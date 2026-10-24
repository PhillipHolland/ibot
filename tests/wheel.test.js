import test from "node:test";
import assert from "node:assert/strict";
import { angleDelta, consumeRotation, pointerAngle, volumeDelta, ROW_DEG } from "../wheel.js";

test("angleDelta wraps across the branch cut", () => {
  const d = angleDelta(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(d - 0.2) < 1e-9);
});

test("one row per 15 degrees", () => {
  const step = (ROW_DEG * Math.PI) / 180;
  let carry = { acc: 0, dir: 0, pending: 0 };
  let rows = 0;
  for (let i = 0; i < 24; i++) {
    const spun = consumeRotation(carry, step);
    carry = spun.carry;
    rows += spun.rows;
  }
  assert.equal(rows, 24);
  assert.ok(Math.abs(carry.acc) < 1e-9);
});

test("partial turns stay in the carry", () => {
  const spun = consumeRotation(0, (10 * Math.PI) / 180);
  assert.equal(spun.rows, 0);
  const next = consumeRotation(spun.carry, (10 * Math.PI) / 180);
  assert.equal(next.rows, 1);
});

test("8 degree reversal is ignored", () => {
  const fwd = consumeRotation({ acc: 0, dir: 1, pending: 0 }, (20 * Math.PI) / 180);
  const back = consumeRotation(fwd.carry, (-7 * Math.PI) / 180);
  assert.equal(back.rows, 0);
  assert.equal(back.carry.dir, 1);
});

test("negative rotation moves backward", () => {
  const spun = consumeRotation(0, (-30 * Math.PI) / 180);
  assert.equal(spun.rows, -2);
});

test("volume steps 4.5 degrees", () => {
  assert.ok(Math.abs(volumeDelta(4.5) - 0.01) < 1e-9);
});

test("pointerAngle is atan2 from center", () => {
  assert.ok(Math.abs(pointerAngle(0, 0, 1, 0)) < 1e-9);
  assert.ok(Math.abs(pointerAngle(0, 0, 0, 1) - Math.PI / 2) < 1e-9);
});

import { createAccelerator, accelerate, segmentDistToCenter } from "../wheel.js";

test("one jittery fast sample does not trigger acceleration", () => {
  const acc = createAccelerator();
  accelerate(acc, 2, 1000);
  const r = accelerate(acc, 30, 1001);
  assert.ok(r.speed < 180);
});

test("speed resets after a 250ms pause", () => {
  const acc = createAccelerator();
  let t = 0;
  for (let i = 0; i < 40; i++) accelerate(acc, 8, (t += 16));
  assert.ok(acc.ema >= 180);
  const r = accelerate(acc, 1, t + 400);
  assert.ok(r.speed < 180 && r.heldMs === 0);
});

test("speed is capped at 400", () => {
  const acc = createAccelerator();
  let t = 0, r;
  for (let i = 0; i < 100; i++) r = accelerate(acc, 90, (t += 16));
  assert.ok(r.speed <= 400);
});

test("segment through center is detected", () => {
  assert.ok(segmentDistToCenter(-10, 0, 10, 0) < 1e-9);
  assert.ok(Math.abs(segmentDistToCenter(-10, 5, 10, 5) - 5) < 1e-9);
});
