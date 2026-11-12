/**
 * Custom hook for managing geolocation state
 * Provides loading states, error handling, caching, and permission management
 *
 * @author CKD
 * @created 2026-01-27
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cacheServes, getUserLocation } from '@/lib/utils/location';
import {
  GeoLocation,
  GeolocationState,
  PermissionState,
  LOCATION_CACHE_KEY,
  LOCATION_CACHE_TIMESTAMP_KEY,
  LOCATION_CACHE_DURATION_MS,
  DEFAULT_MAP_CENTER,
} from '@/lib/constants/geolocation';

interface UseGeolocationOptions {
  /** Enable session caching of location */
  enableCache?: boolean;
  /** Auto-detect location on mount */
  autoDetect?: boolean;
  /** Prefer browser geolocation over IP */
  preferBrowser?: boolean;
}

interface UseGeolocationReturn extends GeolocationState {
  /** Request location (triggers browser permission if needed) */
  requestLocation: (preferBrowser?: boolean) => Promise<GeoLocation>;
  /** Clear any error state */
  clearError: () => void;
  /** Check if location is cached */
  hasCachedLocation: () => boolean;
  /** Get cached location without triggering new request */
  getCachedLocation: () => GeoLocation | null;
  /** Clear cached location */
  clearCache: () => void;
  /** Check current permission state */
  checkPermission: () => Promise<PermissionState | null>;
}

/**
 * Hook for managing geolocation with caching, loading states, and error handling
 *
 * @param {UseGeolocationOptions} options - Hook configuration
 * @returns {UseGeolocationReturn} Geolocation state and methods
 *
 * @example
 * const { location, loading, error, requestLocation } = useGeolocation();
 *
 * const handleClick = async () => {
 *   try {
 *     const loc = await requestLocation(true);
 *     console.log('User location:', loc);
 *   } catch (err) {
 *     console.error('Failed to get location:', err);
 *   }
 * };
 *
 * @author CKD
 * @created 2026-01-27
 */
