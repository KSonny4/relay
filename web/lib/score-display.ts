/**
 * Display-only. The server is expected to send score out of 10.
 * A leftover 0–4 value is scaled by 2.5 so 3.1 renders as 7.8, not 3.1 / 4.
 */
export function formatScoreOutOfTen(score: number): string {
  const scaled = score >= 0 && score <= 4 ? score * 2.5 : score;
  const rounded = Math.round(scaled * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} / 10`;
}
