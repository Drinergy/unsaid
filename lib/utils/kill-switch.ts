/**
 * Emergency brake. Set POSTING_PAUSED=1 in Vercel (then redeploy or let the next request pick it up)
 * to stop new thoughts, replies and reactions during an attack. Reading and reporting keep working.
 */

import { NextResponse } from 'next/server';

/** A response to send when posting is paused, or null when it is not. */
export function pausedResponse(): NextResponse | null {
  if (process.env.POSTING_PAUSED !== '1') return null;
  return NextResponse.json(
    { error: 'New thoughts are paused for a short while. Please try again later.' },
    { status: 503, headers: { 'Retry-After': '600' } }
  );
}
