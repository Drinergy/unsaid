/**
 * Server side of Cloudflare Turnstile (the bot check on posting). The browser widget gives the form a
 * one-time token; we ask Cloudflare whether it is real before touching the database.
 *
 * Without TURNSTILE_SECRET_KEY: local development skips the check, but production refuses every post
 * (a missing key must be noticed at once, not turn the protection off silently).
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('TURNSTILE_SECRET_KEY is not set: refusing to accept posts');
      return false;
    }
    return true;
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    // Cloudflare unreachable: refuse rather than let unchecked posts through
    console.error('Turnstile verification failed:', error);
    return false;
  }
}

export const TURNSTILE_FAILED = { error: 'Please complete the check and try again.' } as const;
