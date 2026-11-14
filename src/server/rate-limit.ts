import { AppError } from "./errors";

// shortcut: in-memory, per process; resets on restart. Move to the DB or Redis before running >1 instance.
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = 10_000;

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_BUCKETS) buckets.clear(); // flood of live keys: fail open rather than grow without bound
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (++b.count > max) throw new AppError("rate_limited");
}

export const resetRateLimits = () => buckets.clear(); // tests only
