/**
 * Thought age utility
 * Calculates age of thoughts for visual fading
 *
 * @author CKD
 * @created 2026-01-23
 */

export function getThoughtAge(createdAt: string): {
  hours: number;
  days: number;
  isRecent: boolean; // Within last hour
  isToday: boolean;
  isThisWeek: boolean;
} {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  const isRecent = hours < 1;
  const isToday = days === 0;
  const isThisWeek = days < 7;
  
  return { hours, days, isRecent, isToday, isThisWeek };
}

export function getOpacityByAge(createdAt: string): number {
  const { hours, days } = getThoughtAge(createdAt);
  
  // Fade based on age
  if (hours < 1) return 1.0; // Full opacity for last hour
  if (hours < 24) return 0.9; // 90% for today
  if (days < 7) return 0.7; // 70% for this week
  if (days < 30) return 0.5; // 50% for this month
  return 0.3; // 30% for older
}

/** Compact relative time like Threads: "now", "5m", "3h", "2d", "4w", then a short date. */
export function timeAgo(createdAt: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
