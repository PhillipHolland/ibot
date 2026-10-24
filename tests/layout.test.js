import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitIpod, DESIGN_W, DESIGN_H } from "../layout.js";

test("scale never exceeds the safe viewport", () => {
  const cases = [
    [390, 844, {}],
    [320, 480, { top: 47, bottom: 34 }],
    [1024, 768, { left: 20 }],
    [200, 200, { top: 40, bottom: 40, left: 10, right: 10 }],
    [800, 2000, {}],
  ];
  for (const [w, h, insets] of cases) {
    const fit = fitIpod(w, h, insets, 12);
    const right = (insets.right || 0);
    const bottom = (insets.bottom || 0);
    assert.ok(fit.scale >= 0);
    assert.ok(fit.x + 1e-6 >= (insets.left || 0));
    assert.ok(fit.y + 1e-6 >= (insets.top || 0));
    assert.ok(fit.x + fit.boxW <= w - right + 1e-6);
    assert.ok(fit.y + fit.boxH <= h - bottom + 1e-6);
    assert.ok(fit.boxW <= DESIGN_W * fit.scale + 1e-6);
    assert.ok(fit.boxH <= DESIGN_H * fit.scale + 1e-6);
  }
});

test("phone frame fills the width with the iPod", () => {
  const fit = fitIpod(390, 844, { top: 47, bottom: 34 }, 4);
  assert.ok(Math.abs(fit.boxW - (390 - 8)) < 1);
  assert.ok(fit.boxH <= 844 - 47 - 34 - 8);
  assert.equal(DESIGN_H, 712);
});

test("index and css lock the page", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /html\s*,\s*body\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /html\s*,\s*body\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /inset:\s*0/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /overscroll-behavior:\s*none/);
});
