import assert from "node:assert/strict";
import test from "node:test";
import {
  PITCH_CRITERIA,
  PITCH_INSTRUCTIONS,
  createMemoryStore,
  createPostgresStore,
  createServer,
  databaseUrlFrom,
  firstSentence,
  jevTarget,
  mapScoreAnswer,
  visibleScore,
  listenPort,
  nearestLevel,
  postgresOptions,
  storeModeName,
} from "../src/server.js";
import { applyEnvFile, loadSecrets } from "../src/env.js";

const LEGEND = {
  0: PITCH_CRITERIA[0],
  1: PITCH_CRITERIA[1],
  2: PITCH_CRITERIA[2],
  3: PITCH_CRITERIA[3],
  4: PITCH_CRITERIA[4],
};

function jevResponse(score = 3.2, confidence = 0.81) {
  return {
    model: "jev-1.13.0",
    answers: {
      pitch: {
        type: "score",
        score,
        legend: LEGEND,
        probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.7, 4: 0.2 },
        confidence,
      },
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

function openaiResponse(content = "Name the first command a developer should run.") {
  return { choices: [{ message: { content } }] };
}

function mockFetch({ jev, openai, deepgram } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.endsWith("/v1/systemone")) {
      return Response.json(jev ?? jevResponse());
    }
    if (href === "https://api.openai.com/v1/chat/completions") {
      return Response.json(openai ?? openaiResponse());
    }
    if (href === "https://api.deepgram.com/v1/auth/grant") {
      return Response.json(deepgram ?? { access_token: "eyJhbGciOiJIUzI1NiJ9.short", expires_in: 30 });
    }
    return new Response("unexpected", { status: 500 });
  };
  return { calls, impl };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function withServer(opts, fn) {
  const store = opts.store ?? createMemoryStore();
  const server = createServer({ ...opts, store });
  await listen(server);
  try {
    await fn({
      server,
      store,
      base: `http://127.0.0.1:${server.address().port}`,
    });
  } finally {
    await close(server);
  }
}

async function request(base, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://127.0.0.1:43123",
      ...(body != null ? { "content-type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text, headers: res.headers };
}

function assertScoreQuestion(body, model, transcript) {
  assert.equal(body.model, model);
  assert.equal(body.state, transcript);
  assert.deepEqual(Object.keys(body).sort(), ["model", "questions", "state"]);
  const questions = Object.values(body.questions);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].type, "score");
  assert.equal(questions[0].instructions, PITCH_INSTRUCTIONS);
  assert.deepEqual(questions[0].criteria, PITCH_CRITERIA);
  assert.equal(
    questions.filter((q) => q.type === "choice" || q.type === "noul").length,
    0,
  );
}

const readyEnv = {
  TYPESAFE_API_KEY: "ts-test-key",
  OPENAI_API_KEY: "oa-test-key",
  DEEPGRAM_API_KEY: "dg-test-key",
};

test("TYPESAFE_API_KEY posts one jev-latest score question, then OpenAI, then stores", async () => {
  const fetchMock = mockFetch();
  const transcript = "A CLI that explains a diff before you commit.";
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base, store }) => {
    const created = await request(base, "POST", "/api/sessions", {
      attempt: 1,
      transcript,
      audioBase64: Buffer.from("SECRET-AUDIO-BYTES").toString("base64"),
      mimeType: "audio/webm",
    });
    assert.equal(created.status, 200);
    assert.equal(created.headers.get("access-control-allow-origin"), "http://127.0.0.1:43123");
    assert.equal(created.json.attempt, 1);
    assert.equal(created.json.score, 8);
    assert.equal(created.json.level, PITCH_CRITERIA[3]);
    assert.equal(created.json.confidence, 0.81);
    assert.equal(created.json.recommendation, "Name the first command a developer should run.");
    assert.equal(typeof created.json.id, "string");
    assert.equal("createdAt" in created.json, false);
    assert.equal(created.text.includes("SECRET-AUDIO-BYTES"), false);
    assert.equal(created.text.includes("ts-test-key"), false);
    assert.equal(created.text.includes("oa-test-key"), false);

    assert.equal(fetchMock.calls.length, 2);
    assert.equal(fetchMock.calls[0].url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(fetchMock.calls[0].init.headers.authorization, "Bearer ts-test-key");
    assertScoreQuestion(JSON.parse(fetchMock.calls[0].init.body), "jev-latest", transcript);
    assert.equal(fetchMock.calls[1].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(fetchMock.calls[1].init.headers.authorization, "Bearer oa-test-key");
    const openaiBody = JSON.parse(fetchMock.calls[1].init.body);
    assert.equal(openaiBody.model, "gpt-4.1-mini");
    assert.equal(openaiBody.messages[1].content, transcript);

    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].audio.equals(Buffer.from("SECRET-AUDIO-BYTES")), true);
    assert.equal(store.rows[0].mimeType, "audio/webm");

    const listed = await request(base, "GET", "/api/sessions");
    assert.equal(listed.status, 200);
    assert.equal(listed.json.sessions.length, 1);
    assert.equal(listed.json.sessions[0].id, created.json.id);
    assert.equal(typeof listed.json.sessions[0].createdAt, "string");
    assert.equal(listed.text.includes("SECRET-AUDIO-BYTES"), false);
    assert.equal("audio" in listed.json.sessions[0], false);
    assert.equal("audioBase64" in listed.json.sessions[0], false);
  });
});

