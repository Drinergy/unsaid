/**
 * Basic keyword filtering for content moderation
 * Filters obvious violations before publishing
 *
 * @author CKD
 * @created 2026-01-23
 */

// Basic list of obvious violations (expand as needed)
const BLOCKED_KEYWORDS: string[] = [
  // Add specific blocked terms here
  // This is a basic implementation - in production, use a more sophisticated system
];

const BLOCKED_PATTERNS = [
  // No `g` flag: a global regex keeps lastIndex between .test() calls and misses matches
  /(http|https):\/\/[^\s]+/i, // URLs (basic check)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, // Email addresses
];

/**
 * Check if content contains blocked keywords or patterns
 *
 * @param {string} content - Content to check
 * @returns {{ blocked: boolean; reason?: string }}
 */
export function checkContentFilter(content: string): { blocked: boolean; reason?: string } {
  const lowerContent = content.toLowerCase();

  // Check blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return {
        blocked: true,
        reason: 'Content contains inappropriate language',
      };
    }
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return {
        blocked: true,
        reason: 'Content contains links or contact information',
      };
    }
  }

  return { blocked: false };
}
