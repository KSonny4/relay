import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatScoreOutOfTen } from "./score-display.ts";

describe("score display", () => {
  it("shows a 0–10 server score as a value out of 10", () => {
    assert.equal(formatScoreOutOfTen(7.8), "7.8 / 10");
    assert.equal(formatScoreOutOfTen(10), "10 / 10");
    assert.equal(formatScoreOutOfTen(0), "0 / 10");
  });

  it("scales a leftover 0–4 score for display only", () => {
    assert.equal(formatScoreOutOfTen(3.1), "7.8 / 10");
    assert.equal(formatScoreOutOfTen(4), "10 / 10");
    assert.equal(formatScoreOutOfTen(7.8).includes("/ 4"), false);
    assert.equal(formatScoreOutOfTen(3.1).includes("/ 4"), false);
  });
});
