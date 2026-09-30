import http from "node:http";
import { randomUUID } from "node:crypto";

export const CORS_ORIGINS = [
  "https://relay-reel.onrender.com",
  "https://relay-web-s1d6.onrender.com",
  "http://127.0.0.1:43123",
];
export const PORT = 43124;

export function allowedOrigin(origin) {
  return typeof origin === "string" && CORS_ORIGINS.includes(origin) ? origin : null;
}

const NOT_A_PITCH =
  "This is not a pitch: it is a greeting or small talk, and it does not say what was built, who it helps, or what to do next.";

export const SCORE_QUESTIONS = [
  {
    id: "execution",
    instructions:
      "How well does this pitch show what was actually built? Small talk scores at the bottom. If the words do not say what was built, the score is 1 or 2, not 4 or 5. A 5 means a listener could act and you would not write a fix for this criterion. Do not give a 5 on a criterion you would still criticize. A real pitch that says what was built can still score high.",
    criteria: [
      NOT_A_PITCH,
      "The words do not say what was built",
      "A listener could tell what was built only with effort",
      "The words say what was built",
      "The words say what was built, a listener could act, and there is nothing to fix",
    ],
  },
  {
    id: "usefulness",
    instructions:
      "Is the problem real, and would someone use this? Small talk scores at the bottom. If the words do not say who it is for, the score is 1 or 2, not 4 or 5. A 5 means a listener could act and you would not write a fix for this criterion. Do not give a 5 on a criterion you would still criticize. A real pitch that says who it is for can still score high.",
    criteria: [
      NOT_A_PITCH,
      "The words do not say who it is for",
      "The problem is too vague to know who it is for",
      "The words say who it is for",
      "The words say who it is for, a listener could act, and there is nothing to fix",
    ],
  },
  {
    id: "clarity",
    instructions:
      "Can we understand what this is and why it matters? Small talk scores at the bottom. If the words do not say why it matters, the score is 1 or 2, not 4 or 5. A 5 means a listener could act and you would not write a fix for this criterion. Do not give a 5 on a criterion you would still criticize. A real pitch that says why it matters can still score high.",
    criteria: [
      NOT_A_PITCH,
      "The words do not say why it matters",
      "Why it matters is vague",
      "The words say why it matters",
      "The words say why it matters, a listener could act, and there is nothing to fix",
    ],
  },
];

export const CRITIC_INSTRUCTIONS =
  'You are a critic who helps the speaker. Reply with JSON only: {"recommendation":"one sentence or empty","omit":["execution","usefulness","clarity"],"fix":["execution","usefulness","clarity"]}. Put execution in omit when the words do not say what was built, usefulness when they do not say who it is for, and clarity when they do not say why it matters. An omitted criterion is 1 or 2, not 4 or 5. Put a criterion in fix when you would still write a fix for it. A 5 means a listener could act and you would not write a fix for that criterion. Do not give a 5 on a criterion you would still criticize. If nothing is omitted and you would not write a fix, recommendation is empty and omit and fix are empty. If the words never say what was built, who it is for, or why it matters, the sentence says that. Do not praise a greeting. Do not give generic marketing advice. No other prose.';

const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/systemone";
const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";
const DEEPGRAM_LISTEN_URL =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&paragraphs=true";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4.1-mini";
const BODY_LIMIT = 32 * 1024 * 1024;

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function jevTarget(env) {
  if (env.TYPESAFE_API_KEY) {
    return {
      url: TYPESAFE_URL,
      key: env.TYPESAFE_API_KEY,
      model: "jev-latest",
    };
  }
  if (env.OPENROUTER_API_KEY) {
    return {
      url: OPENROUTER_URL,
      key: env.OPENROUTER_API_KEY,
      model: "typesafe/jev-1.13",
    };
  }
  return null;
}

export function jevRequestBody(transcript, model) {
  const questions = {};
  for (const question of SCORE_QUESTIONS) {
    questions[question.id] = {
      type: "score",
      instructions: question.instructions,
      criteria: question.criteria,
    };
  }
  return { state: transcript, model, questions };
}

export function nearestLevel(score, legend) {
  const keys = Object.keys(legend)
    .map((key) => Number(key))
    .filter((key) => Number.isFinite(key))
    .sort((a, b) => a - b);
  if (keys.length === 0 || typeof score !== "number" || Number.isNaN(score)) {
    return null;
  }
  let nearest = keys[0];
  let best = Math.abs(score - nearest);
  for (const key of keys) {
    const dist = Math.abs(score - key);
    if (dist < best || (dist === best && key > nearest)) {
      best = dist;
      nearest = key;
    }
  }
  const text = legend[String(nearest)] ?? legend[nearest];
  return typeof text === "string" ? text : null;
}

