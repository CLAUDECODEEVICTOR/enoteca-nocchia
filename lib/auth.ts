import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Two access levels:
//   "app"   → customers, unlocks the scanner (PinGate on the root layout)
//   "admin" → staff only, unlocks /archivio and /feedback and their APIs
export type Scope = "app" | "admin";

export const COOKIE_NAME: Record<Scope, string> = {
  app: "nocchia_app",
  admin: "nocchia_admin",
};

// 12 hours: long enough for a full service day on the enoteca tablet,
// short enough that a borrowed phone doesn't stay unlocked forever.
const MAX_AGE_SECONDS = 60 * 60 * 12;

function authSecret(): string {
  return process.env.AUTH_SECRET || "";
}

function expectedPin(scope: Scope): string {
  return (scope === "admin" ? process.env.ADMIN_PIN : process.env.APP_PIN) || "";
}

// Constant-time compare so response timing never leaks how much of the PIN matched.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function sign(scope: Scope, expiresAt: number): string {
  return createHmac("sha256", authSecret())
    .update(`${scope}.${expiresAt}`)
    .digest("hex");
}

/** True when the submitted PIN matches the one configured for this scope. */
export function pinMatches(scope: Scope, pin: unknown): boolean {
  const expected = expectedPin(scope);
  if (!expected || !authSecret()) return false; // misconfigured server: deny
  if (typeof pin !== "string" || pin.length === 0) return false;
  return safeEqual(pin, expected);
}

/** Signed cookie value: expiry plus its HMAC. Tampering invalidates the signature. */
export function issueToken(scope: Scope): { value: string; maxAge: number } {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return {
    value: `${expiresAt}.${sign(scope, expiresAt)}`,
    maxAge: MAX_AGE_SECONDS,
  };
}

function tokenIsValid(scope: Scope, token: string | undefined): boolean {
  if (!token || !authSecret()) return false;
  const [rawExpiry, signature] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  if (!signature) return false;
  return safeEqual(signature, sign(scope, expiresAt));
}

/** True when the request carries a valid, unexpired cookie for this scope. */
export function isAuthorized(req: NextRequest, scope: Scope): boolean {
  return tokenIsValid(scope, req.cookies.get(COOKIE_NAME[scope])?.value);
}

/** Guard for protected route handlers: returns a 401 response, or null when allowed. */
export function requireScope(req: NextRequest, scope: Scope): NextResponse | null {
  if (isAuthorized(req, scope)) return null;
  return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
}

export function setAuthCookie(res: NextResponse, scope: Scope): NextResponse {
  const { value, maxAge } = issueToken(scope);
  res.cookies.set(COOKIE_NAME[scope], value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
