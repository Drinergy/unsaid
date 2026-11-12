/**
 * Threads-style reply composer: a single row pinned under the thread.
 * Posts a top-level reply, or a reply to one specific reply when a target is set.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { CreateReplyInput } from '@/types/unsaid';
import { validateReply } from '@/lib/utils/content-validation';
import LightAvatar from './light-avatar';
import TurnstileField, { TURNSTILE_ENABLED } from '@/components/ui/turnstile-field';

interface CreateReplyFormProps {
  unsaidId: string;
  parentReplyId: string | null;
  /** Preview of the reply being answered, if any */
  replyingToPreview?: string;
  onSubmit: (input: CreateReplyInput) => Promise<void>;
  /** Clear the "replying to" target */
  onClearTarget: () => void;
  /** Change this number to move focus into the box */
  focusSignal?: number;
  /** Called when the box gets focus (used to detect the place quietly) */
  onFocus?: () => void;
}

const MAX_LENGTH = 500;

export default function CreateReplyForm({
  unsaidId,
  parentReplyId,
  replyingToPreview,
  onSubmit,
  onClearTarget,
  focusSignal = 0,
  onFocus,
}: CreateReplyFormProps) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusSignal > 0) textareaRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [content]);

  const submit = async () => {
    setError(null);
    const validation = validateReply(content);
    if (!validation.valid) {
      setError(validation.error || 'Invalid content');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ unsaidId, parentReplyId, content: content.trim(), turnstileToken: token ?? undefined });
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reply');
    } finally {
      setSubmitting(false);
      setResetSignal((n) => n + 1); // a token works once
    }
  };

  const remaining = MAX_LENGTH - content.length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex items-start gap-3"
    >
      <LightAvatar size={32} className="mt-1" />
      <div className="flex-1 min-w-0">
        {replyingToPreview && (
          <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
            <span className="truncate">Replying to “{replyingToPreview.length > 40 ? replyingToPreview.slice(0, 40) + '…' : replyingToPreview}”</span>
            <button type="button" onClick={onClearTarget} className="ctl shrink-0 rounded-full border border-transparent px-2 py-0.5 text-gray-300" aria-label="Stop replying to this">
              Clear
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          maxLength={MAX_LENGTH}
          disabled={submitting}
          placeholder={replyingToPreview ? 'Write a reply…' : 'Reply to this thought…'}
          aria-label="Reply"
          className="w-full resize-none bg-transparent py-1.5 text-[15px] text-gray-100 placeholder:text-gray-500 focus:outline-none"
        />
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <TurnstileField onToken={setToken} resetSignal={resetSignal} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        {remaining < 50 && <span className="text-xs text-amber-300" aria-live="polite">{remaining}</span>}
        <button
          type="submit"
          disabled={submitting || !content.trim() || (TURNSTILE_ENABLED && !token)}
          className="h-9 rounded-full px-3 text-sm font-semibold text-[rgb(255,214,170)] transition-colors hover:text-white disabled:text-gray-600 disabled:hover:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(255,214,170)]"
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}