test("OPENROUTER_API_KEY is used only when TYPESAFE_API_KEY is empty", async () => {
  const fetchMock = mockFetch();
  const env = {
    OPENROUTER_API_KEY: "or-test-key",
    OPENAI_API_KEY: "oa-test-key",
  };
  await withServer({ fetchImpl: fetchMock.impl, env }, async ({ base }) => {
    const created = await request(base, "POST", "/api/sessions", {
      attempt: 2,
      transcript: "Ship a smaller diff.",
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.attempt, 2);
    assert.equal(fetchMock.calls[0].url, "https://openrouter.ai/api/v1/systemone");
    assert.equal(fetchMock.calls[0].init.headers.authorization, "Bearer or-test-key");
    assertScoreQuestion(JSON.parse(fetchMock.calls[0].init.body), "typesafe/jev-1.13", "Ship a smaller diff.");
    assert.equal(fetchMock.calls[1].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(
      fetchMock.calls.some((call) => call.url.includes("/chat/completions") && call === fetchMock.calls[0]),
      false,
    );
  });
});

test("TYPESAFE_API_KEY wins over OPENROUTER_API_KEY", async () => {
  const target = jevTarget({
    TYPESAFE_API_KEY: "ts-test-key",
    OPENROUTER_API_KEY: "or-test-key",
  });
  assert.equal(target.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(target.model, "jev-latest");
});

test("missing Jev keys return 503 and do not invent a score", async () => {
  const fetchMock = mockFetch();
  await withServer(
    { fetchImpl: fetchMock.impl, env: { OPENAI_API_KEY: "oa-test-key" } },
    async ({ base, store }) => {
      const res = await request(base, "POST", "/api/sessions", {
        attempt: 1,
        transcript: "hello",
      });
      assert.equal(res.status, 503);
      assert.equal(res.json.score, undefined);
      assert.match(res.json.error, /Jev is not configured/);
      assert.equal(fetchMock.calls.length, 0);
      assert.equal(store.rows.length, 0);
    },
  );
});

test("attempt 3 is stored and attempt 0 is rejected", async () => {
  const fetchMock = mockFetch();
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base, store }) => {
    const rejected = await request(base, "POST", "/api/sessions", {
      attempt: 0,
      transcript: "nope",
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.json.error, "attempt must be an integer greater than or equal to 1");
    assert.equal(fetchMock.calls.length, 0);

    const created = await request(base, "POST", "/api/sessions", {
      attempt: 3,
      transcript: "third take",
      audioBase64: Buffer.from("SECRET-AUDIO-BYTES").toString("base64"),
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.attempt, 3);
    assert.equal(store.rows.length, 1);

    const one = await request(base, "GET", `/api/sessions/${created.json.id}`);
    assert.equal(one.status, 200);
    assert.equal(one.json.transcript, "third take");
    assert.equal(one.json.attempt, 3);
    assert.equal(one.json.recommendation, "Name the first command a developer should run.");
    assert.equal(typeof one.json.createdAt, "string");
    assert.equal("audio" in one.json, false);
    assert.equal("audioBase64" in one.json, false);
    assert.equal(one.text.includes("SECRET-AUDIO-BYTES"), false);

    const missing = await request(base, "GET", "/api/sessions/missing");
    assert.equal(missing.status, 404);
  });
});

test("sessions are newest first and omit audio bytes", async () => {
  const fetchMock = mockFetch();
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base }) => {
    const first = await request(base, "POST", "/api/sessions", {
      attempt: 1,
      transcript: "first pitch",
    });
    const second = await request(base, "POST", "/api/sessions", {
      attempt: 2,
      transcript: "second pitch",
      audioBase64: Buffer.from("SECRET-AUDIO-BYTES").toString("base64"),
    });
    const listed = await request(base, "GET", "/api/sessions");
    assert.deepEqual(
      listed.json.sessions.map((row) => row.id),
      [second.json.id, first.json.id],
    );
    assert.equal(listed.text.includes("SECRET-AUDIO-BYTES"), false);
  });
});

