import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  HOLD_MS, HOLD_REPEAT_MS, SEEK_HOLD_STEPS, VOLUME_STEP_DEG, VOLUME_CLICK_DEG, IDLE_JUMP_MS,
  createHoldSeek, createScrollAccumulator, createReversalFilter, createRepeater, previousAction, seekAction,
  stepVolume, clampSeek, keyAction, keyStepAmount, seekMultiplier, tierFor, LIST_TIERS, SEEK_TIERS,
} from "../controls.js";

test("Apple's constants", () => {
  assert.equal(HOLD_MS, 1000);
  assert.equal(HOLD_REPEAT_MS, 500);
  assert.deepEqual(SEEK_HOLD_STEPS, [5, 5, 5, 10, 10, 10, 20]);
  assert.equal(VOLUME_STEP_DEG, 4.5);
  assert.ok(Math.abs(VOLUME_CLICK_DEG - 20.4545) < 1e-3);
  assert.deepEqual(SEEK_TIERS, [1, 2, 3, 5]);
  assert.equal(IDLE_JUMP_MS, 10000);
});

const np = (t, extra = {}) => ({ hasLoadedItem: true, currentTrackIndex: "a", currentPlaybackTime: t, currentPlaybackDuration: 200, ...extra });

test("hold-to-seek walks 5,5,5,10,10,10,20 from where the hold began", () => {
  const h = createHoldSeek();
  const got = [h.step(1, false, np(20))];
  // The player may not have caught up; the walk uses its own base.
  for (let i = 0; i < 7; i++) got.push(h.step(1, true, np(20)));
  assert.deepEqual(got, [25, 30, 35, 45, 55, 65, 85, 105]);
});

test("hold-to-seek backward clamps at 0 and then stops", () => {
  const h = createHoldSeek();
  assert.equal(h.step(-1, false, np(7)), 2);
  assert.equal(h.step(-1, true, np(7)), 0);
  assert.equal(h.step(-1, true, np(7)), undefined);
});

test("hold-to-seek does nothing in seek mode, without a track, or after a track change", () => {
  const h = createHoldSeek();
  assert.equal(h.step(1, false, np(10, { isSeeking: true })), undefined);
  assert.equal(h.step(1, false, np(10, { hasLoadedItem: false })), undefined);
  assert.equal(h.step(1, false, np(10)), 15);
  assert.equal(h.step(1, true, np(10, { currentTrackIndex: "b" })), undefined);
});

test("back: restart past 3 s while playing, else previous, else end", () => {
  assert.equal(previousAction({ isPlaying: true, currentTime: 3.5, position: 4 }), "restart");
  assert.equal(previousAction({ isPlaying: true, currentTime: 3, position: 4 }), "previous");
  assert.equal(previousAction({ isPlaying: false, currentTime: 50, position: 4 }), "previous");
  assert.equal(previousAction({ isPlaying: false, currentTime: 1, position: 0 }), "end");
  assert.equal(previousAction({ isPlaying: false, currentTime: 1, position: 0, repeatOne: true }), "restart");
});

test("seeking into the last 2 s skips when there is a next track", () => {
  assert.equal(seekAction(199, 200, true), "next");
  assert.equal(seekAction(199, 200, false), "seek");
  assert.equal(seekAction(197.9, 200, true), "seek");
});

test("volume is whole points clamped to 0-100; seek clamps and rounds", () => {
  assert.equal(stepVolume(80, 5), 85);
  assert.equal(stepVolume(98, 5), 100);
  assert.equal(stepVolume(2, -5), 0);
  assert.equal(clampSeek(12.6, 200), 13);
  assert.equal(clampSeek(-4, 200), 0);
  assert.equal(clampSeek(500, 200), 200);
});

