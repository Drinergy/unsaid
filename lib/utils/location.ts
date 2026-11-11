/**
 * Location utilities for precise location handling with privacy blur
 * Rounds coordinates to ~100m precision for privacy (prevents doxxing)
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD - Changed blur from 500m to 100m for better precision
 */

import {
  BLUR_PRECISION_MULTIPLIER,
  BLUR_RADIUS_METERS,
  GEOLOCATION_TIMEOUT_MS,
  GEOLOCATION_MAX_AGE_MS,
  IP_GEOLOCATION_API,
  REVERSE_GEOCODE_API,
  API_USER_AGENT,
} from '@/lib/constants/geolocation';

/**
 * Round coordinates to nearest ~100m grid (~100m precision)
 * Removes building-level precision for privacy while maintaining neighborhood accuracy
 * Prevents doxxing while providing more precise area visibility
 * 100m ≈ 0.0009 degrees (at equator)
 *
 * @param {number} coord - Latitude or longitude
 * @returns {number} Rounded coordinate with ~100m blur
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD
 */
export function roundCoordinate(coord: number): number {
  // Round to ~100m precision: multiply by ~1111, round, divide by ~1111
  // 1 degree ≈ 111km, so 100m ≈ 0.0009 degrees
  // This provides ~100m blur radius (about 1 city block)
  return Math.round(coord * BLUR_PRECISION_MULTIPLIER) / BLUR_PRECISION_MULTIPLIER;
}

/**
 * Round location coordinates for privacy
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {{ lat: number; lng: number }} Rounded coordinates
 */
export function roundLocation(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: roundCoordinate(lat),
    lng: roundCoordinate(lng),
  };
}

/**
 * Reverse geocode coordinates to get city and country
 * Uses OpenStreetMap Nominatim (free, but has rate limits)
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{ city?: string; countryCode?: string }>}
 */
