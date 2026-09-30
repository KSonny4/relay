/** The server score is already on a 0–10 scale. Show that number unchanged. */
export function formatScoreOutOfTen(score: number): string {
  return `${score} / 10`;
}
