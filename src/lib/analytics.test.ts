import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bucketLabel,
  bucketStart,
  bucketWindow,
  changeOf,
  EXPLORER_KEYS,
  explorerHref,
  explorerQuery,
  fillSeries,
  formatHours,
  isFiltered,
  niceTicks,
  parseRange,
  parseSource,
  rangeWindow,
  todayIst,
  type ExplorerKey,
  type ExplorerParams,
  type RangeKey,
} from './analytics';

test('bucketStart matches Postgres date_trunc', () => {
  assert.equal(bucketStart('2026-10-02', 'day'), '2026-10-02');
  assert.equal(bucketStart('2026-10-02', 'week'), '2026-09-28'); // Friday -> Monday
  assert.equal(bucketStart('2026-09-28', 'week'), '2026-09-28');
  assert.equal(bucketStart('2026-10-04', 'week'), '2026-09-28'); // Sunday belongs to the week before
  assert.equal(bucketStart('2026-10-31', 'month'), '2026-10-01');
});

test('fillSeries zero-fills every bucket in the range', () => {
  const s = fillSeries([{ bucket: '2026-08-01', n: 3 }], '2026-07-15', '2026-10-02', 'month');
  assert.deepEqual(s, [
    { bucket: '2026-07-01', n: 0 },
    { bucket: '2026-08-01', n: 3 },
    { bucket: '2026-09-01', n: 0 },
    { bucket: '2026-10-01', n: 0 },
  ]);
  assert.equal(fillSeries([], '2026-09-03', '2026-10-02', 'day').length, 30);
  assert.equal(fillSeries([], '2025-12-28', '2026-01-02', 'month').length, 2); // across a year end
});

test('labels, durations and ticks', () => {
  assert.equal(bucketLabel('2026-09-14', 'week'), '14 Sep');
  assert.equal(bucketLabel('2026-09-01', 'month'), 'Sep 26');
  assert.equal(formatHours(null), '—');
  assert.equal(formatHours(0.25), '15 min');
  assert.equal(formatHours(6.5), '6.5 h');
  assert.equal(formatHours(30), '30 h');
  assert.equal(formatHours(24 * 3.2), '3.2 days');
  assert.deepEqual(niceTicks(7), [0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(0), [0, 1]);
  assert.equal(parseRange('bogus'), '90d');
  assert.equal(todayIst(new Date('2026-10-01T20:00:00Z')), '2026-10-02'); // 01:30 IST next day
});

test('changeOf never invents a baseline', () => {
  assert.deepEqual(changeOf(5, 0), { pct: null, dir: 'up' });   // new signal, not +100%
  assert.deepEqual(changeOf(0, 0), { pct: null, dir: 'flat' });
  assert.deepEqual(changeOf(12, 10), { pct: 20, dir: 'up' });
  assert.deepEqual(changeOf(8, 10), { pct: -20, dir: 'down' });
  assert.deepEqual(changeOf(10, 10), { pct: 0, dir: 'flat' });
});

test('bucketWindow covers the whole clicked period', () => {
  assert.deepEqual(bucketWindow('2026-10-02', 'day'), { from: '2026-10-02', to: '2026-10-02' });
  assert.deepEqual(bucketWindow('2026-10-02', 'week'), { from: '2026-09-28', to: '2026-10-04' });
  assert.deepEqual(bucketWindow('2026-10-02', 'month'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(bucketWindow('2026-02-01', 'month'), { from: '2026-02-01', to: '2026-02-28' }); // leap year
});

test('a drilldown keeps the query before the hash so the server sees the filters', () => {
  const href = explorerHref({ range: '90d', source: 'all' }, { status: 'RESOLVED', page: '3' });
  const url = new URL(href, 'https://example.test');
  assert.equal(url.pathname, '/analytics');
  assert.equal(url.hash, '#explorer');
  assert.equal(url.searchParams.get('range'), '90d');
  assert.equal(url.searchParams.get('status'), 'RESOLVED');
  assert.equal(url.searchParams.get('page'), null); // a new filter starts at page one
  assert.ok(!href.includes('#explorer?'), 'filters must not end up inside the fragment');
});

test('drilldowns merge onto the dashboard filters and can clear one', () => {
  const base = { range: '12m', source: 'whatsapp' };
  assert.equal(
    explorerHref(base, { tile: 'A-101', review: '1' }),
    '/analytics?range=12m&source=whatsapp&tile=A-101&review=1#explorer',
  );
  // A falsy value removes the filter, which is how the explorer's chips work.
  assert.equal(explorerHref({ ...base, tile: 'A-101' }, { tile: '' }), '/analytics?range=12m&source=whatsapp#explorer');
  assert.equal(explorerHref(base), '/analytics?range=12m&source=whatsapp#explorer');
  assert.equal(explorerHref({}), '/analytics#explorer');
});

test('explorerQuery drops empty values and keeps order stable', () => {
  assert.equal(explorerQuery({ issue: 'WATER_LEAK', status: '', tile: 'B-2' }), 'issue=WATER_LEAK&tile=B-2');
  assert.equal(explorerQuery({}), '');
  assert.equal(parseSource('nope'), 'all');
  assert.equal(parseSource('whatsapp'), 'whatsapp');
});

test('rangeWindow is the date window the explorer filters on', () => {
  const today = '2026-10-05';
  assert.deepEqual(rangeWindow('30d', today), { from: '2026-09-06', to: '2026-10-05' });
  assert.deepEqual(rangeWindow('90d', today), { from: '2026-07-08', to: '2026-10-05' });
  assert.deepEqual(rangeWindow('12m', today), { from: '2025-10-06', to: '2026-10-05' });
  // "All time" has no lower bound, which is why from is nullable everywhere downstream.
  assert.deepEqual(rangeWindow('all', today), { from: null, to: '2026-10-05' });
  // A hand-edited URL falls back to the default window instead of taking the page down.
  assert.deepEqual(rangeWindow('nonsense' as RangeKey, today), { from: '2026-07-08', to: '2026-10-05' });
  assert.equal(parseRange(undefined), '90d');
});

/**
 * Every filter a dashboard card can drill down with has to survive the URL round trip, otherwise the
 * explorer silently drops the filter and shows the wrong cases. fromParams() used to omit `range`.
 */
test('every explorer filter a card links with is a known key', () => {
  const cards: ExplorerParams[] = [
    { status: 'RESOLVED' },
    { open: '1' },
    { review: '1', reason: 'MISSING_TILE_CODE' },
    { issue: 'WATER_LEAK' },
    { tile: 'A-101' },
    { vendor: 'Modi' },
    { reporter: 'Asha' },
    { status: 'RESOLVED', resolver: 'Ravi' },
    { bucket: '2026-10-01', bucketRange: 'month' },
    { from: '2026-01-01', to: '2026-01-31' },
    { q: '1049' },
  ];
  for (const card of cards) {
    for (const key of Object.keys(card)) {
      assert.ok(EXPLORER_KEYS.includes(key as ExplorerKey), `${key} is not an explorer key`);
    }
    // Whatever the card links with has to be a filter the explorer can clear again.
    if (Object.keys(card).some((k) => k !== 'q')) {
      assert.ok(isFiltered(card), `explorerQuery(${JSON.stringify(card)}) should count as filtered`);
    }
  }
  // The dashboard's own range/source are keys, so they survive the round trip too.
  assert.ok(EXPLORER_KEYS.includes('range'));
  assert.ok(EXPLORER_KEYS.includes('source'));
});
