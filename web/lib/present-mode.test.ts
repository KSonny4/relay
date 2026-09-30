import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPresentMode, presentedTakeAction } from "./present-mode.ts";

describe("present mode", () => {
  it("opens the microphone on load only when present=1 is absent", () => {
    assert.equal(isPresentMode(""), false);
    assert.equal(isPresentMode("?present=0"), false);
    assert.equal(isPresentMode("?present=1"), true);
  });

  it("starts a new take from the reel every time, even if one is already recording", () => {
    const message = { type: "relay:start-recording" };
    assert.equal(
      presentedTakeAction({
        origin: "https://relay-reel-live.onrender.com",
        data: message,
        recording: false,
      }),
      "start",
    );
    assert.equal(
      presentedTakeAction({
        origin: "https://relay-reel-live.onrender.com",
        data: message,
        recording: true,
      }),
      "start",
    );
    assert.equal(
      presentedTakeAction({
        origin: "https://example.com",
        data: message,
        recording: false,
      }),
      null,
    );
    assert.equal(
      presentedTakeAction({
        origin: "https://relay-reel-live.onrender.com",
        data: { type: "other" },
        recording: true,
      }),
      null,
    );
  });

  it("stops only while a take is recording", () => {
    const message = { type: "relay:stop-recording" };
    assert.equal(
      presentedTakeAction({
        origin: "https://relay-reel-live.onrender.com",
        data: message,
        recording: true,
      }),
      "stop",
    );
    assert.equal(
      presentedTakeAction({
        origin: "https://relay-reel-live.onrender.com",
        data: message,
        recording: false,
      }),
      null,
    );
    assert.equal(
      presentedTakeAction({
        origin: "https://example.com",
        data: message,
        recording: true,
      }),
      null,
    );
  });
});