export function criterionInteger(jevScore) {
  const value = Math.round(jevScore + 1);
  if (value < 1) return 1;
  if (value > 5) return 5;
  return value;
}

export function mapScoreAnswer(answer) {
  if (
    !answer ||
    answer.type !== "score" ||
    typeof answer.score !== "number" ||
    typeof answer.confidence !== "number" ||
    !answer.legend ||
    typeof answer.legend !== "object"
  ) {
    throw httpError(502, "Jev score was missing");
  }
  const level = nearestLevel(answer.score, answer.legend);
  if (!level) throw httpError(502, "Jev legend was missing");
  return { value: criterionInteger(answer.score), level, confidence: answer.confidence };
}

export function mapMarks(answers) {
  const parts = {};
  for (const question of SCORE_QUESTIONS) {
    const answer = answers?.[question.id];
    if (!answer) throw httpError(502, "Jev score was missing");
    parts[question.id] = mapScoreAnswer(answer);
  }
  const execution = parts.execution.value;
  const usefulness = parts.usefulness.value;
  const clarity = parts.clarity.value;
  let weakest = "execution";
  for (const name of ["usefulness", "clarity"]) {
    if (parts[name].value < parts[weakest].value) weakest = name;
  }
  return {
    score: execution * 2 + usefulness + clarity,
    execution,
    usefulness,
    clarity,
    level: parts[weakest].level,
    confidence: parts[weakest].confidence,
  };
}

export function transcriptText(json) {
  const text = json?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  return typeof text === "string" ? text : null;
}

export function sentenceTimes(json) {
  const groups = json?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs;
  if (!Array.isArray(groups)) return [];
  const sentences = [];
  for (const group of groups) {
    const items = Array.isArray(group?.sentences) ? group.sentences : [];
    for (const sentence of items) {
      if (
        typeof sentence?.text !== "string" ||
        typeof sentence.start !== "number" ||
        typeof sentence.end !== "number" ||
        !Number.isFinite(sentence.start) ||
        !Number.isFinite(sentence.end)
      ) {
        continue;
      }
      sentences.push({ text: sentence.text, start: sentence.start, end: sentence.end });
    }
  }
  return sentences;
}

export function normalizeSentences(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw httpError(400, "sentences must be an array");
  return value.map((sentence) => {
    if (
      !sentence ||
      typeof sentence !== "object" ||
      Array.isArray(sentence) ||
      typeof sentence.text !== "string" ||
      typeof sentence.start !== "number" ||
      typeof sentence.end !== "number" ||
      !Number.isFinite(sentence.start) ||
      !Number.isFinite(sentence.end)
    ) {
      throw httpError(400, "each sentence needs text, start, and end in seconds");
    }
    return { text: sentence.text, start: sentence.start, end: sentence.end };
  });
}

function storedSentences(value) {
  if (value == null) return [];
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((sentence) => {
    if (
      !sentence ||
      typeof sentence.text !== "string" ||
      typeof sentence.start !== "number" ||
      typeof sentence.end !== "number"
    ) {
      return [];
    }
    return [{ text: sentence.text, start: sentence.start, end: sentence.end }];
  });
}

const ABBREVIATION_ENDING =
  /(?:^|[\s(,])(?:e\.g|i\.e|etc|mr|mrs|ms|dr|prof|vs|inc|ltd|jr|sr|ph\.d|u\.s|u\.k|a\.m|p\.m)\.$/i;

function endsSentence(text, index) {
  const mark = text[index];
  if (mark !== "." && mark !== "!" && mark !== "?") return false;
  const next = text[index + 1];
  if (mark === "." && next && /[A-Za-z0-9.]/.test(next)) return false;
  if (mark === "." && ABBREVIATION_ENDING.test(text.slice(0, index + 1))) return false;
  return true;
}

export function firstSentence(text) {
  const trimmed = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) throw httpError(502, "OpenAI recommendation was empty");
  for (let index = 0; index < trimmed.length; index += 1) {
    if (endsSentence(trimmed, index)) return trimmed.slice(0, index + 1).trim();
  }
  return trimmed;
}

export function storeModeName(databaseUrl) {
  return databaseUrl ? "postgres" : "memory";
}

