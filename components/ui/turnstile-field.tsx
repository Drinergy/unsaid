/**
 * Cloudflare Turnstile bot check. Invisible for real people most of the time (it only shows something
 * when Cloudflare is unsure). Gives the form a one-time token; change `resetSignal` after each submit
 * to get a fresh one. Renders nothing when no site key is set (local development without keys).
 */

'use client';

import { useEffect, useRef, useState } from 'react';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const TURNSTILE_ENABLED = !!TURNSTILE_SITE_KEY;

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next form
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function TurnstileField({
  onToken,
  resetSignal = 0,
}: {
  onToken: (token: string | null) => void;
  resetSignal?: number;
}): React.ReactElement | null {
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile) return;
        widgetRef.current = window.turnstile.render(boxRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          appearance: 'interaction-only', // stays invisible unless Cloudflare needs a click
          callback: (token: string) => {
            setFailed(false);
            onTokenRef.current(token);
          },
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            setFailed(true);
            onTokenRef.current(null);
          },
        });
      })
      .catch(() => {
        // Usually a content blocker stopping challenges.cloudflare.com
        setFailed(true);
        onTokenRef.current(null);
      });
    return () => {
      cancelled = true;
      if (widgetRef.current) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, []);

  // A token works once: after each submit, ask for a new one
  useEffect(() => {
    if (resetSignal > 0 && widgetRef.current) {
      onTokenRef.current(null);
      window.turnstile?.reset(widgetRef.current);
    }
  }, [resetSignal]);

  if (!TURNSTILE_ENABLED) return null;
  return (
    <>
      <div ref={boxRef} className="mt-1" />
      {failed && (
        <p className="mt-1 text-sm text-amber-300" role="alert">
          The check could not load. Turn off content blockers for this site and reload the page.
        </p>
      )}
    </>
  );
}
