import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- a tiny fake of the Supabase client: each .from(table) call takes the next queued answer ---
type Answer = { data?: unknown; count?: number | null; error?: { code?: string; message?: string } | null };
const queue: Record<string, Answer[]> = {};
const calls: string[] = [];

function chain(answer: Answer) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  for (const name of ['select', 'eq', 'gte', 'order', 'limit', 'insert']) q[name] = self;
  const result = { data: null, count: null, error: null, ...answer };
  q.maybeSingle = () => Promise.resolve(result);
  q.single = () => Promise.resolve(result);
  q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      calls.push(table);
      return chain(queue[table]?.shift() ?? {});
    },
  },
}));

beforeEach(() => {
  for (const key of Object.keys(queue)) delete queue[key];
  calls.length = 0;
  process.env.ID_HASH_SECRET = 'test-secret';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('rate limits (rate-limit.ts)', () => {
  it('allows the 10th thought of the day and refuses the 11th', async () => {
    const { checkDeviceRateLimit } = await import('../rate-limit');
    queue.unsaids = [{ count: 9 }, { count: 10 }];
    const tenth = await checkDeviceRateLimit('device', 'unsaid');
    expect(tenth).toMatchObject({ allowed: true, remaining: 1 });
    const eleventh = await checkDeviceRateLimit('device', 'unsaid');
    expect(eleventh).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('refuses when the check itself fails (fails closed)', async () => {
    const { checkDeviceRateLimit, checkIPRateLimit, checkTimeThrottle } = await import('../rate-limit');
    queue.unsaids = [{ error: { message: 'boom' } }, { error: { message: 'boom' } }];
    queue.replies = [{ error: { message: 'boom' } }];
    expect((await checkDeviceRateLimit('d', 'unsaid')).allowed).toBe(false);
    expect((await checkIPRateLimit('ip', 'unsaid')).allowed).toBe(false);
    expect((await checkTimeThrottle('d', 'reply')).allowed).toBe(false);
  });

  it('tells how long to wait between two posts', async () => {
    const { checkTimeThrottle } = await import('../rate-limit');
    queue.unsaids = [{ data: { created_at: new Date(Date.now() - 10_000).toISOString() } }, { data: null }];
    const soon = await checkTimeThrottle('d', 'unsaid');
    expect(soon.allowed).toBe(false);
    expect(soon.waitSeconds).toBeGreaterThanOrEqual(19);
    expect(soon.waitSeconds).toBeLessThanOrEqual(21);
    expect((await checkTimeThrottle('d', 'unsaid')).allowed).toBe(true); // no earlier post
  });
});

describe('reporting (api/reports)', () => {
  const post = async (body: object) => {
    const { POST } = await import('@/app/api/reports/route');
    return POST(new NextRequest('http://localhost/api/reports', { method: 'POST', body: JSON.stringify(body) }));
  };
  const report = { unsaidId: 'u1', deviceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' };

  it('stops one IP after 20 reports in an hour, however many device ids it invents', async () => {
    queue.reports = [{ count: 20 }];
    expect((await post(report)).status).toBe(429);
    expect(calls).toEqual(['reports']); // refused before touching anything else
  });

  it('counts a second report from the same IP on the same target once (not an error)', async () => {
    queue.reports = [{ count: 0 }, { error: { code: '23505' } }];
    queue.unsaids = [{ data: { id: 'u1' } }];
    expect((await post(report)).status).toBe(201);
  });

  it('rejects a device id that is not a UUID', async () => {
    expect((await post({ unsaidId: 'u1', deviceId: 'not-a-uuid' })).status).toBe(400);
  });
});

describe('reply depth (reply-depth.ts)', () => {
  it('allows replies down to depth 5 and refuses depth 6', async () => {
    const { nextReplyDepth, isReplyDepthAllowed } = await import('../reply-depth');
    expect(nextReplyDepth(null)).toBe(0);
    expect(nextReplyDepth(4)).toBe(5);
    expect(isReplyDepthAllowed(nextReplyDepth(4))).toBe(true); // reply to a depth-4 reply
    expect(isReplyDepthAllowed(nextReplyDepth(5))).toBe(false); // reply to a depth-5 reply
  });
});
