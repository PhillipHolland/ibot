/**
 * Center-button bot eyes. The body never moves; only the `.eyes` group does.
 * The pair glides (150-210 ms, eased in and out), holds 0.3-1.4 s, and blinks. Pure translate
 * X/Y; the only shape change is the blink's scaleY about the eyes' center. Pure scheduling
 * and bounds logic is exported for tests; createEyes() drives the DOM.
 */

/**
 * Where the eye pair may sit, per character, as offsets in the 100x100
 * viewBox from the drawn eye position. Rows of [dy, minDx, maxDx] every 2
 * units, measured with SVG isPointInFill so both pills plus a 1.5 unit
 * margin stay inside the body (ibot-harness/eyebounds.js), then pulled in
 * by one more unit.
 */
export const SAFE = {
  ball: { home: [0, 0], rows: [[-16, -14, 14], [-12, -14, 14], [-8, -14, 14], [-4, -14, 14], [0, -14, 14], [4, -14, 14], [8, -14, 14], [10, -12, 12]] },
  cloud: { home: [0, 0], rows: [[-12, 7, 19], [-10, 6, 19], [-8, 5, 19], [-6, 5, 20], [-4, 4, 20], [-2, 2, 17], [0, 0, 13], [2, 5, 12]] },
  pill: { home: [0, 0], rows: [[-20, 0, 0], [-16, 0, 0], [-12, 0, 0], [-8, 0, 0], [-4, 0, 0], [0, 0, 0]] },
  blob: { home: [0, 0], rows: [[-12, 2, 6], [-10, 1, 7], [-8, 0, 8], [-6, -1, 10], [-4, -1, 13], [-2, -1, 14], [0, 0, 12], [2, 1, 10]] },
  triangle: { home: [0, 0], rows: [[-10, -2, 2], [-8, -3, 3], [-6, -4, 4], [-4, -5, 5], [-2, -6, 6], [0, -7, 7], [2, -8, 8], [4, -10, 10], [6, -11, 11]] },
  pumpkin: { home: [0, 0], rows: [[-14, -2, 6], [-12, -4, 8], [-10, -6, 9], [-8, -7, 11], [-6, -8, 11], [-4, -9, 12], [-2, -10, 11], [0, -10, 10], [2, -9, 8], [4, -7, 6], [6, -5, 4]] },
};

export function safeArea(id) {
  return SAFE[id] || SAFE.ball;
}

/** Allowed dx span at height dy: the tighter of the two surrounding rows. */
export function spanAt(area, dy) {
  const rows = area.rows;
  if (dy < rows[0][0] || dy > rows[rows.length - 1][0]) return null;
  let lo = rows[0], hi = rows[rows.length - 1];
  for (const r of rows) {
    if (r[0] <= dy) lo = r;
    if (r[0] >= dy) { hi = r; break; }
  }
  return [Math.max(lo[1], hi[1]), Math.min(lo[2], hi[2])];
}

export function inSafe(area, x, y) {
  const s = spanAt(area, y);
  return !!s && x >= s[0] - 1e-9 && x <= s[1] + 1e-9;
}

/** Nearest allowed point: clamp y into the rows, then x into that row's span. */
export function clampToSafe(area, x, y) {
  const rows = area.rows;
  const cy = Math.min(rows[rows.length - 1][0], Math.max(rows[0][0], y));
  const s = spanAt(area, cy);
  return [Math.min(s[1], Math.max(s[0], x)), cy];
}

/** A random spot inside the safe area. */
export function randomSpot(area, rand = Math.random) {
  const rows = area.rows;
  const y = rows[0][0] + rand() * (rows[rows.length - 1][0] - rows[0][0]);
  const s = spanAt(area, y);
  return [s[0] + rand() * (s[1] - s[0]), y];
}

export const SACCADE_MS = [150, 210];
export const HOLD_MS = [300, 1400];
export const BLINK_GAP_MS = [1600, 3500];
export const BLINK_MS = [180, 220];
export const BLINK_MIN_SCALE = 0.1;
/** Share of glances that return to dead center (home). */
export const HOME_CHANCE = 0.2;
export const DOUBLE_BLINK_CHANCE = 0.25;

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Next glance. mode: "idle" | "playing" | "paused". Paused holds longer;
 * playing snaps the hold to whole beats so glances land on the beat.
 * About a fifth of the glances return to dead center.
 */
