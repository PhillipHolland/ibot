import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("sw.js", root), "utf8");
const shell = [...sw.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);

test("cache name is bumped", () => {
  assert.match(sw, /const CACHE = "ibot-shell-v17";/);
});

test("every module app.js imports is precached and exists", () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(new URL(file, root), "utf8");
    for (const m of src.matchAll(/from "\.\/([^"]+)"/g)) walk(m[1]);
  };
  walk("app.js");
  for (const f of seen) assert.ok(shell.includes(f), `${f} missing from SHELL`);
  for (const f of shell) assert.ok(existsSync(new URL(f, root)), `${f} does not exist`);
});

test("token endpoint is never cached and first install does not reload the page", () => {
  assert.match(sw, /\/api\//);
  assert.match(sw, /startsWith\("ibot-shell-"\)/);
  assert.match(sw, /cache: "reload"/);
});