test("Deepgram grant returns only the short-lived accessToken", async () => {
  const fetchMock = mockFetch({
    deepgram: { access_token: "eyJhbGciOiJIUzI1NiJ9.short", expires_in: 30, key: "dg-test-key" },
  });
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base }) => {
    const res = await request(base, "POST", "/api/deepgram/token");
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { accessToken: "eyJhbGciOiJIUzI1NiJ9.short" });
    assert.equal(res.text.includes("dg-test-key"), false);
    assert.equal(fetchMock.calls.length, 1);
    assert.equal(fetchMock.calls[0].url, "https://api.deepgram.com/v1/auth/grant");
    assert.equal(fetchMock.calls[0].init.method, "POST");
    assert.equal(fetchMock.calls[0].init.headers.authorization, "Token dg-test-key");
    assert.equal(fetchMock.calls[0].init.body, undefined);
  });
});

test("Deepgram without a key is 503 and does not call the network", async () => {
  const fetchMock = mockFetch();
  await withServer({ fetchImpl: fetchMock.impl, env: {} }, async ({ base }) => {
    const res = await request(base, "POST", "/api/deepgram/token");
    assert.equal(res.status, 503);
    assert.match(res.json.error, /DEEPGRAM_API_KEY/);
    assert.equal(fetchMock.calls.length, 0);
  });
});

test("a Jev score of 3.1 leaves the API as 7.8", async () => {
  const fetchMock = mockFetch({ jev: jevResponse(3.1, 0.64) });
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base, store }) => {
    const classified = await request(base, "POST", "/api/classify", {
      transcript: "A pitch that is mostly clear.",
    });
    assert.equal(classified.status, 200);
    assert.equal(classified.json.score, 7.8);
    assert.equal(classified.json.level, PITCH_CRITERIA[3]);
    assert.equal(classified.json.confidence, 0.64);

    const created = await request(base, "POST", "/api/sessions", {
      attempt: 1,
      transcript: "A pitch that is mostly clear.",
    });
    assert.equal(created.json.score, 7.8);
    assert.equal(created.json.level, PITCH_CRITERIA[3]);
    assert.equal(store.rows[0].score, 7.8);
    const jevBodies = fetchMock.calls
      .filter((call) => call.url.endsWith("/v1/systemone"))
      .map((call) => JSON.parse(call.init.body));
    assert.equal(jevBodies.length, 2);
    for (const body of jevBodies) assertScoreQuestion(body, "jev-latest", "A pitch that is mostly clear.");
  });
  assert.equal(visibleScore(3.1), 7.8);
  assert.equal(mapScoreAnswer({
    type: "score",
    score: 3.1,
    confidence: 0.64,
    legend: LEGEND,
  }).score, 7.8);
});

test("nearest legend level and one-sentence recommendation", () => {
  assert.equal(nearestLevel(3.2, LEGEND), PITCH_CRITERIA[3]);
  assert.equal(nearestLevel(2.5, LEGEND), PITCH_CRITERIA[3]);
  assert.equal(nearestLevel(0.1, LEGEND), PITCH_CRITERIA[0]);
  assert.equal(
    firstSentence("Cut the intro. Then add a command."),
    "Cut the intro.",
  );
});

test("postgres list query does not select audio and non-local urls use ssl", async () => {
  const queries = [];
  const pool = {
    async query(text, params) {
      queries.push({ text, params });
      return { rows: [] };
    },
  };
  const store = createPostgresStore(pool);
  await store.insert({
    id: "s1",
    attempt: 1,
    transcript: "pitch",
    audio: Buffer.from("bytes"),
    mimeType: "audio/webm",
    score: 1,
    level: PITCH_CRITERIA[1],
    confidence: 0.5,
    recommendation: "Be specific.",
    createdAt: "2026-09-30T00:00:00.000Z",
  });
  await store.list();
  assert.match(queries[0].text, /INSERT INTO sessions/);
  assert.equal(Buffer.isBuffer(queries[0].params[3]), true);
  assert.match(queries[1].text, /SELECT/);
  assert.doesNotMatch(queries[1].text, /\baudio\b/);
  assert.match(queries[1].text, /ORDER BY created_at DESC/);
  await store.get("s1");
  assert.match(queries[2].text, /SELECT/);
  assert.match(queries[2].text, /transcript/);
  assert.doesNotMatch(queries[2].text, /\baudio\b/);

  const remote = postgresOptions("postgres://user:s3cret@dpg-example.render.com/relay");
  assert.deepEqual(remote.ssl, { rejectUnauthorized: false });
  assert.equal(storeModeName(remote.connectionString), "postgres");
  assert.equal(storeModeName(undefined), "memory");
  assert.equal(storeModeName("postgres://user:s3cret@localhost/relay").includes("s3cret"), false);
  const local = postgresOptions("postgres://user:s3cret@127.0.0.1:5432/relay");
  assert.equal(local.ssl, undefined);
});

