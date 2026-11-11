/** Tells the parent where the map is looking (and how zoomed in) whenever it stops moving. */

'use client';

import { useCallback, useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import type { ViewBounds } from '@/lib/utils/bounds';

export default function ViewportEvents({ onChange }: { onChange: (bounds: ViewBounds, zoom: number) => void }): null {
  const map = useMap();

  const report = useCallback(() => {
    try {
      const b = map.getBounds();
      onChange({ minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() }, map.getZoom());
    } catch (error) {
      console.warn('Could not read the map view:', error);
    }
  }, [map, onChange]);

  // A zoom also ends with a moveend, so one event covers both
  useMapEvents({ moveend: report });

  // First view, once the map has settled
  useEffect(() => {
    const timer = setTimeout(report, 100);
    return () => clearTimeout(timer);
  }, [report]);

  return null;
}
