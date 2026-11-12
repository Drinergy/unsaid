/**
 * Landing page component
 * Shows introduction and CTA to proceed to map
 * Requests geolocation on CTA click to center map on user's country
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD - Added geolocation on CTA click with loading state
 */

'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useGeolocation, getDefaultLocation } from '@/lib/hooks/use-geolocation';
import { ButtonLoading } from '@/components/ui/loading-spinner';
import { COPY } from '@/lib/copy';

interface LandingPageProps {
  /** Callback when user enters the map, receives detected location */
  onEnterMap: (location: { lat: number; lng: number; city?: string; countryCode?: string }) => void;
}

/**
 * Landing page with geolocation-enabled CTA
 * When user clicks "Discover Thoughts", we request their location
 * to center the map on their country/region
 *
 * @param {LandingPageProps} props - Component props
 * @returns {React.ReactElement} Landing page element
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD
 */
export default function LandingPage({ onEnterMap }: LandingPageProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [error_message, setErrorMessage] = useState<string | null>(null);
  const { requestLocation, getCachedLocation } = useGeolocation({ enableCache: true });

  /**
   * Handle CTA click - request location and enter map
   * Button click is a user gesture, which enables browser geolocation in Safari
   */
  const handleEnterMap = async (): Promise<void> => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // Check for cached location first (instant)
      const cached = getCachedLocation();
      if (cached && cached.lat !== 0 && cached.lng !== 0) {
        onEnterMap({
          lat: cached.lat,
          lng: cached.lng,
          city: cached.city,
          countryCode: cached.countryCode,
        });
        return;
      }

      // Request fresh location (prefer browser geolocation for accuracy)
      // This is a user gesture, so browser geolocation will work in Safari
      const location = await requestLocation(true);

      if (location && location.lat !== 0 && location.lng !== 0) {
        onEnterMap({
          lat: location.lat,
          lng: location.lng,
          city: location.city,
          countryCode: location.countryCode,
        });
      } else {
        // Fallback to default world view
        const default_location = getDefaultLocation();
        onEnterMap({
          lat: default_location.lat,
          lng: default_location.lng,
        });
      }
    } catch (err) {
      // Log error but don't block user - use default location
      console.warn('Location detection failed, using world view:', err);

      // For non-blocking errors, still enter the map with default view
      const default_location = getDefaultLocation();
      onEnterMap({
        lat: default_location.lat,
        lng: default_location.lng,
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle "Skip" click - enter map without location
   */
  const handleSkipLocation = (): void => {
    const default_location = getDefaultLocation();
    onEnterMap({
      lat: default_location.lat,
      lng: default_location.lng,
    });
  };

  return (
    <div className="w-full h-dvh bg-black flex items-center justify-center relative overflow-hidden">
      {/* A flat picture of the world with a few glowing dots (decoration, not real thoughts). It is a static
          file, so people who only look at this page use none of the free map-tile quota. */}
      <Image src="/landing-map.svg" alt="" fill priority unoptimized className="object-cover opacity-60" />

      {/* Subtle overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6),transparent_65%)]" />

      <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
        {/* Logo/Title. The logo has a solid black background; a soft round mask hides the square over the map */}
        <Image src="/logo.png" alt="" width={112} height={112} priority className="mx-auto mb-6 [mask-image:radial-gradient(circle,#000_64%,transparent_71%)]" />
        <h1 className="font-serif text-6xl md:text-8xl font-light text-gray-100 mb-5 tracking-[-0.03em] leading-none">
          Unsaid
        </h1>

        {/* Tagline */}
        <p className="font-serif italic text-2xl md:text-3xl text-[rgb(255,214,170)]/80 mb-8 font-light">
          Thoughts left unspoken
        </p>

        {/* Description */}
        <p className="text-base md:text-[17px] leading-relaxed text-gray-400 mb-12 max-w-md mx-auto">
          {COPY.landingBody}
        </p>

        {/* CTA Button with loading state */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleEnterMap}
            disabled={loading}
            className="ctl-primary h-14 min-w-[220px] rounded-full px-10 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={loading ? COPY.landingLocating : 'Enter the map'}
          >
            <ButtonLoading loading={loading} loadingText={COPY.landingLocating}>
              {COPY.landingButton}
            </ButtonLoading>
          </button>

          {/* Skip location link (subtle) */}
          {loading && (
            <button
              type="button"
              onClick={handleSkipLocation}
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
              aria-label="Skip location detection and explore the world"
            >
              {COPY.landingSkip}
            </button>
          )}
        </div>

        {/* Error message (non-blocking) */}
        {error_message && (
          <p className="text-sm text-yellow-500/80 mt-4" role="status">
            {error_message}
          </p>
        )}

        {/* Privacy note */}
        <p className="text-sm text-gray-400 mt-10">
          {COPY.landingPromise}
        </p>

        {/* Location privacy note */}
        <p className="text-xs text-gray-500 mt-2">
          {COPY.landingLocationNote}
        </p>
      </div>
    </div>
  );
}
