/**
 * Reads a point out of a Realtime event's `location`, so the browser can decide if a new thought
 * is in view before asking the API for it. Supabase sends a PostGIS point as a GeoJSON object
 * (`{ type: 'Point', coordinates: [lng, lat] }`); a hex EWKB string is also understood, in case
 * the format differs between versions or setups. Returns null when it is neither.
 */
export function parseRealtimePoint(value: unknown): { lng: number; lat: number } | null {
  if (value && typeof value === 'object') {
    const coords = (value as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const [lng, lat] = coords;
      return typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
    }
    return null;
  }
  if (typeof value === 'string') {
    if (value.trim().startsWith('{')) {
      try {
        return parseRealtimePoint(JSON.parse(value));
      } catch {
        return null;
      }
    }
    return parsePointHex(value);
  }
  return null;
}

/** Reads a point from a hex EWKB string (how PostGIS writes a geometry column as text). */
export function parsePointHex(hex: unknown): { lng: number; lat: number } | null {
  if (typeof hex !== 'string' || hex.length < 42 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);

  const littleEndian = bytes[0] === 1;
  const type = view.getUint32(1, littleEndian);
  if ((type & 0xff) !== 1) return null; // 1 = point

  const hasSrid = (type & 0x20000000) !== 0;
  const offset = 5 + (hasSrid ? 4 : 0);
  if (bytes.length < offset + 16) return null;

  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}
