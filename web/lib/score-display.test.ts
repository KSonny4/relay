import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criteriaTotal,
  emptyCriteria,
  readCriteria,
  shownCriterion,
  shownTotal,
} from "./score-display.ts";

describe("score display", () => {
  it("sums the three criteria out of 20 and shows execution doubled only in the total", () => {
    const criteria = readCriteria({ execution: 4, usefulness: 5, clarity: 3, score: 7.8 });
    assert.equal(shownCriterion(criteria.execution), "4");
    assert.equal(shownCriterion(criteria.usefulness), "5");
    assert.equal(shownCriterion(criteria.clarity), "3");
    assert.equal(criteriaTotal(criteria), 16);
    assert.equal(shownTotal(criteria), "16 / 20");
    assert.equal(shownTotal(readCriteria({ execution: 1, usefulness: 1, clarity: 1 })), "4 / 20");
    assert.equal(shownTotal(readCriteria({ execution: 5, usefulness: 5, clarity: 5 })), "20 / 20");
  });

  it("does not invent criteria or a total from a single score", () => {
    const criteria = readCriteria({ score: 3.1 });
    assert.deepEqual(criteria, emptyCriteria);
    assert.equal(shownCriterion(criteria.execution), "—");
    assert.equal(shownCriterion(criteria.usefulness), "—");
    assert.equal(shownCriterion(criteria.clarity), "—");
    assert.equal(shownTotal(criteria), "—");
    assert.equal(shownTotal(readCriteria({ execution: 4, score: 10 })), "—");
    assert.equal(shownCriterion(readCriteria({ execution: "4" }).execution), "—");
  });
});
