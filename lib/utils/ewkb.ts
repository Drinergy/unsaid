/**
 * Reads a point from a hex EWKB string. This is how a PostGIS geometry column arrives in a
 * Realtime event (not as GeoJSON), so it lets the browser decide if a new thought is in view
 * before asking the API for it.
 */
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
