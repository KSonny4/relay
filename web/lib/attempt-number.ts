export function nextAttempt(savedAttempts: readonly number[]): number {
  let highest = 0;
  for (const attempt of savedAttempts) {
    if (Number.isInteger(attempt) && attempt > highest) highest = attempt;
  }
  return highest + 1;
}
