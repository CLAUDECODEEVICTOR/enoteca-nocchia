// Simple in-memory rate limiter (resets on cold start, which is fine for Vercel serverless)
const requests = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string, maxRequests = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = requests.get(ip);

  if (!entry || now > entry.resetAt) {
    requests.set(ip, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= maxRequests) {
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

// Failed PIN attempts: after 5, wait 10 minutes, even with the right PIN.
// Lives in the instance's memory: it stops someone insisting from a browser.
const MAX_ATTEMPTS = 5;
const LOCK_MS = 10 * 60_000;
const attempts = new Map<string, { count: number; since: number }>();

export function isLocked(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.since > LOCK_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (entry && Date.now() - entry.since <= LOCK_MS) entry.count++;
  else attempts.set(key, { count: 1, since: Date.now() });
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
