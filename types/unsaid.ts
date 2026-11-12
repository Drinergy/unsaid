/**
 * Type definitions for Unsaid entities
 *
 * @author CKD
 * @created 2026-01-23
 */

export interface Unsaid {
  id: string;
  content: string;
  city: string | null;
  countryCode: string;
  location: {
    lat: number;
    lng: number;
  };
  createdAt: string;
  replyCount?: number;
}

export interface Reply {
  id: string;
  unsaidId: string;
  parentReplyId: string | null;
  content: string;
  /** Where the replier is (city and country only), if they shared it */
  city?: string | null;
  countryCode?: string | null;
  deviceId?: string; // not sent to clients (stored hashed)
  createdAt: string;
  replies?: Reply[]; // Nested replies for threading
  depth?: number; // Thread depth
}

export type ReactionType = 'felt' | 'me_too' | 'here_for_you' | 'proud_of_you';
export type ReactionCounts = Record<ReactionType, number>;

export interface UnsaidWithReplies extends Unsaid {
  replies: Reply[];
  /** How many replies the thought has in all (the list may hold only the first page) */
  replyTotal?: number;
  /** Everyone's reaction counts, and this device's own reaction (if any) */
  reactions?: { counts: ReactionCounts; mine: ReactionType | null };
}

export interface CreateUnsaidInput {
  content: string;
  location: {
    lat: number;
    lng: number;
  };
  city?: string;
  countryCode: string;
  /** One-time bot-check token from Turnstile (see components/ui/turnstile-field.tsx) */
  turnstileToken?: string;
}

export interface CreateReplyInput {
  unsaidId: string;
  parentReplyId?: string | null;
  content: string;
  turnstileToken?: string;
}
