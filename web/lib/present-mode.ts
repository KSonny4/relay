export const REEL_ORIGIN = "https://relay-reel-live.onrender.com";

export type PresentedTakeAction = "start" | "stop";

export function isPresentMode(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("present") === "1";
}

/**
 * Start always requests a new take, even when one is already running.
 * Stop matches the on-screen Stop button, and only while audio is recording.
 */
export function presentedTakeAction(input: {
  origin: string;
  data: unknown;
  recording: boolean;
}): PresentedTakeAction | null {
  if (input.origin !== REEL_ORIGIN) return null;
  if (!input.data || typeof input.data !== "object") return null;
  const type = (input.data as { type?: unknown }).type;
  if (type === "relay:start-recording") return "start";
  if (type === "relay:stop-recording") return input.recording ? "stop" : null;
  return null;
}
