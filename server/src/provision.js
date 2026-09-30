import { chmod, writeFile as writeFileFs } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSecrets } from "./env.js";

export const RENDER_API = "https://api.render.com/v1";
export const POSTGRES_NAME = "relay-postgres";
export const SERVICE_NAME = "relay-server";
export const LOCAL_ENV_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.env",
);

const SERVICE_SECRET_KEYS = [
  "DEEPGRAM_API_KEY",
  "OPENAI_API_KEY",
  "TYPESAFE_API_KEY",
  "OPENROUTER_API_KEY",
];

export function secretValues(env) {
  return Object.values(env).filter((value) => typeof value === "string" && value.length >= 4);
}

export function redact(text, secrets) {
  let out = String(text ?? "");
  const values = secrets
    .filter((value) => typeof value === "string" && value.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const secret of values) out = out.split(secret).join("[redacted]");
  return out;
}

export function localEnvFile(connectionString) {
  const needsQuotes = /[\s#"'\\]/.test(connectionString);
  const encoded = needsQuotes
    ? `"${connectionString.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    : connectionString;
  return `DATABASE_URL=${encoded}\n`;
}

export function connectionStrings(info) {
  const internal = info?.internalConnectionString;
  const external = info?.externalConnectionString;
  const service = typeof internal === "string" && internal ? internal : external;
  const local = typeof external === "string" && external ? external : internal;
  if (typeof service !== "string" || !service || typeof local !== "string" || !local) {
    return null;
  }
  return { service, local };
}

export function renderRepoUrl(remote) {
  if (!remote) return "";
  let url;
  try {
    url = new URL(remote);
  } catch {
    return "";
  }
  url.username = "";
  url.password = "";
  const host = url.hostname;
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (host === "github.com" || host === "gitlab.com" || host === "bitbucket.org") {
    if (parts.length < 2) return "";
    return `https://${host}/${parts.slice(-2).join("/")}`;
  }
  if (host === "origin.cursor.com" || host === "cursor.com") {
    const gitAt = parts.indexOf("git");
    const rest = (gitAt >= 0 ? parts.slice(gitAt + 1) : parts).filter((part) => part !== "codebase");
    if (rest.length < 2) return "";
    return `https://cursor.com/codebase/${rest.slice(0, 2).join("/")}`;
  }
  return "";
}

export function safeMessage(text) {
  return String(text ?? "")
    .replace(/\/\/([^/\s@]+)@/g, "//")
    .replace(/x-access-token:[^\s@]+/gi, "x-access-token:[redacted]");
}

export function serviceEnvVars(env, databaseUrl) {
  const vars = [{ key: "DATABASE_URL", value: databaseUrl }];
  for (const key of SERVICE_SECRET_KEYS) {
    if (typeof env[key] === "string" && env[key]) vars.push({ key, value: env[key] });
  }
  return vars;
}

function unwrap(item, key) {
  if (item && item[key] && typeof item[key] === "object") return item[key];
  return item;
}

