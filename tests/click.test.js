import test from "node:test";
import assert from "node:assert/strict";
import { nextClickTime, CLICK_GAP_S, CLICK_MAX_AHEAD_S, CLICK_GAIN } from "../click.js";

test("Apple's click constants", () => {
  assert.equal(CLICK_GAP_S, 0.05);
  assert.equal(CLICK_MAX_AHEAD_S, 0.15);
  assert.equal(CLICK_GAIN, 0.3);
});

test("first click plays now, the next waits 50 ms", () => {
  assert.equal(nextClickTime(1, -Infinity), 1);
  assert.ok(Math.abs(nextClickTime(1, 1) - 1.05) < 1e-9);
  assert.equal(nextClickTime(2, 1), 2);
});

test("a burst queues up to 150 ms ahead, then drops", () => {
  let last = -Infinity;
  const played = [];
  for (let i = 0; i < 10; i++) {
    const at = nextClickTime(5, last);
    if (at != null) { played.push(at); last = at; }
  }
  assert.equal(played.length, 4);
  assert.ok(played.at(-1) - 5 <= CLICK_MAX_AHEAD_S + 1e-9);
});
