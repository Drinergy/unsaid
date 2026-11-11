/**
 * Daily thought overlay component
 * Shows a highlighted thought for the day
 *
 * @author CKD
 * @created 2026-01-23
 */

'use client';

import { useState, useEffect } from 'react';
import type { Unsaid } from '@/types/unsaid';

interface DailyThoughtOverlayProps {
  unsaids: Unsaid[];
  onUnsaidClick: (unsaid: Unsaid) => void;
}

const PICK_KEY = 'daily_thought_pick';

/** The thought picked for a day, remembered so it stays the same all day */
function readPick(today: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PICK_KEY) || 'null');
    return saved?.date === today && typeof saved.id === 'string' ? saved.id : null;
  } catch {
    return null;
  }
}

function savePick(today: string, id: string): void {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify({ date: today, id }));
  } catch {
    // private mode: the pick just will not be remembered
  }
}

export default function DailyThoughtOverlay({ unsaids, onUnsaidClick }: DailyThoughtOverlayProps) {
  const [dailyThought, setDailyThought] = useState<Unsaid | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (unsaids.length === 0) return;
    // The list of newest thoughts changes whenever someone posts, so the pick is made once per day
    // and remembered. Re-running this effect when the list changes never swaps it.
    const today = new Date();
    const day = today.toDateString();
    try {
      setIsDismissed(localStorage.getItem(`daily_thought_dismissed_${day}`) === 'true');
    } catch {
      // storage blocked: show it
    }

    const pickFromList = () => {
      // Simple hash-based selection: the date picks a position in the current list
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      const picked = unsaids[seed % unsaids.length];
      savePick(day, picked.id);
      setDailyThought(picked);
    };

    const savedId = readPick(day);
    if (!savedId) {
      pickFromList();
      return;
    }

    const inList = unsaids.find((u) => u.id === savedId);
    if (inList) {
      setDailyThought(inList);
      return;
    }

    // Today's pick has scrolled out of the newest list: load it by id (or pick again if it is gone)
    let cancelled = false;
    fetch(`/api/unsaids/${savedId}?replies=1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.unsaid) {
          const { id, content, city, countryCode, location, createdAt } = data.unsaid;
          setDailyThought({ id, content, city, countryCode, location, createdAt });
        } else {
          pickFromList();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [unsaids]);

  const handleDismiss = () => {
    const today = new Date();
    const dismissedKey = `daily_thought_dismissed_${today.toDateString()}`;
    localStorage.setItem(dismissedKey, 'true');
    setIsDismissed(true);
  };

  const handleClick = () => {
    if (dailyThought) {
      onUnsaidClick(dailyThought);
    }
  };

  if (!dailyThought || isDismissed) return null;

  const preview = dailyThought.content.length > 100
    ? dailyThought.content.substring(0, 100) + '...'
    : dailyThought.content;

  return (
    <div className="rise-in glass-card fixed bottom-6 left-4 right-24 sm:right-auto sm:left-6 sm:w-[26rem] z-[9999] rounded-2xl p-5">
      <button
        onClick={handleDismiss}
        className="ctl absolute top-1 right-1 w-11 h-11 grid place-items-center rounded-full border border-transparent text-gray-400"
        aria-label="Dismiss today's thought"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <p
        className="text-gray-100 text-base leading-relaxed cursor-pointer pr-8 mb-4"
        onClick={handleClick}
      >
        {preview}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400">
          Today&apos;s thought · {dailyThought.city ? `${dailyThought.city}, ` : ''}{dailyThought.countryCode}
        </div>
        <button
          onClick={handleClick}
          className="text-xs text-[rgb(255,214,170)] hover:text-white transition-colors whitespace-nowrap rounded px-1 -mx-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(255,214,170)]"
        >
          Read more →
        </button>
      </div>
    </div>
  );
}
