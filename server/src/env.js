import { readFile } from "node:fs/promises";

export const SECRETS_PATH =
  "/cursor/stores/bc-74e7af7b-7bb1-4f96-8771-ea8b1954bcec/secrets.env";

export function applyEnvFile(text, env) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] == null || env[key] === "") {
      env[key] = value;
    }
  }
}

export async function loadSecrets(env = process.env, path = SECRETS_PATH) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
  applyEnvFile(text, env);
}
