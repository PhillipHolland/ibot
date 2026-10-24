import test from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS, nextCharacter, beatIntervalMs, pseudoTempo, centerGesture, characterMarkup } from "../avatar.js";

test("cycles six characters and wraps", () => {
  assert.equal(CHARACTERS.length, 6);
  assert.equal(nextCharacter(0), 1);
  assert.equal(nextCharacter(5), 0);
  assert.equal(nextCharacter(NaN), 1);
});

test("beat interval uses tempo, else track id, else 100", () => {
  assert.equal(beatIntervalMs(120), 500);
  assert.equal(beatIntervalMs(100), 600);
  const fromId = beatIntervalMs(0, "abc");
  assert.equal(fromId, 60000 / pseudoTempo("abc"));
  assert.ok(pseudoTempo("abc") >= 84 && pseudoTempo("abc") <= 132);
  assert.equal(pseudoTempo("abc"), pseudoTempo("abc"));
  assert.equal(beatIntervalMs(null, ""), 600);
  assert.equal(beatIntervalMs(undefined), 600);
});

test("a short still tap is a press; a long hold or an 8px move cycles", () => {
  assert.equal(centerGesture({ dt: 80, dist: 2 }), "press");
  assert.equal(centerGesture({ dt: 599, dist: 23.9 }), "press");
  assert.equal(centerGesture({ dt: 600, dist: 0 }), "cycle");
  assert.equal(centerGesture({ dt: 50, dist: 24 }), "cycle");
});

test("markup is a fixed silhouette with two solid eyes and no pupils", () => {
  const ids = CHARACTERS.map((c) => c.id);
  assert.deepEqual(ids, ["ball", "cloud", "pill", "blob", "triangle", "pumpkin"]);
  assert.equal(ids.includes("drop"), false);
  for (const c of CHARACTERS) {
    const svg = characterMarkup(c.id);
    assert.match(svg, new RegExp(`avatar-${c.id}`));
    assert.equal((svg.match(/class="eye /g) || []).length, 2);
    assert.equal(svg.includes("pupil"), false);
    assert.equal(svg.includes("iris"), false);
    assert.equal(svg.includes("teardrop"), false);
    assert.match(svg, new RegExp(c.fill));
  }
  assert.match(characterMarkup("pumpkin"), /#3a3a3a/);
  assert.match(characterMarkup("ball"), /#ffffff/);
});
