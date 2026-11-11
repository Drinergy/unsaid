/**
 * New-thought composer: a centered modal (bottom sheet on phones) in the same Threads-style
 * as the thread view. Detects location quietly (blurred to ~100m on the server) and posts.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useGeolocation, getDefaultLocation } from '@/lib/hooks/use-geolocation';
import { validateUnsaid } from '@/lib/utils/content-validation';
import SheetModal from '@/components/ui/sheet-modal';
import LightAvatar from './light-avatar';
import type { CreateUnsaidInput } from '@/types/unsaid';

interface CreateUnsaidFormProps {
  /** Callback when form is submitted successfully */
  onSubmit: (input: CreateUnsaidInput) => Promise<void>;
  /** Callback when form is cancelled */
  onCancel: () => void;
}

const MAX_LENGTH = 1000;

export default function CreateUnsaidForm({ onSubmit, onCancel }: CreateUnsaidFormProps): React.ReactElement {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { location, requestLocation, getCachedLocation } = useGeolocation({
    enableCache: true,
    autoDetect: false, // We request manually
  });

  // Silently detect location in the background (IP-based first: no permission prompt)
  useEffect(() => {
    const detect = async (): Promise<void> => {
      try {
        const cached = getCachedLocation();
        if (cached && cached.lat !== 0 && cached.lng !== 0) return;
        await requestLocation(false);
      } catch {
        // Location will be detected on submit if needed
      }
    };
    detect();
  }, [getCachedLocation, requestLocation]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 112), 280)}px`;
  }, [content]);

  const submit = async (): Promise<void> => {
    setError(null);

    const validation = validateUnsaid(content);
    if (!validation.valid) {
      setError(validation.error || 'Invalid content');
      return;
    }

    setSubmitting(true);
    try {
      let final_location = location;

      // Form submit is a user gesture, so browser geolocation can be asked now
      if (!final_location || final_location.lat === 0 || final_location.lng === 0) {
        try {
          final_location = await requestLocation(true);
        } catch {
          try {
            final_location = await requestLocation(false);
          } catch {
            console.warn('All location methods failed');
          }
        }
      }

      if (!final_location || final_location.lat === 0 || final_location.lng === 0) {
        final_location = { ...getDefaultLocation(), countryCode: 'XX' };
      }

      await onSubmit({
        content: content.trim(),
        location: { lat: final_location.lat, lng: final_location.lng },
        city: final_location.city,
        countryCode: final_location.countryCode || 'XX',
      });
      setContent('');
    } catch (err) {
      if (err instanceof Error && err.message.includes('Rate limit')) {
        setError('You have reached the daily limit. Please try again tomorrow.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create unsaid');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const remaining = MAX_LENGTH - content.length;
  const hasContent = content.trim().length > 0;
  const place = location?.city ? `${location.city}${location.countryCode ? `, ${location.countryCode}` : ''}` : null;

  return (
    <SheetModal title="New thought" onClose={submitting ? () => undefined : onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-1 gap-3 overflow-y-auto scrollbar-dark px-5 pt-3 pb-4">
          <LightAvatar size={32} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-semibold text-gray-100">Anonymous</span>
              {place && <span className="truncate text-gray-400">{place}</span>}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="What have you never said out loud?"
              rows={4}
              maxLength={MAX_LENGTH}
              disabled={submitting}
              aria-label="Your unsaid thought"
              aria-invalid={error ? 'true' : 'false'}
              className="mt-1 w-full resize-none bg-transparent text-[17px] leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none"
            />
            {error && <p className="mt-1 text-sm text-red-400" role="alert">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-gray-400">
            Location blurred to about 100m
          </p>
          {remaining < 100 && (
            <span className={`text-xs ${remaining < 20 ? 'text-red-300' : 'text-amber-300'}`} aria-live="polite">
              {remaining}
            </span>
          )}
          <button
            type="submit"
            disabled={submitting || !hasContent}
            aria-busy={submitting}
            className="ctl-primary h-10 min-w-[88px] rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </form>
    </SheetModal>
  );
}
