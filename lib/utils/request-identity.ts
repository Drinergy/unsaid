/**
 * Turns the client-sent device id and the caller's IP into keyed hashes,
 * so raw values are never stored or readable through the public database key.
 */

import { createHmac } from 'crypto';
import type { NextRequest } from 'next/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hash(value: string): string {
  const secret = process.env.ID_HASH_SECRET;
  if (!secret) throw new Error('Missing ID_HASH_SECRET');
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Returns the hashed device id, or null if the client sent something that is not a UUID. */
export function hashDeviceId(deviceId: unknown): string | null {
  return typeof deviceId === 'string' && UUID_RE.test(deviceId) ? hash(deviceId.toLowerCase()) : null;
}

/**
 * The caller's IP, from a header the client cannot choose.
 *
 *  1. Headers the hosting platform sets itself (Vercel overwrites these; a client's own value is dropped).
 *  2. Otherwise the LAST x-forwarded-for entry: that is the one our own proxy appended. The first
 *     entry is whatever the client typed, so it must never be used.
 *
 * With no proxy at all (for example `next dev`) there is no trustworthy IP, so everyone shares "unknown".
 */
export function getClientIp(request: NextRequest): string {
  const platform = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-real-ip');
  if (platform) return platform.split(',')[0].trim();

  const hops = request.headers.get('x-forwarded-for')?.split(',').map((h) => h.trim()).filter(Boolean);
  return hops?.[hops.length - 1] ?? 'unknown';
}

export function hashRequestIp(request: NextRequest): string {
  return hash(getClientIp(request));
}
