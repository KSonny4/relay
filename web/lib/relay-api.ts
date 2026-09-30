import { resolveRelayApiBase } from "./relay-api-base";
import { liveClassifyPayload } from "./take-rules";

export { LIVE_RELAY_API_BASE, resolveRelayApiBase } from "./relay-api-base";

export const RELAY_API_BASE = resolveRelayApiBase(process.env.NEXT_PUBLIC_RELAY_API_BASE);

export type Attempt = 1 | 2;

export type LiveScore = {
  score: number;
  level: string;
  confidence: number;
};

export type Classification = {
  id: string;
  attempt: Attempt;
  score: number;
  level: string;
  confidence: number;
  recommendation: string;
};

export type SessionRecord = Classification & {
  createdAt: string;
};

export type ClassifyInput = {
  attempt: Attempt;
  transcript: string;
  audioBase64?: string;
  mimeType?: string;
};

export async function fetchDeepgramAccessToken(): Promise<string> {
  const response = await relayFetch(`${RELAY_API_BASE}/api/deepgram/token`, {
    method: "POST",
    cache: "no-store",
  }, "Deepgram access token is unavailable. Paste a transcript to classify.");
  if (!response.ok) {
    throw new Error(
      `Deepgram access token is unavailable (${response.status}). Paste a transcript to classify.`,
    );
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.accessToken !== "string" || body.accessToken.length === 0) {
    throw new Error("Deepgram access token is unavailable. Paste a transcript to classify.");
  }
  return body.accessToken;
}

export async function classifyLive(transcript: string): Promise<LiveScore> {
  const response = await relayFetch(`${RELAY_API_BASE}/api/classify`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(liveClassifyPayload(transcript)),
  }, "Live score update failed. The Relay API is not reachable.");
  if (!response.ok) {
    throw new Error(`Live score update failed (${response.status}).`);
  }
  return parseLiveScore(await response.json());
}

export async function classifySession(input: ClassifyInput): Promise<Classification> {
  if (input.attempt !== 1 && input.attempt !== 2) {
    throw new Error("attempt must be 1 or 2");
  }
  const payload: Record<string, string | number> = {
    attempt: input.attempt,
    transcript: input.transcript,
  };
  if (input.audioBase64) {
    payload.audioBase64 = input.audioBase64;
  }
  if (input.mimeType) {
    payload.mimeType = input.mimeType;
  }

  const response = await relayFetch(`${RELAY_API_BASE}/api/sessions`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, "Classification failed. The Relay API is not reachable.");
  if (!response.ok) {
    throw new Error(`Classification failed (${response.status}).`);
  }
  return parseClassification(await response.json());
}

export async function listSessions(): Promise<SessionRecord[]> {
  const response = await relayFetch(`${RELAY_API_BASE}/api/sessions`, {
    cache: "no-store",
  }, "Could not load past sessions. The Relay API is not reachable.");
  if (!response.ok) {
    throw new Error(`Could not load past sessions (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.sessions)) {
    throw new Error("Past sessions response was missing a sessions list.");
  }
  return body.sessions.map(parseSession);
}

function parseLiveScore(body: unknown): LiveScore {
  if (!isRecord(body)) {
    throw new Error("Live score response was not an object.");
  }
  if (typeof body.score !== "number") {
    throw new Error("Live score response was missing score.");
  }
  if (typeof body.level !== "string") {
    throw new Error("Live score response was missing level.");
  }
  if (typeof body.confidence !== "number") {
    throw new Error("Live score response was missing confidence.");
  }
  return {
    score: body.score,
    level: body.level,
    confidence: body.confidence,
  };
}

function parseClassification(body: unknown): Classification {
  if (!isRecord(body)) {
    throw new Error("Classification response was not an object.");
  }
  if (typeof body.id !== "string") {
    throw new Error("Classification response was missing id.");
  }
  if (body.attempt !== 1 && body.attempt !== 2) {
    throw new Error("Classification response had an invalid attempt.");
  }
  if (typeof body.score !== "number") {
    throw new Error("Classification response was missing score.");
  }
  if (typeof body.level !== "string") {
    throw new Error("Classification response was missing level.");
  }
  if (typeof body.confidence !== "number") {
    throw new Error("Classification response was missing confidence.");
  }
  if (typeof body.recommendation !== "string") {
    throw new Error("Classification response was missing recommendation.");
  }
  return {
    id: body.id,
    attempt: body.attempt,
    score: body.score,
    level: body.level,
    confidence: body.confidence,
    recommendation: body.recommendation,
  };
}

function parseSession(body: unknown): SessionRecord {
  const classification = parseClassification(body);
  if (!isRecord(body) || typeof body.createdAt !== "string") {
    throw new Error("A past session was missing createdAt.");
  }
  return { ...classification, createdAt: body.createdAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function relayFetch(url: string, init: RequestInit, unreachable: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(unreachable);
  }
}
