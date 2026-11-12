/**
 * Landing page: who we are, then a bouncing arrow. Scrolling down (mouse wheel, swipe up, arrow keys, or
 * a tap on the arrow) moves on to the map. No location prompt appears on the way in: we use the place
 * we already know, or an approximate one from the network, and the exact place is only asked for
 * when someone shares a thought.
 *
 * @author CKD
 * @created 2026-01-23
 */

'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useGeolocation, getDefaultLocation } from '@/lib/hooks/use-geolocation';
import { COPY } from '@/lib/copy';
import { keyGoesDown, swipeGoesDown, wheelGoesDown } from '@/lib/utils/scroll-intent';

type Place = { lat: number; lng: number; city?: string; countryCode?: string };

interface LandingPageProps {
  /** Called the moment the visitor moves on, so the page can start sliding away */
  onEnterStart: () => void;
  /** Called with the place to open the map on (after the slide has had time to play) */
  onEnterMap: (location: Place) => void;
}

/** Let the slide-away play before the map starts to mount, so it does not stutter */
const SLIDE_MS = 700;
const PLACE_TIMEOUT_MS = 3000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isReal = (p?: { lat: number; lng: number } | null): p is Place => !!p && p.lat !== 0 && p.lng !== 0;

export default function LandingPage({ onEnterStart, onEnterMap }: LandingPageProps): React.ReactElement {
  const { requestLocation, getCachedLocation } = useGeolocation({ enableCache: true });
  const started = useRef(false);

  /** A place we already know, else an approximate one (no permission prompt), else the whole world */
  const findPlace = useCallback(async (): Promise<Place> => {
    const cached = getCachedLocation();
    if (isReal(cached)) return cached;
    try {
      const approximate = await Promise.race([requestLocation(false), wait(PLACE_TIMEOUT_MS).then(() => null)]);
      if (isReal(approximate)) return approximate;
    } catch {
      // fall through to the default view
    }
    return getDefaultLocation();
  }, [getCachedLocation, requestLocation]);

  const enter = useCallback(async (): Promise<void> => {
    if (started.current) return;
    started.current = true;
    onEnterStart();
    const [place] = await Promise.all([findPlace(), wait(SLIDE_MS)]);
    onEnterMap(place);
  }, [findPlace, onEnterStart, onEnterMap]);

  // Scrolling down, swiping up or pressing a scrolling key all mean "go on"
  useEffect(() => {
    let touchStartY: number | null = null;
    const onWheel = (e: WheelEvent) => wheelGoesDown(e.deltaY) && void enter();
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const endY = e.changedTouches[0]?.clientY;
      if (touchStartY !== null && endY !== undefined && swipeGoesDown(touchStartY, endY)) void enter();
      touchStartY = null;
    };
    const onKey = (e: KeyboardEvent) => keyGoesDown(e.key) && void enter();

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('keydown', onKey);
    };
  }, [enter]);

  return (
    <div className="w-full h-dvh bg-black flex items-center justify-center relative overflow-hidden">
      {/* A flat picture of the world with a few glowing dots (decoration, not real thoughts). It is a static
          file, so people who only look at this page use none of the free map-tile quota. */}
      <Image src="/landing-map.svg" alt="" fill priority unoptimized className="object-cover opacity-60" />

      {/* Subtle overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6),transparent_65%)]" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        {/* The logo has a solid black background; a soft round mask hides the square over the map */}
        <Image src="/logo.png" alt="" width={112} height={112} priority className="mx-auto mb-6 [mask-image:radial-gradient(circle,#000_64%,transparent_71%)]" />
        <h1 className="font-serif text-6xl md:text-8xl font-light text-gray-100 mb-5 tracking-[-0.03em] leading-none">
          Unsaid
        </h1>

        <p className="font-serif italic text-2xl md:text-3xl text-[rgb(255,214,170)]/80 mb-8 font-light">
          Thoughts left unspoken
        </p>

        <p className="text-base md:text-[17px] leading-relaxed text-gray-400 mb-10 max-w-md mx-auto">
          {COPY.landingBody}
        </p>

        <p className="text-sm text-gray-400">{COPY.landingPromise}</p>
        <p className="text-xs text-gray-500 mt-2">{COPY.landingLocationNote}</p>
      </div>

      {/* The way on: a quiet label and a bouncing arrow. A real button, so keyboards and screen readers can use it. */}
      <button
        type="button"
        onClick={() => void enter()}
        className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 rounded-2xl px-6 py-3 text-gray-400 transition-colors hover:text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(255,214,170)]"
        aria-label={COPY.landingDiscover}
      >
        <span className="text-sm tracking-wide">{COPY.landingDiscover}</span>
        <svg className="bounce-soft h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
