/**
 * What the "My Location" button should do next, given where the map is looking.
 *
 *  - on the user's spot: toggle between the close-up and the zoomed-out view
 *  - wandered elsewhere in the user's country: come back to the user, zoomed in
 *  - wandered into another country: come back to the zoomed-out view of the user
 */

export type LocationTarget = 'in' | 'out';

/** At or above this zoom, a view on the user counts as "zoomed in" */
export const ZOOMED_IN_FROM = 10;

export function decideLocationTarget(args: {
  /** Is the user's point near the middle of the screen? */
  nearUser: boolean;
  zoom: number;
  /** Is the map's centre in the user's country? */
  sameCountry: boolean;
}): LocationTarget {
  if (args.nearUser) return args.zoom >= ZOOMED_IN_FROM ? 'out' : 'in';
  return args.sameCountry ? 'in' : 'out';
}

/** Straight-line distance in km (haversine), used only when the country lookup is unavailable */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Without a country lookup, call somewhere this far from the user "another country" */
export const FAR_AWAY_KM = 1200;
