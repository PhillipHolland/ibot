/**
 * Apple's click scheduler (web-music-ipod.esm.js lines 6990-7072):
 * clicks at least 50 ms apart (Wr), dropped when the queue would run more
 * than 150 ms ahead (jr). Times are AudioContext seconds.
 */
export const CLICK_GAP_S = 0.05;
export const CLICK_MAX_AHEAD_S = 0.15;
export const CLICK_GAIN = 0.3;

/** When the next click should start, or null to drop it. */
export function nextClickTime(now, lastAt) {
  const last = Number.isFinite(lastAt) ? lastAt : -Infinity;
  const at = Math.max(now, last + CLICK_GAP_S);
  return at - now > CLICK_MAX_AHEAD_S ? null : at;
}
