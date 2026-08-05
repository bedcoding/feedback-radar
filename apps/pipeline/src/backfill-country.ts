import {
  loadConfig,
  loadPrivateEnv,
  openDb,
  resolveServices,
  storeCountries,
} from '@feedback-radar/core';

/**
 * 앱 리뷰의 빈 country를 소급해 채운다.
 *
 * 국가별 수집이 들어오기 전에 모인 리뷰는 country가 비어 있다. 그래서 브리핑 카드에 국기가
 * 안 뜨고, 국가 칩에서도 빠지고, 채널 요약이 '국가 없음' 한 덩어리로 묶인다.
 *
 * **어떤 국가로 채우는지의 근거**: 구 코드는 서비스마다 국가를 하나만 조회했고 그게 설정의
 * 첫 값(storeCountries()[0])이다. 지금 데이터도 그와 맞는다 — 설정에 국가가 셋인 서비스에서
 * 이미 채워진 값은 둘뿐이고, 비어 있는 행은 남은 하나(첫 값)에서 온 것이다.
 *
 * 그래도 추론인 구간이 있으므로:
 * - 기본은 미리보기다. 무엇을 몇 건 바꿀지 출력하고 끝낸다
 * - `--apply` 를 줘야 실제로 쓴다
 * - 설정에 국가가 여러 개인데 첫 값이 이미 다른 행에 채워져 있으면 **건너뛴다**
 *   (그 경우 빈 행이 어느 국가에서 왔는지 단정할 수 없다)
 *
 * 사용법: `npm run backfill-country` → 확인 후 `npm run backfill-country -- --apply`
 */

loadPrivateEnv();

interface Plan {
  service: string;
  source: 'appstore' | 'googleplay';
  country: string;
  rows: number;
  /** 판단 근거 (화면에 그대로 보여준다) */
  why: string;
}

function main(): void {
  const apply = process.argv.includes('--apply');
  const config = loadConfig();
  const db = openDb();

  const plans: Plan[] = [];
  const skipped: string[] = [];

  for (const svc of resolveServices(config)) {
    for (const source of ['appstore', 'googleplay'] as const) {
      const cfg = source === 'appstore' ? svc.appstore : svc.googlePlay;
      if (!cfg?.appId) continue;

      const empty = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM items
             WHERE service = ? AND source = ? AND (country IS NULL OR country = '')`,
          )
          .get(svc.name, source) as { c: number }
      ).c;
      if (empty === 0) continue;

      const countries = storeCountries(cfg);
      const first = countries[0];
      // 이미 값이 들어간 국가들 — 첫 국가가 여기 있으면 빈 행의 출처를 단정할 수 없다
      const filled = (
        db
          .prepare(
            `SELECT DISTINCT country FROM items
             WHERE service = ? AND source = ? AND country IS NOT NULL AND country <> ''`,
          )
          .all(svc.name, source) as { country: string }[]
      ).map((r) => r.country);

      if (countries.length === 1) {
        plans.push({
          service: svc.name,
          source,
          country: first,
          rows: empty,
          why: `설정 국가가 ${first} 하나뿐`,
        });
        continue;
      }
      if (filled.includes(first)) {
        skipped.push(
          `${svc.name} ${source}: ${empty}건. 설정 [${countries.join(', ')}] 중 첫 국가 ${first}가 ` +
            `이미 다른 행에 채워져 있어 빈 행의 출처를 단정할 수 없습니다`,
        );
        continue;
      }
      plans.push({
        service: svc.name,
        source,
        country: first,
        rows: empty,
        why: `설정 [${countries.join(', ')}] 중 ${filled.join(', ') || '없음'}만 채워져 있고 첫 국가 ${first}는 미사용`,
      });
    }
  }

  console.log(`\n=== 앱 리뷰 country 소급 채우기 ${apply ? '(적용)' : '(미리보기)'} ===\n`);
  if (plans.length === 0) {
    console.log('채울 대상이 없습니다.');
  }
  let total = 0;
  for (const p of plans) {
    console.log(`  ${p.service} ${p.source} → ${p.country}  ${p.rows.toLocaleString()}건`);
    console.log(`    근거: ${p.why}`);
    total += p.rows;
  }
  if (skipped.length) {
    console.log('\n건너뜀 (근거가 불충분):');
    for (const s of skipped) console.log(`  - ${s}`);
  }

  if (!apply) {
    console.log(`\n합계 ${total.toLocaleString()}건. 실제로 쓰려면 --apply 를 붙여 다시 실행하세요.`);
    db.close();
    return;
  }

  // 한 번에 커밋한다. 중간에 끊겨 절반만 채워지면 어디까지 됐는지 알 수 없다
  const update = db.prepare(
    `UPDATE items SET country = ?
     WHERE service = ? AND source = ? AND (country IS NULL OR country = '')`,
  );
  const run = db.transaction((list: Plan[]) => {
    let n = 0;
    for (const p of list) n += update.run(p.country, p.service, p.source).changes;
    return n;
  });
  const changed = run(plans);
  console.log(`\n✓ ${changed.toLocaleString()}건 갱신`);

  const left = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM items
         WHERE source IN ('appstore','googleplay') AND (country IS NULL OR country = '')`,
      )
      .get() as { c: number }
  ).c;
  console.log(`남은 빈 country: ${left.toLocaleString()}건`);
  console.log('\n채널 요약은 국가별로 다시 만들어야 반영됩니다 (대시보드에서 [지금 실행]).');
  db.close();
}

main();