export function databaseUrlFrom(env) {
  const value = env?.DATABASE_URL;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value;
}

export function listenPort(env = {}) {
  const raw = env.PORT;
  if (raw == null || raw === "") return PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return PORT;
  return parsed;
}

export function postgresOptions(databaseUrl) {
  let host = "";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    host = "";
  }
  const local = host === "localhost" || host === "127.0.0.1";
  return {
    connectionString: databaseUrl,
    ssl: local ? undefined : { rejectUnauthorized: false },
  };
}

export function createMemoryStore() {
  const rows = [];
  let seq = 0;
  return {
    rows,
    async insert(row) {
      rows.push({ ...row, _seq: ++seq });
    },
    async list() {
      return rows
        .slice()
        .sort((a, b) => {
          if (a.createdAt === b.createdAt) return b._seq - a._seq;
          return a.createdAt < b.createdAt ? 1 : -1;
        })
        .map(publicSession);
    },
    async get(id) {
      const row = rows.find((item) => item.id === id);
      return row ? recording(row) : null;
    },
  };
}

export function createPostgresStore(pool) {
  return {
    async init() {
      await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
        id text PRIMARY KEY,
        attempt integer NOT NULL,
        transcript text NOT NULL,
        audio bytea,
        mime_type text,
        score double precision NOT NULL,
        level text NOT NULL,
        confidence double precision NOT NULL,
        recommendation text NOT NULL,
        created_at timestamptz NOT NULL
      )`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS execution integer`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS usefulness integer`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS clarity integer`);
      await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sentences jsonb`);
    },
    async insert(row) {
      await pool.query(
        `INSERT INTO sessions
          (id, attempt, transcript, audio, mime_type, score, level, confidence, recommendation, created_at, execution, usefulness, clarity, sentences)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          row.id,
          row.attempt,
          row.transcript,
          row.audio,
          row.mimeType,
          row.score,
          row.level,
          row.confidence,
          row.recommendation,
          row.createdAt,
          row.execution,
          row.usefulness,
          row.clarity,
          row.sentences == null ? null : JSON.stringify(row.sentences),
        ],
      );
    },
    async list() {
      const result = await pool.query(
        `SELECT id, attempt, score, level, confidence, recommendation, created_at, execution, usefulness, clarity
         FROM sessions
         ORDER BY created_at DESC`,
      );
      return result.rows.map((row) => publicSession(sessionFromPostgres(row)));
    },
    async get(id) {
      const result = await pool.query(
        `SELECT id, attempt, transcript, score, level, confidence, recommendation, created_at, execution, usefulness, clarity, sentences
         FROM sessions
         WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? recording(sessionFromPostgres(row)) : null;
    },
  };
}

function sessionFromPostgres(row) {
  return {
    id: row.id,
    attempt: row.attempt,
    transcript: row.transcript,
    score: row.score,
    execution: row.execution,
    usefulness: row.usefulness,
    clarity: row.clarity,
    level: row.level,
    confidence: row.confidence,
    recommendation: row.recommendation,
    sentences: row.sentences,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

function marksFields(row) {
  const fields = {};
  for (const name of ["execution", "usefulness", "clarity"]) {
    if (Number.isInteger(row[name])) fields[name] = row[name];
  }
  return fields;
}

function publicSession(row) {
  return {
    id: row.id,
    attempt: row.attempt,
    score: row.score,
    ...marksFields(row),
    level: row.level,
    confidence: row.confidence,
    recommendation: row.recommendation,
    createdAt: row.createdAt,
  };
}

function recording(row) {
  return {
    id: row.id,
    attempt: row.attempt,
    transcript: row.transcript,
    score: row.score,
    ...marksFields(row),
    level: row.level,
    confidence: row.confidence,
    recommendation: row.recommendation,
    sentences: storedSentences(row.sentences),
    createdAt: row.createdAt,
  };
}

function createdResponse(row) {
  return {
    id: row.id,
    attempt: row.attempt,
    score: row.score,
    ...marksFields(row),
    level: row.level,
    confidence: row.confidence,
    recommendation: row.recommendation,
  };
}

function writeCors(req, res) {
  const origin = allowedOrigin(req.headers.origin);
  if (origin) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("vary", "Origin");
}

function send(req, res, status, body) {
  writeCors(req, res);
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(httpError(413, "Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function decodeAudio(audioBase64) {
  if (audioBase64 == null) return null;
  if (typeof audioBase64 !== "string") {
    throw httpError(400, "audioBase64 must be a string");
  }
  if (audioBase64.length === 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64) || audioBase64.length % 4 !== 0) {
    throw httpError(400, "audioBase64 is not valid base64");
  }
  return Buffer.from(audioBase64, "base64");
}

async function postJson(fetchImpl, url, headers, body) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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

async function callJev(fetchImpl, env, transcript) {
  const target = jevTarget(env);
  if (!target) {
    throw httpError(
      503,
      "Jev is not configured. Set TYPESAFE_API_KEY or OPENROUTER_API_KEY.",
    );
  }
  const jev = await postJson(
    fetchImpl,
    target.url,
    { authorization: `Bearer ${target.key}` },
    jevRequestBody(transcript, target.model),
  );
  if (!jev.ok || !jev.json?.answers) {
    throw httpError(502, "Jev request failed");
  }
  return mapMarks(jev.json.answers);
}

const MARK_NAMES = ["execution", "usefulness", "clarity"];

export function perfectMarks(marks) {
  return marks.execution === 5 && marks.usefulness === 5 && marks.clarity === 5;
}

function legendFor(name, value) {
  const question = SCORE_QUESTIONS.find((item) => item.id === name);
  return question.criteria[value - 1];
}

function omissionsInSentence(sentence) {
  const omit = [];
  if (/what was built|what (?:this|it|relay) is/i.test(sentence)) omit.push("execution");
  if (/who it is for|who this is for|who it's for/i.test(sentence)) omit.push("usefulness");
  if (/why it matters/i.test(sentence)) omit.push("clarity");
  return omit;
}

export function parseCritic(content) {
  const trimmed = String(content ?? "").trim();
  let json = null;
  try {
    json = JSON.parse(trimmed);
  } catch {
    json = null;
  }
  const names = (value) =>
    Array.isArray(value) ? value.filter((name) => MARK_NAMES.includes(name)) : [];
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    const recommendation = trimmed ? firstSentence(trimmed) : "";
    return {
      recommendation,
      omit: omissionsInSentence(recommendation),
      fix: [],
    };
  }
  const omit = names(json.omit);
  const recommendation = typeof json.recommendation === "string" ? json.recommendation.trim() : "";
  return {
    recommendation: recommendation ? firstSentence(recommendation) : "",
    omit,
    fix: names(json.fix).filter((name) => !omit.includes(name)),
  };
}

export function applyCritic(marks, critic) {
  const next = {
    execution: marks.execution,
    usefulness: marks.usefulness,
    clarity: marks.clarity,
  };
  for (const name of critic.omit ?? []) {
    if (MARK_NAMES.includes(name)) next[name] = Math.min(next[name], 2);
  }
  for (const name of critic.fix ?? []) {
    if (MARK_NAMES.includes(name)) next[name] = Math.min(next[name], 4);
  }
  let recommendation = critic.recommendation ?? "";
  if (recommendation && perfectMarks(next)) next.execution = Math.min(next.execution, 4);
  let weakest = "execution";
  for (const name of ["usefulness", "clarity"]) {
    if (next[name] < next[weakest]) weakest = name;
  }
  if (perfectMarks(next)) recommendation = "";
  return {
    ...marks,
    ...next,
    score: next.execution * 2 + next.usefulness + next.clarity,
    level: legendFor(weakest, next[weakest]),
    confidence: marks.confidence,
    recommendation,
  };
}

async function scoreTranscript(fetchImpl, env, transcript) {
  const mapped = await callJev(fetchImpl, env, transcript);
  if (!env.OPENAI_API_KEY) {
    throw httpError(503, "OpenAI is not configured. Set OPENAI_API_KEY.");
  }

  const openai = await postJson(
    fetchImpl,
    OPENAI_URL,
    { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    {
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: CRITIC_INSTRUCTIONS,
        },
        { role: "user", content: transcript },
      ],
    },
  );
  const content = openai.json?.choices?.[0]?.message?.content;
  if (!openai.ok || typeof content !== "string") {
    throw httpError(502, "OpenAI request failed");
  }

  return applyCritic(mapped, parseCritic(content));
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  let body;
  try {
    body = JSON.parse(raw.toString("utf8") || "");
  } catch {
    throw httpError(400, "Request body must be JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw httpError(400, "Request body must be a JSON object");
  }
  return body;
}

async function handleClassify(req, res, { fetchImpl, env }) {
  const body = await parseJsonBody(req);
  if (typeof body.transcript !== "string") {
    throw httpError(400, "transcript must be a string");
  }
  const mapped = await callJev(fetchImpl, env, body.transcript);
  send(req, res, 200, {
    score: mapped.score,
    execution: mapped.execution,
    usefulness: mapped.usefulness,
    clarity: mapped.clarity,
    level: mapped.level,
    confidence: mapped.confidence,
  });
}

async function handleSessionsPost(req, res, { fetchImpl, store, env }) {
  const body = await parseJsonBody(req);
  if (!Number.isInteger(body.attempt) || body.attempt < 1) {
    throw httpError(400, "attempt must be an integer greater than or equal to 1");
  }
  if (typeof body.transcript !== "string") {
    throw httpError(400, "transcript must be a string");
  }
  if (body.mimeType != null && typeof body.mimeType !== "string") {
    throw httpError(400, "mimeType must be a string");
  }

  const audio = decodeAudio(body.audioBase64);
  const sentences = normalizeSentences(body.sentences);
  const scored = await scoreTranscript(fetchImpl, env, body.transcript);
  const row = {
    id: randomUUID(),
    attempt: body.attempt,
    transcript: body.transcript,
    audio,
    mimeType: body.mimeType ?? null,
    score: scored.score,
    execution: scored.execution,
    usefulness: scored.usefulness,
    clarity: scored.clarity,
    level: scored.level,
    confidence: scored.confidence,
    recommendation: scored.recommendation,
    sentences,
    createdAt: new Date().toISOString(),
  };
  await store.insert(row);
  send(req, res, 200, createdResponse(row));
}

async function handleDeepgram(req, res, { fetchImpl, env }) {
  const apiKey = env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw httpError(503, "Deepgram is not configured. Set DEEPGRAM_API_KEY.");
  }
  const response = await fetchImpl(DEEPGRAM_GRANT_URL, {
    method: "POST",
    headers: { authorization: `Token ${apiKey}` },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const accessToken = json?.access_token;
  if (!response.ok || typeof accessToken !== "string" || accessToken.length === 0) {
    throw httpError(502, "Deepgram token request failed");
  }
  if (accessToken === apiKey) {
    throw httpError(502, "Deepgram token request failed");
  }
  send(req, res, 200, { accessToken });
}

async function handleTranscribe(req, res, { fetchImpl, env }) {
  const apiKey = env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw httpError(503, "Deepgram is not configured. Set DEEPGRAM_API_KEY.");
  }
  const body = await parseJsonBody(req);
  if (typeof body.mimeType !== "string" || body.mimeType.length === 0) {
    throw httpError(400, "mimeType must be a string");
  }
  const audio = decodeAudio(body.audioBase64);
  if (!audio || audio.length === 0) {
    throw httpError(400, "audioBase64 must be a string");
  }
  const response = await fetchImpl(DEEPGRAM_LISTEN_URL, {
    method: "POST",
    headers: {
      authorization: `Token ${apiKey}`,
      "content-type": body.mimeType,
    },
    body: audio,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const transcript = transcriptText(json);
  const sentences = sentenceTimes(json);
  if (
    !response.ok ||
    transcript == null ||
    transcript.includes(apiKey) ||
    sentences.some((sentence) => sentence.text.includes(apiKey))
  ) {
    throw httpError(502, "Deepgram transcription failed");
  }
  send(req, res, 200, { transcript, sentences });
}

async function handle(req, res, options) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    send(req, res, 204);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/sessions") {
    const sessions = await options.store.list();
    send(req, res, 200, { sessions });
    return;
  }
  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const session = await options.store.get(decodeURIComponent(sessionMatch[1]));
    if (!session) {
      send(req, res, 404, { error: "Session not found" });
      return;
    }
    send(req, res, 200, session);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/deepgram/token") {
    await handleDeepgram(req, res, options);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/transcribe") {
    await handleTranscribe(req, res, options);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/classify") {
    await handleClassify(req, res, options);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    await handleSessionsPost(req, res, options);
    return;
  }
  send(req, res, 404, { error: "Not found" });
}

export function createServer({
  fetchImpl = globalThis.fetch,
  store,
  env = process.env,
} = {}) {
  if (!store) throw new Error("store is required");
  return http.createServer((req, res) => {
    handle(req, res, { fetchImpl, store, env }).catch((err) => {
      if (res.headersSent || res.writableEnded) return;
      const status = err.status || 500;
      const message = status === 500 ? "Internal error" : err.message;
      send(req, res, status, { error: message });
    });
  });
}
