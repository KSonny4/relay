import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOLLOW_SLACK_PX,
  followAfterScriptChange,
  followNewestAfterScroll,
  scrollTopForNewestRow,
} from "./follow-transcript.ts";

describe("follow the newest sentence", () => {
  it("stays with the newest sentence only while the reader is at the bottom", () => {
    assert.equal(
      followNewestAfterScroll({
        programmatic: false,
        wasFollowing: true,
        distanceFromBottomPx: 0,
      }),
      true,
    );
    assert.equal(
      followNewestAfterScroll({
        programmatic: false,
        wasFollowing: true,
        distanceFromBottomPx: FOLLOW_SLACK_PX,
      }),
      true,
    );
    assert.equal(
      followNewestAfterScroll({
        programmatic: false,
        wasFollowing: true,
        distanceFromBottomPx: FOLLOW_SLACK_PX + 1,
      }),
      false,
    );
  });

  it("does not yank a reader back until they return to the bottom", () => {
    assert.equal(
      followNewestAfterScroll({
        programmatic: false,
        wasFollowing: false,
        distanceFromBottomPx: 640,
      }),
      false,
    );
    assert.equal(
      followNewestAfterScroll({
        programmatic: false,
        wasFollowing: false,
        distanceFromBottomPx: 8,
      }),
      true,
    );
  });

  it("ignores the scroll that revealed the newest sentence", () => {
    assert.equal(
      followNewestAfterScroll({
        programmatic: true,
        wasFollowing: true,
        distanceFromBottomPx: 400,
      }),
      true,
    );
  });

  it("follows again when the next pitch clears the script", () => {
    assert.equal(followAfterScriptChange({ sentenceCount: 0, wasFollowing: false }), true);
    assert.equal(followAfterScriptChange({ sentenceCount: 4, wasFollowing: false }), false);
  });

  it("leaves the window alone when the newest row is already in view", () => {
    assert.equal(
      scrollTopForNewestRow({
        scrollTop: 0,
        viewportHeight: 800,
        rowTop: 200,
        rowHeight: 40,
        reservePx: 112,
      }),
      null,
    );
  });

  it("scrolls so the newest row clears the stop button", () => {
    assert.equal(
      scrollTopForNewestRow({
        scrollTop: 0,
        viewportHeight: 800,
        rowTop: 860,
        rowHeight: 40,
        reservePx: 112,
      }),
      212,
    );
  });

  it("scrolls a saved session so the last row is in view", () => {
    assert.equal(
      scrollTopForNewestRow({
        scrollTop: 0,
        viewportHeight: 700,
        rowTop: 1200,
        rowHeight: 48,
        reservePx: 24,
      }),
      572,
    );
  });
});
