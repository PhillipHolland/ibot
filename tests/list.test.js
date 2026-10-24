import test from "node:test";
import assert from "node:assert/strict";
import { windowStart } from "../list.js";

test("selection sits on the third row when the list allows", () => {
  assert.equal(windowStart(0, 100, 6), 0);
  assert.equal(windowStart(2, 100, 6), 0);
  assert.equal(windowStart(3, 100, 6), 1);
  assert.equal(windowStart(50, 100, 6), 48);
});

test("window never runs past the end or below zero", () => {
  assert.equal(windowStart(99, 100, 6), 94);
  assert.equal(windowStart(4, 5, 6), 0);
  assert.equal(windowStart(0, 0, 6), 0);
  assert.equal(windowStart(500, 10, 6), 4);
});

test("matches the old inline formula for every index", () => {
  for (const len of [1, 5, 6, 7, 30]) {
    for (let i = 0; i < len; i++) {
      const old = Math.max(0, Math.min(i - 2, Math.max(0, len - 6)));
      assert.equal(windowStart(i, len, 6), old);
    }
  }
});
