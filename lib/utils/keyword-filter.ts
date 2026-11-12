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

// Domains: "shop.com" written with no spaces (any capitals) is a link; "her. Me too" is a sentence.
// Short endings that are also ordinary words (me, co, top, app) only count when spelled out ("shop dot me").
const DOMAIN_TLDS = 'com|net|org|io|xyz|ru|ly|gg|tv|link|online|shop|club|info|biz';
const SPELLED_OUT_TLDS = `${DOMAIN_TLDS}|me|co|app|dev|site|top|cc`;

const LINK_PATTERNS: RegExp[] = [
  // No `g` flag: a global regex keeps lastIndex between .test() calls and misses matches
  /(http|https):\/\/[^\s]+/i, // URLs (basic check)
  /\bwww\s*\./i, // www.something
  new RegExp(`\\b[a-z0-9-]{2,}\\.(${DOMAIN_TLDS})\\b`, 'i'), // shop.com, Shop.com, SHOP.COM
  new RegExp(`\\b[a-z0-9-]{2,}\\s*(\\(dot\\)|\\[dot\\]|\\sdot\\s)\\s*(${SPELLED_OUT_TLDS})\\b`, 'i'), // shop dot com
  /\b(t\.me|wa\.me|bit\.ly|discord\.gg)\b/i, // chat and shortener links
];

const CONTACT_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i, // Email addresses
  /[a-z0-9._%+-]+\s*(\(at\)|\[at\])\s*[a-z0-9.-]+/i, // "name (at) mail"
  /(\+?\d[\s().-]?){10,}/, // phone numbers (10 or more digits)
  /\b(dm|message|text|add|contact)\s+me\s+(on|at|via)\s+(telegram|whatsapp|insta|instagram|snap|snapchat|kik|wechat|signal)\b/i,
];

const SPAM_PATTERNS: RegExp[] = [
  // Only what a bot does: people write "noooooooooooooooo" and "no no no no no no" when they hurt
  /(.)\1{29,}/, // the same character 30 times or more
  /\b(\w+)(\s+\1\b){9,}/i, // the same word 10 times in a row
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

  if (LINK_PATTERNS.some((p) => p.test(content)) || CONTACT_PATTERNS.some((p) => p.test(content))) {
    return { blocked: true, reason: 'Content contains links or contact information' };
  }

  if (SPAM_PATTERNS.some((p) => p.test(content))) {
    return { blocked: true, reason: 'Content looks like spam' };
  }

  return { blocked: false };
}
