/**
 * The quiet moment after someone shares: the form announces it, and two listeners react: the gentle
 * notice (a small card) and the map (the new light glows in where it was written). A window event,
 * so the composer and the thread do not have to pass props up to the page and the map.
 */

export const SHARED_EVENT = 'unsaid:shared';

export interface SharedDetail {
  kind: 'thought' | 'reply';
  /** For a new thought: where its light should appear */
  thought?: { id: string; lat: number; lng: number };
}

export function announceShared(kind: SharedDetail['kind'], thought?: SharedDetail['thought']): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SharedDetail>(SHARED_EVENT, { detail: { kind, thought } }));
}
