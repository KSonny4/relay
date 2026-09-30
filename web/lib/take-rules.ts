export const SILENCE_END_MS = 10_000;
export const CLASSIFY_MIN_INTERVAL_MS = 2_000;

export type TakeClock = {
  elapsedMs: number;
  msSinceLastWords: number;
  userStopped: boolean;
};

/**
 * Length is arbitrary. Elapsed time never ends a take.
 * The take ends when the user stops it, or after 10 seconds with no new words.
 */
export function takeEnds(clock: TakeClock): boolean {
  if (clock.userStopped) return true;
  return clock.msSinceLastWords >= SILENCE_END_MS;
}

export function nextWordsAt(
  previousTranscript: string,
  nextTranscript: string,
  lastWordsAtMs: number,
  nowMs: number,
): number {
  const next = nextTranscript.trim();
  if (next.length > 0 && next !== previousTranscript.trim()) return nowMs;
  return lastWordsAtMs;
}

export type ClassifyPlan = {
  lastSentAtMs: number | null;
  dueAtMs: number | null;
  pendingTranscript: string | null;
};

export function createClassifyPlan(): ClassifyPlan {
  return { lastSentAtMs: null, dueAtMs: null, pendingTranscript: null };
}

export type TranscriptEvent = {
  atMs: number;
  fullTranscript: string;
  isFinal: boolean;
};

export type ClassifyStep = {
  plan: ClassifyPlan;
  send: string | null;
};

export function liveClassifyPayload(transcript: string): { transcript: string } {
  return { transcript };
}

export function onTranscriptEvent(plan: ClassifyPlan, event: TranscriptEvent): ClassifyStep {
  if (!event.isFinal) return { plan, send: null };
  const transcript = event.fullTranscript.trim();
  if (!transcript) return { plan, send: null };

  const elapsedSinceSend =
    plan.lastSentAtMs === null ? CLASSIFY_MIN_INTERVAL_MS : event.atMs - plan.lastSentAtMs;
  if (elapsedSinceSend >= CLASSIFY_MIN_INTERVAL_MS) {
    return {
      plan: { lastSentAtMs: event.atMs, dueAtMs: null, pendingTranscript: null },
      send: transcript,
    };
  }

  return {
    plan: {
      lastSentAtMs: plan.lastSentAtMs,
      dueAtMs: plan.lastSentAtMs! + CLASSIFY_MIN_INTERVAL_MS,
      pendingTranscript: transcript,
    },
    send: null,
  };
}

export function onClassifyTick(plan: ClassifyPlan, atMs: number): ClassifyStep {
  if (plan.pendingTranscript === null || plan.dueAtMs === null || atMs < plan.dueAtMs) {
    return { plan, send: null };
  }
  return {
    plan: { lastSentAtMs: atMs, dueAtMs: null, pendingTranscript: null },
    send: plan.pendingTranscript,
  };
}
