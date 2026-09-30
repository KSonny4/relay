import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPresentMode, shouldStartPresentedTake } from "./present-mode.ts";

describe("present mode", () => {
  it("opens the microphone on load only when present=1 is absent", () => {
    assert.equal(isPresentMode(""), false);
    assert.equal(isPresentMode("?present=0"), false);
    assert.equal(isPresentMode("?present=1"), true);
  });

  it("starts one take from the reel message and ignores a second while it is running", () => {
    const message = { type: "relay:start-recording" };
    assert.equal(
      shouldStartPresentedTake({
        origin: "https://relay-reel-live.onrender.com",
        data: message,
        takeRunning: false,
      }),
      true,
    );
    assert.equal(
      shouldStartPresentedTake({
        origin: "https://relay-reel-live.onrender.com",
        data: message,
        takeRunning: true,
      }),
      false,
    );
    assert.equal(
      shouldStartPresentedTake({
        origin: "https://example.com",
        data: message,
        takeRunning: false,
      }),
      false,
    );
    assert.equal(
      shouldStartPresentedTake({
        origin: "https://relay-reel-live.onrender.com",
        data: { type: "other" },
        takeRunning: false,
      }),
      false,
    );
  });
});