/** Fit the iPod plus its reflection inside the viewport minus safe-area and padding. */
/** Unscaled Apple body (415×692) plus a sliver for the shadow; the reflection may spill below and is clipped. */
export const DESIGN_W = 415;
export const DESIGN_H = 712;

export function fitIpod(vw, vh, insets = {}, pad = 12) {
  const top = Math.max(0, insets.top || 0);
  const right = Math.max(0, insets.right || 0);
  const bottom = Math.max(0, insets.bottom || 0);
  const left = Math.max(0, insets.left || 0);
  const availW = Math.max(0, vw - left - right - pad * 2);
  const availH = Math.max(0, vh - top - bottom - pad * 2);
  const scale = availW === 0 || availH === 0 ? 0 : Math.min(availW / DESIGN_W, availH / DESIGN_H);
  const boxW = DESIGN_W * scale;
  const boxH = DESIGN_H * scale;
  const x = left + (vw - left - right - boxW) / 2;
  const y = top + (vh - top - bottom - boxH) / 2;
  return { scale, x, y, boxW, boxH, availW, availH };
}