test("secrets file fills only empty env vars and ignores a missing file", async () => {
  const env = { OPENAI_API_KEY: "already", DEEPGRAM_API_KEY: "" };
  applyEnvFile(
    'OPENAI_API_KEY=new\nDEEPGRAM_API_KEY=filled\nOPENROUTER_API_KEY="or-value"\n# comment\n',
    env,
  );
  assert.equal(env.OPENAI_API_KEY, "already");
  assert.equal(env.DEEPGRAM_API_KEY, "filled");
  assert.equal(env.OPENROUTER_API_KEY, "or-value");
  await loadSecrets(env, "/tmp/relay-server-missing-secrets.env");
  assert.equal(env.OPENAI_API_KEY, "already");
});

test("POST /api/classify calls Jev once and does not call OpenAI or store a session", async () => {
  const fetchMock = mockFetch();
  const transcript = "A tool that names the next command.";
  await withServer(
    { fetchImpl: fetchMock.impl, env: { TYPESAFE_API_KEY: "ts-test-key" }, store: createMemoryStore() },
    async ({ base, store }) => {
      const res = await request(base, "POST", "/api/classify", { transcript });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, {
        score: 8,
        level: PITCH_CRITERIA[3],
        confidence: 0.81,
      });
      assert.equal(fetchMock.calls.length, 1);
      assert.equal(fetchMock.calls[0].url, "https://api.typesafe.ai/v1/systemone");
      assertScoreQuestion(JSON.parse(fetchMock.calls[0].init.body), "jev-latest", transcript);
      assert.equal(
        fetchMock.calls.some((call) => call.url.includes("api.openai.com")),
        false,
      );
      assert.equal(store.rows.length, 0);
      const listed = await request(base, "GET", "/api/sessions");
      assert.deepEqual(listed.json.sessions, []);
    },
  );
});

test("long transcripts are classified whole and sessions still store one sentence", async () => {
  const fetchMock = mockFetch();
  const transcript = `${"Explain the idea. ".repeat(800)}Done.`;
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base, store }) => {
    const classified = await request(base, "POST", "/api/classify", {
      transcript,
      durationMs: 180000,
    });
    assert.equal(classified.status, 200);
    assert.equal(JSON.parse(fetchMock.calls[0].init.body).state, transcript);
    assert.equal(JSON.parse(fetchMock.calls[0].init.body).state.length, transcript.length);

    const created = await request(base, "POST", "/api/sessions", {
      attempt: 2,
      transcript,
      durationMs: 180000,
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.recommendation, "Name the first command a developer should run.");
    assert.equal(store.rows[0].transcript, transcript);
    const sessionCalls = fetchMock.calls.slice(1);
    assert.equal(sessionCalls[0].url, "https://api.typesafe.ai/v1/systemone");
    assert.equal(JSON.parse(sessionCalls[0].init.body).state, transcript);
    assert.equal(sessionCalls[1].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(JSON.parse(sessionCalls[1].init.body).messages[1].content, transcript);
  });
});

test("ONRENDER_URL is not a database url and Render PORT is optional", () => {
  assert.equal(databaseUrlFrom({ ONRENDER_URL: "rnd_test_token", DATABASE_URL: "" }), undefined);
  assert.equal(databaseUrlFrom({ DATABASE_URL: "postgres://db.internal/relay" }), "postgres://db.internal/relay");
  assert.equal(listenPort({}), 43124);
  assert.equal(listenPort({ PORT: "10000" }), 10000);
});

test("CORS preflight allows the web origin", async () => {
  await withServer({ fetchImpl: mockFetch().impl, env: readyEnv, store: createMemoryStore() }, async ({ base }) => {
    const res = await fetch(`${base}/api/sessions`, { method: "OPTIONS" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://127.0.0.1:43123");
    assert.match(res.headers.get("access-control-allow-methods"), /POST/);
  });
});
