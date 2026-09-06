import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import type { Briefing2Query, Briefing2ReadyResult } from './types';

type Row = Record<string, unknown>;
type ReadFixture = {
  config?: unknown;
  postedDates?: Row[];
  availableDates?: Row[];
  services?: Row[];
  summaries?: Row[];
  items?: Row[];
  trend?: Row[];
  pending?: Row[];
  failSql?: string;
  failConnect?: boolean;
};
type QueryCall = { sql: string; params?: unknown[] };

const compile = (file: string) => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaderCode = compile('./loadData.ts');
const navigationCode = compile('./navigation.ts');

function evaluate(code: string, require: (name: string) => unknown): Record<string, unknown> {
  const module = { exports: {} };
  const execute = runInThisContext(`(function(require, module, exports) { ${code}\n})`);
  execute(require, module, module.exports);
  return module.exports;
}

/** Execute the real loader against an in-memory SQL boundary. An unexpected
 * import or query fails immediately; this suite never opens a database. */
function mockedLoader(fixture: ReadFixture = {}) {
  const calls: QueryCall[] = [];
  const lifecycle = { env: 0, open: 0, connect: 0, release: 0, end: 0 };
  const client = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params: params && [...params] });
      if (fixture.failSql && sql.includes(fixture.failSql)) throw new Error('injected read failure');
      if (/^(BEGIN |COMMIT$|ROLLBACK$)/.test(sql)) return { rows: [] };
      if (sql.startsWith('SELECT value FROM')) return { rows: fixture.config === undefined ? [] : [{ value: fixture.config }] };
      if (sql.startsWith('SELECT date FROM (')) return { rows: fixture.availableDates ?? [] };
      if (sql.startsWith('SELECT SUBSTRING(posted_at,1,10) AS date FROM')) return { rows: fixture.postedDates ?? [] };
      if (sql.startsWith('SELECT service FROM')) return { rows: fixture.services ?? [] };
      if (sql.startsWith('SELECT * FROM')) return { rows: fixture.summaries ?? [] };
      if (sql.startsWith('SELECT id, source,')) return { rows: fixture.items ?? [] };
      if (sql.startsWith("SELECT SUBSTRING(posted_at,1,10) AS date, source, COALESCE")) return { rows: fixture.trend ?? [] };
      if (sql.startsWith('SELECT COUNT(*) AS count FROM')) return { rows: fixture.pending ?? [] };
      throw new Error(`Unexpected query: ${sql}`);
    },
    release() { lifecycle.release++; },
  };
  const navigation = evaluate(navigationCode, name => { throw new Error(`Unexpected navigation import: ${name}`); });
  const exported = evaluate(loaderCode, name => {
    if (name === './navigation') return navigation;
    if (name !== '@feedback-radar/core') throw new Error(`Unexpected loader import: ${name}`);
    return {
      CONFIG_KEY: 'fixture-config', RELEVANT: 'is_relevant = 1',
      localDate: () => '2026-09-06',
      loadPrivateEnv() { lifecycle.env++; },
      async openPostgresDb(options: unknown) {
        lifecycle.open++;
        assert.deepEqual(options, { readOnly: true });
        return {
          schema: 'fixture',
          pool: {
            async connect() { lifecycle.connect++; if (fixture.failConnect) throw new Error('injected connection failure'); return client; },
            async end() { lifecycle.end++; },
          },
        };
      },
    };
  });
  return { load: exported.loadBriefing2ReadyData as (query: Briefing2Query) => Promise<Briefing2ReadyResult>, calls, lifecycle };
}