async function reverseGeocode(lat: number, lng: number): Promise<{
  city?: string;
  countryCode?: string;
}> {
  try {
    // Use OpenStreetMap Nominatim for reverse geocoding
    // Higher zoom level (18) for better city accuracy
    const response = await fetch(
      `${REVERSE_GEOCODE_API}?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': API_USER_AGENT,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Reverse geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.address) {
      // Try multiple fields for city name (prioritize more specific)
      const city = data.address.city 
        || data.address.municipality 
        || data.address.town 
        || data.address.village
        || data.address.county;
      const countryCode = data.address.country_code?.toUpperCase();

      return {
        city: city || undefined,
        countryCode: countryCode || undefined,
      };
    }

    return {};
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
    throw error;
  }
}

/**
 * Country (ISO 3166-1 alpha-2, upper case) at a point, via Nominatim at country level.
 * Returns null when it cannot tell (open sea, offline, rate limited).
 */
export async function getCountryCode(lat: number, lng: number): Promise<string | null> {
  try {
    const response = await fetch(`${REVERSE_GEOCODE_API}?format=json&lat=${lat}&lon=${lng}&zoom=3&addressdetails=1`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const code = data?.address?.country_code;
    return typeof code === 'string' && code.length === 2 ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Get user's location via browser geolocation (primary - more accurate)
 * Falls back to IP-based geolocation if browser geolocation fails
 *
 * @param {boolean} preferBrowser - If true, prioritize browser geolocation (requires user gesture in Safari)
 * @returns {Promise<{ lat: number; lng: number; city?: string; countryCode?: string }>}
 */
export async function getUserLocation(preferBrowser: boolean = false): Promise<{
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
}> {
  // Always try browser geolocation first if available (more accurate)
  // This will trigger the permission popup in Safari
  if (navigator.geolocation) {
    try {
      // Check permission status for logging (but don't block if it says denied - Safari Permissions API can be unreliable)
      let permissionStatus: PermissionStatus | null = null;
      if ('permissions' in navigator) {
        try {
          permissionStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          console.log('Permission status:', permissionStatus?.state);
        } catch (e) {
          // Permissions API not supported or failed (common in Safari)
          console.log('Permissions API not available:', e);
        }
      }

      // Note: We don't block on permissionStatus === 'denied' because Safari's Permissions API
      // might not reflect changes immediately after user updates settings. Let the actual
      // geolocation call determine if permission is truly denied.

      const browserLocation = await new Promise<{
        lat: number;
        lng: number;
        city?: string;
        countryCode?: string;
      }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              console.log('Got precise location:', latitude, longitude);
              
              // Round to ~100m for anonymity (prevents doxxing)
              const rounded = roundLocation(latitude, longitude);
              console.log(`Rounded location (~${BLUR_RADIUS_METERS}m blur):`, rounded);
              
              // Try to reverse geocode to get city/country
              try {
                const reverseGeocoded = await reverseGeocode(rounded.lat, rounded.lng);
                console.log('Reverse geocoded:', reverseGeocoded);
                resolve({
                  lat: rounded.lat,
                  lng: rounded.lng,
                  city: reverseGeocoded.city,
                  countryCode: reverseGeocoded.countryCode,
                });
              } catch (error) {
                // If reverse geocoding fails, return coordinates only
                console.warn('Reverse geocoding failed:', error);
                resolve({
                  lat: rounded.lat,
                  lng: rounded.lng,
                });
              }
            } catch (error) {
              console.error('Error processing location:', error);
              reject(error);
            }
          },
          (error) => {
            // Check if the issue is insecure origin (HTTP instead of HTTPS/localhost)
            const isInsecureOrigin = window.location.protocol === 'http:' && 
                                    !window.location.hostname.includes('localhost') && 
                                    !window.location.hostname.includes('127.0.0.1');
            
            // Permission denied or error
            if (error.code === error.PERMISSION_DENIED) {
              if (isInsecureOrigin) {
                reject(new Error('Geolocation requires a secure connection. Please use http://localhost:3000 instead of the IP address, or set up HTTPS for your development server.'));
              } else {
                reject(new Error('Location permission denied. Please check: 1) Safari > Settings > Websites > Location is set to "Allow" for this site, 2) macOS System Settings > Privacy & Security > Location Services is enabled for Safari.'));
              }
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              // POSITION_UNAVAILABLE is normal for devices without GPS (desktop/laptop)
              // Silently fall through to IP geolocation - no need to log as error
              reject(new Error('POSITION_UNAVAILABLE')); // Special error code for fallback
            } else if (error.code === error.TIMEOUT) {
              // Timeout is also common - silently fallback to IP
              reject(new Error('TIMEOUT'));
            } else {
              // Only log unexpected errors
              console.warn('Unexpected geolocation error:', error.code, error.message);
              reject(new Error(`Location error: ${error.message || 'Unknown error'}`));
            }
          },
          {
            enableHighAccuracy: true, // Enable high accuracy for better city detection
            timeout: GEOLOCATION_TIMEOUT_MS,
            maximumAge: GEOLOCATION_MAX_AGE_MS,
          }
        );
      });
      
      return browserLocation;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // POSITION_UNAVAILABLE and TIMEOUT are normal - silently fallback to IP
      if (errorMessage.includes('POSITION_UNAVAILABLE') || errorMessage.includes('TIMEOUT')) {
        // Continue to IP geolocation fallback silently
      } else if (preferBrowser) {
        // For other errors when preferBrowser is true, throw
        throw error;
      }
      // Otherwise, continue to IP geolocation fallback
    }
  }

  // Fallback to IP-based geolocation only if browser geolocation failed
  try {
    const ipLocation = await getLocationFromIP();
    if (ipLocation.lat !== 0 && ipLocation.lng !== 0) {
      return ipLocation;
    }
  } catch (error) {
    console.warn('IP geolocation failed:', error);
  }

  // If both fail, reject
  throw new Error('Location detection failed. Please allow location access for accurate detection.');
}

/**
 * Get location from IP address (primary method)
 * Uses ipapi.co for free IP geolocation
 *
 * @returns {Promise<{ lat: number; lng: number; city?: string; countryCode?: string }>}
 */
async function getLocationFromIP(): Promise<{
  lat: number;
  lng: number;
  city?: string;
  countryCode?: string;
}> {
  try {
    // Use ipapi.co for IP geolocation (free tier: 1000 requests/day)
    const response = await fetch(IP_GEOLOCATION_API, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`IP geolocation API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API error response
    if (data.error) {
      throw new Error(`IP geolocation error: ${data.reason || 'Unknown error'}`);
    }

    if (data.latitude && data.longitude) {
      const rounded = roundLocation(data.latitude, data.longitude);
      return {
        lat: rounded.lat,
        lng: rounded.lng,
        city: data.city || undefined,
        countryCode: data.country_code || undefined,
      };
    }

    throw new Error('IP geolocation returned invalid data');
  } catch (error) {
    console.error('IP geolocation failed:', error);
    // Return invalid location to signal failure
    return {
      lat: 0,
      lng: 0,
    };
  }
}
