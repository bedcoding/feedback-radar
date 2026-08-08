import {
  dropFlooding,
  fromDottedDateTime,
  loadPrivateEnv,
  normalizeInstant,
  openDb,
  postgresConfigured,
  type RadarDb,
} from '@feedback-radar/core';

/**
 * 수집기 버그로 들어온 오염 데이터를 뒤늦게 정리한다. `npm run cleanup`
 *
 * 재수집만으로는 안 된다. 이미 저장된 행은 그대로 남고, 지워야 할 것과 값을 고쳐야 할 것이
 * 섞여 있다. 고치는 항목은 네 가지다.
 *
 * 1. **실시간베스트 유입**: 디시 수집기가 검색 결과 대신 페이지 우측 위젯(`id=dcbest`)까지
 *    긁던 시절의 행. 검색어와 무관한 뉴스, 유머라 남길 가치가 없다.
 * 2. **디시 본문 오염**: `li.textContent`를 통째로 저장해 본문 끝에 `… <갤러리명> 갤러리2026.08.01 13:44`
 *    처럼 갤러리명과 시각이 붙어 있다. 이걸 떼어내면 본문이 깨끗해지고, **버려졌던 시각을
 *    posted_at으로 되살릴 수 있다** (그 시절 정규식은 날짜만 뽑고 시각을 버렸다).
 * 3. **날짜 형식 혼재**: 애플은 미국 태평양 오프셋, 구글플레이, Threads는 UTC로 저장돼 있다.
 *    목록 정렬과 기간 필터가 `posted_at`의 사전순 비교에 의존하므로 로컬 오프셋으로 맞춘다.
 * 4. **크로스포스팅 도배**: 같은 본문이 여러 갤러리에 뿌려진 광고. 글마다 URL이 달라
 *    UNIQUE 제약에 안 걸린다. 대표 1건만 남긴다.
 * 5. **AI 생성 텍스트의 표기**: 요약(summary)과 판정 근거(reason), 채널 브리핑에 가운뎃점(·)이
 *    섞여 있다. 프롬프트에 "쓰지 말라"를 넣었지만 그 전에 생성된 값은 그대로 남으므로
 *    여기서 쉼표로 바꾼다. **수집 원문(content)은 건드리지 않는다**. 사람이 쓴 글이다.
 *
 * 기본은 **미리보기(dry-run)** 다. 실제로 쓰려면 `--apply`를 붙인다.
 * 지우는 작업이 있으니 그 전에 `npm run pack`으로 스냅샷을 떠 두는 편이 안전하다.
 */

loadPrivateEnv();
if (postgresConfigured()) {
  throw new Error('cleanup --apply는 아직 SQLite 백업 전용입니다. PostgreSQL 원본에는 실행하지 않습니다.');
}

const apply = process.argv.includes('--apply');

/**
 * 디시 본문 꼬리(`… <갤러리명> 갤러리2026.08.01 13:44`)에서 본문과 시각을 가른다.
 *
 * **갤러리명은 떼어내지 않는다.** 갤러리명에 공백이 흔하다(쉼표가 들어간 이름, 괄호로
 * 영문을 병기한 이름, 두 단어 이름 등). 그래서 어디서 시작하는지 신뢰성 있게 정할 수 없다.
 * 길이 제한을 둔 정규식으로 잡아 보면 lazy 수량자를 써도 매치 시작점이 최좌측 우선이라
 * 본문 끝부분까지 갤러리명으로 끌려온다(실측에서 author 칸에 본문 뒷부분이 함께 들어갔다).
 * 잘못 자르면 본문이 손상되고 되돌릴 수 없으므로,
 * 확실한 것(`갤러리` 표기 + 날짜)만 떼고 이름은 본문에 남긴다.
 * 정확한 갤러리명은 새 수집기가 `a.sub_txt`에서 그대로 읽어 채운다.
 */
export function splitDcTail(content: string): { content: string; dateTime?: string } {
  const dm = content.match(/\s*(\d{4}\.\d{1,2}\.\d{1,2}(?:\s+\d{1,2}:\d{2})?)\s*$/);
  if (!dm) return { content };
  const head = content
    .slice(0, dm.index)
    .trimEnd()
    .replace(/\s*갤러리$/, '')
    .trimEnd();
  return { content: head, dateTime: dm[1] };
}

