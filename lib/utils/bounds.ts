/** Map view bounds and the "is this thought near the view?" check shared by the map and realtime. */

import type { Unsaid } from '@/types/unsaid';

export type ViewBounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Render markers within half a screen of the view; keep (don't drop) up to 1.5 screens away. */
export const RENDER_PAD = 0.5;
export const KEEP_PAD = 1.5;

/** Is the point inside the view bounds grown by `pad` (fraction of the view size)? Handles wrapped longitudes. */
export function pointInBounds(point: { lat: number; lng: number }, b: ViewBounds, pad: number): boolean {
  const latSpan = b.maxLat - b.minLat;
  const lngSpan = b.maxLng - b.minLng;
  if (point.lat < b.minLat - latSpan * pad || point.lat > b.maxLat + latSpan * pad) return false;
  if (lngSpan * (1 + 2 * pad) >= 360) return true;
  const minLng = b.minLng - lngSpan * pad;
  const maxLng = b.maxLng + lngSpan * pad;
  return [0, 360, -360].some((offset) => {
    const lng = point.lng + offset;
    return lng >= minLng && lng <= maxLng;
  });
}

export function inBounds(u: Unsaid, b: ViewBounds, pad: number): boolean {
  return pointInBounds(u.location, b, pad);
}

/** Grow a view to whole grid cells so the same area always asks for (and gets) the same answer. */
export function alignBounds(b: ViewBounds, cell: number): ViewBounds {
  return {
    minLng: Math.floor(b.minLng / cell) * cell,
    minLat: Math.max(-90, Math.floor(b.minLat / cell) * cell),
    maxLng: Math.ceil(b.maxLng / cell) * cell,
    maxLat: Math.min(90, Math.ceil(b.maxLat / cell) * cell),
  };
}
