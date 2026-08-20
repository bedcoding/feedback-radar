import fs from 'node:fs';
import path from 'node:path';
import {
  buildChannelSummaries,
  buildDailyReport,
  diagnoseTagger,
  loadPrivateEnv,
  openRadarStore,
  reportsDir,
  resolveServices,
  SUMMARY_MIN_ITEMS,
} from '@feedback-radar/core';

loadPrivateEnv();

/**
 * 과거 날짜 브리핑 채우기.
 *
 * 브리핑 날짜 기준을 수집일에서 **작성일**로 바꾸면서, 이미 저장된 글에 대해 날짜별 요약이
 * 비어 있게 됐다. 예전 요약은 "그날 수집한 것"을 묶은 것이라 작성일 기준 화면에서는 맞지 않는다.
 *
 * 날짜가 수백 개일 수 있어서 두 가지를 둔다.
 * - **이미 요약이 있는 날짜는 건너뛴다.** 중간에 멈춰도 다시 돌리면 남은 날짜만 이어서 한다
 * - `--force`로 다시 만들 수 있다 (프롬프트를 고쳤을 때)
 *
 * 실행:
 *   npm run backfill                       (무엇을 만들지 보여주기만 한다)
 *   npm run backfill -- --apply            (없는 날짜만 만든다)
 *   npm run backfill -- --apply --days=30  (최근 30일치만)
 *   npm run backfill -- --apply --force    (있는 것도 다시 만든다)
 */

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const force = argv.includes('--force');
const daysRaw = Number(argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 0);
const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 0;
const minRaw = Number(argv.find((a) => a.startsWith('--min='))?.split('=')[1] ?? SUMMARY_MIN_ITEMS);
/**
 * 이 건수 미만인 날짜는 건너뛴다.
 *
 * 요약은 글이 많아 다 읽을 수 없을 때 쓰는 압축이다. 그 아래는 화면이 원문을 그대로 보여주므로
 * 요약을 만들 이유가 없다(만들면 정보가 줄고 호출만 나간다).
 */
const minItems = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : SUMMARY_MIN_ITEMS;

const db = await openRadarStore();
const config = await db.getConfig();
const services = resolveServices(config);
const multi = services.length > 1;
const targets = multi ? services.map((s) => s.name) : [undefined];

const allDates = await db.postedDates(2000);
const done = new Set(await db.getSummaryDates(2000));
const undated = await db.countUndatedItems();

let dates = allDates.filter((d) => d.count >= minItems);
if (days > 0) dates = dates.slice(0, days);
const todo = force ? dates : dates.filter((d) => !done.has(d.date));

console.log(`작성일이 있는 날짜 ${allDates.length}개`);
console.log(`요약 대상(글 ${minItems}건 이상): ${dates.length}개`);
console.log(`그 아래 날짜는 화면이 원문을 그대로 보여주므로 요약을 만들지 않습니다.`);
console.log(`요약이 이미 있는 날짜 ${done.size}개`);
console.log(`만들 날짜 ${todo.length}개${force ? ' (--force: 있는 것도 다시)' : ''}`);
if (undated > 0) {
  console.log(`작성일을 못 가져온 글 ${undated.toLocaleString()}건은 어느 날짜에도 들어가지 않습니다.`);
}

if (todo.length === 0) {
  console.log('\n만들 것이 없습니다.');
  await db.close();
  process.exit(0);
}

// 서비스가 여럿이면 날짜마다 서비스 수만큼 호출이 나간다. 그 곱을 미리 알려 준다
console.log(
  `\n예상 LLM 호출: 날짜 ${todo.length}개 x 서비스 ${targets.length}개 = 최대 ${todo.length * targets.length}회 (채널 수만큼 더 늘어납니다)`,
);
if (!apply) {
  console.log('dry-run입니다. 실제로 만들려면 --apply를 붙이세요.');
  console.log(`\n앞쪽 날짜: ${todo.slice(0, 10).map((d) => `${d.date}(${d.count})`).join(', ')}`);
  await db.close();
  process.exit(0);
}

/**
 * 요약 경로는 한 번만 판정하고 전부에 물려준다. 날짜마다 확인하면 그 횟수만큼
 * CLI 진단 호출이 나간다.
 */
const mode = (await diagnoseTagger()).mode;
console.log(`\n요약 경로: ${mode}\n`);

const dir = reportsDir();
fs.mkdirSync(dir, { recursive: true });

let madeChannels = 0;
let calls = 0;
let failed = 0;
const startedAt = Date.now();

for (const [i, d] of todo.entries()) {
  const at = `[${i + 1}/${todo.length}] ${d.date} (${d.count}건)`;
  try {
    let channels = 0;
    for (const target of targets) {
      const res = await buildChannelSummaries(db, d.date, target, { mode });
      for (const s of res.summaries) await db.saveChannelSummary(s);
      channels += res.summaries.length;
      calls += res.llmCalls;
    }
    // 리포트 파일도 같은 날짜로 남긴다. 화면은 DB를 읽고 이 파일은 보관용이다
    const md = await buildDailyReport(db, d.date, config.displayName);
    fs.writeFileSync(path.join(dir, `${d.date}.md`), md, 'utf8');
    madeChannels += channels;
    const mins = Math.round((Date.now() - startedAt) / 60_000);
    console.log(`${at} 채널 ${channels}개, 누적 호출 ${calls}회, 경과 ${mins}분`);
  } catch (e) {
    failed += 1;
    console.warn(`${at} 실패: ${(e as Error).message}`);
  }
}

console.log(
  `\n완료: 채널 요약 ${madeChannels}개, LLM 호출 ${calls}회${failed > 0 ? `, 실패한 날짜 ${failed}개` : ''}`,
);
await db.close();
