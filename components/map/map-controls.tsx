/**
 * Map controls: the My Location button.
 *
 * It remembers nothing itself; each press looks at where the map is now (see
 * lib/utils/location-toggle.ts) and either zooms in on the user, zooms back out, or brings
 * the user home from another place or country.
 */

'use client';

import { useRef } from 'react';
import { useMap } from 'react-leaflet';
import { getCountryCode } from '@/lib/utils/location';
import { decideLocationTarget, distanceKm, FAR_AWAY_KM } from '@/lib/utils/location-toggle';
import { USER_LOCATION_ZOOM, ZOOM_LEVELS } from '@/lib/constants/geolocation';

interface MapControlsProps {
  userLocation?: { lat: number; lng: number };
}

/** How close to the middle of the screen (px) the user's point must be to count as "on the user" */
const NEAR_PX = 80;

export default function MapControls({ userLocation }: MapControlsProps) {
  const map = useMap();
  const busyRef = useRef(false);
  const userCountryRef = useRef<string | null>(null);
  const countryCacheRef = useRef(new Map<string, string | null>());

  /** Country at a point, remembered per whole degree so repeated presses do not re-ask */
  const countryAt = async (lat: number, lng: number): Promise<string | null> => {
    const key = `${Math.round(lat)},${Math.round(lng)}`;
    const cache = countryCacheRef.current;
    if (cache.has(key)) return cache.get(key) ?? null;
    const code = await getCountryCode(lat, lng);
    cache.set(key, code);
    return code;
  };

  const handlePress = async () => {
    if (!userLocation || busyRef.current) return;
    busyRef.current = true;
    try {
      const centre = map.getCenter();
      const userPoint = map.latLngToContainerPoint([userLocation.lat, userLocation.lng]);
      const nearUser = userPoint.distanceTo(map.getSize().divideBy(2)) < NEAR_PX;

      // Only ask which country we are in when the user has wandered off their own spot
      let sameCountry = true;
      if (!nearUser) {
        if (userCountryRef.current === null) userCountryRef.current = await countryAt(userLocation.lat, userLocation.lng);
        const here = await countryAt(centre.lat, centre.lng);
        sameCountry =
          here && userCountryRef.current
            ? here === userCountryRef.current
            : distanceKm({ lat: centre.lat, lng: centre.lng }, userLocation) < FAR_AWAY_KM; // lookup failed
      }

      const target = decideLocationTarget({ nearUser, zoom: map.getZoom(), sameCountry });
      map.flyTo([userLocation.lat, userLocation.lng], target === 'in' ? ZOOM_LEVELS.NEIGHBORHOOD : USER_LOCATION_ZOOM, {
        duration: 1.2,
      });
    } finally {
      busyRef.current = false;
    }
  };

  // Only show the button if the user's location is known
  if (!userLocation) {
    return null;
  }

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: '10px', marginRight: '10px', zIndex: 1000 }}>
      {/* No `leaflet-bar`: it adds Leaflet's own 2px square border around the pill */}
      <div className="leaflet-control">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handlePress();
          }}
          className="glass ctl rounded-full h-11 min-w-11 px-3 sm:px-4 cursor-pointer inline-flex items-center justify-center gap-2 font-medium text-sm"
          aria-label="Go to my location"
          title="My location: zoom in or out"
          type="button"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs font-medium hidden sm:inline">My Location</span>
        </button>
      </div>
    </div>
  );
}
