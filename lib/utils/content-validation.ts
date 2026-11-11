/**
 * Content validation utilities
 * Checks length only. Spam is handled by rate limits, the link/email filter and duplicate checks,
 * so short replies like "hi" or a single emoji are fine.
 *
 * @author CKD
 * @created 2026-01-23
 */

const MIN_LENGTH_REPLY = 1; // Reply: non-empty only
const MAX_LENGTH_UNSAID = 1000;
const MAX_LENGTH_REPLY = 500;

/**
 * Validate content length (generic)
 *
 * @param {string} content - Content to validate
 * @param {number} minLength - Minimum allowed length (after trim)
 * @param {number} maxLength - Maximum allowed length
 * @returns {{ valid: boolean; error?: string }}
 */
function validateLength(
  content: string,
  maxLength: number,
  minLength: number = 1
): { valid: boolean; error?: string } {
  const trimmed = content.trim();
  if (trimmed.length < minLength) {
    return {
      valid: false,
      error: minLength === 1 ? 'Content cannot be empty' : `Content must be at least ${minLength} characters`,
    };
  }

  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `Content must be no more than ${maxLength} characters`,
    };
  }

  return { valid: true };
}

/**
 * Validate Unsaid content
 * Only requires non-empty (no minimum character count)
 *
 * @param {string} content - Unsaid content
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateUnsaid(content: string): { valid: boolean; error?: string } {
  return validateLength(content, MAX_LENGTH_UNSAID, 1);
}

/**
 * Validate Reply content
 *
 * @param {string} content - Reply content
 * @returns {{ valid: boolean; error?: string }}
 */
export function validateReply(content: string): { valid: boolean; error?: string } {
  return validateLength(content, MAX_LENGTH_REPLY, MIN_LENGTH_REPLY);
}
