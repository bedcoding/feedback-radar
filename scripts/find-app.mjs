#!/usr/bin/env node
/**
 * 서비스 이름으로 앱스토어·구글플레이 앱 ID를 찾아 준다.
 *
 *   npm run find-app -- "서비스명"
 *
 * 설정에서 손으로 채워야 하는 값 중 앱 ID 두 개는 스토어 페이지를 열어 URL을
 * 뜯어봐야 알 수 있어 제일 번거롭다. 새 머신에서 셋업 시간을 줄이려고 둔 도우미다.
 * 후보만 출력하고 설정 파일은 건드리지 않는다 — 동명 앱을 잘못 집는 사고를 막기 위해서다.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const term = process.argv.slice(2).filter((a) => a !== '--').join(' ').trim();
if (!term) {
  console.error('사용법: npm run find-app -- "서비스명"');
  process.exit(1);
}

const COUNTRY = process.env.APP_COUNTRY || 'kr';
const LANG = process.env.APP_LANG || 'ko';

async function findAppStore() {
  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&country=${COUNTRY}&entity=software&limit=5`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.results ?? []).map((r) => ({
    id: String(r.trackId),
    name: r.trackName,
    extra: r.sellerName,
  }));
}

async function findGooglePlay() {
  // CJS 패키지라 require 결과가 { default: ... } 로 감싸여 온다
  const mod = require('google-play-scraper');
  const gplay = mod.default ?? mod;
  const results = await gplay.search({ term, num: 5, lang: LANG, country: COUNTRY });
  return results.map((r) => ({ id: r.appId, name: r.title, extra: r.developer }));
}

function print(label, rows, err) {
  console.log(`\n[${label}]`);
  if (err) {
    console.log(`  조회 실패: ${err}`);
    return;
  }
  if (rows.length === 0) {
    console.log('  검색 결과 없음 — 다른 이름(영문명·정식 명칭)으로 다시 시도해 보세요');
    return;
  }
  for (const r of rows) {
    console.log(`  ${r.id}`);
    console.log(`      ${r.name}${r.extra ? ` · ${r.extra}` : ''}`);
  }
}

console.log(`"${term}" 검색 중 (${COUNTRY}/${LANG})…`);

const [appstore, googleplay] = await Promise.allSettled([findAppStore(), findGooglePlay()]);

print('앱스토어 appId', appstore.value ?? [], appstore.reason?.message);
print('구글플레이 appId', googleplay.value ?? [], googleplay.reason?.message);

console.log(`
위 목록에서 맞는 항목을 골라 private/feedback-radar.config.json 에 넣으세요:

  "appstore":   { "appId": "<앱스토어 숫자>", "country": "${COUNTRY}" },
  "googlePlay": { "appId": "<구글플레이 패키지명>", "lang": "${LANG}", "country": "${COUNTRY}" }
`);
