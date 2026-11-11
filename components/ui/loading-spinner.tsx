/**
 * Reusable loading spinner component
 * Provides consistent loading indicator across the application
 *
 * @author CKD
 * @created 2026-01-27
 */

'use client';

import React from 'react';

interface LoadingSpinnerProps {
  /** Size variant of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label for accessibility */
  label?: string;
  /** Additional CSS classes */
  className?: string;
  /** Show label text visually */
  showLabel?: boolean;
}

const SIZE_CLASSES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
} as const;

/**
 * Loading spinner with accessibility support
 *
 * @param {LoadingSpinnerProps} props - Component props
 * @returns {JSX.Element} Spinner element
 *
 * @example
 * <LoadingSpinner size="md" label="Loading location..." />
 *
 * @author CKD
 * @created 2026-01-27
 */
export default function LoadingSpinner({
  size = 'md',
  label = 'Loading...',
  className = '',
  showLabel = false,
}: LoadingSpinnerProps): React.ReactElement {
  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-label={label}
    >
      <div
        className={`
          ${SIZE_CLASSES[size]}
          border-gray-600
          border-t-gray-200
          rounded-full
          animate-spin
        `}
        aria-hidden="true"
      />
      {showLabel ? (
        <span className="text-sm text-gray-400">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}

/**
 * Inline loading state for buttons
 *
 * @param {object} props - Component props
 * @param {boolean} props.loading - Whether to show loading state
 * @param {React.ReactNode} props.children - Button content when not loading
 * @param {string} props.loadingText - Text to show while loading
 * @returns {JSX.Element} Button content
 *
 * @author CKD
 * @created 2026-01-27
 */
export function ButtonLoading({
  loading,
  children,
  loadingText = 'Loading...',
}: {
  loading: boolean;
  children: React.ReactNode;
  loadingText?: string;
}): React.ReactElement {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2">
        <LoadingSpinner size="sm" label={loadingText} />
        <span>{loadingText}</span>
      </span>
    );
  }

  return <>{children}</>;
}
