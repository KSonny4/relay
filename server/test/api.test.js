import assert from "node:assert/strict";
import test from "node:test";
import {
  CORS_ORIGINS,
  CRITIC_INSTRUCTIONS,
  SCORE_QUESTIONS,
  criterionInteger,
  createMemoryStore,
  createPostgresStore,
  createServer,
  databaseUrlFrom,
  firstSentence,
  jevTarget,
  mapMarks,
  listenPort,
  nearestLevel,
  postgresOptions,
  storeModeName,
} from "../src/server.js";
import { applyEnvFile, loadSecrets } from "../src/env.js";

function legendFor(question) {
  return Object.fromEntries(question.criteria.map((text, index) => [index, text]));
}

const EXECUTION = SCORE_QUESTIONS[0];
const USEFULNESS = SCORE_QUESTIONS[1];
const CLARITY = SCORE_QUESTIONS[2];

function scoreAnswer(question, score, confidence) {
  return {
    type: "score",
    score,
    legend: legendFor(question),
    probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.7, 4: 0.2 },
    confidence,
  };
}

function jevResponse(scores = {}, confidence = 0.81) {
  const values = {
    execution: scores.execution ?? 3.2,
    usefulness: scores.usefulness ?? 3.2,
    clarity: scores.clarity ?? 3.2,
  };
  const confidences = {
    execution: scores.executionConfidence ?? confidence,
    usefulness: scores.usefulnessConfidence ?? confidence,
    clarity: scores.clarityConfidence ?? confidence,
  };
  return {
    model: "jev-1.13.0",
    answers: {
      execution: scoreAnswer(EXECUTION, values.execution, confidences.execution),
      usefulness: scoreAnswer(USEFULNESS, values.usefulness, confidences.usefulness),
      clarity: scoreAnswer(CLARITY, values.clarity, confidences.clarity),
    },
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

function openaiResponse(content = "Name the first command a developer should run.") {
  return { choices: [{ message: { content } }] };
}

function mockFetch({ jev, openai, deepgram, listen } = {}) {
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
    if (href.startsWith("https://api.deepgram.com/v1/listen")) {
      return Response.json(
        listen ?? {
          results: { channels: [{ alternatives: [{ transcript: "Ship a smaller diff." }] }] },
        },
      );
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
  assert.deepEqual(Object.keys(body.questions), ["execution", "usefulness", "clarity"]);
  for (const question of SCORE_QUESTIONS) {
    const sent = body.questions[question.id];
    assert.equal(sent.type, "score");
    assert.equal(sent.instructions, question.instructions);
    assert.equal(sent.criteria.length, 5);
    assert.deepEqual(sent.criteria, question.criteria);
  }
  const questions = Object.values(body.questions);
  assert.equal(questions.length, 3);
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

test("TYPESAFE_API_KEY posts three jev-latest score questions, then OpenAI, then stores", async () => {
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
    assert.equal(created.json.score, 16);
    assert.equal(created.json.execution, 4);
    assert.equal(created.json.usefulness, 4);
    assert.equal(created.json.clarity, 4);
    assert.equal(created.json.level, EXECUTION.criteria[3]);
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
    assert.equal(openaiBody.messages[0].content, CRITIC_INSTRUCTIONS);
    assert.equal(openaiBody.messages[1].content, transcript);

    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0].audio.equals(Buffer.from("SECRET-AUDIO-BYTES")), true);
    assert.equal(store.rows[0].mimeType, "audio/webm");

    const listed = await request(base, "GET", "/api/sessions");
    assert.equal(listed.status, 200);
    assert.equal(listed.json.sessions.length, 1);
    assert.equal(listed.json.sessions[0].id, created.json.id);
    assert.equal(listed.json.sessions[0].execution, 4);
    assert.equal(listed.json.sessions[0].usefulness, 4);
    assert.equal(listed.json.sessions[0].clarity, 4);
    assert.equal(listed.json.sessions[0].score, 16);
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
    assert.equal(one.json.score, 16);
    assert.equal(one.json.execution, 4);
    assert.equal(one.json.usefulness, 4);
    assert.equal(one.json.clarity, 4);
    assert.equal(one.json.recommendation, "Name the first command a developer should run.");
    assert.deepEqual(one.json.sentences, []);
    assert.equal(typeof one.json.createdAt, "string");
    assert.equal("audio" in one.json, false);
    assert.equal("audioBase64" in one.json, false);
    assert.equal(one.text.includes("SECRET-AUDIO-BYTES"), false);

    const missing = await request(base, "GET", "/api/sessions/missing");
    assert.equal(missing.status, 404);
  });
});

