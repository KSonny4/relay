export const LIVE_RELAY_API_BASE = "https://relay-server-9hzn.onrender.com";

export function resolveRelayApiBase(configured: string | undefined): string {
  const value = configured?.trim().replace(/\/$/, "");
  if (value) return value;
  return LIVE_RELAY_API_BASE;
}
