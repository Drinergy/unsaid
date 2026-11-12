/**
 * Read limit for the public GET routes, so one script cannot use up a free host's request quota.
 * Generous on purpose: many phones on a mobile carrier share one IP, and panning a map is chatty.
 * The key is the plain IP, kept only in memory (see burst-limit.ts for the per-instance limit).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { allowBurst } from '@/lib/utils/burst-limit';
import { getClientIp } from '@/lib/utils/request-identity';
import { COPY } from '@/lib/copy';

export const READS_PER_MINUTE_PER_IP = 600;

/** A 429 response when this IP is reading too fast, otherwise null. */
export function readLimited(request: NextRequest): NextResponse | null {
  if (allowBurst(`read:${getClientIp(request)}`, READS_PER_MINUTE_PER_IP, 60_000)) return null;
  return NextResponse.json({ error: COPY.busy }, { status: 429, headers: { 'Retry-After': '30' } });
}