test('keeps complete saved data, scope, stable feedback ranking and global status in one read-only snapshot', async () => {
  const longRaw = 'raw '.repeat(70);
  const longSummary = 'summary '.repeat(30);
  const severities = ['low', 'critical', 'high', 'medium', 'critical', 'low', 'high', 'medium', 'critical', 'low', 'high', 'medium'];
  const items = severities.map((severity, index) => ({
    id: String(20 - index), source: 'x', service: '다서비스', country: null, sentiment: 'negative', category: 'feature',
    summary: index === 0 ? '  ' : index === 1 ? `  ${longSummary}  ` : `fixture ${index}`,
    content: longRaw, url: index === 0 ? 'javascript:alert(1)' : `https://example.com/${index}`,
    rating: index === 1 ? '0' : null, severity, posted_at: index === 0 ? '2026-08-20T00:00:00+09:00' : '2026-08-20T14:32:00+09:00',
  }));
  const fixture: ReadFixture = {
    config: JSON.stringify({ displayName: '  My Radar  ', services: [{ name: '다서비스' }, { name: '설정만' }, { name: '다서비스' }, { name: '' }] }),
    postedDates: [{ date: '2026-09-05' }, { date: '2026-08-20' }],
    services: [{ service: '나서비스' }, { service: '가서비스' }, { service: '다서비스' }, { service: '' }, { service: null }],
    summaries: [{ date: '2026-08-20', source: 'x', service: '다서비스', country: null, total: '22', negative: '12', urgent: '3',
      bullets: '[" original bullet ",7,"", "second"]', model: 'model-a', input_tokens: '100', output_tokens: '25', cost_usd: '0.1234', created_at: '2026-08-21T10:56:12+09:00' }],
    items,
    trend: [{ date: '2026-09-01', source: 'x', country: '', count: '9', negative: '2' }],
    pending: [{ count: '1234' }],
  };
  const before = JSON.stringify(fixture);
  const { load, calls, lifecycle } = mockedLoader(fixture);
  const result = await load({ sdate: '2026-08-20', service: '  다서비스  ' });
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(result.displayName, 'My Radar');
  assert.equal(result.selectedService, '다서비스');
  assert.deepEqual(result.serviceOptions, ['다서비스', '설정만', '가서비스', '나서비스']);
  assert.equal(result.notice, undefined);
  assert.deepEqual(result.data.summaries[0], {
    date: '2026-08-20', source: 'x', service: '다서비스', country: '', total: 22, negative: 12, urgent: 3,
    bullets: [' original bullet ', '', 'second'], model: 'model-a', inputTokens: 100, outputTokens: 25, costUsd: 0.1234, createdAt: '2026-08-21T10:56:12+09:00',
  });
  assert.equal(result.data.rawItems?.length, 12);
  assert.equal(result.data.rawItems?.[0].text, longRaw.replace(/\s+/g, ' ').slice(0, 160));
  assert.equal(result.data.rawItems?.[0].url, undefined);
  assert.equal(result.data.rawItems?.[0].time, undefined);
  assert.equal(result.data.rawItems?.[1].text, longSummary.trim());
  assert.equal(result.data.rawItems?.[1].rating, 0);
  assert.equal(result.data.rawItems?.[1].time, '14:32');
  assert.deepEqual(result.data.negatives?.['x||다서비스'].map(item => item.id), [19, 16, 12, 18, 14, 10, 17, 13]);
  assert.equal(result.data.negatives?.['x||다서비스'][0].text, longSummary.trim());
  assert.deepEqual(result.data.trend, [{ date: '2026-09-01', source: 'x', country: '', count: 9, negative: 2 }]);
  assert.equal(result.data.pendingCount, 1234);
  assert.deepEqual(result.data.dates, ['2026-09-05', '2026-08-20']);
  assert.deepEqual(lifecycle, { env: 1, open: 1, connect: 1, release: 1, end: 1 });
  assert.equal(calls[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(calls.at(-1)?.sql, 'COMMIT');
  assert.equal(calls.filter(call => call.sql.startsWith('SELECT id, source,')).length, 1);
  assert.equal(calls.some(call => call.sql.includes('LIMIT 3') || call.sql.includes('LEFT(content')), false);
  assert.equal(calls.some(call => call.sql.startsWith('SELECT date FROM (')), false);
  const summary = calls.find(call => call.sql.startsWith('SELECT * FROM'))!;
  assert.deepEqual(summary.params, ['2026-08-20', '다서비스']);
  assert.ok(summary.sql.endsWith('AND service = $2 ORDER BY total DESC'));
  const body = calls.find(call => call.sql.startsWith('SELECT id, source,'))!;
  assert.deepEqual(body.params, ['2026-08-20', '다서비스']);
  assert.ok(body.sql.endsWith('ORDER BY posted_at DESC, id DESC'));
  assert.deepEqual(calls.find(call => call.sql.includes('SUM(CASE'))?.params, ['2026-08-31', '다서비스']);
  const pending = calls.find(call => call.sql.startsWith('SELECT COUNT(*)'))!;
  assert.equal(pending.sql, 'SELECT COUNT(*) AS count FROM "fixture"."items" WHERE tagged_at IS NULL');
  assert.equal(pending.params, undefined);
  assert.deepEqual(calls.find(call => call.sql.startsWith('SELECT service FROM'))?.params, ['2026-08-20']);
  assert.deepEqual(calls.find(call => call.sql.includes('GROUP BY date ORDER BY date DESC LIMIT $1'))?.params, [400]);
});

test('chooses a valid saved default day but keeps original posted-date choices and a valid empty request', async () => {
  const defaults = [
    { available: ['invalid', '2026-09-07', '2026-09-06', '2026-09-04'], expected: '2026-09-04' },
    { available: ['2026-09-07', '2026-09-06'], expected: '2026-09-07' },
    { available: ['not-a-date', '2026-02-30'], expected: '2026-09-06' },
  ];
  for (const { available, expected } of defaults) {
    for (const requested of [undefined, '2026-02-30']) {
      const { load, calls } = mockedLoader({ postedDates: [{ date: '2026-08-20' }], availableDates: available.map(date => ({ date })) });
      const result = await load({ sdate: requested, service: '   ' });
      assert.equal(result.data.date, expected);
      assert.deepEqual(result.data.dates, ['2026-08-20']);
      assert.equal(result.selectedService, undefined);
      assert.equal(Boolean(result.notice), requested !== undefined);
      assert.equal(result.displayName, '피드백 레이더');
      assert.equal(calls.filter(call => call.sql.startsWith('SELECT date FROM (')).length, 1);
      assert.deepEqual(calls.find(call => call.sql.startsWith('SELECT * FROM'))?.params, [expected]);
    }
  }
  const { load, calls } = mockedLoader({ config: '{broken', postedDates: [{ date: '2026-09-05' }] });
  const empty = await load({ sdate: '2024-02-29', service: "  unknown'--  " });
  assert.equal(empty.data.date, '2024-02-29');
  assert.equal(empty.selectedService, "unknown'--");
  assert.deepEqual(empty.data.summaries, []);
  assert.deepEqual(empty.data.rawItems, []);
  assert.equal(empty.data.pendingCount, 0);
  assert.equal(empty.notice, undefined);
  assert.equal(calls.some(call => call.sql.includes("unknown'--")), false);
  assert.deepEqual(calls.find(call => call.sql.startsWith('SELECT * FROM'))?.params, ['2024-02-29', "unknown'--"]);
});

test('preserves source/country feedback scopes, raw fallback lengths and optional metadata', async () => {
  const { load } = mockedLoader({
    summaries: [{ date: '2026-08-20', source: 'x', service: '', country: 'JP', bullets: 'not-json', created_at: '' }],
    items: [
      { id: 1, source: 'x', service: null, country: 'JP', sentiment: 'negative', content: 'a'.repeat(200), posted_at: '2026-08-20T10:00:00Z', severity: null, url: 'https://example.com/' },
      { id: 2, source: 'x', service: null, country: 'KR', sentiment: 'negative', content: '   a \n b   ', posted_at: '2026-08-20', severity: 'unknown', url: 'file:///private' },
      { id: 3, source: 'x', service: null, country: 'KR', sentiment: 'positive', summary: ' saved ', content: 'unused', posted_at: '2026-08-20Tab:cd:00Z' },
    ],
  });
  const result = await load({ sdate: '2026-08-20' });
  assert.deepEqual(result.data.summaries[0].bullets, []);
  assert.equal(result.data.summaries[0].inputTokens, undefined);
  assert.equal(result.data.summaries[0].model, undefined);
  assert.equal(result.data.rawItems?.[0].text.length, 160);
  assert.equal(result.data.negatives?.['x|JP|'][0].text.length, 120);
  assert.equal(result.data.negatives?.['x|KR|'].length, 1);
  assert.equal(result.data.rawItems?.[1].text, ' a b ');
  assert.equal(result.data.rawItems?.[1].url, undefined);
  assert.equal(result.data.rawItems?.[1].time, undefined);
  assert.equal(result.data.rawItems?.[2].text, 'saved');
  assert.equal(result.data.rawItems?.[2].time, undefined);
});

test('rolls back a failed read and always releases client and pool', async () => {
  const { load, calls, lifecycle } = mockedLoader({ failSql: 'SELECT id, source,' });
  await assert.rejects(load({ sdate: '2026-08-20' }), /injected read failure/);
  assert.equal(calls.at(-1)?.sql, 'ROLLBACK');
  assert.equal(calls.some(call => call.sql === 'COMMIT'), false);
  assert.equal(lifecycle.release, 1);
  assert.equal(lifecycle.end, 1);
  const connectFailure = mockedLoader({ failConnect: true });
  await assert.rejects(connectFailure.load({}), /injected connection failure/);
  assert.equal(connectFailure.lifecycle.release, 0);
  assert.equal(connectFailure.lifecycle.end, 1);
});
