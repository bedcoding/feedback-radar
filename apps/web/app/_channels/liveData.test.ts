import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';
import type { ItemQuery } from '@feedback-radar/core';
import { ALL_CHANNEL_ID, channels as fallbackChannels } from './data';
import type { ChannelBoardData, ChannelBoardRequest } from './liveData';

const loaderCode = ts.transpileModule(readFileSync(new URL('./liveData.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** The actual loader runs against a read-only mock boundary; no database opens. */
function mockedLoader(options: { counts?: { source: string; count: number }[]; failRead?: boolean } = {}) {
  const calls: { method: string; query?: ItemQuery; limit?: number; offset?: number }[] = [];
  const warnings: string[] = [];
  let closed = 0;
  const store = {
    async countItemsBySource(query: ItemQuery) {
      calls.push({ method: 'countItemsBySource', query });
      if (options.failRead) throw new Error('injected read failure');
      return options.counts ?? [];
    },
    async latestCollectionBySource() {
      calls.push({ method: 'latestCollectionBySource' });
      return [];
    },
    async getRecentItems(limit: number, query: ItemQuery, offset: number) {
      calls.push({ method: 'getRecentItems', query, limit, offset });
      return [];
    },
    async countItems(query: ItemQuery) {
      calls.push({ method: 'countItems', query });
      return 0;
    },
    async close() { closed++; },
  };
  const module = { exports: {} as { loadChannelBoardData: (
    channels: typeof fallbackChannels, label: string, request: ChannelBoardRequest,
  ) => Promise<ChannelBoardData> } };
  const execute = runInThisContext(`(function(require, module, exports, console) { ${loaderCode}\n})`);
  execute((name: string) => {
    if (name === './data') return { ALL_CHANNEL_ID };
    if (name === '@feedback-radar/core') return { openRadarStore: async () => store };
    throw new Error(`Unexpected loader import: ${name}`);
  }, module, module.exports, { warn: (message: string) => warnings.push(message) });
  return {
    load: (query: ItemQuery, selected = ALL_CHANNEL_ID) => module.exports.loadChannelBoardData(
      fallbackChannels, 'fallback fixture', { query, selected, page: 1 },
    ),
    calls,
    warnings,
    closed: () => closed,
  };
}

test('successful empty filtered queries remain live and never expose sample posts', async () => {
  const filters: ItemQuery[] = [
    { service: '서비스 A' }, { country: 'none' }, { sentiment: 'negative' },
    { postedFrom: '2026-09-01' }, { undated: true }, { category: '기능' },
    { lang: 'ko' }, { filter: 'irrelevant' }, { filter: 'untagged' },
  ];
  for (const query of filters) {
    const mock = mockedLoader();
    const result = await mock.load(query);
    assert.equal(result.live, true, JSON.stringify(query));
    assert.deepEqual(result.posts, []);
    assert.equal(result.selectedTotal, 0);
    assert.deepEqual(result.channels.map(channel => [channel.id, channel.count]), [[ALL_CHANNEL_ID, 0]]);
    assert.equal(mock.closed(), 1);
  }
});

test('selected source with zero results keeps its real name when all rail counts are empty', async () => {
  const mock = mockedLoader();
  const result = await mock.load({ filter: 'relevant' }, 'googleplay');
  assert.equal(result.live, true);
  assert.deepEqual(result.posts, []);
  const selected = result.channels.find(channel => channel.id === 'googleplay');
  assert.equal(selected?.name, '구글플레이');
  assert.equal(selected?.count, 0);
  assert.equal(selected?.dataOrigin, 'database');
  assert.deepEqual(selected?.items, []);
  assert.equal(mock.closed(), 1);
});

test('zero-count selected source remains available alongside other matching channels', async () => {
  const mock = mockedLoader({ counts: [{ source: 'threads', count: 4 }] });
  const query: ItemQuery = { filter: 'relevant', service: '서비스 A', country: 'none', sentiment: 'negative' };
  const result = await mock.load(query, 'x');
  assert.equal(result.live, true);
  assert.deepEqual(result.channels.map(channel => [channel.id, channel.count]), [
    [ALL_CHANNEL_ID, 4], ['threads', 4], ['x', 0],
  ]);
  assert.equal(result.channels.find(channel => channel.id === 'x')?.name, 'X');
  assert.deepEqual(mock.calls.find(call => call.method === 'countItemsBySource')?.query, { ...query, source: undefined });
  assert.deepEqual(mock.calls.find(call => call.method === 'getRecentItems'), {
    method: 'getRecentItems', limit: 50, offset: 0, query: { ...query, source: 'x' },
  });
});

test('successful unfiltered empty database retains the existing fallback', async () => {
  for (const query of [{}, { filter: 'all' }, { filter: 'relevant' }] as ItemQuery[]) {
    const mock = mockedLoader();
    const result = await mock.load(query);
    assert.deepEqual(result, { channels: fallbackChannels, label: 'fallback fixture', live: false });
    assert.equal(mock.closed(), 1);
  }
});

test('database read failure retains the existing fallback and closes the store', async () => {
  const mock = mockedLoader({ failRead: true });
  const result = await mock.load({ service: '서비스 A', sentiment: 'negative' }, 'x');
  assert.deepEqual(result, { channels: fallbackChannels, label: 'fallback fixture', live: false });
  assert.equal(mock.warnings.length, 1);
  assert.equal(mock.closed(), 1);
});
