/**
 * API route for single Unsaid operations
 * Handles GET (fetch with replies) requests
 *
 * @author CKD
 * @created 2026-01-23
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hashDeviceId } from '@/lib/utils/request-identity';
import { readLimited } from '@/lib/utils/read-limit';
import { COPY } from '@/lib/copy';
import { getReactionCounts, getMyReaction } from '@/lib/utils/reaction-counts';

const DEFAULT_REPLY_PAGE = 200;
const MAX_REPLY_PAGE = 1000;

/**
 * GET /api/unsaids/[id]
 * Fetch a single Unsaid with a page of its replies (flat, oldest first; ?replies=N asks for more)
 *
 * @param {NextRequest} request - Next.js request object
 * @param {{ params: Promise<{ id: string }> }} context - Route context
 * @returns {Promise<NextResponse>} JSON response with Unsaid and replies
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = readLimited(request);
    if (limited) return limited;
    const { id } = await params;

    // Fetch Unsaid (exclude shadow-banned thoughts)
    const { data: unsaid, error: unsaidError } = await supabaseAdmin
      .from('unsaids')
      .select('id, content, city, country_code, location, created_at, is_shadow_banned')
      .eq('id', id)
      .eq('is_shadow_banned', false)
      .single();

    if (unsaidError || !unsaid) {
      return NextResponse.json({ error: COPY.thoughtGone }, { status: 404 });
    }

    // Type assertion for unsaid data
    const unsaidData = unsaid as {
      id: string;
      content: string;
      city: string | null;
      country_code: string;
      location: string | { coordinates?: number[] } | null;
      created_at: string;
      is_shadow_banned?: boolean;
    };

    // Double-check: if somehow is_shadow_banned is true, return 404
    if (unsaidData.is_shadow_banned) {
      return NextResponse.json({ error: COPY.thoughtGone }, { status: 404 });
    }

    // Replies: a bounded, oldest-first page (the client builds the tree and asks for more)
    const wanted = parseInt(request.nextUrl.searchParams.get('replies') || '', 10);
    const replyLimit = Math.min(Math.max(Number.isFinite(wanted) ? wanted : DEFAULT_REPLY_PAGE, 1), MAX_REPLY_PAGE);
    const { data: replies, count: replyTotal, error: repliesError } = await supabaseAdmin
      .from('replies')
      .select('id, unsaid_id, parent_reply_id, content, city, country_code, created_at', { count: 'exact' })
      .eq('unsaid_id', id)
      .eq('is_shadow_banned', false)
      .order('created_at', { ascending: true })
      .limit(replyLimit);

    if (repliesError) {
      console.error('Error fetching replies:', repliesError);
      // Continue without replies rather than failing
    }

    // Transform location from GeoJSON
    let location = { lat: 0, lng: 0 };
    try {
      const geoJson = typeof unsaidData.location === 'string' ? JSON.parse(unsaidData.location) : unsaidData.location;
      if (geoJson && geoJson.coordinates && Array.isArray(geoJson.coordinates)) {
        location = {
          lng: geoJson.coordinates[0],
          lat: geoJson.coordinates[1],
        };
      }
    } catch (e) {
      console.error('Error parsing location:', e);
    }

    const flatReplies = (replies || []).map((reply) => ({
      id: reply.id,
      unsaidId: reply.unsaid_id,
      parentReplyId: reply.parent_reply_id,
      content: reply.content,
      city: reply.city ?? null,
      countryCode: reply.country_code ?? null,
      createdAt: reply.created_at,
    }));

    // Reaction counts for everyone, plus this device's own (sent in a header, not the URL)
    const [counts, mine] = await Promise.all([
      getReactionCounts(id),
      getMyReaction(id, hashDeviceId(request.headers.get('x-device-id'))),
    ]);

    return NextResponse.json({
      unsaid: {
        id: unsaidData.id,
        content: unsaidData.content,
        city: unsaidData.city,
        countryCode: unsaidData.country_code,
        location,
        createdAt: unsaidData.created_at,
        replies: flatReplies,
        replyTotal: replyTotal ?? flatReplies.length,
        reactions: { counts, mine },
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/unsaids/[id]:', error);
    return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
  }
}
