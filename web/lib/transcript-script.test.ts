import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyScript,
  formatScriptClock,
  readTranscriptScript,
} from "./transcript-script.ts";

describe("timed transcript", () => {
  it("shows the start time only, as hours:minutes:seconds", () => {
    const script = readTranscriptScript({
      transcript: "We help developers ship. Reviews get faster.",
      sentences: [
        { text: "We help developers ship.", start: 0, end: 5 },
        { text: "Reviews get faster.", start: 65.2, end: 72 },
      ],
    });
    assert.equal(formatScriptClock(script.sentences[0].start), "00:00:00");
    assert.equal(formatScriptClock(script.sentences[1].start), "00:01:05");
    assert.equal(formatScriptClock(4), "00:00:04");
  });

  it("does not invent times when the sentences array is missing", () => {
    const script = readTranscriptScript({
      transcript: "We help developers ship.",
      score: 14,
    });
    assert.equal(script.transcript, "We help developers ship.");
    assert.deepEqual(script.sentences, emptyScript.sentences);
    const partial = readTranscriptScript({
      transcript: "We help developers ship.",
      sentences: [{ text: "We help developers ship.", start: "4", end: 11 }],
    });
    assert.deepEqual(partial.sentences, []);
  });
});