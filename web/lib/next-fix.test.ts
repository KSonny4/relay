import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showsNextFix } from "./next-fix.ts";

const PERFECT_TAKE =
  "Please clarify exactly what Relay is, who specifically it is for, and suggest trying a demo with a team preparing for a pitch next.";

describe("next fix line", () => {
  it("shows a saved recommendation even when the total is 20", () => {
    assert.equal(showsNextFix(PERFECT_TAKE), true);
  });

  it("hides the line only when the recommendation is empty", () => {
    assert.equal(showsNextFix(null), false);
    assert.equal(showsNextFix(undefined), false);
    assert.equal(showsNextFix(""), false);
    assert.equal(showsNextFix("   "), false);
  });
});
