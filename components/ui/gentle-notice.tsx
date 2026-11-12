/**
 * A small card that appears after someone shares a thought or a reply: a quiet "it's out there now",
 * and, if their words suggest they are hurting, where to find support (it stays until closed).
 */

'use client';

import { useEffect, useState } from 'react';
import { COPY } from '@/lib/copy';
import { SHARED_EVENT, type SharedDetail } from '@/lib/utils/notices';

const SHOW_MS = 7000;

export default function GentleNotice(): React.ReactElement | null {
  const [notice, setNotice] = useState<SharedDetail | null>(null);

  useEffect(() => {
    const onShared = (e: Event) => setNotice((e as CustomEvent<SharedDetail>).detail);
    window.addEventListener(SHARED_EVENT, onShared);
    return () => window.removeEventListener(SHARED_EVENT, onShared);
  }, []);

  // A plain "shared" card fades away by itself; the support card waits until it is closed
  useEffect(() => {
    if (!notice || notice.care) return;
    const timer = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  const message = notice.kind === 'thought' ? COPY.sharedThought : COPY.sentReply;
  const isPh = notice.countryCode === 'PH';

  return (
    <div
      role="status"
      aria-live="polite"
      className="glass-card fixed left-3 right-[4.5rem] top-[4.5rem] z-[10001] rounded-2xl p-4 sm:left-1/2 sm:right-auto sm:top-16 sm:w-[28rem] sm:-translate-x-1/2"
      style={{ animation: 'fadeIn 0.5s ease-out' }}
    >
      <div className="flex items-start gap-3">
        <span className="light-dot mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-gray-200">
          {notice.care ? (
            <>
              <p className="font-serif text-base text-gray-100">{COPY.careTitle}</p>
              <p className="mt-1">{COPY.careBody}</p>
              <p className="mt-2">
                <a
                  href={isPh ? 'https://findahelpline.com/countries/ph' : 'https://findahelpline.com'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[rgb(255,214,170)] underline underline-offset-2"
                >
                  {COPY.careFind}
                </a>
              </p>
              {isPh && <p className="mt-1">{COPY.carePh}</p>}
              <p className="mt-3 text-xs text-gray-400">{message}</p>
            </>
          ) : (
            <p>{message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setNotice(null)}
          className="ctl -mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-transparent text-gray-400"
          aria-label={COPY.careDismiss}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
