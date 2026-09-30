import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLASSIFY_MIN_INTERVAL_MS,
  createClassifyPlan,
  liveClassifyPayload,
  onClassifyTick,
  onTranscriptEvent,
  takeEnds,
  type ClassifyPlan,
  type TranscriptEvent,
} from "./take-rules.ts";

describe("take end", () => {
  it("a take does not auto-stop on a clock", () => {
    for (const elapsedMs of [0, 1_000, 60_000, 120_000, 600_000]) {
      assert.equal(
        takeEnds({ elapsedMs, msSinceLastWords: 0, userStopped: false }),
        false,
      );
    }
  });

  it("stop and 10s of silence both end the take", () => {
    assert.equal(takeEnds({ elapsedMs: 500, msSinceLastWords: 0, userStopped: true }), true);
    assert.equal(
      takeEnds({ elapsedMs: 60_000, msSinceLastWords: 10_000, userStopped: false }),
      true,
    );
    assert.equal(
      takeEnds({ elapsedMs: 12_000, msSinceLastWords: 9_999, userStopped: false }),
      false,
    );
  });
});

describe("live classify", () => {
  it("a classify call happens as transcript finals arrive", () => {
    const sent = playback([
      { atMs: 0, fullTranscript: "We help developers ship", isFinal: false },
      { atMs: 200, fullTranscript: "We help developers ship", isFinal: true },
      { atMs: 900, fullTranscript: "We help developers ship faster reviews", isFinal: true },
      { atMs: 1_600, fullTranscript: "We help developers ship faster reviews", isFinal: true },
    ]);

    assert.deepEqual(
      sent.map((call) => call.transcript),
      ["We help developers ship", "We help developers ship faster reviews"],
    );
    assert.equal(sent[0].atMs, 200);
    assert.equal(sent[1].atMs, 200 + CLASSIFY_MIN_INTERVAL_MS);
    assert.ok(sent[1].atMs - sent[0].atMs >= CLASSIFY_MIN_INTERVAL_MS);

    const body = liveClassifyPayload(sent[1].transcript);
    assert.deepEqual(body, { transcript: "We help developers ship faster reviews" });
    assert.equal("recommendation" in body, false);
  });
});

function playback(events: TranscriptEvent[]): Array<{ atMs: number; transcript: string }> {
  let plan: ClassifyPlan = createClassifyPlan();
  const sent: Array<{ atMs: number; transcript: string }> = [];
  let cursor = 0;

  for (const event of events) {
    while (plan.dueAtMs !== null && plan.dueAtMs <= event.atMs && plan.dueAtMs >= cursor) {
      const dueAtMs = plan.dueAtMs;
      const ticked = onClassifyTick(plan, dueAtMs);
      plan = ticked.plan;
      if (ticked.send) sent.push({ atMs: dueAtMs, transcript: ticked.send });
      if (ticked.plan.dueAtMs === dueAtMs) break;
    }
    const step = onTranscriptEvent(plan, event);
    plan = step.plan;
    if (step.send) sent.push({ atMs: event.atMs, transcript: step.send });
    cursor = event.atMs;
  }

  if (plan.dueAtMs !== null && plan.pendingTranscript !== null) {
    const ticked = onClassifyTick(plan, plan.dueAtMs);
    if (ticked.send) sent.push({ atMs: plan.dueAtMs, transcript: ticked.send });
  }

  return sent;
}