interface Row {
  id: number;
  source: string;
  source_id: string;
  content: string;
  author: string | null;
  posted_at: string | null;
  summary: string | null;
  reason: string | null;
}

/**
 * AI가 쓴 문장에서 가운뎃점과 줄표를 뺀다.
 *
 * 나열이 대부분이라 쉼표로 바꾸면 뜻이 그대로 유지된다. 줄표는 앞이 종결어미면 문장이
 * 끝난 자리이므로 마침표로, 아니면 쉼표로 본다.
 */
export function plainerText(s: string): string {
  return s
    .replace(/\s*·\s*/g, ', ')
    .replace(/(다|요|음|함|됨|임)\s+—\s+/g, '$1. ')
    .replace(/\s+—\s+/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function report(label: string, n: number, detail = ''): void {
  const mark = n > 0 ? '•' : ' ';
  console.log(`  ${mark} ${label}: ${n.toLocaleString()}건${detail ? ` ${detail}` : ''}`);
}

function run(db: RadarDb): void {
  const all = db
    .prepare(`SELECT id, source, source_id, content, author, posted_at, summary, reason FROM items`)
    .all() as Row[];
  console.log(`\n전체 ${all.length.toLocaleString()}건\n`);

  // ── 1. 실시간베스트 유입 ────────────────────────────────────
  const dcbest = all.filter((r) => r.source === 'dcinside' && /[?&]id=dcbest(?:&|$)/.test(r.source_id));
  report('실시간베스트(dcbest) 유입 (삭제 대상)', dcbest.length);

  const surviving = all.filter((r) => !dcbest.some((d) => d.id === r.id));

  // ── 2. 디시 본문 꼬리 분리 + 시각 복구 ──────────────────────
  const tailFixes: { id: number; content: string; postedAt?: string }[] = [];
  for (const r of surviving) {
    if (r.source !== 'dcinside') continue;
    const s = splitDcTail(r.content);
    if (s.content === r.content) continue;
    const postedAt = s.dateTime ? fromDottedDateTime(s.dateTime) : undefined;
    tailFixes.push({
      id: r.id,
      content: s.content,
      // 시각이 있는 값으로만 덮어쓴다. 날짜만 있던 기존 값보다 정보가 많다
      postedAt: postedAt ?? r.posted_at ?? undefined,
    });
  }
  const timeRecovered = tailFixes.filter(
    (f) => f.postedAt && !f.postedAt.includes('T00:00:00'),
  ).length;
  report('디시 본문 꼬리 제거', tailFixes.length, `(그중 시각 복구 ${timeRecovered}건)`);

  // ── 3. 날짜 형식 재정규화 ───────────────────────────────────
  // 꼬리 분리로 이미 고칠 행은 건드리지 않는다 (같은 행을 두 번 쓰지 않게)
  const tailIds = new Set(tailFixes.map((f) => f.id));
  const dateFixes: { id: number; postedAt: string }[] = [];
  for (const r of surviving) {
    if (tailIds.has(r.id) || !r.posted_at) continue;
    // 이미 로컬 오프셋이면 그대로 둔다. UTC(Z)나 다른 오프셋만 바꾼다.
    const normalized = normalizeInstant(r.posted_at);
    if (normalized && normalized !== r.posted_at) dateFixes.push({ id: r.id, postedAt: normalized });
  }
  const bySource = new Map<string, number>();
  for (const f of dateFixes) {
    const src = surviving.find((r) => r.id === f.id)!.source;
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
  }
  report(
    '작성일 형식 재정규화',
    dateFixes.length,
    bySource.size ? `(${[...bySource].map(([s, n]) => `${s} ${n}`).join(', ')})` : '',
  );

  // ── 4. 도배 ─────────────────────────────────────────────────
  // 꼬리를 뗀 뒤의 본문으로 비교해야 정확하다. 갤러리명이 붙어 있으면 같은 글도 달라 보인다
  const tailById = new Map(tailFixes.map((f) => [f.id, f.content]));
  const forFlood = surviving.map((r) => ({ id: r.id, content: tailById.get(r.id) ?? r.content }));
  const { dropped, groups } = dropFlooding(forFlood);
  report('크로스포스팅 도배 (삭제 대상)', dropped.length);
  for (const g of groups.slice(0, 5)) console.log(`      "${g.preview}…" ${g.count}곳`);

  // ── 5. AI 생성 텍스트 표기 ──────────────────────────────────
  const droppedIds = new Set(dropped.map((d) => d.id));
  const textFixes: { id: number; summary: string | null; reason: string | null }[] = [];
  for (const r of surviving) {
    if (droppedIds.has(r.id)) continue;
    const s = r.summary ? plainerText(r.summary) : null;
    const rs = r.reason ? plainerText(r.reason) : null;
    if (s !== r.summary || rs !== r.reason) textFixes.push({ id: r.id, summary: s, reason: rs });
  }
  report('AI 요약, 판정 근거 표기 정리', textFixes.length);

  const summaryRows = db
    .prepare(`SELECT date, source, service, bullets FROM channel_summaries`)
    .all() as { date: string; source: string; service: string; bullets: string }[];
  const bulletFixes: { date: string; source: string; service: string; bullets: string }[] = [];
  for (const row of summaryRows) {
    let arr: unknown;
    try {
      arr = JSON.parse(row.bullets);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    const fixed = arr.map((b) => (typeof b === 'string' ? plainerText(b) : b));
    const next = JSON.stringify(fixed);
    if (next !== row.bullets) bulletFixes.push({ ...row, bullets: next });
  }
  report('채널 브리핑 표기 정리', bulletFixes.length);

  const totalDeleted = dcbest.length + dropped.length;
  const totalUpdated = tailFixes.length + dateFixes.length + textFixes.length + bulletFixes.length;
  console.log(
    `\n합계: 삭제 ${totalDeleted.toLocaleString()}건, 수정 ${totalUpdated.toLocaleString()}건`,
  );

  if (!apply) {
    console.log('\n미리보기입니다. 실제로 적용하려면 --apply를 붙이세요.');
    console.log('  npm run cleanup -- --apply');
    console.log('\n적용 전 스냅샷을 떠 두는 편이 안전합니다: npm run pack');
    return;
  }

  const del = db.prepare(`DELETE FROM items WHERE id = ?`);
  const updTail = db.prepare(
    `UPDATE items SET content = @content, posted_at = @postedAt WHERE id = @id`,
  );
  const updDate = db.prepare(`UPDATE items SET posted_at = @postedAt WHERE id = @id`);
  const updText = db.prepare(`UPDATE items SET summary = @summary, reason = @reason WHERE id = @id`);
  const updBullets = db.prepare(
    `UPDATE channel_summaries SET bullets = @bullets WHERE date = @date AND source = @source AND service = @service`,
  );

  const tx = db.transaction(() => {
    for (const r of dcbest) del.run(r.id);
    for (const r of dropped) del.run(r.id);
    const deletedIds = new Set([...dcbest.map((r) => r.id), ...dropped.map((r) => r.id)]);
    for (const f of tailFixes) {
      if (deletedIds.has(f.id)) continue;
      updTail.run({ id: f.id, content: f.content, postedAt: f.postedAt ?? null });
    }
    for (const f of dateFixes) {
      if (deletedIds.has(f.id)) continue;
      updDate.run(f);
    }
    for (const f of textFixes) {
      if (deletedIds.has(f.id)) continue;
      updText.run(f);
    }
    for (const f of bulletFixes) updBullets.run(f);
  });
  tx();

  const left = (db.prepare(`SELECT COUNT(*) c FROM items`).get() as { c: number }).c;
  console.log(`\n적용 완료. 남은 항목 ${left.toLocaleString()}건`);
  console.log('분류를 다시 매기려면: npm run retag && npm run collect');
}

const db = openDb();
try {
  run(db);
} finally {
  db.close();
}
