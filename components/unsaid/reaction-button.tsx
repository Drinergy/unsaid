/**
 * One reaction button, Facebook-style: tap toggles the default reaction; hover (mouse),
 * long-press (touch) or ArrowUp (keyboard) opens a small picker with the other choices.
 * Single choice per person; counts come from the database (see /api/reactions).
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { ReactionType, ReactionCounts } from '@/types/unsaid';

const OPTIONS: { type: ReactionType; label: string; icon: React.ReactElement }[] = [
  {
    type: 'felt',
    label: 'Felt this',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />,
  },
  {
    type: 'me_too',
    label: 'Me too',
    // two people, side by side
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
  },
  {
    type: 'here_for_you',
    label: 'Here for you',
    // a hand offering a heart (Lucide "hand-heart", ISC license)
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m7 20 1.6 1.4c.3.4.8.6 1.4.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m2 15 6 6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" />
      </>
    ),
  },
  {
    type: 'proud_of_you',
    label: 'Proud of you',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />,
  },
];

// Solid fills with a white glyph, like Facebook's badges, so they read at 22px
const MINI: Record<ReactionType, string> = {
  felt: 'bg-rose-500 text-white',
  me_too: 'bg-sky-500 text-white',
  here_for_you: 'bg-amber-500 text-white',
  proud_of_you: 'bg-emerald-500 text-white',
};

const HOVER_OPEN_MS = 300;
const LONG_PRESS_MS = 450;

function Icon({ option, filled, className = 'w-5 h-5' }: { option: (typeof OPTIONS)[number]; filled?: boolean; className?: string }) {
  return (
    <svg className={className} fill={filled && option.type === 'felt' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      {option.icon}
    </svg>
  );
}

export default function ReactionButton({
  value,
  counts,
  onChange,
}: {
  value: ReactionType | null;
  counts: ReactionCounts;
  onChange: (next: ReactionType | null) => void;
}): React.ReactElement {
  const total = OPTIONS.reduce((sum, o) => sum + counts[o.type], 0);
  const [open, setOpen] = useState(false);
  // Which option is under the pointer or focus, so its name can be shown beside the picker
  const [hint, setHint] = useState<ReactionType | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const schedule = (fn: () => void, ms: number) => {
    clear();
    timer.current = setTimeout(fn, ms);
  };

  const current = OPTIONS.find((o) => o.type === value) ?? null;

  const choose = (type: ReactionType) => {
    clear();
    setOpen(false);
    onChange(type === value ? null : type);
  };

  return (
    <div
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') schedule(() => setOpen(true), HOVER_OPEN_MS);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') schedule(() => setOpen(false), 200);
      }}
    >
      {open && (
        <div
          role="menu"
          aria-label="Choose a reaction"
          className="glass absolute bottom-full left-0 mb-2 flex items-center gap-1 rounded-full p-1.5 z-10"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.type}
              type="button"
              role="menuitem"
              onClick={() => choose(o.type)}
              onPointerEnter={() => setHint(o.type)}
              onPointerLeave={() => setHint(null)}
              onFocus={() => setHint(o.type)}
              onBlur={() => setHint(null)}
              aria-label={`${o.label}${counts[o.type] > 0 ? `, ${counts[o.type]}` : ''}`}
              className="ctl grid h-11 w-11 place-items-center rounded-full border border-transparent motion-safe:hover:-translate-y-1"
            >
              <span className={`grid h-9 w-9 place-items-center rounded-full ${MINI[o.type]}`}>
                <Icon option={o} filled className="h-5 w-5" />
              </span>
            </button>
          ))}
          {hint && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/80 px-2.5 py-1 text-xs text-gray-100"
            >
              {OPTIONS.find((o) => o.type === hint)?.label}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={!!value}
        aria-label={current ? `${current.label}. Tap to remove` : 'React'}
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          clear();
          setOpen(false);
          onChange(value ? null : 'felt');
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') {
            longPressed.current = false;
            schedule(() => {
              longPressed.current = true;
              setOpen(true);
            }, LONG_PRESS_MS);
          }
        }}
        onPointerUp={clear}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className="ctl inline-flex items-center h-10 rounded-full border border-transparent px-2 text-gray-400"
      >
        {current ? (
          <span className={`grid h-7 w-7 place-items-center rounded-full ${MINI[current.type]}`}>
            <Icon option={current} filled className="h-4 w-4" />
          </span>
        ) : (
          <span className="grid h-7 w-7 place-items-center">
            <Icon option={OPTIONS[0]} />
          </span>
        )}
        {total > 0 && <span className="ml-1.5 text-sm tabular-nums text-gray-300">{total}</span>}
      </button>
    </div>
  );
}
/**
 * Stacked badges of the reactions people used (most-used first, up to three), icons only,
 * like Facebook's far-right summary. Renders nothing until someone has reacted.
 */
export function ReactionBadges({ counts }: { counts: ReactionCounts }): React.ReactElement | null {
  const used = OPTIONS.filter((o) => counts[o.type] > 0).sort((a, b) => counts[b.type] - counts[a.type]);
  if (used.length === 0) return null;
  const total = OPTIONS.reduce((sum, o) => sum + counts[o.type], 0);
  const breakdown = used.map((o) => `${counts[o.type]} ${o.label}`).join(', ');

  return (
    <span
      className="flex -space-x-1.5 pr-1"
      role="img"
      aria-label={`${total} ${total === 1 ? 'reaction' : 'reactions'}: ${breakdown}`}
      title={breakdown}
    >
      {used.slice(0, 3).map((o) => (
        <span key={o.type} className={`grid h-[22px] w-[22px] place-items-center rounded-full ring-2 ring-[rgb(12,14,20)] ${MINI[o.type]}`}>
          <svg className="h-3.5 w-3.5" fill={o.type === 'felt' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            {o.icon}
          </svg>
        </span>
      ))}
    </span>
  );
}
