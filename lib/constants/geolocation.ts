/**
 * Geolocation constants for the Unsaid application
 * Centralizes all geolocation-related configuration values
 *
 * @author CKD
 * @created 2026-01-27
 */

/**
 * Blur radius in meters for privacy protection
 * This value determines how much location data is obfuscated
 */
export const BLUR_RADIUS_METERS = 100;

/**
 * Precision multiplier for coordinate rounding
 * 1 degree ≈ 111km at equator
 * For 100m precision: 111000m / 100m ≈ 1111
 * For 500m precision: 111000m / 500m ≈ 222
 */
export const BLUR_PRECISION_MULTIPLIER = 1111;

/**
 * Geolocation API timeout in milliseconds
 * Time to wait for browser geolocation before falling back
 */
export const GEOLOCATION_TIMEOUT_MS = 20000;

/**
 * Maximum age of cached geolocation in milliseconds
 * Set to 0 to always request fresh location
 */
export const GEOLOCATION_MAX_AGE_MS = 0;

/**
 * Session storage key for cached user location
 */
export const LOCATION_CACHE_KEY = 'unsaid_user_location';

/**
 * Session storage key for location cache timestamp
 */
export const LOCATION_CACHE_TIMESTAMP_KEY = 'unsaid_location_timestamp';

/**
 * How long to cache location in session storage (in milliseconds)
 * Default: 30 minutes
 */
export const LOCATION_CACHE_DURATION_MS = 30 * 60 * 1000;

/**
 * Default world view coordinates (Atlantic Ocean, neutral view)
 */
export const DEFAULT_MAP_CENTER = {
  lat: 20,
  lng: 0,
} as const;

/**
 * Zoom levels for different contexts
 */
export const ZOOM_LEVELS = {
  /** World view - shows all continents */
  WORLD: 2,
  /** Continent view */
  CONTINENT: 4,
  /** Country view - default for detected user location */
  COUNTRY: 6,
  /** Region/State view */
  REGION: 8,
  /** City view */
  CITY: 10,
  /** Neighborhood view */
  NEIGHBORHOOD: 12,
  /** Street view */
  STREET: 14,
} as const;

/**
 * Default zoom level when user location is detected
 */
export const USER_LOCATION_ZOOM = ZOOM_LEVELS.COUNTRY;

/**
 * Default zoom level for world view (no location)
 */
export const DEFAULT_ZOOM = ZOOM_LEVELS.WORLD;

/**
 * Zoom level when opening an unsaid node (so user can see where the thought is placed)
 */
export const NODE_OPEN_ZOOM = ZOOM_LEVELS.STREET;

/**
 * Below this zoom level, unsaid markers are clustered (e.g. "Cabanatuan - 2 total").
 * Individual nodes only at zoom 14+ (street level). Keeps clusters visible at region/city view.
 */
export const CLUSTER_ZOOM_THRESHOLD = 14;

/**
 * IP Geolocation API endpoints (fallback when browser geolocation fails)
 */
export const IP_GEOLOCATION_API = 'https://ipapi.co/json/';

/**
 * Reverse geocoding API endpoint (OpenStreetMap Nominatim)
 */
export const REVERSE_GEOCODE_API = 'https://nominatim.openstreetmap.org/reverse';

/**
 * User agent for API requests (required by Nominatim)
 */
export const API_USER_AGENT = 'Unsaid App';

/**
 * Type definitions for location data
 */
export interface GeoLocation {
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
  accuracy?: number;
  isBlurred: boolean;
  timestamp?: number;
}

export interface GeolocationState {
  location: GeoLocation | null;
  loading: boolean;
  error: string | null;
  permissionState: PermissionState | null;
}

export type PermissionState = 'granted' | 'denied' | 'prompt';
