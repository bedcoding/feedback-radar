import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBriefing2ChannelHref } from './channelNavigation';
import type { Briefing2ItemScope } from './types';

const service = '다서비스 & 서비스 / + ?';
const scope: Briefing2ItemScope = { source: 'googleplay', service, country: 'kr' };

function readUrl(href: string | undefined): URL {
  assert.equal(typeof href, 'string');
  return new URL(href!, 'https://fixture.invalid');
}

test('count links open the exact channel, configured service and country for the full period', () => {
  const url = readUrl(createBriefing2ChannelHref([service])(scope));
  assert.equal(url.origin, 'https://fixture.invalid');
  assert.equal(url.pathname, '/');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    tab: 'channels', period: 'all', source: 'googleplay', service, country: 'kr',
  });
});

test('community scopes without a country explicitly select none and preserve sentiment', () => {
  const hrefFor = createBriefing2ChannelHref([service], '/tour');
  for (const source of ['x', 'threads', 'naver-blog', 'naver-cafe', 'theqoo', 'dcinside']) {
    const url = readUrl(hrefFor({ source, service, country: '', sentiment: 'negative' }));
    assert.equal(url.pathname, '/tour');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      tab: 'channels', period: 'all', source, service, country: 'none', sentiment: 'negative',
    });
  }
  for (const sentiment of ['positive', 'neutral']) {
    assert.equal(readUrl(hrefFor({ ...scope, sentiment })).searchParams.get('sentiment'), sentiment);
  }
});

test('date and stale list filters cannot carry into a count link', () => {
  const originalScope = {
    ...scope, sdate: '2026-08-20', period: 'today', range: 'custom',
    from: '2026-08-01', to: '2026-08-20', filter: 'irrelevant',
    page: '8', cat: '기능', lang: 'ja', tab: 'items',
  };
  const url = readUrl(createBriefing2ChannelHref([service])(originalScope));
  assert.deepEqual([...url.searchParams.keys()].sort(), ['country', 'period', 'service', 'source', 'tab']);
  assert.equal(url.searchParams.get('period'), 'all');
  assert.equal(url.searchParams.get('tab'), 'channels');
  assert.equal(originalScope.period, 'today');
});

test('empty and unconfigured services cannot silently widen to all services', () => {
  const hrefFor = createBriefing2ChannelHref([service]);
  for (const unsupported of ['', '삭제된 서비스', ` ${service}`, `${service} `]) {
    assert.equal(hrefFor({ ...scope, service: unsupported }), undefined, unsupported);
  }
  assert.equal(createBriefing2ChannelHref([])(scope), undefined);
});

test('ambiguous store countries and unsupported country formats remain unlinked', () => {
  const hrefFor = createBriefing2ChannelHref([service]);
  for (const source of ['googleplay', 'appstore']) {
    assert.equal(hrefFor({ ...scope, source, country: '' }), undefined);
    assert.equal(readUrl(hrefFor({ ...scope, source, country: 'jp' })).searchParams.get('country'), 'jp');
  }
  for (const country of ['KR', ' kr', 'kr ', 'kor', 'k', 'none', 'kr&source=x']) {
    assert.equal(hrefFor({ ...scope, country }), undefined, country);
  }
});

test('unsupported sources and sentiments never produce a broader destination', () => {
  const hrefFor = createBriefing2ChannelHref([service]);
  for (const source of ['', 'GooglePlay', 'source_1', '1source', 'a'.repeat(21), 'x&service=other']) {
    assert.equal(hrefFor({ ...scope, source }), undefined, source);
  }
  for (const sentiment of ['Negative', 'unknown', 'negative&country=jp']) {
    assert.equal(hrefFor({ ...scope, sentiment }), undefined, sentiment);
  }
});

test('all-channel sentinel and legacy grouped-source alias cannot masquerade as an exact source', () => {
  const hrefFor = createBriefing2ChannelHref([service]);
  for (const source of ['all', 'naver']) {
    assert.equal(hrefFor({ ...scope, source, country: '' }), undefined, source);
  }
});
