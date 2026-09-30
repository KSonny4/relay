import { resolveRelayApiBase } from "./relay-api-base";
import { readCriteria, type Criteria } from "./score-display";
import { liveClassifyPayload } from "./take-rules";

export { LIVE_RELAY_API_BASE, resolveRelayApiBase } from "./relay-api-base";

export const RELAY_API_BASE = resolveRelayApiBase(process.env.NEXT_PUBLIC_RELAY_API_BASE);

export type Attempt = number;

export type LiveScore = Criteria;

export type Classification = Criteria & {
  id: string;
  attempt: Attempt;
  recommendation: string | null;
};

export type SessionRecord = Classification & {
  createdAt: string;
  transcript?: string;
};

export type SessionDetail = SessionRecord & {
  transcript: string;
};

export type ClassifyInput = {
  attempt: Attempt;
  transcript: string;
  audioBase64?: string;
  mimeType?: string;
};

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  const response = await relayFetch(`${RELAY_API_BASE}/api/transcribe`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audioBase64, mimeType }),
  }, "Transcription failed. The Relay API is not reachable.");
  if (!response.ok) {
    throw new Error(`Transcription failed (${response.status}).`);
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.transcript !== "string") {
    throw new Error("Transcription response was missing a transcript.");
  }
  return body.transcript;
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
  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new Error("attempt must be an integer >= 1");
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

export async function getSession(id: string): Promise<SessionDetail> {
  const response = await relayFetch(
    `${RELAY_API_BASE}/api/sessions/${encodeURIComponent(id)}`,
    { cache: "no-store" },
    "Could not open that recording. The Relay API is not reachable.",
  );
  if (!response.ok) {
    throw new Error(`Could not open that recording (${response.status}).`);
  }
  return parseSessionDetail(await response.json());
}

function parseLiveScore(body: unknown): LiveScore {
  if (!isRecord(body)) {
    throw new Error("Live score response was not an object.");
  }
  return readCriteria(body);
}

function parseClassification(body: unknown): Classification {
  if (!isRecord(body)) {
    throw new Error("Classification response was not an object.");
  }
  if (typeof body.id !== "string") {
    throw new Error("Classification response was missing id.");
  }
  const attempt = body.attempt;
  if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Classification response had an invalid attempt.");
  }
  return {
    id: body.id,
    attempt,
    recommendation: typeof body.recommendation === "string" ? body.recommendation : null,
    ...readCriteria(body),
  };
}

function parseSession(body: unknown): SessionRecord {
  const classification = parseClassification(body);
  if (!isRecord(body) || typeof body.createdAt !== "string") {
    throw new Error("A past session was missing createdAt.");
  }
  const transcript = typeof body.transcript === "string" ? body.transcript : undefined;
  return transcript === undefined
    ? { ...classification, createdAt: body.createdAt }
    : { ...classification, createdAt: body.createdAt, transcript };
}

function parseSessionDetail(body: unknown): SessionDetail {
  const session = parseSession(body);
  const transcript = isRecord(body) && typeof body.transcript === "string" ? body.transcript : "";
  return { ...session, transcript };
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
