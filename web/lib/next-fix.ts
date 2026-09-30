/** The fix line follows the recommendation text. A perfect total does not hide it. */
export function showsNextFix(recommendation: string | null | undefined): boolean {
  return typeof recommendation === "string" && recommendation.trim().length > 0;
}
