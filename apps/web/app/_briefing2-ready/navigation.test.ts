import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefing2Href, isBriefingDate, readBriefing2Query, BRIEFING2_PREVIEW_LOCATION, BRIEFING2_TAB_LOCATION } from './navigation';

test('calendar dates have no timezone conversion and reject rollover', () => {
  for (const date of ['2026-08-20', '2028-02-29']) assert.equal(isBriefingDate(date), true);
  for (const date of [undefined, '', '2026-02-29', '2026-13-01', '2026-08-20T00:00:00Z', '26-8-20']) assert.equal(isBriefingDate(date), false);
});

test('preview and future tab routes preserve date/service but not lab parameters', () => {
  for (const location of [BRIEFING2_PREVIEW_LOCATION, BRIEFING2_TAB_LOCATION]) {
    const url = new URL(briefing2Href(location, { date: '2026-08-20', service: ' 다서비스 & 서비스 ' }), 'http://localhost');
    assert.equal(url.pathname, location.pathname);
    assert.equal(url.searchParams.get('tab'), location.tab ?? null);
    assert.equal(url.searchParams.get('sdate'), '2026-08-20');
    assert.equal(url.searchParams.get('service'), '다서비스 & 서비스');
    assert.equal(url.searchParams.has('view'), false);
    const all = new URL(briefing2Href(location, { date: '2026-08-20' }), 'http://localhost');
    assert.equal(all.searchParams.has('service'), false);
    assert.equal(all.searchParams.get('sdate'), '2026-08-20');
  }
});

test('invalid dates are not propagated and repeated query values use the first value', () => {
  assert.equal(briefing2Href(BRIEFING2_PREVIEW_LOCATION, { date: 'invalid', service: '  ' }), '/briefing2-preview');
  assert.deepEqual(readBriefing2Query({ sdate: ['2026-08-20', '2026-08-19'], service: ['다서비스', '라서비스'], view: '7' }), { sdate: '2026-08-20', service: '다서비스' });
  assert.deepEqual(readBriefing2Query({}), { sdate: undefined, service: undefined });
});
