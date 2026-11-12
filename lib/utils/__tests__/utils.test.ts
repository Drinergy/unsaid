import { describe, it, expect, beforeAll } from 'vitest';
import { checkContentFilter } from '../keyword-filter';
import { validateUnsaid, validateReply } from '../content-validation';
import { hashDeviceId } from '../request-identity';
import { roundCoordinate } from '../location';

describe('checkContentFilter', () => {
  it('blocks a link every time, not every other call (no stateful regex)', () => {
    const results = [1, 2, 3, 4].map(() => checkContentFilter('go to http://spam.example now').blocked);
    expect(results).toEqual([true, true, true, true]);
  });

  it('still catches a link near the start after an earlier match', () => {
    checkContentFilter('a long message with a link at the end http://spam.example/page');
    expect(checkContentFilter('http://a.io hi').blocked).toBe(true);
  });

  it('blocks emails and allows plain text', () => {
    expect(checkContentFilter('mail me at a@b.com').blocked).toBe(true);
    expect(checkContentFilter('I never told her I was sorry').blocked).toBe(false);
  });
});

describe('content validation', () => {
  it('allows a short unsaid but not an empty or oversized one', () => {
    expect(validateUnsaid('hi').valid).toBe(true);
    expect(validateUnsaid('   ').valid).toBe(false);
    expect(validateUnsaid('x'.repeat(1001)).valid).toBe(false);
  });

  it('accepts short replies (hi, a single emoji) but not empty or oversized ones', () => {
    expect(validateReply('hi').valid).toBe(true);
    expect(validateReply('❤️').valid).toBe(true);
    expect(validateReply('   ').valid).toBe(false);
    expect(validateReply('x'.repeat(501)).valid).toBe(false);
  });
});

describe('hashDeviceId', () => {
  beforeAll(() => {
    process.env.ID_HASH_SECRET = 'test-secret';
  });

  it('rejects anything that is not a UUID', () => {
    expect(hashDeviceId(undefined)).toBeNull();
    expect(hashDeviceId('server-placeholder')).toBeNull();
  });

  it('is stable, case-insensitive and does not contain the raw id', () => {
    const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const hashed = hashDeviceId(id);
    expect(hashed).toBe(hashDeviceId(id.toUpperCase()));
    expect(hashed).not.toContain(id);
  });
});

describe('roundCoordinate', () => {
  it('removes street-level precision', () => {
    const rounded = roundCoordinate(52.520008);
    expect(Math.abs(rounded - 52.520008)).toBeLessThan(0.001);
    expect(rounded).not.toBe(52.520008);
  });
});

describe('clustering', () => {
  it('keeps the cell ~constant on screen at every zoom', async () => {
    const { clusterCellSize } = await import('../clustering');
    for (const z of [2, 6, 10, 13]) {
      const px = (clusterCellSize(z) / 360) * 256 * 2 ** z;
      expect(px).toBeGreaterThan(80);
      expect(px).toBeLessThan(100);
    }
  });

  it('groups thoughts at the same spot, and splits far-apart ones', async () => {
    const { groupByPixel } = await import('../clustering');
    const t = (id: string, lat: number, lng: number) => ({ id, content: id, city: null, countryCode: 'PH', location: { lat, lng }, createdAt: '' });
    const groups = groupByPixel([t('a', 14.6, 121), t('b', 14.6, 121), t('c', 10.3, 123.9)], 15);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 2]);
  });

  it('merges overlapping clusters and keeps far ones apart', async () => {
    const { mergeOverlapping } = await import('../clustering');
    const c = (lat: number, lng: number, count: number) => ({ center: { lat, lng }, count, thoughts: [], bounds: [[lat, lng], [lat, lng]] as [[number, number], [number, number]] });
    // ~0.1° apart at zoom 4 is only a few px, so these two touch; the third is far away
    const out = mergeOverlapping([c(14.6, 121.0, 10), c(14.7, 121.0, 5), c(35.7, 139.7, 3)], 4);
    expect(out.map((x) => x.count).sort((a, b) => a - b)).toEqual([3, 15]);
    expect(out.find((x) => x.count === 15)!.bounds![1][0]).toBeCloseTo(14.7);
  });
});

describe('timeAgo', () => {
  it('formats compactly like a thread', async () => {
    const { timeAgo } = await import('../thought-age');
    const now = Date.parse('2026-11-12T12:00:00Z');
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(timeAgo(ago(20_000), now)).toBe('now');
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5m');
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h');
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2d');
    expect(timeAgo(ago(15 * 86_400_000), now)).toBe('2w');
  });
});

