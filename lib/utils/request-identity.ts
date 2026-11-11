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

export function hashRequestIp(request: NextRequest): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return hash(ip);
}
