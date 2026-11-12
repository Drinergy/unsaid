/**
 * Which map tiles to use. MapTiler's free plan stops serving after its monthly quota, and a refused
 * tile still arrives as a picture ("invalid key"), so the map cannot notice by itself. We ask for one
 * tile first and fall back to plain OpenStreetMap tiles (no key, shown dark with a CSS filter) if MapTiler says no.
 * This is a stopgap, not a home: OpenStreetMap's tile servers are for light use, and OSM's dark tiles
 * now need a key too (checked: they return an "API KEY REQUIRED" picture).
 */

export type TileProvider = 'maptiler' | 'osm';

export const TILE_SOURCES: Record<TileProvider, { url: string; attribution: string; className: string }> = {
  maptiler: {
    url: `https://api.maptiler.com/maps/dataviz-dark/256/{z}/{x}/{y}.png?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`,
    attribution:
      '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: '',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: 'tiles-dark', // OSM is a light map; globals.css darkens it
  },
};

/** A tile answer of any non-2xx status (403 bad key or quota, 429, 5xx) or no key at all means: use OSM. */
export function pickTileProvider(hasKey: boolean, probeStatus: number | null): TileProvider {
  if (!hasKey) return 'osm';
  if (probeStatus === null) return 'maptiler'; // probe did not finish in time: try MapTiler anyway
  return probeStatus >= 200 && probeStatus < 300 ? 'maptiler' : 'osm';
}

/** Ask MapTiler for the world tile (the browser caches it for hours, so this is about one request per visitor per day). */
export async function probeTileProvider(timeoutMs = 3000): Promise<TileProvider> {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (!key) return pickTileProvider(false, null);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.maptiler.com/maps/dataviz-dark/256/0/0/0.png?key=${key}`, { signal: controller.signal });
    return pickTileProvider(true, res.status);
  } catch (error) {
    // Timed out: try MapTiler. Any other failure (offline, blocked): OSM is the safer choice.
    return (error as { name?: string })?.name === 'AbortError' ? pickTileProvider(true, null) : 'osm';
  } finally {
    clearTimeout(timer);
  }
}
