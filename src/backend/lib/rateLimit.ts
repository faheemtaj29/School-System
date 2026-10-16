/**
 * Per-process sliding-window limiter for anonymous/public endpoints.
 * Good enough for a single Node instance; move to Redis when running several.
 */
const buckets = new Map<string, number[]>();

/**
 * Client address as seen by our own reverse proxy. The left-most
 * X-Forwarded-For entry is whatever the client sent (spoofable), so prefer
 * X-Real-IP, then the right-most hop, which the proxy appended itself.
 * Without any proxy in front, both headers are client-controlled: deploy
 * behind nginx/the host's proxy for the limit to be meaningful.
 */
export function clientIp(req: Request) {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = req.headers.get("x-forwarded-for")?.split(",").map((h) => h.trim()).filter(Boolean);
  return hops?.length ? hops[hops.length - 1] : "local";
}

/** Records a hit for `scope:key` and reports whether the limit is exceeded. */
export function tooMany(req: Request, scope: string, limit = 8, windowMs = 60_000, key = clientIp(req)) {
  const id = `${scope}:${key}`;
  const now = Date.now();
  const recent = (buckets.get(id) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(id, recent);
  if (buckets.size > 20_000) buckets.clear();
  return recent.length > limit;
}
