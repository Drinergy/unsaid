/**
 * API route for Reports operations
 * Handles POST (create report) requests
 *
 * @author CKD
 * @created 2026-01-23
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { hashDeviceId, hashRequestIp } from '@/lib/utils/request-identity';
import { COPY } from '@/lib/copy';

const REPORTS_PER_HOUR_PER_IP = 20;

/**
 * POST /api/reports
 * Create a new Report
 *
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<NextResponse>} JSON response
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { unsaidId, replyId, reason } = body;

    const deviceId = hashDeviceId(body.deviceId);
    if (!deviceId) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    if (reason != null && (typeof reason !== 'string' || reason.length > 500)) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }

    // Validate that exactly one target is provided
    if ((!unsaidId && !replyId) || (unsaidId && replyId)) {
      return NextResponse.json(
        { error: COPY.badRequest },
        { status: 400 }
      );
    }

    // Get IP address
    const ipAddress = hashRequestIp(request);

    // A device id is whatever the caller says it is, so reports are limited and counted per IP.
    const { count: recentReports } = await supabaseAdmin
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString());
    if ((recentReports ?? 0) >= REPORTS_PER_HOUR_PER_IP) {
      return NextResponse.json({ error: COPY.slowDown }, { status: 429 });
    }

    // Verify target exists
    if (unsaidId) {
      const { data: unsaid, error: unsaidError } = await supabaseAdmin
        .from('unsaids')
        .select('id')
        .eq('id', unsaidId)
        .single();

      if (unsaidError || !unsaid) {
        return NextResponse.json({ error: COPY.thoughtGone }, { status: 404 });
      }
    }

    if (replyId) {
      const { data: reply, error: replyError } = await supabaseAdmin
        .from('replies')
        .select('id')
        .eq('id', replyId)
        .single();

      if (replyError || !reply) {
        return NextResponse.json({ error: COPY.replyGone }, { status: 404 });
      }
    }

    // Create report (trigger will increment report_count and shadow ban if threshold reached)
    const { error: insertError } = await supabaseAdmin.from('reports').insert({
      unsaid_id: unsaidId || null,
      reply_id: replyId || null,
      device_id: deviceId,
      ip_address: ipAddress,
      reason: reason || null,
    });

    // 23505 = this IP (or device) already reported this target; treat as success, count stays at one
    if (insertError && insertError.code !== '23505') {
      console.error('Error creating report:', insertError);
      return NextResponse.json({ error: COPY.couldNotReport }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/reports:', error);
    return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
  }
}
