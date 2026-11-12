/**
 * API route for Unsads operations
 * Handles GET (list) and POST (create) requests
 *
 * @author CKD
 * @created 2026-01-23
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { validateUnsaid } from '@/lib/utils/content-validation';
import {
  checkDeviceRateLimit,
  checkIPRateLimit,
  checkTimeThrottle,
} from '@/lib/utils/rate-limit';
import { checkContentFilter } from '@/lib/utils/keyword-filter';
import { hashDeviceId, hashRequestIp } from '@/lib/utils/request-identity';
import { roundCoordinate } from '@/lib/utils/location';
import { clusterCellSize } from '@/lib/utils/clustering';
import { CLUSTER_ZOOM_THRESHOLD } from '@/lib/constants/geolocation';
import { readLimited } from '@/lib/utils/read-limit';
import { pausedResponse } from '@/lib/utils/kill-switch';
import { COPY } from '@/lib/copy';
import { verifyTurnstile, TURNSTILE_FAILED } from '@/lib/utils/turnstile';
import crypto from 'crypto';

type UnsaidRow = { id: string; content: string; city: string | null; country_code: string; location: unknown; created_at: string };

/** Database rows to the shape the client uses (location arrives as GeoJSON, as an object or a string) */
function toUnsaids(rows: UnsaidRow[]) {
  return rows.map((unsaid) => {
    let location = { lat: 0, lng: 0 };
    try {
      const geoJson = typeof unsaid.location === 'string' ? JSON.parse(unsaid.location) : (unsaid.location as { coordinates?: number[] } | null);
      if (geoJson && Array.isArray(geoJson.coordinates)) {
        location = { lng: geoJson.coordinates[0], lat: geoJson.coordinates[1] };
      }
    } catch (e) {
      console.error('Error parsing location:', e);
    }
    return {
      id: unsaid.id,
      content: unsaid.content,
      city: unsaid.city,
      countryCode: unsaid.country_code,
      location,
      createdAt: unsaid.created_at,
    };
  });
}

/**
 * GET /api/unsaids
 * Fetch Unsads within viewport bounds or initial load
 *
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<NextResponse>} JSON response with Unsads
 */
export async function GET(request: NextRequest) {
  try {
    // A free host has a small request quota: one visitor (or script) must not be able to use it all
    const limited = readLimited(request);
    if (limited) return limited;

    const searchParams = request.nextUrl.searchParams;
    const bbox = searchParams.get('bbox'); // "minLng,minLat,maxLng,maxLat"
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10) || 200, 1), 500);
    const initial = searchParams.get('initial') === 'true';
    const zoom = parseFloat(searchParams.get('zoom') || '');

    let data;
    let error;

    if (bbox && !initial) {
      const parsed = bbox.split(',').map(Number);
      if (parsed.length !== 4 || !parsed.every(Number.isFinite)) {
        return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
      }
      // Snap zoom and box edges to whole grid cells so near-identical requests share one CDN entry
      // (a caller cannot dodge the cache by changing the last decimal)
      const snappedZoom = Number.isFinite(zoom) ? Math.round(zoom * 2) / 2 : null;
      const cell = snappedZoom === null ? null : clusterCellSize(snappedZoom);
      const [minLng, minLat] = cell ? [parsed[0], parsed[1]].map((v) => Math.floor(v / cell) * cell) : [parsed[0], parsed[1]];
      const [maxLng, maxLat] = cell ? [parsed[2], parsed[3]].map((v) => Math.ceil(v / cell) * cell) : [parsed[2], parsed[3]];
      const cacheHeaders = { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' };

      // Zoomed out: return grid clusters computed in the database instead of up to 200 raw points
      if (snappedZoom !== null && cell && zoom < CLUSTER_ZOOM_THRESHOLD) {
        const { data: rows, error: clusterError } = await supabaseAdmin.rpc('get_unsaid_clusters', {
          min_lng: minLng,
          min_lat: minLat,
          max_lng: maxLng,
          max_lat: maxLat,
          cell_size: cell,
        });
        if (clusterError) {
          console.error('Error fetching clusters:', clusterError);
          return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
        }
        const clusters = (rows || []).map((r) => ({
          lat: r.lat,
          lng: r.lng,
          count: Number(r.count),
          bounds: [[r.bounds_min_lat, r.bounds_min_lng], [r.bounds_max_lat, r.bounds_max_lng]],
          sample: {
            id: r.sample_id,
            content: r.sample_content,
            city: r.sample_city,
            countryCode: r.sample_country_code,
            location: { lat: r.lat, lng: r.lng },
            createdAt: r.sample_created_at,
          },
        }));
        // Cluster answers are the same for everyone looking at the same box, so let the CDN share them
        return NextResponse.json({ clusters }, { headers: cacheHeaders });
      }

      // Viewport-based query using PostGIS RPC
      const result = await supabaseAdmin.rpc('get_unsaids_in_bbox', {
        min_lng: minLng,
        min_lat: minLat,
        max_lng: maxLng,
        max_lat: maxLat,
        result_limit: limit,
      });
      data = result.data;
      error = result.error;
      if (!error) return NextResponse.json({ unsaids: toUnsaids(data || []) }, { headers: cacheHeaders });
    } else {
      // Initial load - get most recent
      const result = await supabaseAdmin
        .from('unsaids')
        .select('id, content, city, country_code, location, created_at')
        .eq('is_shadow_banned', false)
        .order('created_at', { ascending: false })
        .limit(limit);
      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error fetching unsaids:', error);
      return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
    }

    const unsaids = toUnsaids(data || []);

    return NextResponse.json({ unsaids });
  } catch (error) {
    console.error('Unexpected error in GET /api/unsaids:', error);
    return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
  }
}

