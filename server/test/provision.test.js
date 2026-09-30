import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  connectionStrings,
  localEnvFile,
  provisionRender,
  redact,
  serviceEnvVars,
} from "../src/provision.js";

const TOKEN = "rnd_test_render_token";
const INTERNAL = "postgres://relay:internal-secret@dpg-internal/relay";
const EXTERNAL = "postgres://relay:external-secret@dpg-external.render.com/relay";

function renderMock({ postgres = [], services = [], failCreate } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    const href = String(url);
    const method = init?.method || "GET";
    calls.push({ url: href, init });
    const pathname = new URL(href).pathname;
    if (pathname === "/v1/owners") {
      return Response.json([{ owner: { id: "tea-test", name: "workspace", type: "team" }, cursor: "c1" }]);
    }
    if (pathname === "/v1/postgres" && method === "GET") {
      return Response.json(postgres);
    }
    if (pathname === "/v1/postgres" && method === "POST") {
      if (failCreate) return Response.json({ message: "free plan unavailable" }, { status: 400 });
      return Response.json({ id: "dpg-created", name: "relay-postgres", status: "creating" }, { status: 201 });
    }
    if (pathname === "/v1/postgres/dpg-created/connection-info" || pathname === "/v1/postgres/dpg-existing/connection-info") {
      return Response.json({
        password: "db-password",
        internalConnectionString: INTERNAL,
        externalConnectionString: EXTERNAL,
        psqlCommand: "psql hidden",
      });
    }
    if (pathname === "/v1/services" && method === "GET") {
      return Response.json(services);
    }
    if (pathname === "/v1/services" && method === "POST") {
      return Response.json({ id: "srv-created", name: "relay-server" }, { status: 201 });
    }
    if (method === "PUT" && pathname.endsWith("/env-vars")) {
      return Response.json([]);
    }
    return new Response("unexpected", { status: 500 });
  };
  return { calls, impl };
}

test("empty ONRENDER_URL skips Render and does not call the network", async () => {
  const fetchMock = renderMock();
  const result = await provisionRender({
    env: { ONRENDER_URL: "  " },
    fetchImpl: fetchMock.impl,
    writeFile: async () => {
      throw new Error("should not write");
    },
  });
  assert.equal(result.skipped, true);
  assert.equal(result.ok, true);
  assert.equal(fetchMock.calls.length, 0);
  assert.match(result.logs.join("\n"), /ONRENDER_URL is empty/);
});

test("provision uses ONRENDER_URL as a bearer token and stores connection strings without logging them", async () => {
  const fetchMock = renderMock();
  const writes = [];
  const env = {
    ONRENDER_URL: TOKEN,
    DEEPGRAM_API_KEY: "dg-live-test",
    OPENAI_API_KEY: "oa-live-test",
    TYPESAFE_API_KEY: "ts-live-test",
    DATABASE_URL: "",
  };
  const result = await provisionRender({
    env,
    fetchImpl: fetchMock.impl,
    writeFile: async (filePath, contents) => {
      writes.push({ filePath, contents });
    },
    localEnvPath: "/tmp/relay-server.env",
    repo: "https://example.com/relay.git",
    branch: "main",
  });

  assert.equal(result.ok, true);
  assert.equal(result.localEnvWritten, true);
  assert.equal(fetchMock.calls[0].url, "https://api.render.com/v1/owners");
  assert.equal(fetchMock.calls[0].init.headers.authorization, `Bearer ${TOKEN}`);
  const createDb = fetchMock.calls.find((call) => call.url.endsWith("/v1/postgres") && call.init.method === "POST");
  const dbBody = JSON.parse(createDb.init.body);
  assert.equal(dbBody.plan, "free");
  assert.equal(dbBody.version, "16");
  assert.equal(dbBody.name, "relay-postgres");
  assert.equal(JSON.stringify(dbBody).includes(TOKEN), false);

  const createService = fetchMock.calls.find((call) => call.url.endsWith("/v1/services") && call.init.method === "POST");
  const serviceBody = JSON.parse(createService.init.body);
  assert.equal(serviceBody.type, "web_service");
  assert.equal(serviceBody.name, "relay-server");
  assert.equal(serviceBody.rootDir, "server");
  assert.equal(serviceBody.serviceDetails.runtime, "node");
  assert.equal(serviceBody.envVars.find((item) => item.key === "DATABASE_URL").value, INTERNAL);
  assert.equal(serviceBody.envVars.some((item) => item.key === "ONRENDER_URL"), false);
  assert.deepEqual(writes, [
    { filePath: "/tmp/relay-server.env", contents: localEnvFile(EXTERNAL) },
  ]);

  const logged = result.logs.join("\n");
  assert.equal(logged.includes(TOKEN), false);
  assert.equal(logged.includes(INTERNAL), false);
  assert.equal(logged.includes(EXTERNAL), false);
  assert.equal(logged.includes("dg-live-test"), false);
  assert.match(logged, /connection string stored/);
  assert.match(logged, /Render web service created/);
});

test("existing postgres and service update env without creating duplicates", async () => {
  const fetchMock = renderMock({
    postgres: [{ postgres: { id: "dpg-existing", name: "relay-postgres" }, cursor: "a" }],
    services: [{ service: { id: "srv-existing", name: "relay-server" }, cursor: "b" }],
  });
  const result = await provisionRender({
    env: { ONRENDER_URL: TOKEN, OPENAI_API_KEY: "oa-live-test" },
    fetchImpl: fetchMock.impl,
    writeFile: async () => {},
    repo: "https://example.com/relay.git",
  });
  assert.equal(result.ok, true);
  assert.equal(
    fetchMock.calls.some((call) => call.init.method === "POST" && call.url.endsWith("/v1/postgres")),
    false,
  );
  assert.equal(
    fetchMock.calls.some((call) => call.init.method === "POST" && call.url.endsWith("/v1/services")),
    false,
  );
  const update = fetchMock.calls.find((call) => call.init.method === "PUT");
  assert.equal(update.url, "https://api.render.com/v1/services/srv-existing/env-vars");
  const vars = JSON.parse(update.init.body);
  assert.equal(vars.find((item) => item.key === "DATABASE_URL").value, INTERNAL);
  assert.equal(vars.some((item) => item.key === "ONRENDER_URL"), false);
});

test("blueprint has no secrets and connection helpers keep the token out of the database url", async () => {
  const blueprint = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../render.yaml"),
    "utf8",
  );
  assert.match(blueprint, /relay-postgres/);
  assert.match(blueprint, /relay-server/);
  assert.equal(blueprint.includes("postgres://"), false);
  assert.equal(blueprint.includes("ONRENDER_URL"), false);
  assert.deepEqual(connectionStrings({
    internalConnectionString: INTERNAL,
    externalConnectionString: EXTERNAL,
  }), { service: INTERNAL, local: EXTERNAL });
  assert.equal(serviceEnvVars({ ONRENDER_URL: TOKEN, OPENAI_API_KEY: "oa" }, INTERNAL).some((item) => item.key === "ONRENDER_URL"), false);
  assert.equal(redact(`token ${TOKEN} db ${EXTERNAL}`, [TOKEN, EXTERNAL]).includes(TOKEN), false);
});
