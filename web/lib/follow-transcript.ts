/** Slack before a reader counts as having left the newest sentence. */
export const FOLLOW_SLACK_PX = 120;

/** Clears the fixed Stop control on a live take (`pb-28`). */
export const LIVE_TAKE_BOTTOM_RESERVE_PX = 112;

/** Keeps the last row off the viewport edge on a saved session. */
export const SAVED_SESSION_BOTTOM_RESERVE_PX = 24;

export function distanceFromBottom(
  scrollHeight: number,
  scrollTop: number,
  viewportHeight: number,
): number {
  return scrollHeight - scrollTop - viewportHeight;
}

/** True when the page is still at the newest sentence. */
export function isWithNewestSentence(
  distanceFromBottomPx: number,
  slackPx = FOLLOW_SLACK_PX,
): boolean {
  return distanceFromBottomPx <= slackPx;
}

/**
 * A scroll we caused does not count as leaving the newest sentence.
 * A reader who has moved up stays put until they return to the bottom.
 */
export function followNewestAfterScroll(input: {
  programmatic: boolean;
  wasFollowing: boolean;
  distanceFromBottomPx: number;
}): boolean {
  if (input.programmatic) return input.wasFollowing;
  return isWithNewestSentence(input.distanceFromBottomPx);
}

/** A new take starts at the newest sentence again. */
export function followAfterScriptChange(input: {
  sentenceCount: number;
  wasFollowing: boolean;
}): boolean {
  if (input.sentenceCount === 0) return true;
  return input.wasFollowing;
}

/**
 * Window scroll offset that puts the newest row fully in view above `reservePx`.
 * Null when that row is already visible.
 */
export function scrollTopForNewestRow(input: {
  scrollTop: number;
  viewportHeight: number;
  rowTop: number;
  rowHeight: number;
  reservePx: number;
}): number | null {
  if (input.viewportHeight <= input.reservePx) return null;
  const rowBottom = input.rowTop + input.rowHeight;
  const visibleBottom = input.scrollTop + input.viewportHeight - input.reservePx;
  if (input.rowTop >= input.scrollTop && rowBottom <= visibleBottom) return null;
  return Math.max(0, rowBottom - (input.viewportHeight - input.reservePx));
}