describe('buildThreadRows', () => {
  type TestReply = { id: string; unsaidId: string; parentReplyId: string | null; content: string; createdAt: string; replies: TestReply[] };
  const r = (id: string, replies: TestReply[] = []): TestReply => ({ id, unsaidId: 'u', parentReplyId: null, content: id, createdAt: '', replies });

  it('indents a reply to a reply and joins siblings with a line', async () => {
    const { buildThreadRows } = await import('../thread-rows');
    // "its okay" has a child "agree"; "test" is another reply to the thought
    const rows = buildThreadRows([r('okay', [r('agree')]), r('test')]);
    expect(rows.map((x) => [x.reply.id, x.depth])).toEqual([['okay', 0], ['agree', 1], ['test', 0]]);

    const [okay, agree, test] = rows;
    expect(okay.ownDown).toBe(true); // reaches its child and the next reply
    expect(agree.pass).toEqual([0]); // the column-0 line runs past it down to "test"
    expect(agree.ownDown).toBe(false);
    expect(test.ownDown).toBe(false); // last in the column: the line ends at its avatar
  });

  it('stops a parent line at its last child when nothing follows', async () => {
    const { buildThreadRows } = await import('../thread-rows');
    const rows = buildThreadRows([r('a', [r('a1'), r('a2')])]);
    expect(rows[0].ownDown).toBe(true);
    expect(rows[1].pass).toEqual([0]); // more children follow, so the parent's line continues
    expect(rows[2].pass).toEqual([]); // last child: nothing follows, so no line runs past it
  });

  it('joins siblings at every level with their own straight line (the "lols" case)', async () => {
    const { buildThreadRows } = await import('../thread-rows');
    // okay -> [agree -> [yup], lols]; test
    const rows = buildThreadRows([r('okay', [r('agree', [r('yup')]), r('lols')]), r('test')]);
    expect(rows.map((x) => x.reply.id)).toEqual(['okay', 'agree', 'yup', 'lols', 'test']);
    const by = Object.fromEntries(rows.map((x) => [x.reply.id, x]));

    expect(by.okay.ownDown).toBe(true); // down to "test"
    expect(by.agree.ownDown).toBe(true); // joins "lols", its sibling, through "yup"
    expect(by.yup.pass).toEqual([0, 1]); // both lines run past it
    expect(by.yup.ownDown).toBe(false);
    expect(by.lols.pass).toEqual([0]); // the level-0 line still runs to "test"
    expect(by.lols.ownDown).toBe(false); // last of its group
    expect(by.test.ownDown).toBe(false);
  });
});

describe('decideLocationTarget (My Location button)', () => {
  it('toggles between close-up and zoomed-out while on the user', async () => {
    const { decideLocationTarget } = await import('../location-toggle');
    expect(decideLocationTarget({ nearUser: true, zoom: 6, sameCountry: true })).toBe('in');
    expect(decideLocationTarget({ nearUser: true, zoom: 12, sameCountry: true })).toBe('out');
    expect(decideLocationTarget({ nearUser: true, zoom: 10, sameCountry: true })).toBe('out');
    expect(decideLocationTarget({ nearUser: true, zoom: 9, sameCountry: true })).toBe('in');
  });

  it('comes home zoomed in from elsewhere in the country, zoomed out from another country', async () => {
    const { decideLocationTarget } = await import('../location-toggle');
    expect(decideLocationTarget({ nearUser: false, zoom: 8, sameCountry: true })).toBe('in');
    expect(decideLocationTarget({ nearUser: false, zoom: 12, sameCountry: true })).toBe('in');
    expect(decideLocationTarget({ nearUser: false, zoom: 8, sameCountry: false })).toBe('out');
  });

  it('measures distance in km for the fallback', async () => {
    const { distanceKm, FAR_AWAY_KM } = await import('../location-toggle');
    const manila = { lat: 14.6, lng: 121 };
    expect(distanceKm(manila, manila)).toBeCloseTo(0, 5);
    expect(distanceKm(manila, { lat: 35.68, lng: 139.69 })).toBeGreaterThan(FAR_AWAY_KM); // Tokyo
    expect(distanceKm(manila, { lat: 10.31, lng: 123.89 })).toBeLessThan(FAR_AWAY_KM); // Cebu
  });
});

describe('parsePointHex (Realtime location)', () => {
  it('reads a PostGIS point (the real EWKB for POINT(1 2), SRID 4326)', async () => {
    const { parsePointHex } = await import('../ewkb');
    expect(parsePointHex('0101000020E6100000000000000000F03F0000000000000040')).toEqual({ lng: 1, lat: 2 });
  });

  it('returns null for anything that is not a point', async () => {
    const { parsePointHex } = await import('../ewkb');
    expect(parsePointHex(null)).toBeNull();
    expect(parsePointHex('')).toBeNull();
    expect(parsePointHex('zz'.repeat(25))).toBeNull();
    expect(parsePointHex('0102000020E6100000000000000000F03F0000000000000040')).toBeNull(); // a line, not a point
  });
});

