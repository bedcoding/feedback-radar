import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChannelSummary } from '@feedback-radar/core';
import { countBriefing2Cards, groupBriefing2Cards, safeBriefing2OriginalUrl } from './presentation';
import type { Briefing2RawItem } from './types';

function summary(source: string, service: string, total: number, country = ''): ChannelSummary {
  return {
    date: '2026-09-01', source, service, country, total, negative: 0, urgent: 0,
    bullets: ['첫 문장 그대로.', '둘째 문장 그대로.'], createdAt: '2026-09-01T09:10:11+09:00',
  };
}

test('card counts preserve duplicate summaries and suppress only matching raw scopes', () => {
  const scope = { source: 'googleplay', country: 'KR', service: '서비스 A' };
  assert.equal(countBriefing2Cards({ summaries: [] }), 0);
  assert.equal(countBriefing2Cards({
    summaries: [scope, scope],
    rawItems: [scope, { ...scope, country: 'JP' }, { ...scope, service: '서비스 B' }, { source: 'x' }, { source: 'x', country: '', service: '' }],
  }), 5);
});

test('groups preserve service totals, channel priority, ties, raw list order and input data', () => {
  const summaries = [
    summary('naver-blog', '서비스 A', 100),
    summary('x', '서비스 A', 8),
    summary('threads', '서비스 A', 8),
    summary('googleplay', '서비스 B', 10, 'KR'),
  ];
  const rawItems: Briefing2RawItem[] = [
    { id: 1, source: 'dcinside', service: '서비스 A', text: '첫 원문 그대로.' },
    { id: 2, source: 'googleplay', service: '서비스 B', country: 'KR', text: '요약과 같은 범위' },
    { id: 3, source: 'dcinside', service: '서비스 A', text: '둘째 원문 그대로.' },
    { id: 4, source: 'googleplay', service: '서비스 B', country: 'JP', text: '다른 국가' },
  ];
  const before = JSON.stringify({ summaries, rawItems });
  const groups = groupBriefing2Cards({ summaries, rawItems });
  assert.deepEqual(groups.map(group => [group.service, group.total]), [['서비스 A', 118], ['서비스 B', 11]]);
  assert.deepEqual(groups[0].cards.map(card => card.kind === 'sum' ? card.summary.source : card.source), ['x', 'threads', 'dcinside', 'naver-blog']);
  const rawCard = groups[0].cards[2];
  assert.equal(rawCard.kind, 'raw');
  if (rawCard.kind === 'raw') assert.deepEqual(rawCard.items, [rawItems[0], rawItems[2]]);
  const firstSummary = groups[0].cards[0];
  assert.equal(firstSummary.kind, 'sum');
  if (firstSummary.kind === 'sum') assert.equal(firstSummary.summary, summaries[1]);
  assert.equal(groups.flatMap(group => group.cards).length, countBriefing2Cards({ summaries, rawItems }));
  assert.equal(JSON.stringify({ summaries, rawItems }), before);
});

test('duplicate summary entries remain separate cards in input order', () => {
  const summaries = [summary('x', '', 3), summary('x', '', 3)];
  const groups = groupBriefing2Cards({ summaries, rawItems: [{ id: 1, source: 'x', text: '중복 범위' }] });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].total, 6);
  assert.equal(groups[0].cards.length, 2);
  assert.deepEqual(groups[0].cards.map(card => card.kind === 'sum' && card.summary), summaries);
});

test('external original links retain exact http(s) URLs and reject other protocols', () => {
  for (const value of ['https://example.com/a?q=%ED%95%9C%EA%B8%80#part', 'http://example.com/post/1', 'HTTPS://example.com/X']) {
    assert.equal(safeBriefing2OriginalUrl(value), value);
  }
  for (const value of [undefined, null, 17, '', '/relative', '//example.com/a', 'javascript:alert(1)', 'data:text/html,hello', 'file:///private/item', 'mailto:reader@example.com']) {
    assert.equal(safeBriefing2OriginalUrl(value), undefined);
  }
});
