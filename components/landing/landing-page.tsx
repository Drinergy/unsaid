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
    <div className="w-full h-dvh bg-black flex items-center justify-center relative overflow-hidden pb-28">
      {/* A flat picture of the world with a few glowing dots (decoration, not real thoughts). It is a static
          file, so people who only look at this page use none of the free map-tile quota. */}
      <Image src="/landing-map.svg" alt="" fill priority unoptimized className="object-cover opacity-60" />

      {/* Subtle overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6),transparent_65%)]" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        {/* The logo has a solid black background; a soft round mask hides the square over the map */}
        <Image src="/logo.png" alt="" width={112} height={112} priority className="mx-auto mb-6 [mask-image:radial-gradient(circle,#000_64%,transparent_71%)] [@media(max-height:700px)]:mb-3 [@media(max-height:700px)]:h-16 [@media(max-height:700px)]:w-16" />
        <h1 className="font-serif text-6xl md:text-8xl font-light text-gray-100 mb-5 tracking-[-0.03em] leading-none">
          Unsaid
        </h1>

        <p className="font-serif italic text-2xl md:text-3xl text-[rgb(255,214,170)]/80 mb-8 font-light">
          Thoughts left unspoken
        </p>

        <p className="text-base md:text-[17px] leading-relaxed text-gray-400 mb-8 max-w-md mx-auto">
          {COPY.landingBody}
        </p>

        <p className="text-sm text-gray-400">{COPY.landingPromise}</p>
        <p className="text-xs text-gray-500 mt-2">{COPY.landingLocationNote}</p>
      </div>

      {/* The way on, at the bottom edge where scroll cues belong, apart from the text: a ring (like the logo)
          with a bouncing arrow in it. A real button, so keyboards and screen readers can use it; scrolling
          and swiping work too. */}
      <button
        type="button"
        onClick={() => void enter()}
        className="group absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 rounded-2xl px-6 py-2 text-[rgb(255,214,170)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(255,214,170)]"
        aria-label={COPY.landingDiscover}
      >
        <span className="text-base tracking-wide">{COPY.landingDiscover}</span>
        <span className="cue-ring grid h-12 w-12 place-items-center rounded-full border border-[rgba(255,190,120,0.7)] transition-colors group-hover:border-[rgb(255,214,170)]">
          <svg className="bounce-soft h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {/* The next screen peeking up from the bottom edge: the map's own sea color, so it hints that there is more below */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#141414]/90 to-transparent" />
    </div>
  );
}
