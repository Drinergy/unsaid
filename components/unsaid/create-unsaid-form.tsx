/**
 * New-thought composer: a centered modal (bottom sheet on phones) in the same Threads-style
 * as the thread view. Detects location quietly (blurred to ~100m on the server) and posts.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useGeolocation, getDefaultLocation } from '@/lib/hooks/use-geolocation';
import { validateUnsaid } from '@/lib/utils/content-validation';
import SheetModal from '@/components/ui/sheet-modal';
import { COPY } from '@/lib/copy';
import TurnstileField, { TURNSTILE_ENABLED } from '@/components/ui/turnstile-field';
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
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
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
      setError(validation.error || COPY.emptyContent);
      return;
    }

    setSubmitting(true);
    try {
      let final_location = location;

      // Form submit is a user gesture, so the device's own position can be asked now. A place we only
      // guessed from the network (used to open the map) is not good enough to pin a thought to.
      const hasPlace = (l: typeof final_location) => !!l && l.lat !== 0 && l.lng !== 0;
      if (!hasPlace(final_location) || final_location?.approximate) {
        try {
          final_location = await requestLocation(true);
        } catch {
          // Refused or unavailable: keep the network guess if we have one, otherwise try once more without the device
          if (!hasPlace(final_location)) {
            try {
              final_location = await requestLocation(false);
            } catch {
              console.warn('All location methods failed');
            }
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
        turnstileToken: token ?? undefined,
      });
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : COPY.couldNotShare);
    } finally {
      setSubmitting(false);
      setResetSignal((n) => n + 1); // a token works once
    }
  };

  const remaining = MAX_LENGTH - content.length;
  const hasContent = content.trim().length > 0;
  const place = location?.city ? `${location.city}${location.countryCode ? `, ${location.countryCode}` : ''}` : null;

  return (
    <SheetModal title={COPY.composerTitle} onClose={submitting ? () => undefined : onCancel}>
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
              placeholder={COPY.composerPlaceholder}
              rows={4}
              maxLength={MAX_LENGTH}
              disabled={submitting}
              aria-label={COPY.composerAria}
              aria-invalid={error ? 'true' : 'false'}
              className="mt-1 w-full resize-none bg-transparent text-[17px] leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none"
            />
            {error && <p className="mt-1 text-sm text-red-400" role="alert">{error}</p>}
            <TurnstileField onToken={setToken} resetSignal={resetSignal} />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-gray-400">
            {COPY.composerNote}
          </p>
          {remaining < 100 && (
            <span className={`text-xs ${remaining < 20 ? 'text-red-300' : 'text-amber-300'}`} aria-live="polite">
              {remaining}
            </span>
          )}
          <button
            type="submit"
            disabled={submitting || !hasContent || (TURNSTILE_ENABLED && !token)}
            aria-busy={submitting}
            className="ctl-primary h-10 min-w-[88px] rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? COPY.sharing : COPY.shareButton}
          </button>
        </div>
      </form>
    </SheetModal>
  );
}