/**
 * POST /api/unsaids
 * Create a new Unsaid
 *
 * @param {NextRequest} request - Next.js request object
 * @returns {Promise<NextResponse>} JSON response with created Unsaid
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
    const { content, city, countryCode } = body;
    const rawLocation = body.location;

    // Hashed identifiers: raw device id / IP are never stored
    const deviceId = hashDeviceId(body.deviceId);
    if (!deviceId) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    const ipAddress = hashRequestIp(request);

    // Validate content
    if (typeof content !== 'string') {
      return NextResponse.json({ error: COPY.emptyContent }, { status: 400 });
    }
    const validation = validateUnsaid(content);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Check keyword filter
    const filterCheck = checkContentFilter(content);
    if (filterCheck.blocked) {
      return NextResponse.json({ error: filterCheck.reason || 'Content not allowed' }, { status: 400 });
    }

    // Validate place data, then blur coordinates here so privacy does not depend on the client
    const lat = rawLocation?.lat;
    const lng = rawLocation?.lng;
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    if (typeof countryCode !== 'string' || !/^[A-Za-z]{2}$/.test(countryCode)) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    if (city != null && (typeof city !== 'string' || city.length > 100)) {
      return NextResponse.json({ error: COPY.badRequest }, { status: 400 });
    }
    const location = { lat: roundCoordinate(lat), lng: roundCoordinate(lng) };

    // Check rate limits
    const deviceLimit = await checkDeviceRateLimit(deviceId, 'unsaid');
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

    const ipLimit = await checkIPRateLimit(ipAddress, 'unsaid');
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: COPY.networkBusy,
          remaining: ipLimit.remaining,
        },
        { status: 429 }
      );
    }

    const timeThrottle = await checkTimeThrottle(deviceId, 'unsaid');
    if (!timeThrottle.allowed) {
      return NextResponse.json(
        {
          error: COPY.throttleThought,
          waitSeconds: timeThrottle.waitSeconds,
        },
        { status: 429 }
      );
    }

    // Generate content hash for duplicate detection
    const contentHash = crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex');

    // Check for duplicate content (same hash in last hour)
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: duplicates } = await supabaseAdmin
      .from('unsaids')
      .select('id')
      .eq('content_hash', contentHash)
      .gte('created_at', oneHourAgo)
      .limit(5);

    if (duplicates && duplicates.length >= 5) {
      return NextResponse.json(
        { error: COPY.repeatedThought },
        { status: 400 }
      );
    }

    // Insert Unsaid using RPC function for PostGIS
    const { data: unsaidData, error: insertError } = await supabaseAdmin.rpc(
      'create_unsaid_with_location',
      {
        p_content: content.trim(),
        p_content_hash: contentHash,
        p_city: city || null,
        p_country_code: countryCode.toUpperCase(),
        p_lng: location.lng,
        p_lat: location.lat,
        p_device_id: deviceId,
        p_ip_address: ipAddress,
      }
    );

    const unsaid = unsaidData && unsaidData.length > 0 ? unsaidData[0] : null;

    if (insertError || !unsaid) {
      console.error('Error creating unsaid:', insertError);
      return NextResponse.json({ error: COPY.couldNotShare }, { status: 500 });
    }


    // Transform response location
    let responseLocation = { lat: location.lat, lng: location.lng };
    if (unsaid && unsaid.location) {
      try {
        const geoJson = typeof unsaid.location === 'string' ? JSON.parse(unsaid.location) : unsaid.location;
        if (geoJson && geoJson.coordinates && Array.isArray(geoJson.coordinates)) {
          responseLocation = {
            lng: geoJson.coordinates[0],
            lat: geoJson.coordinates[1],
          };
        }
      } catch {
        // Use provided location as fallback
      }
    }

    return NextResponse.json(
      {
        unsaid: {
          id: unsaid.id,
          content: unsaid.content,
          city: unsaid.city,
          countryCode: unsaid.country_code,
          location: responseLocation,
          createdAt: unsaid.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/unsaids:', error);
    return NextResponse.json({ error: COPY.ourSide }, { status: 500 });
  }
}
