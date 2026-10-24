/**
 * Click-wheel control logic copied from Apple's iPod
 * (music.apple.com/includes/ipod/web-music-ipod.esm.js). Pure, no DOM.
 * Line numbers refer to that bundle.
 */

/** Long-press duration for menu, back, forward (`Oe`, line 986). */
export const HOLD_MS = 1000;
/** Back/forward hold repeat interval (`ul`, line 986). */
export const HOLD_REPEAT_MS = 500;
/** Seconds per hold-to-seek repeat (`Ol`, line 986, used by `Zr` line 7146). */
export const SEEK_HOLD_STEPS = [5, 5, 5, 10, 10, 10, 20];
/** Seek seconds per wheel step by speed tier (`yl.tiers`). */
export const SEEK_TIERS = [1, 2, 3, 5];
/** List rows per step by tier (`vl.tiers`). */
export const LIST_TIERS = [1, 2, 3, 5, 8, 13, 21, 34];
export const TIER_MS = 500;
export const MIN_SPEED = 180;
/** Degrees per volume step (`Ps`) and per volume click (`Es`), line 999. */
export const VOLUME_STEP_DEG = (1.25 * 360) / 100;
export const VOLUME_CLICK_DEG = (1.25 * 360) / 22;
/** Volume points per arrow-key step (`bs`). */
export const VOLUME_KEY_STEP = 5;
/** Volume overlay and seek mode close after 5 s idle (`ws`, `fs`). */
export const VOLUME_IDLE_MS = 5000;
export const SEEK_IDLE_MS = 5000;
/** Seek preview commits 1 s after the last change (`As`). */
export const SEEK_COMMIT_MS = 1000;
/** Arrow key repeat: 300 ms delay, then every 80 ms (`gs`, `ms`). */
export const KEY_REPEAT_DELAY_MS = 300;
export const KEY_REPEAT_MS = 80;
/** Back restarts the track instead when playing past 3 s (`br`, line 6411). */
export const RESTART_THRESHOLD_S = 3;
/** Seeking into the last 2 s skips to the next track (`Ne`, line 6411). */
export const END_GUARD_S = 2;
/** Wheel direction-change dead zone (`Vh`, line 5490). */
export const REVERSAL_DEG = 8;

/** `El`: tier for how long a fast spin or key hold has lasted. */
export function tierFor(tiers, heldMs) {
  const i = Math.min(tiers.length - 1, Math.max(0, Math.floor((Number(heldMs) || 0) / TIER_MS)));
  return tiers[i];
}

/** Seek multiplier from the shared accelerator output (`yl` through `Ja`). */
export function seekMultiplier(speed, heldMs) {
  return speed > MIN_SPEED ? tierFor(SEEK_TIERS, heldMs) : SEEK_TIERS[0];
}

/** `pl`: whole steps in an accumulated angle, and what is left over. */
export function splitSteps(total, per) {
  const count = Math.floor(total / per);
  return { count, remainder: total - count * per };
}

/**
 * `Yh` direction filter: a reversal only counts after 8° of travel the
 * other way. Returns the step sign to use, or 0 while inside the dead zone.
 */
export function createReversalFilter() {
  let dir;
  let pending = 0;
  return {
    next(deltaDeg) {
      if (!deltaDeg) return 0;
      const s = deltaDeg > 0 ? 1 : -1;
      if (dir === undefined || s === dir) { dir = s; pending = 0; return s; }
      pending += Math.abs(deltaDeg);
      if (pending < REVERSAL_DEG) return 0;
      dir = s; pending = 0;
      return s;
    },
    reset() { dir = undefined; pending = 0; },
  };
}

/**
 * `Xr` (line 7109): turns wheel degrees into moves for volume and seek.
 * `move(step, count)` returns whether anything changed; `click(count, target)`
 * plays clicks. Volume clicks every ~20.45° only if the volume moved since
 * the last click. Seek never clicks (`S`, line 7547).
 */
export function createScrollAccumulator({ move, click }) {
  let acc = 0, lastStep, lastVolume, clickAcc = 0, movedSinceClick = false;
  function reset() { acc = 0; clickAcc = 0; movedSinceClick = false; }
  function scroll({ step, degrees, target, multiplier = 1, dragStepDegrees = 15 }) {
    const isVolume = target === "volume";
    if (step !== lastStep || isVolume !== lastVolume) { lastStep = step; lastVolume = isVolume; reset(); }
    acc += degrees;
    if (isVolume) {
      const v = splitSteps(acc, VOLUME_STEP_DEG);
      acc = v.remainder;
      if (v.count >= 1) movedSinceClick = move(step, v.count) || movedSinceClick;
      const c = splitSteps(clickAcc + degrees, VOLUME_CLICK_DEG);
      clickAcc = c.remainder;
      if (c.count >= 1) {
        if (movedSinceClick) click(c.count, "volume");
        movedSinceClick = false;
      }
      return;
    }
    const s = splitSteps(acc, dragStepDegrees);
    acc = s.remainder;
    if (s.count < 1) return;
    if (move(step, s.count * multiplier) && target !== "seek") click(s.count, target);
  }
  return { scroll, reset };
}