export function nextGlance(area, { mode = "idle", beatMs = 0, rand = Math.random } = {}) {
  const home = rand() < HOME_CHANCE;
  const [x, y] = home ? clampToSafe(area, area.home[0], area.home[1]) : randomSpot(area, rand);
  const moveMs = lerp(SACCADE_MS[0], SACCADE_MS[1], rand());
  let holdMs = lerp(HOLD_MS[0], HOLD_MS[1], rand());
  if (mode === "paused") holdMs *= 1.5;
  if (mode === "playing" && beatMs > 0) holdMs = Math.max(1, Math.round(holdMs / beatMs)) * beatMs;
  return { x, y, moveMs, holdMs };
}

/** Next blink: wait, duration, and whether it is a double (about 15%). */
export function nextBlink(rand = Math.random, { reduced = false } = {}) {
  const gap = lerp(BLINK_GAP_MS[0], BLINK_GAP_MS[1], rand());
  return {
    inMs: reduced ? gap * 2.5 : gap,
    durMs: lerp(BLINK_MS[0], BLINK_MS[1], rand()),
    double: !reduced && rand() < DOUBLE_BLINK_CHANCE,
  };
}

/** Eye scaleY t ms into a blink of durMs: 1 -> 0.1 -> 1. */
export function blinkScale(t, durMs) {
  if (!(t >= 0) || t >= durMs) return 1;
  const half = durMs / 2;
  const k = Math.sin(Math.PI * (t / durMs));
  return 1 - (1 - BLINK_MIN_SCALE) * k;
}

/** Smooth start and stop (sine in-out) for eye glides. */
export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return 0.5 - Math.cos(Math.PI * c) / 2;
}

export function easeOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * Glance along a direction (unit-ish dx, dy) from home, as far as the safe
 * area allows, scaled by strength 0..1.
 */
export function glanceToward(area, dx, dy, strength = 1) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const [hx, hy] = clampToSafe(area, area.home[0], area.home[1]);
  let best = [hx, hy];
  for (let r = 0.5; r <= 30; r += 0.5) {
    const px = hx + ux * r, py = hy + uy * r;
    if (!inSafe(area, px, py)) break;
    best = [px, py];
  }
  return [lerp(hx, best[0], strength), lerp(hy, best[1], strength)];
}

/** SVG transform for the eye group: offset plus a blink scale around the eyes' center. */
export function eyeTransform(x, y, scaleY) {
  const r = (n) => Math.round(n * 100) / 100;
  if (scaleY >= 0.999) return `translate(${r(x)} ${r(y)})`;
  return `translate(${r(x)} ${r(y + 63 * (1 - scaleY))}) scale(1 ${r(scaleY)})`;
}

/**
 * DOM driver. getEl() returns the current `.eyes` group (it is rebuilt when
 * the character changes). Runs requestAnimationFrame only while something
 * moves; otherwise waits on a timer. Stops while the document is hidden.
 */
