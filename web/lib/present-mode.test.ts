import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPresentMode,
  presentedStartOpensRecord,
  presentedTakeAction,
  readPresentedCommand,
} from "./present-mode.ts";
import {
  consumePresentedStart,
  deliverPresentedCommand,
  setPresentedHandler,
} from "./present-queue.ts";

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

  it("opens the record page from the list, where the deck embeds the app", () => {
    assert.equal(presentedStartOpensRecord("/"), true);
    assert.equal(presentedStartOpensRecord("/sessions/4efcc5f3"), true);
    assert.equal(presentedStartOpensRecord("/record"), false);
    assert.equal(readPresentedCommand({
      origin: "https://relay-reel-live.onrender.com",
      data: { type: "relay:start-recording" },
    }), "start");
  });

  it("remembers a start until the record page is listening, and ignores a stop with no take", () => {
    assert.equal(consumePresentedStart(), false);
    deliverPresentedCommand("stop");
    assert.equal(consumePresentedStart(), false);
    deliverPresentedCommand("start");
    const seen: string[] = [];
    const stop = setPresentedHandler((command) => {
      seen.push(command);
    });
    assert.equal(consumePresentedStart(), true);
    deliverPresentedCommand("start");
    deliverPresentedCommand("stop");
    stop();
    deliverPresentedCommand("start");
    assert.deepEqual(seen, ["start", "stop"]);
    assert.equal(consumePresentedStart(), true);
    assert.equal(consumePresentedStart(), false);
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
