import fs from 'node:fs';
import path from 'node:path';
import {
  loadPrivateEnv,
  localDate,
  localIso,
  openRadarStore,
  privateDir,
  rawServices,
  resolveServices,
} from '@feedback-radar/core';

loadPrivateEnv();

/**
 * 사내 배포용 데이터를 JSON으로 뽑는다.
 *
 * 사내 사본은 같은 화면 코드를 쓰고 DB 자리에만 이 파일들을 끼운다. 그래서 형태를 화면이
 * 기대하는 것(ItemRow, ChannelSummary)에 맞춘다. 배열을 압축하지 않는 이유는 이 데이터가
 * 브라우저로 가지 않기 때문이다. 사내 사본도 서버 렌더라 파일은 서버만 읽는다.
 *
 * **작성자 닉네임은 뺀다.** 원본은 한 대의 PC에만 있지만 사본은 사내에 놓인다. 글 내용과
 * 원문 링크는 판정을 검증하는 근거라서 남긴다.
 *
 * 실행: npm run export:json -- --out=<디렉터리>
 */

const argv = process.argv.slice(2);
const outDir = argv.find((a) => a.startsWith('--out='))?.split('=')[1] ?? path.join(privateDir(), 'export', 'data');

const db = await openRadarStore();
const anyDb = db as unknown as { db: { pool: { query: (s: string) => Promise<{ rows: Record<string, unknown>[] }> }; schema: string } };
const schema = `"${anyDb.db.schema}"`;
const q = async (sql: string) => (await anyDb.db.pool.query(sql)).rows;

const config = await db.getConfig();

/*
  무관 판정 글도 담는다. 목록의 [걸러진 글] 탭이 판정을 검증하는 자리이고, 그걸 빼면
  '무관 143건'이라고만 적히고 확인할 방법이 없다. 미분류는 담지 않는다(수집 직후 몇 분만
  존재하고, 사본을 굽는 시점에는 이미 분류가 끝나 있어야 한다).
*/
const items = (await q(`
  SELECT id, source, source_id, service, url, content, summary, reason,
         rating, posted_at, collected_at, tagged_at, relevant,
         category, sentiment, severity, team, lang, country, keyword
  FROM ${schema}."items"
  WHERE tagged_at IS NOT NULL
  ORDER BY posted_at DESC NULLS LAST, id DESC`)).map((r) => ({
  id: Number(r.id),
  source: r.source,
  sourceId: r.source_id,
  service: r.service ?? undefined,
  url: r.url ?? undefined,
  // 작성자(author)는 담지 않는다. 사본이 놓이는 자리가 넓어진다
  content: r.content,
  summary: r.summary ?? undefined,
  reason: r.reason ?? undefined,
  rating: r.rating == null ? undefined : Number(r.rating),
  postedAt: r.posted_at ?? undefined,
  collectedAt: r.collected_at ?? undefined,
  taggedAt: r.tagged_at ?? undefined,
  // 화면 타입이 boolean이다. DB의 0/1을 원본 rowToItem과 같은 방식으로 바꾼다
  relevant: r.relevant == null ? undefined : Number(r.relevant) === 1,
  category: r.category ?? undefined,
  sentiment: r.sentiment ?? undefined,
  severity: r.severity ?? undefined,
  team: r.team ?? undefined,
  lang: r.lang ?? undefined,
  country: r.country ?? undefined,
  keyword: r.keyword ?? undefined,
}));

const summaries = (await q(`
  SELECT date::text AS date, source, service, country, total, negative, urgent,
         bullets, model, input_tokens, output_tokens, cost_usd, created_at::text AS created_at
  FROM ${schema}."channel_summaries" ORDER BY date DESC, total DESC`)).map((r) => ({
  date: r.date,
  source: r.source,
  service: r.service ?? '',
  country: r.country ?? '',
  total: Number(r.total),
  negative: Number(r.negative),
  urgent: Number(r.urgent ?? 0),
  bullets: typeof r.bullets === 'string' ? JSON.parse(r.bullets as string) : r.bullets,
  model: r.model ?? undefined,
  inputTokens: r.input_tokens == null ? undefined : Number(r.input_tokens),
  outputTokens: r.output_tokens == null ? undefined : Number(r.output_tokens),
  costUsd: r.cost_usd == null ? undefined : Number(r.cost_usd),
  createdAt: r.created_at,
}));

/** 화면이 설정에서 읽는 값 중 사본에 필요한 것만. 키와 접속 정보는 담지 않는다 */
const meta = {
  displayName: config.displayName,
  services: resolveServices(config).map((s) => ({ name: s.name, keywords: s.keywords })),
  rawServiceCount: rawServices(config).length,
  generatedAt: localIso(),
  generatedDate: localDate(),
};

fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, value: unknown) => {
  const p = path.join(outDir, name);
  const json = JSON.stringify(value);
  fs.writeFileSync(p, json, 'utf8');
  return `${name} ${(Buffer.byteLength(json, 'utf8') / 1024 / 1024).toFixed(2)}MB`;
};

console.log(write('items.json', items));
console.log(write('summaries.json', summaries));
console.log(write('meta.json', meta));
const relevant = items.filter((i) => i.relevant === true || (i.relevant == null && i.taggedAt)).length;
console.log(`\n글 ${items.length.toLocaleString()}건 (관련 ${relevant.toLocaleString()}, 무관 ${(items.length - relevant).toLocaleString()})`);
console.log(`채널 요약 ${summaries.length}개, 서비스 ${meta.services.length}개`);
console.log(`-> ${outDir}`);
await db.close();
