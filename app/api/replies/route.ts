/**
 * API route for Replies operations
 * Handles POST (create) requests
 *
 * @author CKD
 * @created 2026-01-23
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { validateReply } from '@/lib/utils/content-validation';
import {
  checkDeviceRateLimit,
  checkIPRateLimit,
  checkTimeThrottle,
} from '@/lib/utils/rate-limit';
import { checkContentFilter } from '@/lib/utils/keyword-filter';
import { hashDeviceId, hashRequestIp } from '@/lib/utils/request-identity';
import { nextReplyDepth, isReplyDepthAllowed } from '@/lib/utils/reply-depth';
import { pausedResponse } from '@/lib/utils/kill-switch';
import { COPY } from '@/lib/copy';
import { verifyTurnstile, TURNSTILE_FAILED } from '@/lib/utils/turnstile';
import crypto from 'crypto';

/**
 * POST /api/replies
 * Create a new Reply
 *
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<NextResponse>} JSON response with created Reply
 */
export async function POST(request: NextRequest) {
  const paused = pausedResponse();
  if (paused) return paused;
  try {
    const body = await request.json();

    // Bot check first: it costs nothing in the database
    if (!(await verifyTurnstile(body.turnstileToken))) {
      return NextResponse.json(TURNSTILE_FAILED, { status: 400 });
    }
    const { unsaidId, parentReplyId, content } = body;

    const deviceId = hashDeviceId(body.deviceId);
    if (!deviceId) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    const ipAddress = hashRequestIp(request);

    // Optional coarse place (city and country only). Unverified, like a thought's place.
    const countryCode =
      typeof body.countryCode === 'string' && /^[A-Za-z]{2}$/.test(body.countryCode) && body.countryCode.toUpperCase() !== 'XX'
        ? body.countryCode.toUpperCase()
        : null;
    const city =
      typeof body.city === 'string' && body.city.trim().length > 0 && body.city.length <= 100 ? body.city.trim() : null;

    // Validate content
    if (typeof content !== 'string') {
      return NextResponse.json({ error: COPY.emptyContent }, { status: 400 });
    }
    const validation = validateReply(content);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Check keyword filter
    const filterCheck = checkContentFilter(content);
    if (filterCheck.blocked) {
      return NextResponse.json({ error: filterCheck.reason || 'Content not allowed' }, { status: 400 });
    }

    // Verify Unsaid exists and is visible (no replies to hidden posts)
    const { data: unsaid, error: unsaidError } = await supabaseAdmin
      .from('unsaids')
      .select('id')
      .eq('id', unsaidId)
      .eq('is_shadow_banned', false)
      .single();

    if (unsaidError || !unsaid) {
      return NextResponse.json({ error: COPY.thoughtGone }, { status: 404 });
    }

    // If parent reply specified, verify it exists
    let replyDepth = nextReplyDepth(null);
    if (parentReplyId) {
      const { data: parentReply, error: parentError } = await supabaseAdmin
        .from('replies')
        .select('id, unsaid_id, depth')
        .eq('id', parentReplyId)
        .eq('is_shadow_banned', false)
        .single();

      if (parentError || !parentReply) {
        return NextResponse.json({ error: COPY.replyGone }, { status: 404 });
      }

      // Verify parent reply belongs to same Unsaid
      if (parentReply.unsaid_id !== unsaidId) {
        return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
      }

      // Cap thread depth. The parent row already knows its depth, so no need to read the thread.
      replyDepth = nextReplyDepth(parentReply.depth);
      if (!isReplyDepthAllowed(replyDepth)) {
        return NextResponse.json({ error: COPY.tooDeep }, { status: 400 });
      }
    }

    // Check rate limits
    const deviceLimit = await checkDeviceRateLimit(deviceId, 'reply');
    if (!deviceLimit.allowed) {
      return NextResponse.json(
        {
          error: COPY.dailyLimit,
          remaining: deviceLimit.remaining,
          resetAt: deviceLimit.resetAt,
        },
        { status: 429 }
      );
    }

    const ipLimit = await checkIPRateLimit(ipAddress, 'reply');
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: COPY.networkBusy,
          remaining: ipLimit.remaining,
        },
        { status: 429 }
      );
    }

    const timeThrottle = await checkTimeThrottle(deviceId, 'reply');
    if (!timeThrottle.allowed) {
      return NextResponse.json(
        {
          error: COPY.throttleReply,
          waitSeconds: timeThrottle.waitSeconds,
        },
        { status: 429 }
      );
    }

    // Generate content hash
    const contentHash = crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex');

    // The same text five times under one thought in an hour is spam
    const { data: duplicates } = await supabaseAdmin
      .from('replies')
      .select('id')
      .eq('unsaid_id', unsaidId)
      .eq('content_hash', contentHash)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
      .limit(5);
    if (duplicates && duplicates.length >= 5) {
      return NextResponse.json({ error: COPY.repeatedReply }, { status: 400 });
    }

    // Insert Reply
    const { data: reply, error: insertError } = await supabaseAdmin
      .from('replies')
      .insert({
        unsaid_id: unsaidId,
        parent_reply_id: parentReplyId || null,
        content: content.trim(),
        content_hash: contentHash,
        device_id: deviceId,
        ip_address: ipAddress,
        city,
        country_code: countryCode,
        depth: replyDepth,
      })
      .select('id, unsaid_id, parent_reply_id, content, city, country_code, created_at')
      .single();

    if (insertError) {
      console.error('Error creating reply:', insertError);
      return NextResponse.json({ error: COPY.couldNotReply }, { status: 500 });
    }


    return NextResponse.json(
      {
        reply: {
          id: reply.id,
          unsaidId: reply.unsaid_id,
          parentReplyId: reply.parent_reply_id,
          content: reply.content,
          city: reply.city,
          countryCode: reply.country_code,
          createdAt: reply.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/replies:', error);
    return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
  }
}