test("older rows that only stored one score omit the three marks", async () => {
  const store = createMemoryStore();
  await store.insert({
    id: "old",
    attempt: 1,
    transcript: "old pitch",
    score: 7.8,
    level: "A listener can tell what was built",
    confidence: 0.5,
    recommendation: "Be specific.",
    createdAt: "2026-09-30T00:00:00.000Z",
  });
  const listed = await store.list();
  assert.equal(listed[0].score, 7.8);
  assert.equal("execution" in listed[0], false);
  assert.equal("usefulness" in listed[0], false);
  assert.equal("clarity" in listed[0], false);
  const one = await store.get("old");
  assert.equal(one.transcript, "old pitch");
  assert.equal("execution" in one, false);
  assert.equal("audio" in one, false);
  assert.deepEqual(one.sentences, []);
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

test("POST /api/transcribe sends raw audio to Deepgram listen and returns only the transcript", async () => {
  const audio = Buffer.from("SECRET-AUDIO-BYTES");
  const sentences = [
    { text: "Ship a smaller diff.", start: 0.4, end: 1.8 },
    { text: "Then name the command.", start: 1.9, end: 3.1 },
  ];
  const fetchMock = mockFetch({
    listen: {
      results: {
        channels: [
          {
            alternatives: [
              {
                transcript: "Ship a smaller diff. Then name the command.",
                confidence: 0.99,
                paragraphs: {
                  paragraphs: [
                    {
                      sentences: [
                        { text: "Ship a smaller diff.", start: 0.4, end: 1.8 },
                        { text: "Then name the command.", start: 1.9, end: 3.1 },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  });
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base, store }) => {
    const res = await request(base, "POST", "/api/transcribe", {
      audioBase64: audio.toString("base64"),
      mimeType: "audio/webm",
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://127.0.0.1:43123");
    assert.deepEqual(res.json, {
      transcript: "Ship a smaller diff. Then name the command.",
      sentences,
    });
    assert.equal(res.text.includes("SECRET-AUDIO-BYTES"), false);
    assert.equal(res.text.includes("dg-test-key"), false);
    assert.equal("audio" in res.json, false);
    assert.equal("audioBase64" in res.json, false);
    assert.equal(fetchMock.calls.length, 1);
    const call = fetchMock.calls[0];
    const url = new URL(call.url);
    assert.equal(`${url.origin}${url.pathname}`, "https://api.deepgram.com/v1/listen");
    assert.equal(url.searchParams.get("model"), "nova-2");
    assert.equal(url.searchParams.get("smart_format"), "true");
    assert.equal(url.searchParams.get("paragraphs"), "true");
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers.authorization, "Token dg-test-key");
    assert.equal(call.init.headers["content-type"], "audio/webm");
    assert.equal(Buffer.from(call.init.body).equals(audio), true);
    assert.equal(store.rows.length, 0);
    assert.equal(
      fetchMock.calls.some((item) => item.url.includes("openai") || item.url.includes("systemone")),
      false,
    );
  });
});

test("Deepgram without a key is 503 and does not call the network", async () => {
  const fetchMock = mockFetch();
  await withServer({ fetchImpl: fetchMock.impl, env: {} }, async ({ base }) => {
    const res = await request(base, "POST", "/api/deepgram/token");
    assert.equal(res.status, 503);
    assert.match(res.json.error, /DEEPGRAM_API_KEY/);
    const transcribed = await request(base, "POST", "/api/transcribe", {
      audioBase64: Buffer.from("SECRET-AUDIO-BYTES").toString("base64"),
      mimeType: "audio/webm",
    });
    assert.equal(transcribed.status, 503);
    assert.match(transcribed.json.error, /DEEPGRAM_API_KEY/);
    assert.equal(fetchMock.calls.length, 0);
  });
});

test("a saved session keeps sentence times and an old row returns an empty list", async () => {
  const fetchMock = mockFetch();
  const sentences = [{ text: "Hi, how are you?", start: 0.2, end: 1.4 }];
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base }) => {
    const created = await request(base, "POST", "/api/sessions", {
      attempt: 1,
      transcript: "Hi, how are you?",
      sentences,
    });
    assert.equal(created.status, 200);
    const one = await request(base, "GET", `/api/sessions/${created.json.id}`);
    assert.equal(one.status, 200);
    assert.deepEqual(one.json.sentences, sentences);
    assert.equal(one.text.includes("audio"), false);

    const bare = await request(base, "POST", "/api/sessions", {
      attempt: 2,
      transcript: "No times were stored.",
    });
    const without = await request(base, "GET", `/api/sessions/${bare.json.id}`);
    assert.deepEqual(without.json.sentences, []);
  });
});

test("Jev 3.1 becomes 4 and the total is execution times two plus the other marks", async () => {
  const jev = jevResponse({
    execution: 3.1,
    usefulness: 0,
    clarity: 4,
    executionConfidence: 0.64,
    usefulnessConfidence: 0.9,
    clarityConfidence: 0.2,
  });
  const fetchMock = mockFetch({ jev });
  await withServer({ fetchImpl: fetchMock.impl, env: readyEnv }, async ({ base, store }) => {
    const classified = await request(base, "POST", "/api/classify", {
      transcript: "A pitch that is mostly clear.",
    });
    assert.equal(classified.status, 200);
    assert.equal(classified.json.execution, 4);
    assert.equal(classified.json.usefulness, 1);
    assert.equal(classified.json.clarity, 5);
    assert.equal(classified.json.score, 14);
    assert.equal(classified.json.level, USEFULNESS.criteria[0]);
    assert.equal(classified.json.confidence, 0.9);
    assert.equal("recommendation" in classified.json, false);

    const created = await request(base, "POST", "/api/sessions", {
      attempt: 1,
      transcript: "A pitch that is mostly clear.",
    });
    assert.equal(created.json.execution, 4);
    assert.equal(created.json.usefulness, 1);
    assert.equal(created.json.clarity, 5);
    assert.equal(created.json.score, 14);
    assert.equal(created.json.level, USEFULNESS.criteria[0]);
    assert.equal(store.rows[0].score, 14);
    const jevBodies = fetchMock.calls
      .filter((call) => call.url.endsWith("/v1/systemone"))
      .map((call) => JSON.parse(call.init.body));
    assert.equal(jevBodies.length, 2);
    for (const body of jevBodies) assertScoreQuestion(body, "jev-latest", "A pitch that is mostly clear.");
  });
  assert.equal(criterionInteger(3.1), 4);
  assert.equal(criterionInteger(0), 1);
  assert.equal(criterionInteger(4), 5);
  assert.deepEqual(
    mapMarks(jev.answers),
    {
      score: 14,
      execution: 4,
      usefulness: 1,
      clarity: 5,
      level: USEFULNESS.criteria[0],
      confidence: 0.9,
    },
  );
});

test("small talk is the bottom criterion and the sentence is a critic", () => {
  const bottom =
    "This is not a pitch: it is a greeting or small talk, and it does not say what was built, who it helps, or what to do next.";
  for (const question of SCORE_QUESTIONS) {
    assert.equal(question.criteria[0], bottom);
    assert.match(question.instructions, /Small talk scores at the bottom/);
    assert.match(question.instructions, /real pitch/i);
    assert.equal(question.criteria.length, 5);
    assert.notEqual(question.criteria[4], bottom);
  }
  assert.match(CRITIC_INSTRUCTIONS, /critic who helps the speaker/);
  assert.match(
    CRITIC_INSTRUCTIONS,
    /If the words never say what was built, who it is for, and what to try next, the sentence says that/,
  );
  assert.match(CRITIC_INSTRUCTIONS, /Do not praise a greeting/);
  assert.match(CRITIC_INSTRUCTIONS, /Do not give generic marketing advice/);
});

test("nearest legend level and one-sentence recommendation", () => {
  const legend = legendFor(EXECUTION);
  assert.equal(nearestLevel(3.2, legend), EXECUTION.criteria[3]);
  assert.equal(nearestLevel(2.5, legend), EXECUTION.criteria[3]);
  assert.equal(nearestLevel(0.1, legend), EXECUTION.criteria[0]);
  assert.equal(
    firstSentence("Cut the intro. Then add a command."),
    "Cut the intro.",
  );
  assert.equal(
    firstSentence("Say what was built, e.g. the first command a developer runs."),
    "Say what was built, e.g. the first command a developer runs.",
  );
  assert.equal(
    firstSentence("Name who it is for, i.e. a developer who records pitches."),
    "Name who it is for, i.e. a developer who records pitches.",
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
    score: 14,
    execution: 4,
    usefulness: 1,
    clarity: 5,
    level: USEFULNESS.criteria[0],
    confidence: 0.5,
    recommendation: "Be specific.",
    createdAt: "2026-09-30T00:00:00.000Z",
  });
  await store.list();
  assert.match(queries[0].text, /INSERT INTO sessions/);
  assert.equal(Buffer.isBuffer(queries[0].params[3]), true);
  assert.match(queries[1].text, /SELECT/);
  assert.doesNotMatch(queries[1].text, /\baudio\b/);
  assert.match(queries[1].text, /execution/);
  assert.match(queries[1].text, /usefulness/);
  assert.match(queries[1].text, /clarity/);
  assert.match(queries[1].text, /ORDER BY created_at DESC/);
  await store.get("s1");
  assert.match(queries[2].text, /SELECT/);
  assert.match(queries[2].text, /transcript/);
  assert.match(queries[2].text, /execution/);
  assert.match(queries[2].text, /usefulness/);
  assert.match(queries[2].text, /clarity/);
  assert.match(queries[2].text, /sentences/);
  assert.doesNotMatch(queries[2].text, /\baudio\b/);
  assert.equal(queries[0].params[13], null);
  await store.init();
  const sql = queries.map((query) => query.text).join("\n");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS execution/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS sentences jsonb/);

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
        score: 16,
        execution: 4,
        usefulness: 4,
        clarity: 4,
        level: EXECUTION.criteria[3],
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

test("CORS preflight echoes only the three allowed origins", async () => {
  await withServer({ fetchImpl: mockFetch().impl, env: readyEnv, store: createMemoryStore() }, async ({ base }) => {
    assert.deepEqual(CORS_ORIGINS, [
      "https://relay-reel.onrender.com",
      "https://relay-web-s1d6.onrender.com",
      "http://127.0.0.1:43123",
    ]);
    for (const origin of CORS_ORIGINS) {
      const res = await fetch(`${base}/api/sessions`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), origin);
      assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
      assert.match(res.headers.get("access-control-allow-methods"), /POST/);
    }
    const blocked = await fetch(`${base}/api/classify`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    assert.equal(blocked.status, 204);
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  });
});
