import test from "node:test";
import assert from "node:assert/strict";
import {
  SAFE, safeArea, spanAt, inSafe, clampToSafe, randomSpot, nextGlance, nextBlink, blinkScale, easeOut, easeInOut,
  glanceToward, eyeTransform, SACCADE_MS, HOLD_MS, BLINK_GAP_MS, BLINK_MS, HOME_CHANCE, DOUBLE_BLINK_CHANCE,
} from "../eyes.js";
import { CHARACTERS } from "../avatar.js";

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("every character has a safe area whose home is dead center", () => {
  for (const c of CHARACTERS) {
    const a = SAFE[c.id];
    assert.ok(a, c.id);
    assert.deepEqual(a.home, [0, 0]);
    assert.ok(inSafe(a, 0, 0), `${c.id} center inside`);
    for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i][0] > a.rows[i - 1][0], "rows sorted");
    for (const r of a.rows) assert.ok(r[1] <= r[2], "span not empty");
  }
  assert.equal(safeArea("nope"), SAFE.ball);
});

test("spans between rows take the tighter neighbour", () => {
  const a = { home: [0, 0], rows: [[0, -4, 4], [2, -1, 10]] };
  assert.deepEqual(spanAt(a, 1), [-1, 4]);
  assert.deepEqual(spanAt(a, 0), [-4, 4]);
  assert.equal(spanAt(a, 3), null);
  assert.deepEqual(clampToSafe(a, 20, 9), [10, 2]);
});

test("random spots, glances and clamps always stay inside", () => {
  const rand = lcg(7);
  for (const c of CHARACTERS) {
    const a = SAFE[c.id];
    for (let i = 0; i < 500; i++) {
      const [x, y] = randomSpot(a, rand);
      assert.ok(inSafe(a, x, y), `${c.id} random ${x},${y}`);
      const g = nextGlance(a, { rand });
      assert.ok(inSafe(a, g.x, g.y), `${c.id} glance`);
      const [cx, cy] = clampToSafe(a, rand() * 80 - 40, rand() * 80 - 40);
      assert.ok(inSafe(a, cx, cy), `${c.id} clamp`);
    }
    for (let d = 0; d < 360; d += 10) {
      const [x, y] = glanceToward(a, Math.cos(d), Math.sin(d));
      assert.ok(inSafe(a, x, y), `${c.id} toward ${d}`);
    }
  }
});

test("glances: snappy jump, long hold, about a fifth return to center", () => {
  const rand = lcg(42);
  let home = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const g = nextGlance(SAFE.ball, { rand });
    assert.ok(g.moveMs >= SACCADE_MS[0] && g.moveMs <= SACCADE_MS[1] && g.moveMs <= 210);
    assert.ok(g.holdMs >= HOLD_MS[0] && g.holdMs <= HOLD_MS[1]);
    if (g.x === 0 && g.y === 0) home++;
  }
  assert.equal(HOME_CHANCE, 0.2);
  assert.ok(Math.abs(home / N - HOME_CHANCE) < 0.05, `home share ${home / N}`);
});

test("glances land on the beat while playing and slow down when paused", () => {
  const g = nextGlance(SAFE.ball, { mode: "playing", beatMs: 500, rand: seq([0.9, 0.5, 0.5, 0.5]) });
  assert.equal(g.holdMs % 500, 0);
  const idle = nextGlance(SAFE.ball, { rand: seq([0.9, 0.5, 0.5, 0.5]) });
  const paused = nextGlance(SAFE.ball, { mode: "paused", rand: seq([0.9, 0.5, 0.5, 0.5]) });
  assert.ok(paused.holdMs > idle.holdMs);
});

test("blinks: every 1.6-3.5 s, 180-220 ms, double about 25%", () => {
  const rand = lcg(3);
  let doubles = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const b = nextBlink(rand);
    assert.ok(b.inMs >= BLINK_GAP_MS[0] && b.inMs <= BLINK_GAP_MS[1]);
    assert.ok(b.durMs >= BLINK_MS[0] && b.durMs <= BLINK_MS[1]);
    if (b.double) doubles++;
  }
  assert.equal(DOUBLE_BLINK_CHANCE, 0.25);
  assert.ok(Math.abs(doubles / N - DOUBLE_BLINK_CHANCE) < 0.03, `doubles ${doubles / N}`);
  const r = nextBlink(seq([0.5, 0.5, 0]), { reduced: true });
  assert.equal(r.double, false);
  assert.ok(r.inMs > BLINK_GAP_MS[1], "reduced motion blinks rarely");
});

test("blink scale goes 1 -> 0.1 -> 1 about the eyes' center", () => {
  assert.equal(blinkScale(0, 200), 1);
  assert.ok(Math.abs(blinkScale(100, 200) - 0.1) < 1e-9);
  assert.equal(blinkScale(200, 200), 1);
  assert.equal(blinkScale(-5, 200), 1);
  assert.equal(easeOut(0), 0);
  assert.equal(easeOut(1), 1);
  assert.ok(easeOut(0.5) > 0.5);
  assert.equal(eyeTransform(1.234, -2, 1), "translate(1.23 -2)");
  // scaleY 0.1 about y=63: 63 maps to itself.
  const t = eyeTransform(0, 0, 0.1);
  const [, ty] = t.match(/translate\(0 ([\d.]+)\)/);
  assert.ok(Math.abs(Number(ty) + 63 * 0.1 - 63) < 0.01, t);
  assert.match(t, /scale\(1 0\.1\)/);
});

test("glides ease in and out smoothly", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  assert.ok(Math.abs(easeInOut(0.5) - 0.5) < 1e-9);
  assert.ok(easeInOut(0.1) < 0.1 && easeInOut(0.9) > 0.9);
});
