/**
 * The quiet moment after someone shares: the form announces it, and the gentle notice (a small card)
 * listens. A window event, so the thread and the composer do not have to pass props up to the page.
 */

import { mentionsSelfHarm } from '@/lib/utils/care-words';

export const SHARED_EVENT = 'unsaid:shared';

export interface SharedDetail {
  kind: 'thought' | 'reply';
  /** The writer may be in pain: show where to find support */
  care: boolean;
  countryCode?: string;
}

/** Call after a thought or reply was saved. `text` is only checked here, never sent anywhere. */
export function announceShared(kind: SharedDetail['kind'], text: string, countryCode?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SharedDetail>(SHARED_EVENT, { detail: { kind, care: mentionsSelfHarm(text), countryCode } }));
}
