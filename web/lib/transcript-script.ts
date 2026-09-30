export type TimedSentence = {
  text: string;
  start: number;
  end: number;
};

export type TranscriptScript = {
  transcript: string;
  sentences: TimedSentence[];
};

export const emptyScript: TranscriptScript = {
  transcript: "",
  sentences: [],
};

/** Read the transcript string and any timed sentences. Missing times stay empty. */
export function readTranscriptScript(body: object): TranscriptScript {
  const record = body as Record<string, unknown>;
  const transcript = typeof record.transcript === "string" ? record.transcript : "";
  return {
    transcript,
    sentences: readSentences(record.sentences),
  };
}

export function formatScriptTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatSentenceSpan(sentence: TimedSentence): string {
  return `${formatScriptTime(sentence.start)}–${formatScriptTime(sentence.end)}`;
}

function readSentences(value: unknown): TimedSentence[] {
  if (!Array.isArray(value)) return [];
  const sentences: TimedSentence[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.text !== "string" || item.text.trim().length === 0) continue;
    if (!isFiniteNumber(item.start) || !isFiniteNumber(item.end)) continue;
    sentences.push({ text: item.text, start: item.start, end: item.end });
  }
  return sentences;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
