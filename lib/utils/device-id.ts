/**
 * Device ID management for anonymous user identification
 * Generates (crypto.randomUUID) and persists a UUID v4 in localStorage
 *
 * @author CKD
 * @created 2026-01-23
 */

const DEVICE_ID_KEY = 'unsaid_device_id';

// Used when the browser blocks storage (some privacy modes): the ID then lasts until the tab closes.
let memoryId: string | null = null;

/**
 * Get or create anonymous device ID
 *
 * @returns {string} Device ID (UUID v4)
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    // Server-side: return a placeholder (will be replaced by client)
    return 'server-placeholder';
  }

  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    memoryId ??= crypto.randomUUID();
    return memoryId;
  }
}
