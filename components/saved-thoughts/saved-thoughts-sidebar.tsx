/**
 * Saved thoughts sidebar component
 * Shows thoughts saved for later (localStorage only)
 *
 * @author CKD
 * @created 2026-01-23
 */

'use client';

import { useState, useEffect } from 'react';
import { getSavedThoughts, removeSavedThought, exportSavedThoughts, type SavedThought } from '@/lib/utils/saved-thoughts';
import type { Unsaid } from '@/types/unsaid';
import LightAvatar from '@/components/unsaid/light-avatar';
import { COPY } from '@/lib/copy';
import { timeAgo } from '@/lib/utils/thought-age';

interface SavedThoughtsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onUnsaidClick: (unsaid: Unsaid) => void;
}

export default function SavedThoughtsSidebar({ isOpen, onClose, onUnsaidClick }: SavedThoughtsSidebarProps) {
  const [savedThoughts, setSavedThoughts] = useState<SavedThought[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSavedThoughts(getSavedThoughts());
    }
  }, [isOpen]);

  const handleRemove = (thoughtId: string) => {
    removeSavedThought(thoughtId);
    setSavedThoughts(getSavedThoughts());
  };

  const handleExport = () => {
    const text = exportSavedThoughts();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unsaid-saved-thoughts-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClick = (thought: SavedThought) => {
    // Convert saved thought to Unsaid format for modal
    const unsaid: Unsaid = {
      id: thought.id,
      content: thought.content,
      city: thought.city || null,
      countryCode: thought.countryCode,
      location: { lat: 0, lng: 0 }, // Not needed for modal
      createdAt: thought.savedAt,
    };
    onUnsaidClick(unsaid);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[10001] bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={COPY.savedThoughts}
        className="glass-card fixed right-0 top-0 z-[10002] flex h-full w-full flex-col sm:w-[26rem] sm:rounded-l-3xl"
      >
        <div className="flex items-center justify-between pl-5 pr-2 pt-2 pb-1">
          <h2 className="text-base font-semibold text-gray-100">{COPY.savedThoughts}</h2>
          <div className="flex items-center">
            {savedThoughts.length > 0 && (
              <button
                onClick={handleExport}
                className="ctl grid h-11 w-11 place-items-center rounded-full border border-transparent text-gray-400"
                aria-label="Export all saved thoughts"
                title="Export all"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="ctl grid h-11 w-11 place-items-center rounded-full border border-transparent text-gray-400"
              aria-label="Close"
              title="Close (Esc)"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="scrollbar-dark flex-1 overflow-y-auto px-5 pt-2">
          {savedThoughts.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="text-gray-200">{COPY.nothingSaved}</p>
              <p className="mt-1 text-sm text-gray-400">{COPY.nothingSavedHint}</p>
            </div>
          ) : (
            <ul>
              {savedThoughts.map((thought) => (
                <li key={thought.id} className="border-b border-white/10 last:border-0">
                  <div className="flex gap-3 py-4">
                    <LightAvatar size={32} className="mt-0.5" />
                    <button
                      type="button"
                      onClick={() => handleClick(thought)}
                      className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(255,214,170)]"
                    >
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="font-semibold text-gray-100">Anonymous</span>
                        <span className="truncate text-gray-400">
                          {thought.city ? `${thought.city}, ` : ''}{thought.countryCode} · saved {timeAgo(thought.savedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-[15px] leading-relaxed text-gray-200">{thought.content}</p>
                    </button>
                    <button
                      onClick={() => handleRemove(thought.id)}
                      className="ctl grid h-10 w-10 shrink-0 place-items-center rounded-full border border-transparent text-[rgb(255,214,170)]"
                      aria-label="Remove from saved"
                      title="Remove from saved"
                    >
                      <svg className="h-5 w-5" fill="currentColor" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
