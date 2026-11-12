/**
 * Leaflet map (client-side only): the map itself, the tiles, and the skeleton until it is ready.
 * The thoughts on it live in use-viewport-data.ts (loading) and unsaid-markers.tsx (drawing).
 */

'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { MapContainer, TileLayer, AttributionControl, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import type { Unsaid } from '@/types/unsaid';
import { USER_LOCATION_ZOOM, DEFAULT_ZOOM, DEFAULT_MAP_CENTER } from '@/lib/constants/geolocation';
import MapControls from './map-controls';
import MapSkeleton from './map-skeleton';
import FlyToLocation from './fly-to-location';
import ViewportEvents from './viewport-events';
import UnsaidMarkers from './unsaid-markers';
import { useViewportData } from './use-viewport-data';
import { probeTileProvider, TILE_SOURCES, type TileProvider } from '@/lib/utils/tile-provider';

interface LeafletMapProps {
  /** Callback when an unsaid marker is clicked */
  onUnsaidClick: (unsaid: Unsaid) => void;
  /** Thoughts the page already has (merged with what the map loads) */
  initialUnsads?: Unsaid[];
  /** Initial center coordinates (will flyTo this location) */
  initialCenter?: { lat: number; lng: number };
  /** Initial zoom level */
  initialZoom?: number;
  /** User's detected location (for "my location" button) */
  userLocation?: { lat: number; lng: number };
}

export type { LeafletMapProps };

const NO_UNSAIDS: Unsaid[] = [];

/** Never keep the skeleton up longer than this if tiles or data fail to arrive (offline, bad key) */
const GIVE_UP_MS = 6000;

export default function LeafletMap({
  onUnsaidClick,
  initialUnsads = NO_UNSAIDS,
  initialCenter,
  initialZoom,
  userLocation,
}: LeafletMapProps): React.ReactElement {
  // Determine zoom level based on whether user location is detected
  const hasUserLocation =
    initialCenter && initialCenter.lat !== DEFAULT_MAP_CENTER.lat && initialCenter.lng !== DEFAULT_MAP_CENTER.lng;

  // Leaflet expects [lat, lng]
  const defaultCenter = useMemo<LatLngExpression>(
    () => (initialCenter ? [initialCenter.lat, initialCenter.lng] : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng]),
    [initialCenter]
  );
  const defaultZoom = initialZoom || (hasUserLocation ? USER_LOCATION_ZOOM : DEFAULT_ZOOM);

  // One key per mount so the map container is never reused
  const mapKey = useId();

  // Which tiles to use is decided once, before any tile is requested (see tile-provider.ts)
  const [provider, setProvider] = useState<TileProvider | null>(null);
  useEffect(() => {
    let cancelled = false;
    probeTileProvider().then((p) => !cancelled && setProvider(p));
    return () => {
      cancelled = true;
    };
  }, []);

  const { visibleUnsaids, serverClusters, viewCount, dataLoaded, onViewChange } = useViewportData(initialUnsads);

  // Show a skeleton until the first tiles AND the first viewport data are in, then reveal
  // everything together (no stray placeholder markers that jump when the real ones arrive)
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const ready = (tilesLoaded && dataLoaded) || gaveUp;
  useEffect(() => {
    const timer = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full h-full">
      <MapContainer
        key={mapKey}
        center={defaultCenter}
        zoom={defaultZoom}
        minZoom={2}
        className="w-full h-full"
        worldCopyJump
        attributionControl={false}
        zoomControl={false}
        scrollWheelZoom={true}
      >
        {/* Credit is required by MapTiler/OSM terms; keep it, but without the Leaflet flag */}
        <AttributionControl position="bottomright" prefix={false} />

        {/* Dark raster tiles: MapTiler, or plain OpenStreetMap when MapTiler's quota or key is exhausted.
            updateWhenZooming and keepBuffer keep tile requests (and the free quota) low. */}
        {provider && (
          <TileLayer
            key={provider}
            url={TILE_SOURCES[provider].url}
            className={TILE_SOURCES[provider].className}
            maxZoom={19}
            updateWhenZooming={false}
            keepBuffer={1}
            attribution={TILE_SOURCES[provider].attribution}
            eventHandlers={{ load: () => setTilesLoaded(true) }}
          />
        )}

        {/* FlyTo user location with smooth animation */}
        {initialCenter && <FlyToLocation center={initialCenter} zoom={defaultZoom} animate={!!hasUserLocation} />}

        <MapControls userLocation={userLocation} />

        {/* Tell the data hook where the map is looking */}
        <ViewportEvents onChange={onViewChange} />

        {ready && (
          <>
            <HideMarkersWhileZooming />
            <UnsaidMarkers unsaids={visibleUnsaids} serverClusters={serverClusters} onUnsaidClick={onUnsaidClick} />
          </>
        )}
      </MapContainer>

      {/* Live status instead of a permanent banner: what is actually in this view */}
      {ready && viewCount && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none" role="status" aria-live="polite">
          <div className="glass rounded-full h-10 px-4 inline-flex items-center gap-2 text-sm text-gray-200 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-[rgb(255,214,170)]" aria-hidden="true" />
            {viewCount.count === 0
              ? 'No thoughts in this view yet'
              : `${viewCount.count.toLocaleString()}${viewCount.capped ? '+' : ''} ${viewCount.count === 1 ? 'thought' : 'thoughts'} in view`}
          </div>
        </div>
      )}

      {/* Skeleton covers the map until tiles are drawn, then fades out */}
      <div
        aria-hidden={ready}
        className={`absolute inset-0 z-[1100] transition-opacity duration-500 ${ready ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      >
        <MapSkeleton />
      </div>
    </div>
  );
}

/**
 * Leaflet CSS-scales the SVG marker layer during a zoom and only redraws it at the
 * final size afterwards, so dots balloon and then snap back. Hide the layer while
 * zooming (see `.is-zooming` in globals.css) and fade it back in after.
 */
function HideMarkersWhileZooming(): null {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const start = () => el.classList.add('is-zooming');
    const end = () => el.classList.remove('is-zooming');
    map.on('zoomstart', start);
    map.on('zoomend', end);
    return () => {
      map.off('zoomstart', start);
      map.off('zoomend', end);
      end();
    };
  }, [map]);
  return null;
}