export function createEyes({ getEl, getId, reducedMotion }) {
  const st = {
    x: 0, y: 0, from: [0, 0], to: [0, 0], moveStart: 0, moveMs: 0,
    holdUntil: 0, blinkAt: 0, blinkStart: -1, blinkDur: 140, blinkQueue: 0,
    mode: "idle", beatMs: 0, raf: 0, timer: 0, last: "", wheelUntil: 0,
  };
  const now = () => performance.now();
  const reduced = () => !!reducedMotion?.matches;
  const area = () => safeArea(getId());

  function write(scale) {
    const el = getEl();
    if (!el) return;
    const t = eyeTransform(st.x, st.y, scale);
    if (t !== st.last || el.getAttribute("transform") !== t) { el.setAttribute("transform", t); st.last = t; }
  }

  function goTo(x, y, ms, t = now()) {
    st.from = [st.x, st.y];
    st.to = [x, y];
    st.moveStart = t;
    st.moveMs = ms;
  }

  function scheduleBlink(t = now()) {
    const b = nextBlink(Math.random, { reduced: reduced() });
    st.blinkAt = t + b.inMs;
    st.blinkDur = b.durMs;
    st.blinkQueue = b.double ? 1 : 0;
  }

  function blink(t = now(), double = false) {
    st.blinkStart = t;
    st.blinkQueue = double ? 1 : 0;
  }

  function frame() {
    st.raf = 0;
    if (document.hidden) return;
    const t = now();
    // Movement.
    if (st.moveMs > 0) {
      const k = (t - st.moveStart) / st.moveMs;
      const e = easeInOut(k);
      st.x = st.from[0] + (st.to[0] - st.from[0]) * e;
      st.y = st.from[1] + (st.to[1] - st.from[1]) * e;
      if (k >= 1) st.moveMs = 0;
    }
    if (!st.moveMs && t >= st.holdUntil && t >= st.wheelUntil) {
      if (reduced()) {
        const [hx, hy] = clampToSafe(area(), area().home[0], area().home[1]);
        st.x = hx; st.y = hy;
        st.holdUntil = Infinity;
      } else {
        const g = nextGlance(area(), { mode: st.mode, beatMs: st.beatMs });
        goTo(g.x, g.y, g.moveMs, t);
        st.holdUntil = t + g.moveMs + g.holdMs;
      }
    }
    // Blink.
    let scale = 1;
    if (st.blinkStart >= 0) {
      const bt = t - st.blinkStart;
      scale = blinkScale(bt, st.blinkDur);
      if (bt >= st.blinkDur) {
        if (st.blinkQueue > 0) { st.blinkQueue -= 1; st.blinkStart = t + 60; scale = 1; }
        else { st.blinkStart = -1; scheduleBlink(t); }
      }
    } else if (t >= st.blinkAt) {
      st.blinkStart = t;
      scale = 1;
    }
    write(scale);
    plan(t);
  }

  function plan(t = now()) {
    clearTimeout(st.timer);
    st.timer = 0;
    if (document.hidden) return;
    const busy = st.moveMs > 0 || st.blinkStart >= 0;
    if (busy) { st.raf ||= requestAnimationFrame(frame); return; }
    const next = Math.min(st.blinkAt, Math.max(st.holdUntil, st.wheelUntil));
    const wait = Math.max(0, next - t);
    if (!Number.isFinite(wait)) return;
    st.timer = setTimeout(() => { st.raf ||= requestAnimationFrame(frame); }, wait);
  }

  function kick() {
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(frame);
  }

  /** New character: snap to its home and blink; no scaling of the body. */
  function reset() {
    const a = area();
    const [hx, hy] = clampToSafe(a, a.home[0], a.home[1]);
    st.x = hx; st.y = hy; st.moveMs = 0;
    st.last = "";
    const t = now();
    st.holdUntil = t + 900;
    blink(t);
    write(1);
    kick();
  }

  /** Wheel turning: dx, dy is the finger's travel direction on screen. */
  function glance(dx, dy) {
    if (reduced()) return;
    const [x, y] = glanceToward(area(), dx, dy, 0.85);
    const t = now();
    if (Math.hypot(x - st.to[0], y - st.to[1]) > 0.5 || !st.moveMs) goTo(x, y, 160, t);
    st.wheelUntil = t + 700;
    st.holdUntil = st.wheelUntil;
    kick();
  }

  /** Track change: quick look up, then a blink. */
  function surprise() {
    if (reduced()) { blink(now()); kick(); return; }
    const [x, y] = glanceToward(area(), 0, -1, 1);
    const t = now();
    goTo(x, y, 160, t);
    st.holdUntil = t + 700;
    blink(t + 180);
    kick();
  }

  function setMode(mode, beatMs = 0) {
    st.mode = mode;
    st.beatMs = beatMs;
  }

  scheduleBlink();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(st.raf); st.raf = 0; clearTimeout(st.timer); }
    else kick();
  });
  reducedMotion?.addEventListener?.("change", kick);

  return { reset, glance, surprise, setMode, blink: () => { blink(now()); kick(); }, state: st };
}
