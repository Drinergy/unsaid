/**
 * Short in-memory burst limit, for actions that leave no row behind to count (like removing a reaction).
 *
 * shortcut: the counter lives in one server instance, so it slows a loop on a warm instance but is not
 * shared across instances. Upgrade to a database counter if reaction spam shows up in practice.
 */

const hits = new Map<string, number[]>();

/** True if `key` has done this fewer than `max` times in the last `windowMs`; records the attempt. */
export function allowBurst(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Drop idle keys so the map cannot grow forever
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] >= windowMs) hits.delete(k);
  return true;
}
