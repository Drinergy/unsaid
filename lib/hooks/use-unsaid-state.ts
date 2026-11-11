/**
 * Custom hook for managing Unsaid state
 * Handles CRUD operations, loading states, and API interactions
 *
 * @author CKD
 * @created 2026-01-27
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { getDeviceId } from '@/lib/utils/device-id';
import type { Unsaid, CreateUnsaidInput } from '@/types/unsaid';

interface UseUnsaidStateOptions {
  /** Whether to fetch initial unsaids on mount */
  autoFetch?: boolean;
  /** Initial limit for fetching */
  initialLimit?: number;
}

interface UseUnsaidStateReturn {
  /** List of unsaids */
  unsaids: Unsaid[];
  /** Currently selected unsaid */
  selectedUnsaid: Unsaid | null;
  /** Loading state for initial fetch */
  loading: boolean;
  /** Loading state for create operation */
  creating: boolean;
  /** Error message */
  error: string | null;
  /** Select an unsaid (for modal) */
  selectUnsaid: (unsaid: Unsaid | null) => void;
  /** Create a new unsaid */
  createUnsaid: (input: CreateUnsaidInput) => Promise<Unsaid>;
  /** Remove an unsaid from local state (e.g., after report) */
  removeUnsaid: (unsaidId: string) => void;
  /** Add unsaids to the list (for realtime updates) */
  addUnsaids: (newUnsaids: Unsaid[]) => void;
  /** Refetch unsaids */
  refetch: () => Promise<void>;
  /** Clear error */
  clearError: () => void;
}

/**
 * Hook for managing Unsaid state and operations
 *
 * @param {UseUnsaidStateOptions} options - Configuration options
 * @returns {UseUnsaidStateReturn} State and methods
 *
 * @example
 * const {
 *   unsaids,
 *   selectedUnsaid,
 *   loading,
 *   createUnsaid,
 *   selectUnsaid,
 * } = useUnsaidState({ autoFetch: true });
 *
 * @author CKD
 * @created 2026-01-27
 */
export function useUnsaidState(options: UseUnsaidStateOptions = {}): UseUnsaidStateReturn {
  const { autoFetch = false, initialLimit = 500 } = options;

  const [unsaids, setUnsaids] = useState<Unsaid[]>([]);
  const [selected_unsaid, setSelectedUnsaid] = useState<Unsaid | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch initial unsaids from API
   */
  const fetchUnsaids = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/unsaids?initial=true&limit=${initialLimit}`);

      if (!response.ok) {
        throw new Error('Failed to fetch unsaids');
      }

      const data = await response.json();

      if (data.unsaids) {
        setUnsaids(data.unsaids);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch unsaids';
      setError(message);
      console.error('Error fetching unsaids:', err);
    } finally {
      setLoading(false);
    }
  }, [initialLimit]);

  /**
   * Select an unsaid (opens modal)
   */
  const selectUnsaid = useCallback((unsaid: Unsaid | null): void => {
    setSelectedUnsaid(unsaid);
  }, []);

  /**
   * Create a new unsaid
   */
  const createUnsaid = useCallback(async (input: CreateUnsaidInput): Promise<Unsaid> => {
    setCreating(true);
    setError(null);

    try {
      const device_id = getDeviceId();

      const response = await fetch('/api/unsaids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...input,
          deviceId: device_id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create unsaid');
      }

      const data = await response.json();

      if (data.unsaid) {
        // Add to local state
        setUnsaids((prev) => [data.unsaid, ...prev]);
        return data.unsaid;
      }

      throw new Error('Invalid response from server');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create unsaid';
      setError(message);
      throw err;
    } finally {
      setCreating(false);
    }
  }, []);

  /**
   * Remove an unsaid from local state (e.g., after report)
   */
  const removeUnsaid = useCallback((unsaidId: string): void => {
    setUnsaids((prev) => prev.filter((u) => u.id !== unsaidId));

    // Clear selection if removed unsaid was selected
    if (selected_unsaid?.id === unsaidId) {
      setSelectedUnsaid(null);
    }
  }, [selected_unsaid?.id]);

  /**
   * Add unsaids to the list (for realtime updates)
   */
  const addUnsaids = useCallback((newUnsaids: Unsaid[]): void => {
    if (newUnsaids.length === 0) return;

    setUnsaids((prev) => {
      const existing_ids = new Set(prev.map((u) => u.id));
      const unique_new = newUnsaids.filter((u) => !existing_ids.has(u.id));
      return [...unique_new, ...prev];
    });
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  /**
   * Auto-fetch on mount if enabled
   */
  useEffect(() => {
    if (autoFetch) {
      fetchUnsaids();
    }
  }, [autoFetch, fetchUnsaids]);

  return {
    unsaids,
    selectedUnsaid: selected_unsaid,
    loading,
    creating,
    error,
    selectUnsaid,
    createUnsaid,
    removeUnsaid,
    addUnsaids,
    refetch: fetchUnsaids,
    clearError,
  };
}

export type { UseUnsaidStateOptions, UseUnsaidStateReturn };
