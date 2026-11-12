/**
 * Main page component
 * Displays the world map and handles Unsaid creation/viewing
 * Refactored to use custom hooks for cleaner architecture
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD - Refactored with custom hooks
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import WorldMap from '@/components/map/world-map';
import UnsaidModal from '@/components/unsaid/unsaid-modal';
import CreateUnsaidForm from '@/components/unsaid/create-unsaid-form';
import LandingPage from '@/components/landing/landing-page';
import SavedThoughtsSidebar from '@/components/saved-thoughts/saved-thoughts-sidebar';
import DailyThoughtOverlay from '@/components/daily-thought/daily-thought-overlay';
import { MapErrorBoundary } from '@/components/error-boundary';
import { useUnsaidState } from '@/lib/hooks/use-unsaid-state';
import { useAppShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { getDeviceId } from '@/lib/utils/device-id';
import { USER_LOCATION_ZOOM, DEFAULT_ZOOM } from '@/lib/constants/geolocation';
import type { Unsaid } from '@/types/unsaid';

/**
 * Home page - main entry point for the Unsaid application
 *
 * @returns {React.ReactElement} Main page component
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD
 */
export default function Home(): React.ReactElement {
  // UI state
  const [show_map, setShowMap] = useState(false);
  const [show_create_form, setShowCreateForm] = useState(false);
  const [show_saved_thoughts, setShowSavedThoughts] = useState(false);
  const [user_location, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Unsaid state management
  const {
    unsaids,
    selectedUnsaid,
    selectUnsaid,
    createUnsaid,
    removeUnsaid,
    refetch,
  } = useUnsaidState({ autoFetch: false, initialLimit: 50 });

  // Keyboard shortcuts
  useAppShortcuts({
    onCreateToggle: () => setShowCreateForm(true),
    onSavedToggle: () => setShowSavedThoughts((prev) => !prev),
    onClose: () => setShowCreateForm(false),
    isCreateOpen: show_create_form,
  });

  // Initialize device ID
  useEffect(() => {
    getDeviceId();
  }, []);

  // Fetch unsaids when map is shown
  useEffect(() => {
    if (show_map) {
      refetch();
    }
  }, [show_map, refetch]);

  /**
   * Handle entering the map from landing page
   * Location is already detected by the landing page
   */
  const handleEnterMap = useCallback((location: { lat: number; lng: number }): void => {
    setUserLocation(location);
    setShowMap(true);
  }, []);

  /**
   * Handle unsaid click (open modal)
   */
  const handleUnsaidClick = useCallback((unsaid: Unsaid): void => {
    selectUnsaid(unsaid);
  }, [selectUnsaid]);

  /**
   * Handle unsaid creation
   */
  const handleCreateUnsaid = useCallback(async (input: Parameters<typeof createUnsaid>[0]): Promise<void> => {
    await createUnsaid(input);
    setShowCreateForm(false);
  }, [createUnsaid]);

  /**
   * Handle report (remove unsaid from view)
   */
  const handleReport = useCallback((unsaidId: string): void => {
    removeUnsaid(unsaidId);
  }, [removeUnsaid]);

  // Calculate zoom based on whether we have user location
  const initial_zoom = user_location ? USER_LOCATION_ZOOM : DEFAULT_ZOOM;

  return (
    <main className="w-full h-dvh bg-black overflow-hidden relative">
      {/* Map (always rendered, faded when landing is visible) */}
      <div className={`absolute inset-0 transition-opacity duration-500 ${show_map ? 'opacity-100' : 'opacity-30'}`}>
        <MapErrorBoundary>
          <WorldMap
            onUnsaidClick={handleUnsaidClick}
            initialUnsads={unsaids}
            initialCenter={user_location || undefined}
            initialZoom={initial_zoom}
            userLocation={user_location || undefined}
          />
        </MapErrorBoundary>
      </div>

      {/* Landing page overlay */}
      {!show_map && (
        <div className="absolute inset-0 z-10">
          <LandingPage onEnterMap={handleEnterMap} />
        </div>
      )}

      {/* Map UI (only when map is visible) */}
      {show_map && (
        <>
          {/* Floating action buttons */}
          <FloatingActions
            onCreateClick={() => setShowCreateForm(true)}
            onSavedClick={() => setShowSavedThoughts(true)}
          />

          {/* New thought composer (centered modal) */}
          {show_create_form && (
            <CreateUnsaidForm
              onSubmit={handleCreateUnsaid}
              onCancel={() => setShowCreateForm(false)}
            />
          )}

          {/* Saved thoughts sidebar */}
          <SavedThoughtsSidebar
            isOpen={show_saved_thoughts}
            onClose={() => setShowSavedThoughts(false)}
            onUnsaidClick={(unsaid) => {
              selectUnsaid(unsaid);
              setShowSavedThoughts(false);
            }}
          />

          {/* Daily thought overlay */}
          <DailyThoughtOverlay unsaids={unsaids} onUnsaidClick={handleUnsaidClick} />

          {/* Unsaid modal */}
          {selectedUnsaid && (
            <UnsaidModal
              unsaidId={selectedUnsaid.id}
              onClose={() => selectUnsaid(null)}
              onReport={handleReport}
            />
          )}
        </>
      )}
    </main>
  );
}

/**
 * Floating action buttons component
 * Extracted for cleaner main component
 */
function FloatingActions({
  onCreateClick,
  onSavedClick,
}: {
  onCreateClick: () => void;
  onSavedClick: () => void;
}): React.ReactElement {
  return (
    <>
      {/* Phones: Saved sits under My Location (top right); the + stays in the thumb zone (bottom right).
          Larger screens: both stack at the bottom right. */}
      <button
        onClick={onSavedClick}
        className="glass ctl fixed z-[10000] top-[4.5rem] right-3 sm:top-auto sm:bottom-[6.75rem] sm:right-8 rounded-full w-12 h-12 grid place-items-center"
        aria-label="Saved thoughts"
        title="Saved thoughts (Ctrl+S)"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>
      <button
        onClick={onCreateClick}
        className="ctl-primary fixed z-[10000] bottom-[calc(0.75rem+env(safe-area-inset-bottom))] right-3 sm:bottom-8 sm:right-8 rounded-full w-14 h-14 sm:w-16 sm:h-16 grid place-items-center"
        aria-label="Create new Unsaid"
        title="Create new Unsaid (C)"
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </>
  );
}
