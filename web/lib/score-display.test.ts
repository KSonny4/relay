import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatScoreOutOfTen } from "./score-display.ts";

describe("score display", () => {
  it("shows the server score as-is out of 10", () => {
    assert.equal(formatScoreOutOfTen(3.1), "3.1 / 10");
    assert.equal(formatScoreOutOfTen(7.8), "7.8 / 10");
    assert.equal(formatScoreOutOfTen(4), "4 / 10");
    assert.equal(formatScoreOutOfTen(10), "10 / 10");
    assert.equal(formatScoreOutOfTen(0), "0 / 10");
  });
});
