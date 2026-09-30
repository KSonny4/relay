import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyScript,
  formatSentenceSpan,
  readTranscriptScript,
} from "./transcript-script.ts";

describe("timed transcript", () => {
  it("renders each sentence as minutes and seconds", () => {
    const script = readTranscriptScript({
      transcript: "We help developers ship. Reviews get faster.",
      sentences: [
        { text: "We help developers ship.", start: 4, end: 11 },
        { text: "Reviews get faster.", start: 65.2, end: 72 },
      ],
    });
    assert.equal(formatSentenceSpan(script.sentences[0]), "0:04–0:11");
    assert.equal(formatSentenceSpan(script.sentences[1]), "1:05–1:12");
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
