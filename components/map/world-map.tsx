/**
 * World Map component using Leaflet
 * Displays Unsads as soft glowing lights on a dark night-flight style map
 *
 * @author CKD
 * @created 2026-01-23
 */

'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { Unsaid } from '@/types/unsaid';
import MapSkeleton from './map-skeleton';

// Dynamically import Leaflet map to prevent SSR issues
const LeafletMap = dynamic(
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - TypeScript cannot resolve dynamic imports for client-only modules (works at runtime)
  () => import('./leaflet-map'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full relative bg-black">
        <MapSkeleton />
      </div>
    ),
  }
) as React.ComponentType<{
  onUnsaidClick: (unsaid: Unsaid) => void;
  initialUnsads?: Unsaid[];
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  userLocation?: { lat: number; lng: number };
}>;

interface WorldMapProps {
  onUnsaidClick: (unsaid: Unsaid) => void;
  initialUnsads?: Unsaid[];
  initialCenter?: { lat: number; lng: number };
  initialZoom?: number;
  userLocation?: { lat: number; lng: number };
}

export default function WorldMap({ 
  onUnsaidClick, 
  initialUnsads = [],
  initialCenter,
  initialZoom,
  userLocation,
}: WorldMapProps) {
  // Memoize props to prevent unnecessary re-renders
  const leafletMapProps = useMemo(() => ({
    onUnsaidClick,
    initialUnsads,
    initialCenter,
    initialZoom,
    ...(userLocation && { userLocation }),
  }), [onUnsaidClick, initialUnsads, initialCenter, initialZoom, userLocation]);

  return (
    <div className="w-full h-full relative">
      <LeafletMap {...leafletMapProps} />
    </div>
  );
}
