import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import handler, { signDeveloperToken, originAllowed } from "../api/token.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });

function decode(part) {
  return JSON.parse(Buffer.from(part, "base64url").toString());
}

test("signs an ES256 developer token", () => {
  const now = 1_700_000_000;
  const { token, expiresAt } = signDeveloperToken({
    teamId: "TEAMTEST10",
    keyId: "KEYTESTID1",
    privateKeyPem: pem,
    now,
  });
  const [h, p, s] = token.split(".");
  assert.deepEqual(decode(h), { alg: "ES256", kid: "KEYTESTID1" });
  assert.equal(decode(p).iss, "TEAMTEST10");
  assert.equal(decode(p).iat, now);
  assert.equal(decode(p).exp, now + 86400);
  assert.equal(expiresAt, now + 86400);
  const verify = createVerify("SHA256");
  verify.update(`${h}.${p}`);
  verify.end();
  const ok = verify.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
  assert.equal(ok, true);
});

test("accepts literal backslash-n in the PEM", () => {
  const flat = pem.replace(/\n/g, "\\n");
  const { token } = signDeveloperToken({
    teamId: "TEAMTEST10",
    keyId: "KEYTESTID1",
    privateKeyPem: flat,
    now: 10,
  });
  assert.equal(token.split(".").length, 3);
});

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(k, v) { this.headers[k] = v; },
    end(s) { this.body = s; },
  };
}

test("rejects a foreign origin when ALLOWED_ORIGINS is set", async () => {
  process.env.APPLE_TEAM_ID = "TEAMTEST10";
  process.env.APPLE_KEY_ID = "KEYTESTID1";
  process.env.APPLE_PRIVATE_KEY = pem;
  process.env.ALLOWED_ORIGINS = "ipod.example";
  const res = mockRes();
  handler({ headers: { origin: "https://evil.example" } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["Cache-Control"], "no-store");
  delete process.env.ALLOWED_ORIGINS;
});

test("missing env returns 500", () => {
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APPLE_KEY_ID;
  delete process.env.APPLE_PRIVATE_KEY;
  const res = mockRes();
  handler({ headers: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body, /not configured/);
});

test("originAllowed is open when the list is empty", () => {
  assert.equal(originAllowed({ headers: { origin: "https://a.test" } }, []), true);
  assert.equal(originAllowed({ headers: { referer: "https://ipod.example/x" } }, ["ipod.example"]), true);
});