/**
 * `Zr` (line 7146): hold back/forward to seek. The first fire captures the
 * current time; each repeat walks SEEK_HOLD_STEPS. Returns the time to seek
 * to, or undefined when nothing should happen.
 */
export function createHoldSeek() {
  let base, track, count = 0;
  function step(dir, repeat, { isInert = false, isSeeking = false, hasLoadedItem, currentTrackIndex, currentPlaybackTime, currentPlaybackDuration }) {
    if (!repeat) { base = isInert ? undefined : currentPlaybackTime; track = currentTrackIndex; count = 0; }
    if (base === undefined || isInert || isSeeking || !hasLoadedItem || !(currentPlaybackDuration > 0) || currentTrackIndex !== track) return undefined;
    const secs = SEEK_HOLD_STEPS[Math.min(count, SEEK_HOLD_STEPS.length - 1)];
    const to = Math.min(Math.max(base + dir * secs, 0), currentPlaybackDuration);
    count += 1;
    base = to > 0 && to < currentPlaybackDuration ? to : undefined;
    return to;
  }
  return { step, cancel() { base = undefined; } };
}

/**
 * `skipToPreviousItem` (line 6633): restart when playing past 3 s, else go
 * to the previous track, else end the queue.
 */
export function previousAction({ isPlaying, currentTime, position, repeatOne = false }) {
  if (repeatOne) return "restart";
  if (isPlaying && currentTime > RESTART_THRESHOLD_S) return "restart";
  if (position > 0) return "previous";
  return "end";
}

/** `seekToTime` (line 6672): a seek into the last 2 s skips ahead when there is a next track. */
export function seekAction(time, duration, hasNext) {
  if (Number.isFinite(duration) && duration > END_GUARD_S && time >= duration - END_GUARD_S && hasNext) return "next";
  return "seek";
}

/** `zh` volume: whole points 0-100. Returns the new value. */
export function stepVolume(percent, delta) {
  return Math.min(100, Math.max(0, Math.round(percent) + delta));
}

/** Seek preview (`wh.seekTo`): rounded and clamped to [0, duration]. */
export function clampSeek(time, duration) {
  const max = duration > 0 ? duration : Infinity;
  return Math.min(max, Math.max(0, Math.round(time)));
}

/**
 * Click-wheel keyboard map (`k`, line 6097). target is "list", "volume"
 * (Now Playing) or "seek".
 */
export function keyAction(key, target) {
  switch (key) {
    case "ArrowUp":
    case "ArrowDown":
      return { kind: "scroll", step: key === (target === "list" ? "ArrowDown" : "ArrowUp") ? 1 : -1 };
    case "ArrowLeft":
    case "ArrowRight": {
      const left = key === "ArrowLeft";
      if (target === "seek") return { kind: "scroll", step: left ? -1 : 1 };
      if (target === "volume") return { kind: "hold", button: left ? "back" : "forward", repeatInterval: HOLD_REPEAT_MS };
      return { kind: "press", button: left ? "menu" : "select" };
    }
    case "Enter":
      return { kind: "press", button: "select" };
    case " ":
      return { kind: "press", button: "playpause" };
    case "Escape":
      return { kind: "hold", button: "menu" };
    default:
      return undefined;
  }
}

/** Rows or seconds or volume points for one arrow-key step held for heldMs (`keyStep`, `ke`). */
export function keyStepAmount(target, heldMs) {
  if (target === "seek") return tierFor(SEEK_TIERS, heldMs);
  if (target === "volume") return VOLUME_KEY_STEP;
  return tierFor(LIST_TIERS, heldMs);
}

/**
 * `Sl` (line 1124): fire once after `delay`, then every `interval` if set.
 * stop() returns whether it fired, so a release before the hold can act as
 * a tap. Timers are injectable for tests.
 */
export function createRepeater(fire, timers = globalThis) {
  let t, iv, fired = false;
  function clear() { timers.clearTimeout(t); timers.clearInterval(iv); t = undefined; iv = undefined; }
  function stop() { clear(); const f = fired; fired = false; return f; }
  function start(delay, interval) {
    stop();
    t = timers.setTimeout(() => {
      t = undefined; fired = true; fire(false);
      if (fired && interval !== undefined) iv = timers.setInterval(() => fire(true), interval);
    }, delay);
  }
  return { start, stop, get active() { return t !== undefined || iv !== undefined; } };
}

/** Apple's idle jump to Now Playing while music plays (`ps`, line 986). */
export const IDLE_JUMP_MS = 10000;
