import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadSecrets } from "./env.js";
import {
  createMemoryStore,
  createPostgresStore,
  createServer,
  databaseUrlFrom,
  listenPort,
  postgresOptions,
  storeModeName,
} from "./server.js";

await loadSecrets();
await loadSecrets(
  process.env,
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
);

const databaseUrl = databaseUrlFrom(process.env);
const mode = storeModeName(databaseUrl);
let store;

if (databaseUrl) {
  const pool = new pg.Pool(postgresOptions(databaseUrl));
  store = createPostgresStore(pool);
  try {
    await store.init();
  } catch {
    console.error("session store: postgres unavailable");
    process.exit(1);
  }
} else {
  store = createMemoryStore();
}

console.log(`session store: ${mode}`);

const server = createServer({ store });
server.listen(listenPort(process.env), "0.0.0.0");
