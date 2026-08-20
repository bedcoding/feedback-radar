import { loadPrivateEnv, openRadarStore, SUMMARY_MIN_ITEMS } from '@feedback-radar/core';

loadPrivateEnv();

/**
 * 지금 기준으로 만들 이유가 없는 채널 요약을 지운다.
 *
 * 두 가지를 함께 걸러낸다. 판정은 저장된 `total`이 아니라 **그 날짜, 채널에 실제로 있는
 * 글 수**로 한다 (`total`은 요약을 만든 시점의 값이라 낡는다).
 *
 * - **몇 건짜리 요약.** 임계(`SUMMARY_MIN_ITEMS`)가 처음에는 날짜 총건수에만 걸려 있었다.
 *   요약은 (서비스, 채널) 조합마다 만들어지므로 날짜가 임계를 넘겨도 카드 하나는 몇 건뿐일
 *   수 있다. 2건을 네 줄로 늘린 카드는 원문보다 읽기 어렵다.
 * - **작성일 기준으로 다시 세면 0건인 요약.** 수집일 기준으로 만들어진 것들이다. 작성일을
 *   주지 않는 채널이 있어서, 그런 요약은 화면에 건수가 적혀 있는데 목록을 열면 비어 있다.
 *
 * 임계를 채널 단위로 옮긴 뒤에도 **이미 저장된 요약은 그대로 남는다.** 화면은 요약이 있으면
 * 요약을 보여주므로, 지우지 않으면 같은 카드가 계속 뜬다. 지우면 그 자리에 원문이 실린다.
 *
 * **dry-run이 기본이다.** `--apply`가 있어야 실제로 지운다.
 *
 * 실행:
 *   npm run prune-summaries                 (무엇을 지울지 보여주기만 한다)
 *   npm run prune-summaries -- --apply      (실제로 지운다)
 *   npm run prune-summaries -- --min=6      (임계를 따로 준다)
 */

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const minRaw = Number(argv.find((a) => a.startsWith('--min='))?.split('=')[1] ?? SUMMARY_MIN_ITEMS);
const minItems = Number.isFinite(minRaw) && minRaw > 0 ? minRaw : SUMMARY_MIN_ITEMS;

const db = await openRadarStore();
const rows = await db.thinSummaries(minItems);
const allDates = new Set((await db.getSummaryDates(2000)).map((d) => d));

if (rows.length === 0) {
  console.log(`${minItems}건 미만인 채널 요약이 없습니다.`);
  await db.close();
  process.exit(0);
}

// 실제 건수 분포. 이 분포가 곧 "얼마나 무의미한 요약이었나"의 근거다
const dist = new Map<string, number>();
for (const r of rows) {
  const k =
    r.actual === 0
      ? '0건 (작성일 기준으로 다시 세면 없다)'
      : r.actual < 3
        ? '1~2건'
        : r.actual < 6
          ? '3~5건'
          : `6~${minItems - 1}건`;
  dist.set(k, (dist.get(k) ?? 0) + 1);
}

console.log(`요약이 있는 날짜 ${allDates.size}개`);
console.log(`실제 글이 ${minItems}건 미만인 채널 요약 ${rows.length}개`);
for (const [k, n] of [...dist].sort()) console.log(`  ${k}: ${n}개`);
console.log(`\n앞쪽 15개 (요약에 적힌 건수 -> 실제):`);
for (const r of rows.slice(0, 15)) {
  const gap = r.total !== r.actual ? ` (요약에는 ${r.total}건이라 적혀 있다)` : '';
  console.log(`  ${r.date} ${r.source}${r.service ? ` (${r.service})` : ''} ${r.actual}건${gap}`);
}

if (!apply) {
  console.log('\ndry-run입니다. 실제로 지우려면 --apply를 붙이세요.');
  console.log('지운 자리에는 화면이 원문을 그대로 싣습니다 (LLM 호출은 나가지 않습니다).');
  await db.close();
  process.exit(0);
}

const deleted = await db.deleteThinSummaries(minItems);
const left = await db.getSummaryDates(2000);
console.log(`\n지운 채널 요약 ${deleted}개. 요약이 남은 날짜 ${left.length}개`);
await db.close();
