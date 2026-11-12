/**
 * Error boundary components for catching React errors
 * Provides graceful error handling and user feedback
 *
 * @author CKD
 * @created 2026-01-23
 * @modified 2026-01-27 CKD - Added specialized error boundaries for map and modal
 */

'use client';

import React from 'react';
import { COPY } from '@/lib/copy';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error | null; reset: () => void }>;
}

/**
 * Generic error boundary for catching React errors
 *
 * @author CKD
 * @created 2026-01-23
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error} reset={this.reset} />;
      }

      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-lg p-8 max-w-md text-center border border-gray-800">
            <h1 className="text-2xl font-light text-gray-100 mb-4">{COPY.errorTitle}</h1>
            <p className="text-gray-400 mb-6">
              {COPY.errorBody}
            </p>
            <button
              onClick={this.reset}
              className="px-6 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
            >
              {COPY.tryAgain}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Fallback component for map errors
 *
 * @author CKD
 * @created 2026-01-27
 */
function MapErrorFallback({ error, reset }: { error: Error | null; reset: () => void }): React.ReactElement {
  return (
    <div className="w-full h-full bg-gray-900 flex items-center justify-center">
      <div className="text-center p-8 max-w-md">
        <div className="mb-4">
          <svg
            className="w-16 h-16 text-gray-600 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-light text-gray-100 mb-2">{COPY.mapErrorTitle}</h2>
        <p className="text-gray-400 text-sm mb-6">
          {COPY.mapErrorBody}
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
        >
          {COPY.tryAgain}
        </button>
      </div>
    </div>
  );
}

/**
 * Specialized error boundary for the map component
 *
 * @author CKD
 * @created 2026-01-27
 */
export function MapErrorBoundary({ children }: { children: React.ReactNode }): React.ReactElement {
  return <ErrorBoundary fallback={MapErrorFallback}>{children}</ErrorBoundary>;
}
