import {
  dropFlooding,
  fromShortDateOrTime,
  loadPrivateEnv,
  localDate,
  openRadarStore,
  resolveServices,
  type RawItem,
} from '@feedback-radar/core';
import { fetchText, pause, parseBody, parseList } from './collectors/theqoo.js';

loadPrivateEnv();

/**
 * 더쿠 과거 글 백필.
 *
 * 평소 수집기(collectors/theqoo.ts)는 최근 몇 쪽만 본다. 더쿠는 검색이 동작하지 않아
 * 목록을 훑는 방식이라 **과거로 가려면 쪽을 깊이 넘기는 수밖에 없다.** 그래서 상한(20쪽)에
 * 묶이지 않는 별도 스크립트로 둔다. 파싱 규칙은 수집기에서 그대로 가져다 쓴다(중복 금지).
 *
 * 실측(2026-08-21, blnovelwebtoon):
 *   p50=08.19 / p200=08.12 / p1000=07.09 / p3000=04.19 / p8000=2025-10-30
 *   하루가 약 25쪽이다. 30일치≈750쪽, 1년치≈9,100쪽.
 *   제목에만 키워드를 대므로 적중률은 1~2% 수준이다(79건 훑어 1건).
 *
 * 실행:
 *   npm run backfill-theqoo                                  미리보기(요청 안 보냄, 계획만)
 *   npm run backfill-theqoo -- --apply --pages=750            최근 30일치
 *   npm run backfill-theqoo -- --apply --from=751 --pages=750 이어서 다음 30일치
 *   npm run backfill-theqoo -- --apply --until=2025-08-21     그 날짜에 닿으면 멈춘다
 *   --boards=a,b   게시판 지정 (기본: 설정에 저장된 값)
 *   --no-body      본문을 읽지 않는다 (요청이 크게 줄지만 분류 정확도가 떨어진다)
 *   --keep-today   오늘 글도 담는다 (기본은 버린다)
 *
 * 중단해도 안전하다. 저장은 쪽 묶음마다 하고, 마지막으로 끝낸 쪽을 찍어 주므로
 * `--from` 으로 이어서 돌리면 된다. 같은 글은 sourceId 로 걸러진다.
 */

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const num = (name: string, def: number) => {
  const raw = Number(argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : def;
};
const str = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const apply = has('--apply');
const withBody = !has('--no-body');
const keepToday = has('--keep-today');
const fromPage = num('from', 1);
const pageCount = num('pages', 30);
const until = str('until');
/** 몇 쪽마다 저장할지. 중단 손실을 줄이면서 트랜잭션 수를 억제한다 */
const FLUSH_EVERY = 25;

const today = localDate();

async function main() {
  const db = await openRadarStore();
  const config = await db.getConfig();
  const services = resolveServices(config);
  const boards = (str('boards') ?? (config.theqooBoards ?? []).join(','))
    .split(',')
    .map((b: string) => b.trim())
    .filter(Boolean);

  if (boards.length === 0) {
    console.error('게시판이 없습니다. --boards=blnovelwebtoon 처럼 지정하거나 설정에 저장하세요.');
    process.exit(1);
  }

  /** 서비스마다 키워드가 다르다. 한 번 훑은 목록을 모든 서비스에 대해 함께 판정한다 */
  const targets = services
    .map((s) => ({
      name: s.name,
      needles: (s.keywords ?? []).map((k: string) => k.toLowerCase()).filter(Boolean),
    }))
    .filter((t) => t.needles.length > 0);

  const lastPage = fromPage + pageCount - 1;
  console.log(
    `더쿠 백필 ${apply ? '실행' : '미리보기'} · 게시판 ${boards.join(', ')} · ` +
      `${fromPage}~${lastPage}쪽 (${pageCount}쪽) · 본문 ${withBody ? '읽음' : '건너뜀'}`,
  );
  console.log(`  서비스 ${targets.length}개, 오늘(${today}) 글은 ${keepToday ? '담음' : '버림'}`);
  if (until) console.log(`  ${until} 보다 오래된 글을 만나면 멈춥니다`);
  if (!apply) {
    console.log('  --apply 를 붙이면 실제로 요청을 보내고 저장합니다. 지금은 계획만 보여줍니다.');
    await db.close?.();
    return;
  }

  let scanned = 0;
  let bodies = 0;
  let saved = 0;
  let skippedToday = 0;
  let pending: RawItem[] = [];
  let stop = false;

  const flush = async () => {
    if (pending.length === 0) return;
    const { kept } = dropFlooding(pending);
    const n = await db.insertItems(kept);
    saved += n;
    console.log(`    저장 ${n}건 (누적 ${saved}건)`);
    pending = [];
  };

  for (const board of boards) {
    if (stop) break;
    for (let page = fromPage; page <= lastPage && !stop; page++) {
      const html = await fetchText(`https://theqoo.net/${board}?page=${page}`);
      if (!html) {
        console.warn(`  ${board} ${page}쪽: 응답 없음. 여기서 멈춥니다 (--from=${page} 로 이어하세요)`);
        break;
      }
      const rows = parseList(html, board);
      if (rows.length === 0) {
        console.warn(`  ${board} ${page}쪽: 글을 찾지 못했습니다 (구조 변경 가능). 멈춥니다`);
        break;
      }
      scanned += rows.length;

      for (const row of rows) {
        const postedAt = fromShortDateOrTime(row.time);
        const day = postedAt?.slice(0, 10);
        if (until && day && day < until) {
          console.log(`  ${until} 보다 오래된 글(${day})을 만나 멈춥니다`);
          stop = true;
          break;
        }
        if (!keepToday && day === today) {
          skippedToday += 1;
          continue;
        }
        const lower = row.title.toLowerCase();
        const hit = targets.find((t) => t.needles.some((n) => lower.includes(n)));
        if (!hit) continue;

        let body = '';
        if (withBody) {
          await pause(1_200, 3_000);
          const detail = await fetchText(row.url);
          if (detail) {
            body = parseBody(detail);
            bodies += 1;
          }
        }
        pending.push({
          source: 'theqoo',
          service: hit.name,
          sourceId: row.id,
          url: row.url,
          content: body ? `${row.title}\n${body}` : row.title,
          postedAt,
          keyword: hit.needles.find((n) => lower.includes(n)),
        });
      }

      if (page % 10 === 0 || page === lastPage) {
        const firstDay = fromShortDateOrTime(rows[0]?.time ?? '')?.slice(0, 10) ?? '?';
        console.log(
          `  ${board} ${page}쪽까지 · 훑음 ${scanned}건 · 대기 ${pending.length}건 · 그 쪽 날짜 ${firstDay}`,
        );
      }
      if (pending.length >= FLUSH_EVERY) await flush();
      await pause(1_500, 3_500);
    }
    await flush();
  }
  await flush();

  console.log(
    `끝. 훑음 ${scanned}건 · 저장 ${saved}건 · 본문 ${bodies}건` +
      (skippedToday ? ` · 오늘 글 ${skippedToday}건 제외` : ''),
  );
  console.log('브리핑은 따로 만들어야 합니다: npm run backfill -- --apply --days=N');
  await db.close?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
