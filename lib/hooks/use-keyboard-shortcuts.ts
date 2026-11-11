/**
 * Custom hook for keyboard shortcuts
 * Provides a clean interface for registering and managing keyboard shortcuts
 *
 * @author CKD
 * @created 2026-01-27
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';

interface KeyboardShortcut {
  /** The key to listen for (case-insensitive) */
  key: string;
  /** Require Ctrl/Cmd modifier */
  ctrl?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Require Alt/Option modifier */
  alt?: boolean;
  /** Handler function */
  handler: () => void;
  /** Description for accessibility */
  description?: string;
}

interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled?: boolean;
  /** Whether to prevent default behavior */
  preventDefault?: boolean;
  /** Ignore when focus is on input/textarea */
  ignoreInputs?: boolean;
}

/**
 * Hook for managing keyboard shortcuts
 *
 * @param {KeyboardShortcut[]} shortcuts - Array of shortcuts to register
 * @param {UseKeyboardShortcutsOptions} options - Configuration options
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 'c', handler: () => setShowCreate(true), description: 'Create new thought' },
 *   { key: 'Escape', handler: () => setShowCreate(false), description: 'Close form' },
 *   { key: 's', ctrl: true, handler: () => toggleSaved(), description: 'Toggle saved thoughts' },
 * ]);
 *
 * @author CKD
 * @created 2026-01-27
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
): void {
  const {
    enabled = true,
    preventDefault = true,
    ignoreInputs = true,
  } = options;

  const shortcuts_ref = useRef(shortcuts);
  shortcuts_ref.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if focus is on input/textarea
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable
        ) {
          // Allow Escape to work even in inputs
          if (event.key !== 'Escape') {
            return;
          }
        }
      }

      for (const shortcut of shortcuts_ref.current) {
        const key_matches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrl_matches = shortcut.ctrl
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey;
        const shift_matches = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const alt_matches = shortcut.alt ? event.altKey : !event.altKey;

        if (key_matches && ctrl_matches && shift_matches && alt_matches) {
          if (preventDefault) {
            event.preventDefault();
          }
          shortcut.handler();
          break;
        }
      }
    },
    [enabled, ignoreInputs, preventDefault]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}

/**
 * Hook for common app shortcuts (create, save, close)
 *
 * @param {object} handlers - Handler functions for each shortcut
 * @param {object} state - Current state to determine which shortcuts are active
 *
 * @author CKD
 * @created 2026-01-27
 */
export function useAppShortcuts({
  onCreateToggle,
  onSavedToggle,
  onClose,
  isCreateOpen,
}: {
  onCreateToggle?: () => void;
  onSavedToggle?: () => void;
  onClose?: () => void;
  isCreateOpen?: boolean;
}): void {
  const shortcuts: KeyboardShortcut[] = [];

  // 'C' to open create form (when not already open)
  if (onCreateToggle && !isCreateOpen) {
    shortcuts.push({
      key: 'c',
      handler: onCreateToggle,
      description: 'Create new thought',
    });
  }

  // 'Escape' to close create form
  if (onClose && isCreateOpen) {
    shortcuts.push({
      key: 'Escape',
      handler: onClose,
      description: 'Close form',
    });
  }

  // 'Ctrl+S' to toggle saved thoughts
  if (onSavedToggle) {
    shortcuts.push({
      key: 's',
      ctrl: true,
      handler: onSavedToggle,
      description: 'Toggle saved thoughts',
    });
  }

  useKeyboardShortcuts(shortcuts);
}
