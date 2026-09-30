export type TimedSentence = {
  text: string;
  start: number;
  end: number | null;
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

/** Start time only, as hours:minutes:seconds. */
export function formatScriptClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const part = (value: number) => String(value).padStart(2, "0");
  return `${part(hours)}:${part(minutes)}:${part(remainder)}`;
}

function readSentences(value: unknown): TimedSentence[] {
  if (!Array.isArray(value)) return [];
  const sentences: TimedSentence[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.text !== "string" || item.text.trim().length === 0) continue;
    if (!isFiniteNumber(item.start)) continue;
    sentences.push({
      text: item.text,
      start: item.start,
      end: isFiniteNumber(item.end) ? item.end : null,
    });
  }
  return sentences;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
