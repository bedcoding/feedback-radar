import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInThisContext } from 'node:vm';
import { createElement } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import type { ChannelSummary } from '@feedback-radar/core';
import type { Briefing2CardProps } from './Briefing2Card';
import type { Briefing2ItemScope } from './types';
import * as navigation from './navigation';
import * as presentation from './presentation';

/** Run the actual server renderer with its real pure helpers. The import
 * boundary prevents CSS, client effects, dashboard/lab renderers, and the core
 * database package from being loaded by this synthetic-data-only suite. */
const rendererCode = ts.transpileModule(readFileSync(new URL('./Briefing2Card.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const module = { exports: {} as { Briefing2Card: (props: Briefing2CardProps) => React.ReactElement } };
const execute = runInThisContext(`(function(require, module, exports) { ${rendererCode}\n})`);
execute((name: string) => {
  if (name === 'react/jsx-runtime') return jsxRuntime;
  if (name === './navigation') return navigation;
  if (name === './presentation') return presentation;
  if (name === './Briefing2Controls') return {
    Briefing2ExpandButton: () => createElement('button', { type: 'button', className: 'briefing-expand' }, '모두 펼치기'),
  };
  if (name === '@feedback-radar/core') return {
    countryName: (country: string) => ({ KR: '대한민국', JP: '일본' })[country as 'KR' | 'JP'] ?? country,
    countryFlag: (country: string) => ({ KR: '🇰🇷', JP: '🇯🇵' })[country as 'KR' | 'JP'] ?? country,
  };
  throw new Error(`Unexpected renderer import: ${name}`);
}, module, module.exports);
const Briefing2Card = module.exports.Briefing2Card;

function summary(overrides: Partial<ChannelSummary> = {}): ChannelSummary {
  return {
    date: '2026-09-01', source: 'googleplay', service: '서비스 A', country: 'KR',
    total: 12, negative: 4, urgent: 1, bullets: ['첫 문장 그대로.', '둘째 문장 그대로.'],
    createdAt: '2026-09-01T09:10:11+09:00', ...overrides,
  };
}

function render(overrides: Partial<Briefing2CardProps> = {}): string {
  return renderToStaticMarkup(createElement(Briefing2Card, {
    date: '2026-09-01', dates: ['2026-09-01'], summaries: [], trend: [],
    location: navigation.BRIEFING2_PREVIEW_LOCATION, ...overrides,
  }));
}

const escapedText = (text: string): string => renderToStaticMarkup(createElement('span', null, text)).slice(6, -7);
const occurrences = (html: string, value: string): number => html.split(value).length - 1;
const hrefs = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
function assertDateForm(html: string, action: string) {
  const form = html.match(/<form\b[^>]*>/)?.[0] ?? '';
  for (const attribute of ['class="briefing-datepick"', 'method="get"', `action="${action}"`]) {
    assert.ok(form.includes(attribute), `Expected ${attribute} in ${form}`);
  }
}

test('explicit 07 markup retains stored bullet/raw/feedback order, usage, latest time and trend before the global footer', () => {
  const bullets = [' 첫째 <문장> & 그대로. ', '둘째\n줄도 그대로.', ''];
  const first = summary({ bullets, inputTokens: 1234, outputTokens: 25, costUsd: 0.1, model: 'model-a' });
  const second = summary({ source: 'threads', service: '서비스 B', country: '', total: 3, negative: 0,
    bullets: ['B의 저장된 문장.'], inputTokens: 66, outputTokens: 75, costUsd: 0.0234, model: 'model-b',
    createdAt: '2026-09-01T17:04:59+09:00' });
  const props: Partial<Briefing2CardProps> = {
    summaries: [first, second],
    rawItems: [
      { id: 1, source: 'x', service: '서비스 A', text: '첫 원문 <&> '.repeat(30), time: '12:34', rating: 0, category: '기능', sentiment: 'negative' },
      { id: 2, source: 'x', service: '서비스 A', text: '두 번째 원문.' },
      { id: 3, source: 'googleplay', service: '서비스 A', country: 'KR', text: '요약과 범위가 같아서 원문 카드에 중복하지 않는 글' },
    ],
    negatives: { 'googleplay|KR|서비스 A': [
      { id: 41, text: '첫 피드백 그대로.', rating: 1 },
      { id: 42, text: '둘째 피드백 <&> 그대로.', url: 'https://example.com/feedback?part=2&view=full' },
    ] },
    trend: [
      { date: '2026-09-01', source: 'googleplay', country: 'KR', count: 12, negative: 4 },
      { date: '2026-08-31', source: 'googleplay', country: 'KR', count: 6, negative: 1 },
      { date: '2026-09-01', source: 'x', country: '', count: 2, negative: 0 },
    ],
    pendingCount: 1234,
  };
  const before = JSON.stringify(props);
  const html = render(props);
  assert.equal(JSON.stringify(props), before);
  assert.ok(html.includes(`<ul class="briefing-bullets">${bullets.map(bullet => `<li>${escapedText(bullet)}</li>`).join('')}</ul>`));
  assert.ok(html.indexOf(escapedText(props.rawItems![0].text)) < html.indexOf('두 번째 원문.'));
  assert.ok(html.indexOf('첫 피드백 그대로.') < html.indexOf(escapedText('둘째 피드백 <&> 그대로.')));
  assert.ok(!html.includes('요약과 범위가 같아서 원문 카드에 중복하지 않는 글'));
  assert.ok(html.includes('<span class="t">12:34</span><span class="c">0점</span><span class="c">기능</span>'));
  assert.ok(html.includes('<li class="neg">'));
  assert.equal(occurrences(html, '<div class="briefing-platform-card"><article class="briefing-ch'), 3);
  assert.equal(occurrences(html, '<section class="briefing-group"'), 2);
  assert.equal(occurrences(html, '<header class="briefing-service-head"><h3 class="bg-name">'), 2);
  assert.ok(!html.includes('<details class="briefing-group"'));
  assert.ok(!html.includes('<h2') && !html.includes('🧠') && !html.includes('type="checkbox"'));
  assert.match(html, /<strong>구글플레이<\/strong><span class="briefing-country" title="대한민국">🇰🇷<\/span><span class="briefing-count">전체 12건<\/span>/);
  assert.match(html, /<\/ul><details class="briefing-feedback"><summary class="briefing-feedback-toggle">사용자 피드백 2건<\/summary>/);
  assert.match(html, /<span class="briefing-usage" title="model-a, model-b">입력 1,300 \/ 출력 100 토큰, 환산 \$0\.1234 <time class="briefing-generated-at" dateTime="2026-09-01T17:04:59\+09:00"/);
  assert.ok(html.includes('요약 생성 시각 2026-09-01T17:04:59+09:00'));
  assert.ok(html.includes('(17:04)</time></span><button type="button" class="briefing-expand">'));
  assert.ok(html.includes('작성일 기준 최근 2일 채널별 언급량'));
  assert.ok(html.includes('style="height:50%" title="2026-08-31 6건 (부정 1)"'));
  assert.ok(html.includes('style="height:0%" title="2026-08-31 0건"'));
  assert.ok(html.includes('<span class="trend-total">18</span>'));
  assert.ok(html.includes('<div class="trend-axis"><span></span><div><span>8/31</span><span>9/1</span></div>'));
  assert.match(html, /<footer class="briefing-data-status" title="선택한 날짜·서비스와 관계없는 전체 자료 기준입니다\.">전체 자료 중 미분류 1,234건<\/footer><\/section>$/);
  assert.ok(html.indexOf('class="briefing-trend"') < html.indexOf('class="briefing-data-status"'));
});

test('renderer applies safe original URLs to caller-supplied raw posts and feedback without changing their text', () => {
  const safeRaw = 'http://example.com/raw?part=1&exact=%20#saved';
  const safeFeedback = 'HTTPS://example.com/feedback?q=%EA%B8%80#part';
  const html = render({
    summaries: [summary()],
    rawItems: [
      { id: 1, source: 'x', text: '원문 링크', url: safeRaw },
      { id: 2, source: 'x', text: '위험 원문도 문장은 남음', url: 'javascript:alert(1)' },
      { id: 3, source: 'x', text: '상대 주소 원문', url: '/private' },
    ],
    negatives: { 'googleplay|KR|서비스 A': [
      { id: 4, text: '피드백 링크', url: safeFeedback, rating: 0 },
      { id: 5, text: '파일 주소 피드백', url: 'file:///private/item' },
      { id: 6, text: '데이터 주소 피드백', url: 'data:text/html,hello' },
    ] },
  });
  assert.ok(hrefs(html).includes(safeRaw));
  assert.ok(hrefs(html).includes(safeFeedback));
  assert.equal(occurrences(html, 'target="_blank" rel="noreferrer"'), 2);
  assert.ok(html.includes('위험 원문도 문장은 남음</li>'));
  assert.ok(html.includes('상대 주소 원문</li>'));
  assert.ok(html.includes('<span>파일 주소 피드백</span>'));
  assert.ok(html.includes('<span>데이터 주소 피드백</span>'));
  assert.ok(html.includes('<span class="briefing-neg-rating">0점</span>'));
  assert.ok(!html.includes('javascript:') && !html.includes('file:') && !html.includes('data:text'));
});

test('empty, zero-pending and summary-without-token states show only available metadata', () => {
  const empty = render({ dates: [], pendingCount: 0 });
  assert.ok(empty.includes('<p class="briefing-empty">2026-09-01에 작성된 글이 없습니다.</p>'));
  for (const className of ['briefing-data-status', 'briefing-usage', 'briefing-generated-at', 'briefing-feedback', 'briefing-trend']) {
    assert.ok(!empty.includes(`class="${className}"`));
  }
  const pending = render({ dates: [], pendingCount: 2 });
  assert.match(pending, /<\/p><footer class="briefing-data-status"[^>]*>전체 자료 중 미분류 2건<\/footer><\/section>$/);
  assert.ok(!pending.includes('briefing-usage'));
  const timeOnly = render({ summaries: [summary({ inputTokens: 0, outputTokens: 10, costUsd: 0 })], pendingCount: 0,
    trend: [{ date: '2026-09-01', source: 'googleplay', country: 'KR', count: 12, negative: 4 }] });
  assert.ok(timeOnly.includes('<span class="briefing-usage"><time class="briefing-generated-at"'));
  assert.ok(timeOnly.includes('(09:10)</time></span>'));
  assert.ok(!timeOnly.includes(' 토큰') && !timeOnly.includes('briefing-trend') && !timeOnly.includes('briefing-data-status'));
  const noTime = render({ summaries: [summary({ createdAt: '' })] });
  assert.ok(!noTime.includes('briefing-generated-at') && !noTime.includes('briefing-usage'));
});

test('native GET calendar is always available and preserves host location, tab and selected service', () => {
  for (const dates of [[], ['2026-09-01']]) {
    const preview = render({ dates, date: '2024-02-29', selectedService: '서비스 A' });
    assertDateForm(preview, '/briefing2-preview');
    assert.ok(preview.includes('type="hidden" name="service" value="서비스 A"'));
    assert.ok(!preview.includes('type="hidden" name="tab"'));
    const dateInput = preview.match(/<input type="date"[^>]*>/)?.[0] ?? '';
    for (const attribute of ['name="sdate"', 'required=""', 'value="2024-02-29"', 'list="briefing2-available-dates"']) {
      assert.ok(dateInput.includes(attribute), `Expected ${attribute} in ${dateInput}`);
    }
    assert.ok(!preview.includes(' min=') && !preview.includes(' max='));
  }
  const service = '서비스 A & B';
  const dates = ['2026-09-06', '2026-09-05', '2026-09-04', '2026-09-03', '2026-09-02', '2026-09-01', '2026-08-31', '2026-08-30', '2026-08-29'];
  const tab = render({ date: '2026-08-29', dates, selectedService: service, location: navigation.BRIEFING2_TAB_LOCATION });
  assertDateForm(tab, '/');
  assert.ok(tab.includes('type="hidden" name="tab" value="brief2"'));
  assert.ok(tab.includes('type="hidden" name="service" value="서비스 A &amp; B"'));
  const dateLinks = hrefs(tab).map(href => new URL(href, 'https://fixture.invalid'));
  assert.equal(dateLinks.length, 8);
  assert.deepEqual(dateLinks.map(url => url.searchParams.get('sdate')), [...dates.slice(0, 7), '2026-08-29']);
  for (const url of dateLinks) {
    assert.equal(url.pathname, '/');
    assert.equal(url.searchParams.get('tab'), 'brief2');
    assert.equal(url.searchParams.get('service'), service);
  }
  assert.match(tab, /<a class="on" href="[^"]*sdate=2026-08-29[^"]*">8\/29<\/a>/);
  assert.equal(occurrences(tab, '<option value='), dates.length);
});

test('injected list links receive exact card/feedback scopes and omission leaves counts as text', () => {
  const calls: Briefing2ItemScope[] = [];
  const data: Partial<Briefing2CardProps> = {
    summaries: [summary({ negative: 3 })],
    rawItems: [{ id: 3, source: 'x', service: '서비스 A', text: '원문 자체 링크', url: 'https://example.com/original' }],
    negatives: { 'googleplay|KR|서비스 A': [{ id: 1, text: '저장된 피드백' }] },
  };
  const linked = render({ ...data, itemsHref(scope) {
    calls.push({ ...scope });
    const query = new URLSearchParams({ source: scope.source, service: scope.service, country: scope.country });
    if (scope.sentiment) query.set('sentiment', scope.sentiment);
    return `/future-items?${query}`;
  } });
  assert.deepEqual(calls, [
    { source: 'googleplay', service: '서비스 A', country: 'KR', sentiment: 'negative' },
    { source: 'googleplay', service: '서비스 A', country: 'KR' },
    { source: 'x', service: '서비스 A', country: '' },
  ]);
  assert.equal(occurrences(linked, '<a class="briefing-count"'), 2);
  assert.ok(linked.includes('채널별에서 더 보기 · 전체 기간</a>'));
  assert.ok(hrefs(linked).some(href => href.startsWith('/future-items?') && new URL(href, 'https://fixture.invalid').searchParams.get('sentiment') === 'negative'));
  const preview = render(data);
  assert.equal(occurrences(preview, '<span class="briefing-count"'), 2);
  assert.ok(!preview.includes('<a class="briefing-count"') && !preview.includes('briefing-neg-more') && !preview.includes('/future-items'));
  assert.ok(hrefs(preview).includes('https://example.com/original'));
});
