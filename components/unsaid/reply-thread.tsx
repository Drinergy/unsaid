/**
 * One reply row in a Threads-style thread: a light for the anonymous author, a straight guide line
 * for its level, and a quiet Reply action. See lib/utils/thread-rows.ts.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import LightAvatar from './light-avatar';
import { timeAgo } from '@/lib/utils/thought-age';
import type { ThreadRow } from '@/lib/utils/thread-rows';

const AVATAR = 32;
/** A reply to a reply starts under its parent's text (avatar 32 + gap 12) */
const INDENT = AVATAR + 12;
/** Deeper replies stop moving right so the text keeps its room on narrow screens */
const MAX_INDENT_LEVEL = 2;
const level = (depth: number) => Math.min(depth, MAX_INDENT_LEVEL);
/** x of a column's line: the middle of an avatar at that depth */
const lineX = (depth: number) => level(depth) * INDENT + AVATAR / 2 - 1;

interface ReplyThreadProps {
  row: ThreadRow;
  onReply: (parentId: string, preview: string) => void;
  onReport: (replyId: string) => void;
}

export default function ReplyThread({ row, onReply, onReport }: ReplyThreadProps) {
  const { reply, depth, pass, ownDown } = row;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the ⋯ menu on an outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const place = [reply.city, reply.countryCode].filter(Boolean).join(', ');

  // One line per x position: when deep rows share a column, drawing twice would look brighter
  const own = ownDown ? { x: lineX(depth), top: AVATAR + 8 } : null;
  const through = [...new Set(pass.map(lineX))].filter((x) => x !== own?.x);

  return (
    <article className="relative pb-4" style={{ paddingLeft: 44 + level(depth) * INDENT }}>
      {/* lines of columns that run past this row to reach later replies */}
      {through.map((x) => (
        <span key={x} aria-hidden="true" className="absolute w-px bg-white/10" style={{ left: x, top: 0, bottom: 0 }} />
      ))}

      <span className="absolute top-0" style={{ left: level(depth) * INDENT }}>
        <LightAvatar size={AVATAR} />
      </span>

      {/* this reply's own line, down to its replies or the next reply in the column */}
      {own && <span aria-hidden="true" className="absolute w-px bg-white/10" style={{ left: own.x, top: own.top, bottom: 0 }} />}

      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold text-gray-100">Anonymous</span>
        <span className="text-gray-400">
          {place ? `${place} · ` : ''}{timeAgo(reply.createdAt)}
        </span>
        <div className="relative ml-auto self-center" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="ctl grid h-8 w-8 place-items-center rounded-full border border-transparent text-gray-500"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>
          {menuOpen && (
            <div role="menu" className="glass absolute right-0 top-full z-10 mt-1 w-40 rounded-2xl p-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onReport(reply.id);
                }}
                className="ctl w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm text-red-300"
              >
                Report reply
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-[15px] leading-relaxed text-gray-200 whitespace-pre-wrap">{reply.content}</p>
      <button
        type="button"
        onClick={() => onReply(reply.id, reply.content)}
        className="ctl -ml-2 mt-1 inline-flex items-center gap-1.5 h-8 px-2 rounded-full border border-transparent text-xs text-gray-400"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        Reply
      </button>
    </article>
  );
}
