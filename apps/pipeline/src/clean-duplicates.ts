import { dropFlooding, openRadarStore, type ItemRow } from '@feedback-radar/core';

/**
 * 이미 저장된 본문 중복을 정리한다.
 *
 * 수집기에 `dropFlooding`을 붙인 뒤에도 그 전에 들어온 중복은 남아 있다. 같은 본문이 서로 다른
 * URL로 올라오면 `UNIQUE(source, source_id)`도 URL 기준 중복 제거도 통과하기 때문이다
 * (실측: 한 계정이 같은 글을 3번 올려 3건이 저장되고 분류 호출도 3번 나갔다).
 *
 * **dry-run이 기본이다.** `--apply`가 있어야 실제로 지운다.
 *
 * 실행:
 *   npm run clean-dupes              (무엇을 지울지 보여주기만 한다)
 *   npm run clean-dupes -- --apply   (실제로 지운다)
 *   npm run clean-dupes -- --source=x --days=7
 */

interface Options {
  apply: boolean;
  source?: string;
  days: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const days = Number(get('days') ?? 30);
  return {
    apply: argv.includes('--apply'),
    source: get('source'),
    days: Number.isFinite(days) && days > 0 ? days : 30,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const db = await openRadarStore();

  /**
   * 최근 며칠분만 본다. 전체를 훑으면 오래된 글까지 비교해서, 우연히 같은 짧은 글이
   * 도배로 잡힐 수 있다(같은 사건에 대한 같은 반응은 시간이 붙어 있다).
   */
  const items: ItemRow[] = [];
  const today = new Date();
  for (let i = 0; i < opts.days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const rows = await db.getItemsByDate(date);
    items.push(...(opts.source ? rows.filter((r) => r.source === opts.source) : rows));
  }

  console.log(`대상: 최근 ${opts.days}일${opts.source ? `, 채널 ${opts.source}` : ''} / ${items.length}건`);

  /**
   * 채널별로 따로 판정한다. 채널이 다르면 같은 사람이 여러 곳에 올린 것일 수 있고,
   * 그건 실제로 여러 채널에서 언급된 것이라 남기는 편이 맞다.
   */
  const bySource = new Map<string, ItemRow[]>();
  for (const it of items) {
    const bucket = bySource.get(it.source);
    if (bucket) bucket.push(it);
    else bySource.set(it.source, [it]);
  }

  const toDelete: ItemRow[] = [];
  for (const [source, rows] of bySource) {
    const { dropped, groups } = dropFlooding(rows);
    if (dropped.length === 0) continue;
    console.log(`\n[${source}] 중복 ${dropped.length}건 (묶음 ${groups.length}개)`);
    for (const g of groups.slice(0, 10)) {
      console.log(`  x${g.count}  ${g.preview}`);
    }
    toDelete.push(...dropped);
  }

  if (toDelete.length === 0) {
    console.log('\n지울 중복이 없습니다.');
    await db.close();
    return;
  }

  console.log(`\n지울 대상 ${toDelete.length}건 (대표 1건은 남깁니다)`);
  if (!opts.apply) {
    console.log('dry-run입니다. 실제로 지우려면 --apply를 붙이세요.');
    await db.close();
    return;
  }

  const removed = await db.deleteItems(toDelete.map((i) => i.id));
  console.log(`삭제 완료: ${removed}건`);
  await db.close();
}

main().catch((e) => {
  console.error('정리 실패:', (e as Error).message);
  process.exit(1);
});