test("volume: one point per 4.5°, a click per ~20.45° only if it moved", () => {
  let vol = 50;
  const clicks = [];
  const acc = createScrollAccumulator({
    move: (step, n) => { const next = stepVolume(vol, step * n); const moved = next !== vol; vol = next; return moved; },
    click: (n, t) => clicks.push([n, t]),
  });
  for (let i = 0; i < 30; i++) acc.scroll({ step: 1, degrees: 1.5, target: "volume" });
  assert.equal(vol, 60); // 45°
  assert.deepEqual(clicks, [[1, "volume"], [1, "volume"]]);
  vol = 100;
  clicks.length = 0;
  acc.reset();
  for (let i = 0; i < 30; i++) acc.scroll({ step: 1, degrees: 1.5, target: "volume" });
  assert.equal(vol, 100);
  assert.deepEqual(clicks, [], "pinned at max: silent");
});

test("seek: 15° per step times the speed tier, never clicks", () => {
  let t = 0;
  const clicks = [];
  const acc = createScrollAccumulator({ move: (step, n) => { t += step * n; return true; }, click: (n, x) => clicks.push(x) });
  acc.scroll({ step: 1, degrees: 31, target: "seek", multiplier: 3 });
  assert.equal(t, 6);
  assert.deepEqual(clicks, []);
});

test("direction change resets the accumulator", () => {
  let moves = 0;
  const acc = createScrollAccumulator({ move: () => { moves++; return true; }, click() {} });
  acc.scroll({ step: 1, degrees: 4, target: "volume" });
  acc.scroll({ step: -1, degrees: 4, target: "volume" });
  assert.equal(moves, 0);
});

test("reversal needs 8° the other way", () => {
  const f = createReversalFilter();
  assert.equal(f.next(5), 1);
  assert.equal(f.next(-3), 0);
  assert.equal(f.next(-4), 0);
  assert.equal(f.next(-1.5), -1);
  assert.equal(f.next(-1), -1);
});

test("speed tiers", () => {
  assert.equal(seekMultiplier(100, 5000), 1);
  assert.equal(seekMultiplier(300, 0), 1);
  assert.equal(seekMultiplier(300, 1100), 3);
  assert.equal(seekMultiplier(300, 9000), 5);
  assert.equal(tierFor(LIST_TIERS, 1600), 5);
});

test("keyboard map follows Apple's click wheel", () => {
  assert.deepEqual(keyAction("ArrowDown", "list"), { kind: "scroll", step: 1 });
  assert.deepEqual(keyAction("ArrowUp", "volume"), { kind: "scroll", step: 1 });
  assert.deepEqual(keyAction("ArrowDown", "seek"), { kind: "scroll", step: -1 });
  assert.deepEqual(keyAction("ArrowLeft", "list"), { kind: "press", button: "menu" });
  assert.deepEqual(keyAction("ArrowRight", "list"), { kind: "press", button: "select" });
  assert.deepEqual(keyAction("ArrowLeft", "volume"), { kind: "hold", button: "back", repeatInterval: 500 });
  assert.deepEqual(keyAction("ArrowRight", "seek"), { kind: "scroll", step: 1 });
  assert.deepEqual(keyAction("Enter", "list"), { kind: "press", button: "select" });
  assert.deepEqual(keyAction(" ", "list"), { kind: "press", button: "playpause" });
  assert.deepEqual(keyAction("Escape", "volume"), { kind: "hold", button: "menu" });
  assert.equal(keyAction("a", "list"), undefined);
  assert.equal(keyStepAmount("volume", 0), 5);
  assert.equal(keyStepAmount("list", 0), 1);
  assert.equal(keyStepAmount("list", 1000), 3);
  assert.equal(keyStepAmount("seek", 600), 2);
});

test("repeater: tap releases before the hold; hold fires then repeats", () => {
  mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    const fired = [];
    const r = createRepeater((repeat) => fired.push(repeat));
    r.start(1000, 500);
    mock.timers.tick(999);
    assert.equal(r.stop(), false, "a release before 1 s is a tap");
    assert.deepEqual(fired, []);
    r.start(1000, 500);
    mock.timers.tick(1000);
    mock.timers.tick(500);
    mock.timers.tick(500);
    assert.equal(r.stop(), true, "a release after a hold is not a tap");
    assert.deepEqual(fired, [false, true, true]);
    mock.timers.tick(5000);
    assert.equal(fired.length, 3, "nothing fires after release");
  } finally {
    mock.timers.reset();
  }
});
