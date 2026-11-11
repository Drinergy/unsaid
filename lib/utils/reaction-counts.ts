/**
 * Server-side reaction helpers: counts per type for a thought, and this device's own reaction.
 * A failed lookup (e.g. migration 006 not applied yet) returns zeros so the thought still loads.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import type { ReactionCounts, ReactionType } from '@/types/unsaid';

export const REACTION_TYPES: ReactionType[] = ['felt', 'me_too', 'here_for_you', 'proud_of_you'];

const empty = (): ReactionCounts => ({ felt: 0, me_too: 0, here_for_you: 0, proud_of_you: 0 });

export async function getReactionCounts(unsaidId: string): Promise<ReactionCounts> {
  const counts = empty();
  const { data, error } = await supabaseAdmin.rpc('get_reaction_counts', { p_unsaid_id: unsaidId });
  if (error) {
    console.error('Error fetching reaction counts:', error);
    return counts;
  }
  for (const row of data ?? []) {
    if (REACTION_TYPES.includes(row.type as ReactionType)) counts[row.type as ReactionType] = Number(row.count);
  }
  return counts;
}

export async function getMyReaction(unsaidId: string, hashedDeviceId: string | null): Promise<ReactionType | null> {
  if (!hashedDeviceId) return null;
  const { data } = await supabaseAdmin
    .from('reactions')
    .select('type')
    .eq('unsaid_id', unsaidId)
    .eq('device_id', hashedDeviceId)
    .maybeSingle();
  return data && REACTION_TYPES.includes(data.type as ReactionType) ? (data.type as ReactionType) : null;
}
