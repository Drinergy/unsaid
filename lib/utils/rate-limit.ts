/**
 * Rate limiting. Counts the posts themselves (rolling windows), so there is no
 * separate counter table to drift out of sync.
 *
 * shortcut: check-then-insert is not atomic, so a burst of parallel requests can
 * slip a few extra posts past the limit. Upgrade to a DB function if that matters.
 */

import { supabaseAdmin } from '@/lib/supabase/server';

export const RATE_LIMITS = {
  UNSAID_PER_DAY: 10,
  REPLY_PER_DAY: 50,
  UNSAID_PER_HOUR_IP: 20,
  MIN_SECONDS_BETWEEN_POSTS: 30,
} as const;

export type LimitType = 'unsaid' | 'reply';

const tableFor = (type: LimitType) => (type === 'unsaid' ? 'unsaids' : 'replies');

/** Posts by this column value since `since`; null if the count query failed. */
async function countSince(
  type: LimitType,
  column: 'device_id' | 'ip_address',
  value: string,
  since: Date
): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from(tableFor(type))
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since.toISOString());

  if (error) {
    console.error('Rate limit check error:', error);
    return null;
  }
  return count ?? 0;
}

/** Device limit: posts in the last 24 hours. Fails closed if the check errors. */
export async function checkDeviceRateLimit(
  deviceId: string,
  limitType: LimitType
): Promise<{ allowed: boolean; remaining?: number; resetAt?: Date }> {
  const limit = limitType === 'unsaid' ? RATE_LIMITS.UNSAID_PER_DAY : RATE_LIMITS.REPLY_PER_DAY;
  const count = await countSince(limitType, 'device_id', deviceId, new Date(Date.now() - 86_400_000));
  if (count === null) return { allowed: false };

  return {
    allowed: count < limit,
    remaining: Math.max(0, limit - count),
    resetAt: new Date(Date.now() + 86_400_000),
  };
}

/** IP limit: posts in the last hour. Fails closed if the check errors. */
export async function checkIPRateLimit(
  ipAddress: string,
  limitType: LimitType
): Promise<{ allowed: boolean; remaining?: number }> {
  const limit = RATE_LIMITS.UNSAID_PER_HOUR_IP;
  const count = await countSince(limitType, 'ip_address', ipAddress, new Date(Date.now() - 3_600_000));
  if (count === null) return { allowed: false };

  return { allowed: count < limit, remaining: Math.max(0, limit - count) };
}

/** Minimum gap between two posts from one device. Fails closed if the check errors. */
export async function checkTimeThrottle(
  deviceId: string,
  limitType: LimitType
): Promise<{ allowed: boolean; waitSeconds?: number }> {
  const { data, error } = await supabaseAdmin
    .from(tableFor(limitType))
    .select('created_at')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Throttle check error:', error);
    return { allowed: false };
  }
  if (!data) return { allowed: true };

  const secondsSince = (Date.now() - new Date(data.created_at).getTime()) / 1000;
  if (secondsSince < RATE_LIMITS.MIN_SECONDS_BETWEEN_POSTS) {
    return { allowed: false, waitSeconds: Math.ceil(RATE_LIMITS.MIN_SECONDS_BETWEEN_POSTS - secondsSince) };
  }
  return { allowed: true };
}
