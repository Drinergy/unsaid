/**
 * API route for reactions. POST sets, changes or clears this device's single reaction on a thought.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hashDeviceId, hashRequestIp } from '@/lib/utils/request-identity';
import { getReactionCounts, REACTION_TYPES } from '@/lib/utils/reaction-counts';
import { allowBurst } from '@/lib/utils/burst-limit';
import { pausedResponse } from '@/lib/utils/kill-switch';
import { COPY } from '@/lib/copy';
import type { ReactionType } from '@/types/unsaid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NEW_REACTIONS_PER_HOUR_PER_IP = 60;
// Every call (add, change or remove) counts here, so add/remove loops are slowed too
const REACTION_CALLS_PER_MINUTE_PER_IP = 30;

/**
 * POST /api/reactions
 * Body: { unsaidId, type: 'felt' | 'me_too' | 'here_for_you' | 'proud_of_you' | null, deviceId }
 * type null removes the reaction. Returns fresh counts and this device's reaction.
 */
export async function POST(request: NextRequest) {
  const paused = pausedResponse();
  if (paused) return paused;
  try {
    const body = await request.json();
    const { unsaidId, type } = body;

    const deviceId = hashDeviceId(body.deviceId);
    if (!deviceId) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    if (typeof unsaidId !== 'string' || !UUID_RE.test(unsaidId)) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    if (type !== null && !REACTION_TYPES.includes(type)) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }

    if (!allowBurst(`reaction:${hashRequestIp(request)}`, REACTION_CALLS_PER_MINUTE_PER_IP, 60_000)) {
      return NextResponse.json({ error: COPY.slowDown }, { status: 429 });
    }

    // Only visible thoughts can be reacted to
    const { data: unsaid } = await supabaseAdmin
      .from('unsaids')
      .select('id')
      .eq('id', unsaidId)
      .eq('is_shadow_banned', false)
      .maybeSingle();
    if (!unsaid) {
      return NextResponse.json({ error: COPY.thoughtGone }, { status: 404 });
    }

    if (type === null) {
      const { error } = await supabaseAdmin
        .from('reactions')
        .delete()
        .eq('unsaid_id', unsaidId)
        .eq('device_id', deviceId);
      if (error) throw error;
    } else {
      const ipAddress = hashRequestIp(request);

      // Changing an existing reaction is free; only brand-new rows count toward the spam limit
      const { data: existing } = await supabaseAdmin
        .from('reactions')
        .select('id')
        .eq('unsaid_id', unsaidId)
        .eq('device_id', deviceId)
        .maybeSingle();

      if (!existing) {
        const since = new Date(Date.now() - 3_600_000).toISOString();
        const { count } = await supabaseAdmin
          .from('reactions')
          .select('id', { count: 'exact', head: true })
          .eq('ip_address', ipAddress)
          .gte('created_at', since);
        if ((count ?? 0) >= NEW_REACTIONS_PER_HOUR_PER_IP) {
          return NextResponse.json({ error: COPY.slowDown }, { status: 429 });
        }
      }

      const { error } = await supabaseAdmin
        .from('reactions')
        .upsert(
          { unsaid_id: unsaidId, device_id: deviceId, ip_address: ipAddress, type: type as ReactionType },
          { onConflict: 'unsaid_id,device_id' }
        );
      if (error) throw error;
    }

    const counts = await getReactionCounts(unsaidId);
    return NextResponse.json({ counts, mine: type });
  } catch (error) {
    console.error('Unexpected error in POST /api/reactions:', error);
    return NextResponse.json({ error: COPY.couldNotReact }, { status: 500 });
  }
}
