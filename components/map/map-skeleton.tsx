/**
 * Shown while the map code and the first tiles load. It is the same picture of the world as the landing
 * page, drifting slowly, with soft rings spreading from the middle, like a light searching for thoughts.
 * Used by the page (while the place is found), the dynamic import fallback and the in-map overlay, so the
 * hand-over between them looks like one continuous loading moment.
 */

import React from 'react';
import Image from 'next/image';
import { COPY } from '@/lib/copy';

export default function MapSkeleton(): React.ReactElement {
  return (
    <div role="status" aria-label={COPY.mapLoading} className="absolute inset-0 overflow-hidden bg-[#0b0c10]">
      <Image src="/landing-map.svg" alt="" fill priority unoptimized className="skeleton-drift object-cover opacity-45" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.65))]" />

      {/* Rings spreading out from a light in the middle */}
      <div className="search-ring" />
      <div className="search-ring" style={{ animationDelay: '1.2s' }} />
      <div className="search-ring" style={{ animationDelay: '2.4s' }} />
      <span className="light-dot breathe absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" aria-hidden="true" />

      <p className="absolute left-0 right-0 top-[calc(50%+3.5rem)] text-center text-sm text-gray-400 loading-caption">
        {COPY.mapLoading}
      </p>
    </div>
  );
}
