/**
 * Apple's iPod marquee (web-music-ipod.esm.js, component `Dl`, svelte-61q7q9,
 * bundle lines 2199-2360). Pure helpers so the logic is testable without a DOM.
 *
 * Apple: scrolling = copyWidth - containerWidth > 1, a second aria-hidden copy
 * is added only while scrolling, the track moves by copyWidth + 30px (the gap)
 * at 0.05 s per px after a 2 s delay, and a new resetKey restarts it.
 */
export const MARQUEE_GAP = 30;
export const MARQUEE_SEC_PER_PX = 0.05;
export const MARQUEE_DELAY_S = 2;

export function shouldScroll(copyWidth, containerWidth) {
  const c = Number(copyWidth) || 0;
  const w = Number(containerWidth) || 0;
  return c - w > 1;
}

export function marqueeDistance(copyWidth) {
  return (Number(copyWidth) || 0) + MARQUEE_GAP;
}

export function marqueeDurationS(copyWidth) {
  return marqueeDistance(copyWidth) * MARQUEE_SEC_PER_PX;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Apple's marquee DOM. The duplicate copy exists only while scrolling. */
export function marqueeMarkup(text, { scrolling = false, copyWidth = 0 } = {}) {
  const t = esc(text);
  const copy = Math.round(Number(copyWidth) || 0);
  const second = scrolling ? `<span class="marquee-copy" aria-hidden="true">${t}</span>` : "";
  return `<div class="marquee${scrolling ? " scrolling" : ""}" dir="auto">`
    + `<div class="marquee-track" style="--marquee-copy-width:${copy}">`
    + `<span class="marquee-copy">${t}</span>${second}</div></div>`;
}