describe('thought near the view (bounds.ts)', () => {
  const ph = { minLng: 118, minLat: 5, maxLng: 127, maxLat: 20 };

  it('keeps nearby thoughts, ignores far ones, and understands the wrapped world', async () => {
    const { pointInBounds } = await import('../bounds');
    expect(pointInBounds({ lat: 14.6, lng: 121 }, ph, 0.5)).toBe(true);
    expect(pointInBounds({ lat: 52.5, lng: 13.4 }, ph, 0.5)).toBe(false); // Berlin
    const pacific = { minLng: 170, minLat: -10, maxLng: 200, maxLat: 10 }; // runs past 180
    expect(pointInBounds({ lat: 0, lng: -175 }, pacific, 0)).toBe(true);
  });

  it('grows a view to whole grid cells', async () => {
    const { alignBounds } = await import('../bounds');
    const a = alignBounds({ minLng: 120.13, minLat: 14.02, maxLng: 121.46, maxLat: 14.88 }, 0.5);
    expect(a).toEqual({ minLng: 120, minLat: 14, maxLng: 121.5, maxLat: 15 });
    // two slightly different pans inside the same cells ask for the same box
    expect(alignBounds({ minLng: 120.2, minLat: 14.1, maxLng: 121.3, maxLat: 14.7 }, 0.5)).toEqual({ minLng: 120, minLat: 14, maxLng: 121.5, maxLat: 14.5 + 0.5 });
  });
});

describe('buildReplyTree', () => {
  it('nests replies and drops the answers to a hidden reply instead of promoting them', async () => {
    const { buildReplyTree } = await import('../thread-rows');
    const flat = [
      { id: 'a', unsaidId: 'u', parentReplyId: null, content: 'a', createdAt: '1' },
      { id: 'b', unsaidId: 'u', parentReplyId: 'a', content: 'b', createdAt: '2' },
      { id: 'c', unsaidId: 'u', parentReplyId: 'hidden', content: 'c', createdAt: '3' }, // its parent is not in the list
    ];
    const tree = buildReplyTree(flat);
    expect(tree.map((r) => r.id)).toEqual(['a']);
    expect(tree[0].replies!.map((r) => r.id)).toEqual(['b']);
  });
});

describe('parseRealtimePoint (what a Realtime event really carries)', () => {
  it('reads the GeoJSON object Supabase sends, as seen in a real event', async () => {
    const { parseRealtimePoint } = await import('../ewkb');
    const event = { crs: { type: 'name', properties: { name: 'EPSG:4326' } }, type: 'Point', coordinates: [13.4, 52.52] };
    expect(parseRealtimePoint(event)).toEqual({ lng: 13.4, lat: 52.52 });
    expect(parseRealtimePoint(JSON.stringify(event))).toEqual({ lng: 13.4, lat: 52.52 });
  });

  it('still reads a hex EWKB string, and gives up on anything else', async () => {
    const { parseRealtimePoint } = await import('../ewkb');
    expect(parseRealtimePoint('0101000020E6100000000000000000F03F0000000000000040')).toEqual({ lng: 1, lat: 2 });
    expect(parseRealtimePoint(undefined)).toBeNull();
    expect(parseRealtimePoint({ type: 'Point', coordinates: ['a', 'b'] })).toBeNull();
    expect(parseRealtimePoint('not a point')).toBeNull();
  });
});

describe('content filter: links, contact details and spam', () => {
  it.each([
    'check out shop.com for cheap stuff',
    'Buy at Cheapstuff.com',
    'SHOP.COM',
    'Visit Shop.Com now',
    'visit www . mysite . com',
    'my site is shop dot com',
    'buy at shop (dot) me now',
    'join t.me/channel',
    'mail me at name (at) gmail',
    'call me 0917 123 4567 anytime',
    'dm me on telegram please',
    'a'.repeat(30),
    'buy buy buy buy buy buy buy buy buy buy now',
  ])('blocks: %s', (text) => {
    expect(checkContentFilter(text).blocked).toBe(true);
  });

  it.each([
    "I'm scared that I'm becoming my mother.",
    'I never told her. Me too, honestly.',
    'noooooooooooooooo please come back',
    'I miss her................ so much',
    'hmmmmmmmmmmmmmmmm',
    'no no no no no no no, I just want her back',
    'I miss her.Me and her were close.',
    'It was 2019, then 2020, then she was gone.',
    'I wanted to say sorry... but I never did!!!',
    'Text me when you get home, she said. I never did.',
  ])('allows: %s', (text) => {
    expect(checkContentFilter(text).blocked).toBe(false);
  });
});

describe('map tile provider (tile-provider.ts)', () => {
  it('uses MapTiler only when it answers 2xx, and falls back to OpenStreetMap on a bad key or quota', async () => {
    const { pickTileProvider } = await import('../tile-provider');
    expect(pickTileProvider(true, 200)).toBe('maptiler');
    expect(pickTileProvider(true, 403)).toBe('osm'); // bad key or quota used up
    expect(pickTileProvider(true, 429)).toBe('osm');
    expect(pickTileProvider(false, null)).toBe('osm'); // no key set
    expect(pickTileProvider(true, null)).toBe('maptiler'); // probe too slow: try MapTiler anyway
  });
});
