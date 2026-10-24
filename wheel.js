/** Apple click-wheel math. One list row per 15°, 8° reversal dead zone. */
export const ROW_DEG = 15;
export const REVERSAL_DEADZONE_DEG = 8;
export const VOLUME_DEG = 4.5;
const STEP = (ROW_DEG * Math.PI) / 180;
const DEAD = (REVERSAL_DEADZONE_DEG * Math.PI) / 180;
const TIERS = [1, 2, 3, 5, 8, 13, 21, 34];

export function angleDelta(prev, next) {
  let d = next - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function pointerAngle(cx, cy, x, y) {
  return Math.atan2(y - cy, x - cx);
}

/**
 * Accumulate rotation. Reversal under 8° is ignored.
 * Fast spin (over 180°/s sustained) multiplies rows by Fibonacci tiers.
 */
export function consumeRotation(carry, delta, speedDegPerSec = 0, heldMs = 0) {
  if (typeof carry !== "object" || carry == null) carry = { acc: Number(carry) || 0, dir: 0, pending: 0 };
  const sign = delta === 0 ? 0 : Math.sign(delta);
  const prevSign = carry.dir || 0;
  let pending = carry.pending || 0;
  let acc = carry.acc || 0;
  if (sign && prevSign && sign !== prevSign) {
    pending += Math.abs(delta);
    if (pending < DEAD) {
      return { rows: 0, carry: { acc, dir: prevSign, pending } };
    }
    acc = 0;
    pending = 0;
  } else if (sign) {
    pending = 0;
  }
  acc += delta;
  const rowsBase = Math.trunc(acc / STEP);
  acc -= rowsBase * STEP;
  let mult = 1;
  if (Math.abs(speedDegPerSec) >= 180) {
    const tier = Math.min(TIERS.length - 1, Math.floor(heldMs / 500));
    mult = TIERS[tier];
  }
  const rows = rowsBase * mult;
  return { rows, carry: { acc, dir: sign || prevSign, pending } };
}

export function volumeDelta(degrees) {
  return degrees / VOLUME_DEG / 100;
}

/**
 * Apple's accelerator: EMA (alpha 0.15) of speed capped at 400 deg/s,
 * reset after a 250 ms pause or a direction change. Tier advances every
 * 500 ms while smoothed speed stays at or above 180 deg/s.
 */
export function createAccelerator() {
  return { ema: 0, lastT: 0, dir: 0, fastSince: 0 };
}

export function accelerate(acc, degrees, now) {
  const dir = Math.sign(degrees);
  const dt = acc.lastT ? now - acc.lastT : 0;
  if (!acc.lastT || dt > 250 || (dir && acc.dir && dir !== acc.dir)) {
    acc.ema = 0;
    acc.fastSince = 0;
  }
  const raw = dt > 0 ? Math.min(400, Math.abs(degrees) / dt * 1000) : 0;
  acc.ema = acc.ema ? acc.ema + 0.15 * (raw - acc.ema) : raw * 0.15;
  acc.lastT = now;
  if (dir) acc.dir = dir;
  if (acc.ema >= 180) acc.fastSince = acc.fastSince || now;
  else acc.fastSince = 0;
  return { speed: acc.ema, heldMs: acc.fastSince ? now - acc.fastSince : 0 };
}

/** Closest distance from (0,0) to segment a->b, for Apple's near-center skip. */
export function segmentDistToCenter(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
