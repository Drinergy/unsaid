/**
 * Shared modal shell: centered dialog on desktop, bottom sheet on phones.
 * Backdrop click and Escape close it. Used by the thread view and the new-thought composer.
 */

'use client';

import React, { useEffect } from 'react';

export default function SheetModal({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Extra header controls shown before the close button */
  actions?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-card w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between pl-5 pr-2 pt-2 pb-1">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <div className="flex items-center">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="ctl grid place-items-center w-11 h-11 rounded-full border border-transparent text-gray-400"
              aria-label="Close"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
