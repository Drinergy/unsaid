/**
 * Shown while the map code and the first tiles load: the map's own sea colour (#141414), with soft rings
 * spreading from a light in the middle, like a search. Plain on purpose: any picture of the world would
 * not line up with the real tiles and would look like a different map popping in. Used by the page (while
 * the place is found), the dynamic import fallback and the in-map overlay, so they look like one moment.
 */

import React from 'react';
import { COPY } from '@/lib/copy';

export default function MapSkeleton(): React.ReactElement {
  return (
    <div role="status" aria-label={COPY.mapLoading} className="absolute inset-0 overflow-hidden bg-[#141414]">
      {/* Rings spreading out from a light in the middle */}
      <div className="search-ring" />
      <div className="search-ring" style={{ animationDelay: '1.2s' }} />
      <div className="search-ring" style={{ animationDelay: '2.4s' }} />
      <span className="light-dot breathe absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" aria-hidden="true" />

    </div>
  );
}