export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationReturn {
  const {
    enableCache = true,
    autoDetect = false,
    preferBrowser = false,
  } = options;

  const [state, setState] = useState<GeolocationState>({
    location: null,
    loading: false,
    error: null,
    permissionState: null,
  });

  const mounted_ref = useRef(true);
  const request_in_progress_ref = useRef(false);

  /**
   * Check if location is cached and still valid
   */
  const hasCachedLocation = useCallback((): boolean => {
    if (typeof window === 'undefined' || !enableCache) return false;

    try {
      const cached = sessionStorage.getItem(LOCATION_CACHE_KEY);
      const timestamp = sessionStorage.getItem(LOCATION_CACHE_TIMESTAMP_KEY);

      if (!cached || !timestamp) return false;

      const cache_age = Date.now() - parseInt(timestamp, 10);
      return cache_age < LOCATION_CACHE_DURATION_MS;
    } catch {
      return false;
    }
  }, [enableCache]);

  /**
   * Get cached location without triggering new request
   */
  const getCachedLocation = useCallback((): GeoLocation | null => {
    if (typeof window === 'undefined' || !enableCache) return null;

    try {
      const cached = sessionStorage.getItem(LOCATION_CACHE_KEY);
      const timestamp = sessionStorage.getItem(LOCATION_CACHE_TIMESTAMP_KEY);

      if (!cached || !timestamp) return null;

      const cache_age = Date.now() - parseInt(timestamp, 10);
      if (cache_age >= LOCATION_CACHE_DURATION_MS) {
        // Cache expired, clear it
        sessionStorage.removeItem(LOCATION_CACHE_KEY);
        sessionStorage.removeItem(LOCATION_CACHE_TIMESTAMP_KEY);
        return null;
      }

      return JSON.parse(cached) as GeoLocation;
    } catch {
      return null;
    }
  }, [enableCache]);

  /**
   * Save location to session cache
   */
  const cacheLocation = useCallback((location: GeoLocation): void => {
    if (typeof window === 'undefined' || !enableCache) return;

    try {
      sessionStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));
      sessionStorage.setItem(LOCATION_CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.warn('Failed to cache location:', error);
    }
  }, [enableCache]);

  /**
   * Clear cached location
   */
  const clearCache = useCallback((): void => {
    if (typeof window === 'undefined') return;

    try {
      sessionStorage.removeItem(LOCATION_CACHE_KEY);
      sessionStorage.removeItem(LOCATION_CACHE_TIMESTAMP_KEY);
    } catch {
      // Ignore errors
    }
  }, []);

  /**
   * Check current permission state
   */
  const checkPermission = useCallback(async (): Promise<PermissionState | null> => {
    if (typeof window === 'undefined' || !('permissions' in navigator)) {
      return null;
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      const permission_state = result.state as PermissionState;

      if (mounted_ref.current) {
        setState((prev) => ({ ...prev, permissionState: permission_state }));
      }

      return permission_state;
    } catch {
      // Permissions API not supported (common in Safari)
      return null;
    }
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Request location from browser or IP
   *
   * @param {boolean} prefer_browser - Prefer browser geolocation (requires user gesture)
   * @returns {Promise<GeoLocation>} Location data with ~100m blur
   */
  const requestLocation = useCallback(async (prefer_browser: boolean = false): Promise<GeoLocation> => {
    // Prevent concurrent requests
    if (request_in_progress_ref.current) {
      throw new Error('Location request already in progress');
    }

    // Check cache first
    const cached = getCachedLocation();
    if (cached && cacheServes(cached, prefer_browser)) {
      setState((prev) => ({
        ...prev,
        location: cached,
        loading: false,
        error: null,
      }));
      return cached;
    }

    request_in_progress_ref.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const raw_location = await getUserLocation(prefer_browser);

      const geo_location: GeoLocation = {
        lat: raw_location.lat,
        lng: raw_location.lng,
        city: raw_location.city,
        countryCode: raw_location.countryCode,
        isBlurred: true,
        approximate: raw_location.approximate,
        timestamp: Date.now(),
      };

      // Cache the location
      cacheLocation(geo_location);

      if (mounted_ref.current) {
        setState((prev) => ({
          ...prev,
          location: geo_location,
          loading: false,
          error: null,
        }));
      }

      return geo_location;
    } catch (error) {
      const error_message = error instanceof Error ? error.message : 'Failed to get location';

      if (mounted_ref.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error_message,
        }));
      }

      throw error;
    } finally {
      request_in_progress_ref.current = false;
    }
  }, [getCachedLocation, cacheLocation]);

  /**
   * Initialize: Check cache and optionally auto-detect
   */
  useEffect(() => {
    mounted_ref.current = true;

    // Check for cached location on mount
    const cached = getCachedLocation();
    if (cached) {
      setState((prev) => ({
        ...prev,
        location: cached,
      }));
    }

    // Check permission state
    checkPermission();

    // Auto-detect if enabled and no cache
    if (autoDetect && !cached) {
      requestLocation(preferBrowser).catch(() => {
        // Silently fail auto-detect
      });
    }

    return () => {
      mounted_ref.current = false;
    };
  }, [autoDetect, preferBrowser, getCachedLocation, checkPermission, requestLocation]);

  return {
    ...state,
    requestLocation,
    clearError,
    hasCachedLocation,
    getCachedLocation,
    clearCache,
    checkPermission,
  };
}

/**
 * Get default location for fallback scenarios
 *
 * @returns {GeoLocation} Default world view location
 *
 * @author CKD
 * @created 2026-01-27
 */
export function getDefaultLocation(): GeoLocation {
  return {
    lat: DEFAULT_MAP_CENTER.lat,
    lng: DEFAULT_MAP_CENTER.lng,
    isBlurred: false,
  };
}

export type { UseGeolocationOptions, UseGeolocationReturn };
