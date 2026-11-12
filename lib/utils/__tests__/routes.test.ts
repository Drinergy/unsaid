import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { BLUR_PRECISION_MULTIPLIER } from '@/lib/constants/geolocation';

// Same tiny fake of the Supabase client as server-rules.test.ts, plus rpc() so we can see what is stored.
type Answer = { data?: unknown; count?: number | null; error?: { code?: string; message?: string } | null };
const queue: Record<string, Answer[]> = {};
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

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
    from: (table: string) => chain(queue[table]?.shift() ?? {}),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const created = { id: 'new', content: 'x', city: null, country_code: 'PH', location: null, created_at: 'now' };
      return Promise.resolve({ data: name === 'create_unsaid_with_location' ? [created] : [], error: null });
    },
  },
}));

const DEVICE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const req = (url: string, body?: object, ip = '203.0.113.1') =>
  new NextRequest(`http://localhost${url}`, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'x-real-ip': ip },
  });

beforeEach(() => {
  for (const key of Object.keys(queue)) delete queue[key];
  rpcCalls.length = 0;
  process.env.ID_HASH_SECRET = 'test-secret';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('POST /api/unsaids', () => {
  const thought = { content: 'I never told her I was proud of her', deviceId: DEVICE, countryCode: 'PH', city: 'Manila' };
  // rate-limit checks (device count, IP count, throttle) then the duplicate lookup
  const clearToPost = () => (queue.unsaids = [{ count: 0 }, { count: 0 }, { data: null }, { data: [] }]);

  it('rounds the coordinates on the server, whatever the client sends', async () => {
    const { POST } = await import('@/app/api/unsaids/route');
    clearToPost();
    const res = await POST(req('/api/unsaids', { ...thought, location: { lat: 14.599512, lng: 120.984222 } }));
    expect(res.status).toBe(201);
    const { p_lat, p_lng } = rpcCalls.find((c) => c.name === 'create_unsaid_with_location')!.args as { p_lat: number; p_lng: number };
    expect(p_lat).not.toBe(14.599512);
    expect(Math.abs(p_lat - 14.599512)).toBeLessThan(0.01);
    expect(Math.abs(p_lng - 120.984222)).toBeLessThan(0.01);
    // lands on the ~100 m grid (whole multiples of 1/1111 degree), allowing for float noise
    expect(Math.abs(p_lat * BLUR_PRECISION_MULTIPLIER - Math.round(p_lat * BLUR_PRECISION_MULTIPLIER))).toBeLessThan(1e-6);
  });

  it('refuses a missing or impossible location and a bad device id', async () => {
    const { POST } = await import('@/app/api/unsaids/route');
    expect((await POST(req('/api/unsaids', { ...thought, location: { lat: 99, lng: 0 } }))).status).toBe(400);
    expect((await POST(req('/api/unsaids', { ...thought }))).status).toBe(400);
    expect((await POST(req('/api/unsaids', { ...thought, deviceId: 'nope', location: { lat: 1, lng: 1 } }))).status).toBe(400);
  });

  it('refuses the same text a sixth time within an hour', async () => {
    const { POST } = await import('@/app/api/unsaids/route');
    queue.unsaids = [{ count: 0 }, { count: 0 }, { data: null }, { data: [1, 2, 3, 4, 5] }];
    expect((await POST(req('/api/unsaids', { ...thought, location: { lat: 1, lng: 1 } }))).status).toBe(400);
  });
});

describe('GET /api/unsaids (clusters)', () => {
  it('gives near-identical requests the same database query, so they share one CDN entry', async () => {
    const { GET } = await import('@/app/api/unsaids/route');
    await GET(req('/api/unsaids?bbox=120.1000001,14.1000001,121.2000001,15.2000001&zoom=6.01'));
    await GET(req('/api/unsaids?bbox=120.1000009,14.1000009,121.2000009,15.2000009&zoom=6.04'));
    const [a, b] = rpcCalls.filter((c) => c.name === 'get_unsaid_clusters');
    expect(a.args).toEqual(b.args);
  });
});

describe('POST /api/replies', () => {
  it('refuses the same reply a sixth time under one thought within an hour', async () => {
    const { POST } = await import('@/app/api/replies/route');
    queue.unsaids = [{ data: { id: 'u1' } }];
    queue.replies = [{ count: 0 }, { count: 0 }, { data: null }, { data: [1, 2, 3, 4, 5] }];
    const res = await POST(req('/api/replies', { unsaidId: 'u1', content: 'me too, honestly', deviceId: DEVICE }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/reactions', () => {
  it('slows an add/remove loop from one IP (30 calls a minute)', async () => {
    const { POST } = await import('@/app/api/reactions/route');
    const call = () =>
      POST(req('/api/reactions', { unsaidId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302', type: null, deviceId: DEVICE }, '198.51.100.99'));
    for (let i = 0; i < 30; i++) expect((await call()).status).toBe(404); // thought does not exist; not rate limited yet
    expect((await call()).status).toBe(429);
  });
});

describe('allowBurst', () => {
  it('lets the window slide', async () => {
    const { allowBurst } = await import('../burst-limit');
    expect(allowBurst('k', 2, 1000, 0)).toBe(true);
    expect(allowBurst('k', 2, 1000, 10)).toBe(true);
    expect(allowBurst('k', 2, 1000, 20)).toBe(false);
    expect(allowBurst('k', 2, 1000, 1100)).toBe(true);
  });
});

describe('kill switch (POSTING_PAUSED=1)', () => {
  it('stops new thoughts, replies and reactions with a 503, but not reading', async () => {
    process.env.POSTING_PAUSED = '1';
    try {
      const unsaids = await import('@/app/api/unsaids/route');
      const replies = await import('@/app/api/replies/route');
      const reactions = await import('@/app/api/reactions/route');
      expect((await unsaids.POST(req('/api/unsaids', { content: 'x', deviceId: DEVICE }))).status).toBe(503);
      expect((await replies.POST(req('/api/replies', { unsaidId: 'u', content: 'x', deviceId: DEVICE }))).status).toBe(503);
      expect((await reactions.POST(req('/api/reactions', { unsaidId: 'u', type: null, deviceId: DEVICE }))).status).toBe(503);
      expect(rpcCalls).toHaveLength(0);
      expect((await unsaids.GET(req('/api/unsaids?initial=true'))).status).toBe(200);
    } finally {
      delete process.env.POSTING_PAUSED;
    }
  });
});

describe('read rate limit', () => {
  it('answers 429 after 180 reads a minute from one IP', async () => {
    const { GET } = await import('@/app/api/unsaids/route');
    for (let i = 0; i < 180; i++) expect((await GET(req('/api/unsaids?initial=true', undefined, '198.51.100.7'))).status).toBe(200);
    const blocked = await GET(req('/api/unsaids?initial=true', undefined, '198.51.100.7'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBe('30');
    // someone else is not affected
    expect((await GET(req('/api/unsaids?initial=true', undefined, '198.51.100.8'))).status).toBe(200);
  });
});

describe('Turnstile bot check', () => {
  const thought = { content: 'I never told her I was proud of her', deviceId: DEVICE, countryCode: 'PH', location: { lat: 14.6, lng: 120.98 } };
  const clearToPost = () => (queue.unsaids = [{ count: 0 }, { count: 0 }, { data: null }, { data: [] }]);
  const cloudflareSays = (success: boolean) => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ success }) });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-turnstile-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('refuses a post with no token, and never reaches the database or Cloudflare', async () => {
    const fetchMock = cloudflareSays(true);
    const { POST } = await import('@/app/api/unsaids/route');
    const res = await POST(req('/api/unsaids', thought));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCalls).toHaveLength(0);
  });

  it('refuses a token Cloudflare rejects, for thoughts and for replies', async () => {
    cloudflareSays(false);
    const unsaids = await import('@/app/api/unsaids/route');
    const replies = await import('@/app/api/replies/route');
    expect((await unsaids.POST(req('/api/unsaids', { ...thought, turnstileToken: 'bad' }))).status).toBe(400);
    expect((await replies.POST(req('/api/replies', { unsaidId: 'u1', content: 'me too, honestly', deviceId: DEVICE, turnstileToken: 'bad' }))).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it('accepts a token Cloudflare approves, and sends the secret and token to Cloudflare', async () => {
    const fetchMock = cloudflareSays(true);
    const { POST } = await import('@/app/api/unsaids/route');
    clearToPost();
    expect((await POST(req('/api/unsaids', { ...thought, turnstileToken: 'good' }))).status).toBe(201);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(init.body)).toContain('response=good');
  });

  it('refuses everything when Cloudflare cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { POST } = await import('@/app/api/unsaids/route');
    expect((await POST(req('/api/unsaids', { ...thought, turnstileToken: 'good' }))).status).toBe(400);
  });

  it('in production, a missing secret refuses posts instead of switching the check off', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const { POST } = await import('@/app/api/unsaids/route');
    expect((await POST(req('/api/unsaids', thought))).status).toBe(400);
  });
});
