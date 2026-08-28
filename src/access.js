import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "intake_access";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function passwordMatches(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createAccessToken(secret) {
  const exp = String(Date.now() + WEEK_MS);
  const sig = createHmac("sha256", secret).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyAccessToken(secret, token) {
  if (!secret || !token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(exp).digest("hex");
  if (expected.length !== sig.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sig, "utf8"));
  } catch {
    return false;
  }
}

export function readCookie(header, name) {
  if (!header) return "";
  for (const part of String(header).split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return "";
}

export function accessCookieHeader(token, { secure = false } = {}) {
  const parts = [
    `${ACCESS_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(WEEK_MS / 1000)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAccessCookieHeader({ secure = false } = {}) {
  const parts = [
    `${ACCESS_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function createLoginLimiter({ windowMs = 15 * 60 * 1000, max = 8 } = {}) {
  const attempts = new Map();

  return function allowLogin(ip) {
    const now = Date.now();
    const current = attempts.get(ip);
    if (!current || current.resetAt <= now) {
      attempts.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= max) return false;
    current.count += 1;
    return true;
  };
}
