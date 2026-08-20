import { openRadarStore } from '@feedback-radar/core';

/**
 * 재태깅 준비: 아이템의 태그 상태를 초기화한다. 그다음 `npm run collect`가 현재 태거로 다시 분류한다.
 *
 * 분류 체계를 바꿨을 때(카테고리 추가 등) 기존 글은 예전 분류로 남아 있어서, 집계와 브리핑이
 * 새 기준을 반영하지 못한다. 그걸 되돌리는 스크립트다.
 *
 * **dry-run이 기본이다.** 되돌릴 수 없는 작업이기 때문이다. 초기화하면 예전 판정은 사라지고,
 * 다시 분류한 결과가 전과 다를 수 있다(LLM 판정에는 흔들림이 있다).
 *
 * 실행:
 *   npm run retag                      (몇 건이 대상인지 보여주기만 한다)
 *   npm run retag -- --days=1 --apply  (오늘 수집분만 초기화)
 *   npm run retag -- --all --apply     (전체)
 */
const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const all = argv.includes('--all');
const daysRaw = Number(argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 1);
const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 1;

/** 며칠 전 자정. collected_at 이 이 값 이상인 것만 대상이 된다 */
function sinceDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const db = await openRadarStore();
const since = all ? undefined : sinceDate(days);
const scope = all ? '전체' : `최근 ${days}일 (${since} 이후 수집분)`;

if (!apply) {
  /**
   * 몇 건이 영향을 받는지 정확히 센다. 초기화는 되돌릴 수 없으므로 어림수를 보여주면
   * 확인의 의미가 없다. 범위 내 날짜를 하나씩 세서 합한다.
   */
  const total = await db.countItems({ filter: 'all' });
  let inScope = total;
  if (since) {
    inScope = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      inScope += (await db.getItemsByDate(date)).length;
    }
  }
  console.log(`대상 범위: ${scope}`);
  console.log(`초기화될 글: ${inScope.toLocaleString()}건 (저장된 전체 ${total.toLocaleString()}건)`);
  console.log(`재분류에 드는 호출은 대략 ${Math.ceil(inScope / 25)}회입니다 (배치 25건 기준).`);
  console.log('dry-run입니다. 실제로 초기화하려면 --apply를 붙이세요.');
  console.log('초기화 뒤에는 npm run collect (또는 스케줄러)가 현재 태거로 다시 분류합니다.');
} else {
  const n = await db.resetTags(since ? { since } : {});
  console.log(`${scope}: ${n.toLocaleString()}건 태그 초기화 완료.`);
  console.log("'npm run collect'를 실행하면 현재 태거로 재분류됩니다.");
}
await db.close();
