import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldScroll, marqueeDistance, marqueeDurationS, marqueeMarkup, MARQUEE_GAP } from "../marquee.js";

test("scrolls only when the copy is more than 1px wider than its box (Apple)", () => {
  assert.equal(shouldScroll(200, 243), false);
  assert.equal(shouldScroll(244, 243), false);
  assert.equal(shouldScroll(245, 243), true);
  assert.equal(shouldScroll(undefined, 243), false);
});

test("distance is copy + 30px gap at 0.05 s per px", () => {
  assert.equal(MARQUEE_GAP, 30);
  assert.equal(marqueeDistance(470), 500);
  assert.ok(Math.abs(marqueeDurationS(470) - 25) < 1e-9);
});

test("markup duplicates the copy only while scrolling, and escapes text", () => {
  const still = marqueeMarkup("A <b>&", { scrolling: false, copyWidth: 100 });
  assert.equal((still.match(/class="marquee-copy"/g) || []).length, 1);
  assert.doesNotMatch(still, /scrolling/);
  assert.match(still, /A &lt;b&gt;&amp;/);
  const moving = marqueeMarkup("Long", { scrolling: true, copyWidth: 300.4 });
  assert.equal((moving.match(/class="marquee-copy"/g) || []).length, 2);
  assert.match(moving, /class="marquee scrolling"/);
  assert.match(moving, /aria-hidden="true"/);
  assert.match(moving, /--marquee-copy-width:300/);
});

test("css clips every animated line to its box", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.marquee\{overflow:hidden\}/);
  assert.match(css, /\.scrolling \.marquee-track\{animation:marquee-scroll calc\(var\(--marquee-distance\) \* 0\.05s\) linear 2s infinite\}/);
  assert.match(css, /@keyframes marquee-scroll\{to\{transform:translateX/);
  assert.match(css, /prefers-reduced-motion: reduce\)\{\.marquee-track\{display:block/);
  assert.match(css, /\.screen-body\{[^}]*overflow:hidden;overflow:clip/);
  assert.match(css, /\.menu\{[^}]*overflow:hidden;overflow:clip/);
  assert.match(css, /\.item-title\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  assert.match(css, /\.chevron\{[^}]*flex:none/);
  assert.match(css, /\.note\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.play-icon\[hidden\]\{display:none\}/);
});

test("screen slides move #lcd inside the clip, never the clip box", () => {
  const js = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const slide = js.slice(js.indexOf("function slideScreens"), js.indexOf("function push"));
  assert.match(slide, /lcd\.style\.transform = `translate3d/);
  assert.doesNotMatch(slide, /body\.style\.transform/);
});
