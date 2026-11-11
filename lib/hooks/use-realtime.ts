/**
 * React hook for Supabase Realtime subscriptions
 * Handles new Unsads and replies within viewport bounds
 *
 * Realtime sends the PostGIS location as a raw hex string, not GeoJSON, so for a new
 * Unsaid we only use the id from the event and fetch the full record from the API.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Unsaid, Reply } from '@/types/unsaid';
import { parsePointHex } from '@/lib/utils/ewkb';
import { pointInBounds, RENDER_PAD } from '@/lib/utils/bounds';

interface UseRealtimeOptions {
  onNewUnsaid?: (unsaid: Unsaid) => void;
  onNewReply?: (reply: Reply) => void;
  onUnsaidDeleted?: (unsaidId: string) => void;
  onUnsaidShadowBanned?: (unsaidId: string) => void;
  viewportBounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;
}

let channelCounter = 0;

/**
 * Subscribes only to the events whose handlers are passed. Handlers and bounds are read
 * through a ref, so inline callbacks do not cause a re-subscribe on every render.
 */
export function useRealtime(options: UseRealtimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const wantsUnsaids = !!(options.onNewUnsaid || options.onUnsaidDeleted || options.onUnsaidShadowBanned);
  const wantsReplies = !!options.onNewReply;

  useEffect(() => {
    // Unique topic per hook instance: two hooks sharing one name would share one channel
    const id = ++channelCounter;
    const channels: ReturnType<typeof supabase.channel>[] = [];
    let cancelled = false;

    if (wantsUnsaids) {
      const channel = supabase
        .channel(`unsaids-changes-${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'unsaids', filter: 'is_shadow_banned=eq.false' },
          async (payload) => {
            if (!optionsRef.current.onNewUnsaid) return;

            // Decide from the event itself whether the thought is anywhere near this screen, so
            // thousands of open browsers do not all fetch every new post. (If the location cannot
            // be read, fall back to fetching.)
            const bounds = optionsRef.current.viewportBounds;
            const point = parsePointHex(payload.new.location);
            if (point && bounds && !pointInBounds(point, bounds, RENDER_PAD)) return;

            try {
              const res = await fetch(`/api/unsaids/${payload.new.id}?replies=1`);
              if (!res.ok || cancelled) return;
              const { unsaid } = await res.json();
              const { id, content, city, countryCode, location, createdAt } = unsaid;
              optionsRef.current.onNewUnsaid?.({ id, content, city, countryCode, location, createdAt });
            } catch (e) {
              console.error('Error loading new unsaid from realtime event:', e);
            }
          }
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'unsaids' }, (payload) => {
          if (payload.new.is_shadow_banned) optionsRef.current.onUnsaidShadowBanned?.(payload.new.id);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'unsaids' }, (payload) => {
          optionsRef.current.onUnsaidDeleted?.(payload.old.id);
        })
        .subscribe();
      channels.push(channel);
    }

    if (wantsReplies) {
      const channel = supabase
        .channel(`replies-changes-${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'replies', filter: 'is_shadow_banned=eq.false' },
          (payload) => {
            const reply = payload.new;
            optionsRef.current.onNewReply?.({
              id: reply.id,
              unsaidId: reply.unsaid_id,
              parentReplyId: reply.parent_reply_id,
              content: reply.content,
              createdAt: reply.created_at,
            });
          }
        )
        .subscribe();
      channels.push(channel);
    }

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [wantsUnsaids, wantsReplies]);
}
