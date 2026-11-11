/** Flies (or jumps) the map to a place once the map is ready. Used for the first view on the user's location. */

'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Component to fly to a location with smooth animation
 * Used for initial map centering on user's detected location
 *
 * @param {object} props - Component props
 * @param {{ lat: number; lng: number }} props.center - Target coordinates
 * @param {number} props.zoom - Target zoom level
 * @param {boolean} props.animate - Whether to animate the transition
 *
 * @author CKD
 * @created 2026-01-27
 */
export default function FlyToLocation({ 
  center, 
  zoom,
  animate = true,
}: { 
  center: { lat: number; lng: number }; 
  zoom: number;
  animate?: boolean;
}): null {
  const map = useMap();
  const has_flown_ref = useRef(false);
  const retry_count_ref = useRef(0);
  const max_retries = 10;

  useEffect(() => {
    if (has_flown_ref.current) return;

    const flyToLocation = (): void => {
      try {
        if (!map) {
          if (retry_count_ref.current < max_retries) {
            retry_count_ref.current++;
            setTimeout(flyToLocation, 100);
          }
          return;
        }
        
        // Check if map is properly initialized
        const container = map.getContainer();
        if (!container || !container.parentElement) {
          if (retry_count_ref.current < max_retries) {
            retry_count_ref.current++;
            setTimeout(flyToLocation, 100);
          }
          return;
        }

        // Check if map has panes (fully initialized)
        if (!map.getPane || !map.getPane('mapPane')) {
          if (retry_count_ref.current < max_retries) {
            retry_count_ref.current++;
            setTimeout(flyToLocation, 100);
          }
          return;
        }

        // Use flyTo for smooth animation when user location is detected
        // Use setView for instant positioning when showing world view
        if (animate) {
          map.flyTo([center.lat, center.lng], zoom, {
            duration: 1.5, // Smooth 1.5 second animation
            easeLinearity: 0.25,
          });
        } else {
          map.setView([center.lat, center.lng], zoom, {
            animate: false,
          });
        }

        has_flown_ref.current = true;
      } catch (error) {
        console.warn('Error flying to location:', error);
      }
    };

    // Start after a brief delay to ensure map is ready
    const timer = setTimeout(flyToLocation, 150);
    return () => clearTimeout(timer);
  }, [map, center.lat, center.lng, zoom, animate]);

  return null;
}
