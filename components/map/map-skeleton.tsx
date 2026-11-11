/**
 * Placeholder shown while the map code and the first tiles load.
 * Used by both the dynamic import fallback and the in-map overlay, so the
 * hand-off between the two looks like one continuous loading state.
 */

import React from 'react';

const TILES = Array.from({ length: 24 });

export default function MapSkeleton(): React.ReactElement {
  return (
    <div
      role="status"
      aria-label="Loading map"
      className="absolute inset-0 overflow-hidden bg-[#161616]"
    >
      {/* Faint grid of "tiles" that pulse, staggered, like a map being drawn in */}
      <div className="absolute inset-0 grid grid-cols-6 grid-rows-4 gap-px">
        {TILES.map((_, i) => (
          <div
            key={i}
            className="bg-white/[0.08] motion-safe:animate-pulse"
            style={{ animationDelay: `${(i % 6) * 120 + Math.floor(i / 6) * 160}ms` }}
          />
        ))}
      </div>
      <span className="sr-only">Loading map…</span>
    </div>
  );
}
