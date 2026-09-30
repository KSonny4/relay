export const REEL_ORIGIN = "https://relay-reel-live.onrender.com";

export function isPresentMode(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("present") === "1";
}

export function shouldStartPresentedTake(input: {
  origin: string;
  data: unknown;
  takeRunning: boolean;
}): boolean {
  if (input.takeRunning) return false;
  if (input.origin !== REEL_ORIGIN) return false;
  if (!input.data || typeof input.data !== "object") return false;
  return (input.data as { type?: unknown }).type === "relay:start-recording";
}
