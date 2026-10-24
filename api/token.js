import { createPrivateKey, createSign } from "node:crypto";

const DAY = 24 * 60 * 60;

function b64url(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buf.toString("base64url");
}

function hostOf(value) {
  if (!value) return "";
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

export function originAllowed(req, allowed) {
  if (!allowed.length) return true;
  const host = hostOf(req.headers?.origin) || hostOf(req.headers?.referer);
  // Browsers always send Origin or Referer cross-site; a bare same-site fetch may send neither.
  if (!host) return true;
  return allowed.includes(host);
}

export function signDeveloperToken({ teamId, keyId, privateKeyPem, now = Math.floor(Date.now() / 1000) }) {
  const pem = String(privateKeyPem).replace(/\\n/g, "\n");
  const key = createPrivateKey(pem);
  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now, exp: now + DAY };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  return {
    token: `${signingInput}.${b64url(sig)}`,
    expiresAt: payload.exp,
  };
}

export default function handler(req, res) {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (!teamId || !keyId || !privateKey) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Token service is not configured" }));
    return;
  }
  if (!originAllowed(req, allowed)) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return;
  }
  try {
    const signed = signDeveloperToken({ teamId, keyId, privateKeyPem: privateKey });
    res.statusCode = 200;
    res.end(JSON.stringify(signed));
  } catch {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Token service is not configured" }));
  }
}
