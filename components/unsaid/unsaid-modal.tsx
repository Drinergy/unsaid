/**
 * Thread view for one thought, Threads-style: the thought on top, replies below as a
 * connected thread, one composer pinned at the bottom. Opens when a light is clicked.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UnsaidWithReplies, CreateReplyInput, ReactionType, ReactionCounts } from '@/types/unsaid';
import { getDeviceId } from '@/lib/utils/device-id';
import { useGeolocation } from '@/lib/hooks/use-geolocation';
import ReplyThread from './reply-thread';
import CreateReplyForm from './create-reply-form';
import LightAvatar from './light-avatar';
import ReactionButton, { ReactionBadges } from './reaction-button';
import SheetModal from '@/components/ui/sheet-modal';
import { useRealtime } from '@/lib/hooks/use-realtime';
import { saveThought, removeSavedThought, isThoughtSaved } from '@/lib/utils/saved-thoughts';
import { timeAgo } from '@/lib/utils/thought-age';
import { buildReplyTree, buildThreadRows } from '@/lib/utils/thread-rows';

interface UnsaidModalProps {
  unsaidId: string;
  onClose: () => void;
  onReport: (unsaidId: string) => void;
}

const REPLY_PAGE = 200;

export default function UnsaidModal({ unsaidId, onClose, onReport }: UnsaidModalProps) {
  const [unsaid, setUnsaid] = useState<UnsaidWithReplies | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState<ReactionType | null>(null);
  const [reactionCounts, setReactionCounts] = useState<ReactionCounts>({ felt: 0, me_too: 0, here_for_you: 0, proud_of_you: 0 });
  const [isSaved, setIsSaved] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; preview: string } | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Replies the reader has reported are hidden for them straight away (the server hides them for
  // everyone once enough people report). The flat page from the server becomes a tree here.
  const [hiddenReplyIds, setHiddenReplyIds] = useState<Set<string>>(new Set());
  const [replyLimit, setReplyLimit] = useState(REPLY_PAGE);
  const rows = useMemo(
    () => buildThreadRows(buildReplyTree((unsaid?.replies ?? []).filter((r) => !hiddenReplyIds.has(r.id)))),
    [unsaid, hiddenReplyIds]
  );
  const { requestLocation } = useGeolocation({ enableCache: true, autoDetect: false });
  const warmedRef = useRef(false);

  // Look up the replier's place quietly when they start typing (IP-based first: no permission prompt)
  const warmLocation = useCallback(() => {
    if (warmedRef.current) return;
    warmedRef.current = true;
    requestLocation(false).catch(() => undefined);
  }, [requestLocation]);

  const fetchUnsaid = useCallback(async () => {
    try {
      const response = await fetch(`/api/unsaids/${unsaidId}?replies=${replyLimit}`, { headers: { 'x-device-id': getDeviceId() } });
      if (!response.ok) throw new Error('Failed to fetch unsaid');
      const data = await response.json();
      setUnsaid(data.unsaid);
      setError(null);
      if (data.unsaid) {
        setIsSaved(isThoughtSaved(data.unsaid.id));
        setReaction(data.unsaid.reactions?.mine ?? null);
        if (data.unsaid.reactions?.counts) setReactionCounts(data.unsaid.reactions.counts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [unsaidId, replyLimit]);

  useEffect(() => {
    setLoading(true);
    setReplyLimit(REPLY_PAGE);
    setHiddenReplyIds(new Set());
  }, [unsaidId]);

  // Fetch on open, and again when more replies are asked for or one arrives (no loading flash)
  useEffect(() => {
    fetchUnsaid();
  }, [fetchUnsaid]);

  // Refresh quietly (no loading state) when someone replies
  useRealtime({
    onNewReply: (reply) => {
      if (reply.unsaidId === unsaidId) fetchUnsaid();
    },
  });

  // Close the ⋯ menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleSave = useCallback(() => {
    if (!unsaid) return;
    if (isSaved) {
      removeSavedThought(unsaid.id);
      setIsSaved(false);
    } else {
      saveThought({
        id: unsaid.id,
        content: unsaid.content,
        city: unsaid.city || undefined,
        countryCode: unsaid.countryCode,
      });
      setIsSaved(true);
    }
  }, [unsaid, isSaved]);

  // One reaction at a time, like Facebook. Updates the screen at once, then confirms with the server.
  const handleReaction = useCallback(
    async (next: ReactionType | null) => {
      if (!unsaid) return;
      const prevReaction = reaction;
      const prevCounts = reactionCounts;

      const counts = { ...prevCounts };
      if (prevReaction) counts[prevReaction] = Math.max(0, counts[prevReaction] - 1);
      if (next) counts[next] += 1;
      setReaction(next);
      setReactionCounts(counts);

      try {
        const response = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unsaidId: unsaid.id, type: next, deviceId: getDeviceId() }),
        });
        if (!response.ok) throw new Error('Failed to save reaction');
        const data = await response.json();
        setReactionCounts(data.counts);
        setReaction(data.mine);
      } catch (err) {
        console.error('Error saving reaction:', err);
        setReaction(prevReaction);
        setReactionCounts(prevCounts);
      }
    },
    [unsaid, reaction, reactionCounts]
  );

  const handleCreateReply = async (input: CreateReplyInput) => {
    // City and country only (never coordinates). Cached from when typing started; skipped if unknown.
    let place: { city?: string; countryCode?: string } = {};
    try {
      const loc = await requestLocation(false);
      place = { city: loc.city, countryCode: loc.countryCode };
    } catch {
      // no place: the reply just shows its time
    }

    const response = await fetch('/api/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, ...place, deviceId: getDeviceId() }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create reply');
    }
    await fetchUnsaid();
    setReplyingTo(null);
  };

  const sendReport = async (target: { unsaidId: string } | { replyId: string }) => {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...target, deviceId: getDeviceId() }),
    });
    if (!response.ok) throw new Error('Failed to report');
  };

  const handleReport = async () => {
    setMenuOpen(false);
    if (!confirm('Report this thought? If enough people report it, it will be hidden.')) return;
    try {
      await sendReport({ unsaidId });
      onReport(unsaidId);
      onClose();
    } catch (err) {
      console.error('Error reporting:', err);
      alert('Failed to report. Please try again.');
    }
  };

  const handleReportReply = async (replyId: string) => {
    if (!confirm('Report this reply? If enough people report it, it will be hidden.')) return;
    try {
      await sendReport({ replyId });
      setHiddenReplyIds((ids) => new Set(ids).add(replyId));
    } catch (err) {
      console.error('Error reporting reply:', err);
      alert('Failed to report. Please try again.');
    }
  };

  if (loading) {
    return (
      <SheetModal title="Thread" onClose={onClose}>
        <div className="px-5 pb-8 pt-4" role="status" aria-label="Loading thought">
          <div className="flex gap-3">
            <div className="skeleton w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-2/3" />
            </div>
          </div>
        </div>
      </SheetModal>
    );
  }

  if (error || !unsaid) {
    return (
      <SheetModal title="Thread" onClose={onClose}>
        <p className="px-5 pb-8 pt-2 text-red-400">{error || 'This thought is no longer available.'}</p>
      </SheetModal>
    );
  }

  const place =
    unsaid.city || (unsaid.countryCode && unsaid.countryCode !== 'XX' ? unsaid.countryCode : 'Somewhere');
  const placeLine = unsaid.city && unsaid.countryCode && unsaid.countryCode !== 'XX' ? `${place}, ${unsaid.countryCode}` : place;
  // Count from the server's total (the list may be one page); hidden ones come off right away
  const loaded = unsaid.replies.length;
  const total = Math.max(0, (unsaid.replyTotal ?? loaded) - hiddenReplyIds.size);
  const hasMore = (unsaid.replyTotal ?? loaded) > loaded;

  const menu = (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="ctl grid place-items-center w-11 h-11 rounded-full border border-transparent text-gray-400"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {menuOpen && (
        <div role="menu" className="glass absolute right-0 top-full z-10 mt-1 w-44 rounded-2xl p-1">
          <button
            type="button"
            role="menuitem"
            onClick={handleReport}
            className="ctl w-full rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-red-300"
          >
            Report thought
          </button>
        </div>
      )}
    </div>
  );

  return (
    <SheetModal title="Thread" onClose={onClose} actions={menu}>
      <div className="flex-1 overflow-y-auto scrollbar-dark px-5 pt-2">
        {/* The thought */}
        <article className="relative pb-4" style={{ paddingLeft: 44 }}>
          <LightAvatar className="absolute left-0 top-0" size={32} />
          {total > 0 && <span aria-hidden="true" className="absolute w-px bg-white/10" style={{ left: 15, top: 40, bottom: 0 }} />}
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold text-gray-100">Anonymous</span>
            <span className="text-gray-400">{placeLine} · {timeAgo(unsaid.createdAt)}</span>
          </div>
          <p className="mt-1 text-[17px] leading-relaxed text-gray-100 whitespace-pre-wrap">{unsaid.content}</p>

          <div className="-ml-2 mt-2 flex items-center gap-1">
            <ReactionButton value={reaction} counts={reactionCounts} onChange={handleReaction} />
            <button
              type="button"
              onClick={() => {
                setReplyingTo(null);
                setFocusSignal((n) => n + 1);
              }}
              className="ctl inline-flex items-center gap-1.5 h-10 rounded-full border border-transparent px-2.5 text-sm text-gray-400"
              aria-label="Reply to this thought"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {total > 0 && <span>{total}</span>}
            </button>
            <span className="flex-1" />
            <ReactionBadges counts={reactionCounts} />
            <button
              type="button"
              onClick={handleSave}
              aria-pressed={isSaved}
              aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
              title={isSaved ? 'Saved. Tap to remove' : 'Save for later'}
              className={`ctl grid place-items-center w-10 h-10 rounded-full border border-transparent ${isSaved ? 'text-[rgb(255,214,170)]' : 'text-gray-400'}`}
            >
              <svg className="w-5 h-5" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>
        </article>

        {/* Replies */}
        {total === 0 ? (
          <p className="pb-6 pl-[44px] text-sm text-gray-500">No replies yet.</p>
        ) : (
          rows.map((row) => (
            <ReplyThread
              key={row.reply.id}
              row={row}
              onReply={(id, preview) => {
                setReplyingTo({ id, preview });
                setFocusSignal((n) => n + 1);
              }}
              onReport={handleReportReply}
            />
          ))
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => setReplyLimit((n) => n + REPLY_PAGE)}
            className="ctl mb-4 ml-[44px] rounded-full border border-transparent px-3 py-1.5 text-sm text-gray-300"
          >
            Show more replies
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/10 px-5 py-3">
        <CreateReplyForm
          key={replyingTo?.id ?? 'root'}
          unsaidId={unsaidId}
          parentReplyId={replyingTo?.id ?? null}
          replyingToPreview={replyingTo?.preview}
          onSubmit={handleCreateReply}
          onClearTarget={() => setReplyingTo(null)}
          focusSignal={focusSignal}
          onFocus={warmLocation}
        />
      </div>
    </SheetModal>
  );
}