async function renderFetch(fetchImpl, token, method, pathname, body) {
  const response = await fetchImpl(`${RENDER_API}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body != null ? { "content-type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { ok: response.ok, status: response.status, json };
}

function errorMessage(json) {
  if (json && typeof json.message === "string") return json.message;
  return "";
}

export async function provisionRender({
  env,
  fetchImpl,
  writeFile,
  localEnvPath = LOCAL_ENV_PATH,
  repo = "",
  branch = "main",
  poll = async () => {},
  maxConnectionAttempts = 1,
} = {}) {
  const logs = [];
  const log = (line) => logs.push(line);
  const secrets = secretValues(env);
  const finish = (result) => ({
    ...result,
    logs: logs.map((line) => redact(line, secrets)),
  });

  const token = typeof env.ONRENDER_URL === "string" ? env.ONRENDER_URL.trim() : "";
  if (!token) {
    log("ONRENDER_URL is empty; skipping Render provisioning");
    return finish({ skipped: true, ok: true, localEnvWritten: false });
  }

  const ownersRes = await renderFetch(fetchImpl, token, "GET", "/owners");
  if (!ownersRes.ok) {
    log(`Render owners request failed: ${ownersRes.status} ${safeMessage(errorMessage(ownersRes.json))}`);
    return finish({ skipped: false, ok: false, localEnvWritten: false });
  }
  const owners = (Array.isArray(ownersRes.json) ? ownersRes.json : [])
    .map((item) => unwrap(item, "owner"))
    .filter((owner) => owner?.id);
  if (owners.length === 0) {
    log("Render workspace was not found");
    return finish({ skipped: false, ok: false, localEnvWritten: false });
  }
  const ownerId = owners[0].id;

  const listed = await renderFetch(fetchImpl, token, "GET", "/postgres?limit=100");
  if (!listed.ok) {
    log(`Render postgres list failed: ${listed.status} ${safeMessage(errorMessage(listed.json))}`);
    return finish({ skipped: false, ok: false, localEnvWritten: false });
  }
  const existing = (Array.isArray(listed.json) ? listed.json : [])
    .map((item) => unwrap(item, "postgres"))
    .find((db) => db?.name === POSTGRES_NAME);

  let postgresId = existing?.id;
  if (!postgresId) {
    const created = await renderFetch(fetchImpl, token, "POST", "/postgres", {
      name: POSTGRES_NAME,
      ownerId,
      plan: "free",
      region: "oregon",
      version: "16",
      databaseName: "relay",
      databaseUser: "relay",
    });
    if (!created.ok) {
      log(`Render postgres create failed: ${created.status} ${safeMessage(errorMessage(created.json))}`);
      return finish({ skipped: false, ok: false, localEnvWritten: false });
    }
    postgresId = created.json?.id || unwrap(created.json, "postgres")?.id;
    log("Render postgres created");
  } else {
    log("Render postgres already exists");
  }
  if (!postgresId) {
    log("Render postgres id was missing");
    return finish({ skipped: false, ok: false, localEnvWritten: false });
  }

  let info = null;
  for (let attempt = 0; attempt < maxConnectionAttempts; attempt += 1) {
    const connection = await renderFetch(
      fetchImpl,
      token,
      "GET",
      `/postgres/${postgresId}/connection-info`,
    );
    const strings = connection.ok ? connectionStrings(connection.json) : null;
    if (strings) {
      info = strings;
      break;
    }
    if (attempt < maxConnectionAttempts - 1) await poll();
  }
  if (!info) {
    log("Render postgres connection info is not ready");
    return finish({ skipped: false, ok: false, localEnvWritten: false });
  }
  secrets.push(info.service, info.local);

  await writeFile(localEnvPath, localEnvFile(info.local));
  log("connection string stored in gitignored local env file");

  const envVars = serviceEnvVars(env, info.service);
  const servicesRes = await renderFetch(fetchImpl, token, "GET", "/services?limit=100");
  if (!servicesRes.ok) {
    log(`Render service list failed: ${servicesRes.status} ${safeMessage(errorMessage(servicesRes.json))}`);
    return finish({ skipped: false, ok: false, localEnvWritten: true });
  }
  const existingService = (Array.isArray(servicesRes.json) ? servicesRes.json : [])
    .map((item) => unwrap(item, "service"))
    .find((service) => service?.name === SERVICE_NAME);

  if (existingService?.id) {
    const updated = await renderFetch(
      fetchImpl,
      token,
      "PUT",
      `/services/${existingService.id}/env-vars`,
      envVars,
    );
    if (!updated.ok) {
      log(`Render env update failed: ${updated.status} ${safeMessage(errorMessage(updated.json))}`);
      return finish({ skipped: false, ok: false, localEnvWritten: true });
    }
    log("Render web service env updated");
    return finish({ skipped: false, ok: true, localEnvWritten: true });
  }

  if (!repo) {
    log("Render web service was not created because no git remote is set");
    return finish({ skipped: false, ok: false, localEnvWritten: true });
  }

  const createdService = await renderFetch(fetchImpl, token, "POST", "/services", {
    type: "web_service",
    name: SERVICE_NAME,
    ownerId,
    repo,
    branch,
    rootDir: "server",
    autoDeployTrigger: "commit",
    serviceDetails: {
      runtime: "node",
      plan: "free",
      region: "oregon",
      healthCheckPath: "/api/sessions",
      envSpecificDetails: {
        buildCommand: "npm install",
        startCommand: "npm start",
      },
    },
    envVars,
  });
  if (!createdService.ok) {
    log(`Render web service create failed: ${createdService.status} ${safeMessage(errorMessage(createdService.json))}`);
    return finish({ skipped: false, ok: false, localEnvWritten: true });
  }
  log("Render web service created");
  return finish({ skipped: false, ok: true, localEnvWritten: true });
}

function gitOutput(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

async function writeLocalFile(filePath, contents) {
  await writeFileFs(filePath, contents, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await loadSecrets();
  const result = await provisionRender({
    env: process.env,
    fetchImpl: globalThis.fetch,
    writeFile: writeLocalFile,
    repo: renderRepoUrl(gitOutput(["remote", "get-url", "origin"])),
    branch: gitOutput(["rev-parse", "--abbrev-ref", "HEAD"]) || "main",
    poll: () => new Promise((resolve) => setTimeout(resolve, 2000)),
    maxConnectionAttempts: 30,
  });
  for (const line of result.logs) console.log(line);
  if (!result.ok && !result.skipped) process.exitCode = 1;
}
