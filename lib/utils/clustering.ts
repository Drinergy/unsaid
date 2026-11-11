/**
 * Location clustering utility
 * Groups nearby thoughts for display when zoomed out (grid-based so overlapping nodes always merge)
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD - Grid-based clustering for reliable grouping
 */

import type { Unsaid } from '@/types/unsaid';

export interface Cluster {
  center: { lat: number; lng: number };
  /** All thoughts in the cell (client clustering) or just the one sample when count is 1 (server clustering) */
  thoughts: Unsaid[];
  count: number;
  /** [[south, west], [north, east]] of the cell's points; set by server clustering */
  bounds?: [[number, number], [number, number]];
}

/** One cell as the API returns it (GET /api/unsaids with a zoom below the cluster threshold) */
export interface ApiCluster {
  lat: number;
  lng: number;
  count: number;
  /** [[south, west], [north, east]] of the points in the cell */
  bounds: [[number, number], [number, number]];
  /** The newest thought in the cell; shown directly when the cell holds only one */
  sample: Unsaid;
}

/** Turn API cells into map clusters, padding the bounds a little so a click leaves room around them */
export function clustersFromApi(rows: ApiCluster[]): Cluster[] {
  return rows.map((row) => {
    const [[minLat, minLng], [maxLat, maxLng]] = row.bounds;
    const padLat = Math.max((maxLat - minLat) * 0.2, 0.01);
    const padLng = Math.max((maxLng - minLng) * 0.2, 0.01);
    return {
      center: { lat: row.lat, lng: row.lng },
      count: row.count,
      thoughts: row.count === 1 ? [row.sample] : [],
      bounds: [[minLat - padLat, minLng - padLng], [maxLat + padLat, maxLng + padLng]],
    };
  });
}

/** Target cluster cell width on screen, in pixels (Leaflet tiles are 256px at zoom 0). */
const CELL_PX = 90;

/**
 * Cell size in degrees that stays ~CELL_PX wide on screen at every zoom, so clusters
 * never pile on top of each other. Used by both the client and the API.
 */
export function clusterCellSize(zoom: number): number {
  return Math.max(0.0005, (CELL_PX * 360) / (256 * Math.pow(2, zoom)));
}

/** Web Mercator position in pixels at this zoom (Leaflet tiles are 256px at zoom 0). */
function toPixel(lat: number, lng: number, zoom: number): [number, number] {
  const scale = 256 * Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  return [
    ((lng + 180) / 360) * scale,
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
  ];
}

/** Drawn radius (px) of a cluster marker; shared by the map and the overlap merge. */
export function clusterRadius(count: number): number {
  return count === 1 ? 5 : Math.min(8 + count * 1.5, 24);
}

/**
 * Merge clusters whose circles would overlap on screen. Grid cells can leave two
 * centres almost touching across a cell edge; this folds such pairs into one.
 */
export function mergeOverlapping(clusters: Cluster[], zoom: number): Cluster[] {
  const items = clusters.map((c) => ({ ...c, center: { ...c.center } }));
  const px = items.map((c) => toPixel(c.center.lat, c.center.lng, zoom));
  const alive = items.map(() => true);
  const order = items.map((_, i) => i).sort((a, b) => items[b].count - items[a].count);

  for (const i of order) {
    if (!alive[i]) continue;
    let merged = true;
    while (merged) {
      merged = false;
      for (let j = 0; j < items.length; j++) {
        if (j === i || !alive[j]) continue;
        const gap = Math.hypot(px[i][0] - px[j][0], px[i][1] - px[j][1]);
        if (gap >= clusterRadius(items[i].count) + clusterRadius(items[j].count)) continue;

        const a = items[i];
        const b = items[j];
        const total = a.count + b.count;
        a.center = {
          lat: (a.center.lat * a.count + b.center.lat * b.count) / total,
          lng: (a.center.lng * a.count + b.center.lng * b.count) / total,
        };
        if (a.bounds && b.bounds) {
          a.bounds = [
            [Math.min(a.bounds[0][0], b.bounds[0][0]), Math.min(a.bounds[0][1], b.bounds[0][1])],
            [Math.max(a.bounds[1][0], b.bounds[1][0]), Math.max(a.bounds[1][1], b.bounds[1][1])],
          ];
        }
        a.count = total;
        a.thoughts = [];
        px[i] = toPixel(a.center.lat, a.center.lng, zoom);
        alive[j] = false;
        merged = true;
      }
    }
  }
  return items.filter((_, i) => alive[i]);
}

/**
 * Group thoughts that would sit within ~cellPx of each other on screen at this zoom
 * (including thoughts at the exact same point), so overlapping dots become one group.
 */
export function groupByPixel(thoughts: Unsaid[], zoom: number, cellPx = 28): Unsaid[][] {
  const groups = new Map<string, Unsaid[]>();
  for (const t of thoughts) {
    const [x, y] = toPixel(t.location.lat, t.location.lng, zoom);
    const key = `${Math.floor(x / cellPx)}_${Math.floor(y / cellPx)}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }
  return [...groups.values()];
}

/**
 * Get bounding box for a list of unsaids (for flyToBounds)
 *
 * @param thoughts - List of unsaids
 * @returns [[south, west], [north, east]] for Leaflet bounds
 */
export function getThoughtsBounds(thoughts: Unsaid[]): [[number, number], [number, number]] {
  if (thoughts.length === 0) {
    return [[0, 0], [0, 0]];
  }
  let minLat = thoughts[0].location.lat;
  let maxLat = thoughts[0].location.lat;
  let minLng = thoughts[0].location.lng;
  let maxLng = thoughts[0].location.lng;
  for (const t of thoughts) {
    minLat = Math.min(minLat, t.location.lat);
    maxLat = Math.max(maxLat, t.location.lat);
    minLng = Math.min(minLng, t.location.lng);
    maxLng = Math.max(maxLng, t.location.lng);
  }
  const padLat = Math.max((maxLat - minLat) * 0.2, 0.01);
  const padLng = Math.max((maxLng - minLng) * 0.2, 0.01);
  return [
    [minLat - padLat, minLng - padLng],
    [maxLat + padLat, maxLng + padLng],
  ];
}
