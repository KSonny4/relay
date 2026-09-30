import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextAttempt } from "./attempt-number.ts";

describe("next attempt", () => {
  it("starts at 1 and then uses the highest saved attempt plus one", () => {
    assert.equal(nextAttempt([]), 1);
    assert.equal(nextAttempt([1]), 2);
    assert.equal(nextAttempt([1, 2]), 3);
    assert.equal(nextAttempt([7, 2]), 8);
  });
});
