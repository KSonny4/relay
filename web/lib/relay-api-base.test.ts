import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIVE_RELAY_API_BASE, resolveRelayApiBase } from "./relay-api-base.ts";

describe("relay API base", () => {
  it("uses the live Render server unless an env value points somewhere else", () => {
    assert.equal(resolveRelayApiBase(undefined), LIVE_RELAY_API_BASE);
    assert.equal(resolveRelayApiBase(""), LIVE_RELAY_API_BASE);
    assert.equal(resolveRelayApiBase("   "), LIVE_RELAY_API_BASE);
    assert.equal(LIVE_RELAY_API_BASE, "https://relay-server-9hzn.onrender.com");
    assert.equal(resolveRelayApiBase("http://127.0.0.1:43124"), "http://127.0.0.1:43124");
    assert.equal(resolveRelayApiBase("http://127.0.0.1:43124/"), "http://127.0.0.1:43124");
  });
});
