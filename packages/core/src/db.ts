import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { defaultDbPath } from './paths.js';
import { localIso } from './time.js';
import type { ItemRow, RawItem, TagResult } from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT,
  author TEXT,
  content TEXT NOT NULL,
  rating INTEGER,
  posted_at TEXT,
  collected_at TEXT NOT NULL,
  keyword TEXT,
  service TEXT,
  country TEXT,
  sentiment TEXT,
  category TEXT,
  severity TEXT,
  team TEXT,
  summary TEXT,
  relevant INTEGER,
  reason TEXT,
  tagged_at TEXT,
  UNIQUE(source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_items_collected ON items(collected_at);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_summaries (
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  service TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  negative INTEGER NOT NULL,
  urgent INTEGER NOT NULL,
  bullets TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, source, service, country)
);
`;

/**
 * 수집 작업 하나하나의 진행 상태.
 *
 * 한 번 수집하면 서비스와 소스와 국가를 조합한 작업이 수십 개 생기고, 브라우저 스크래핑이
 * 섞여 있어 몇 분씩 걸린다. 그동안 화면에는 '실행 중'이라는 한 줄만 떠서, 어디까지 갔는지
 * 무엇이 남았는지 왜 안 도는지를 알 수 없었다. 터미널 로그를 봐야 알 수 있는 정보였고
 * 대시보드만 보는 사람에게는 그냥 멈춘 것처럼 보였다.
 *
 * 작업은 병렬로 도니 '진행 중'이 여러 개일 수 있다. 상태를 작업 단위로 남겨 두면 화면이
 * 완료와 진행과 대기를 갈라 보여줄 수 있다.
 */
const SCHEMA_PROGRESS = `
CREATE TABLE IF NOT EXISTS collect_progress (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  service TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  collected INTEGER,
  inserted INTEGER,
  note TEXT,
  started_at TEXT,
  ended_at TEXT,
  PRIMARY KEY (run_id, seq)
);
`;

/**
 * 요약 표에 country를 넣는 마이그레이션.
 *
 * country는 기본키의 일부다. 같은 채널을 국가별로 따로 요약하므로 (날짜, 채널, 서비스)만으로는
 * 행이 겹친다. SQLite는 기본키 변경을 지원하지 않아 표를 새로 만들어 옮기는 수밖에 없다.
 * 국가가 없는 채널(커뮤니티, SNS)과 이 컬럼이 붙기 전에 만든 요약은 빈 문자열로 둔다.
 * NULL이 아니라 빈 문자열인 이유는 기본키 컬럼이라서다.
 */
const MIGRATE_SUMMARY_COUNTRY = `
CREATE TABLE channel_summaries_mig (
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  service TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL,
  negative INTEGER NOT NULL,
  urgent INTEGER NOT NULL,
  bullets TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, source, service, country)
);
INSERT INTO channel_summaries_mig
  (date, source, service, country, total, negative, urgent, bullets, model, input_tokens, output_tokens, cost_usd, created_at)
  SELECT date, source, service, '', total, negative, urgent, bullets, model, input_tokens, output_tokens, cost_usd, created_at
  FROM channel_summaries;
DROP TABLE channel_summaries;
ALTER TABLE channel_summaries_mig RENAME TO channel_summaries;
`;

/**
 * 실행 중단 요청이 담기는 키.
 *
 * 대시보드(웹 프로세스)와 파이프라인(스케줄러 프로세스)은 메모리를 공유하지 않아서 신호를
 * 변수로 넘길 수 없다. 두 프로세스가 같은 SQLite 파일을 보므로 다른 상태들과 같은 방식으로
 * settings를 거친다. 키를 상수로 두는 이유: 양쪽 문자열이 어긋나면 버튼이 조용히 안 먹는다.
 */
export const RUN_CANCEL_KEY = 'runCancelAt';

/** 지금 보내는 LLM 프롬프트 정보가 담기는 키 (화면에 그대로 띄운다) */
export const RUN_TAG_CALL_KEY = 'runTagCall';

/** 스케줄러↔대시보드가 공유하는 설정 저장소 (프로세스 간 통신 채널 겸용) */
export function getSetting(db: RadarDb, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(db: RadarDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function getSettings(db: RadarDb): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export type RadarDb = Database.Database;

export function openDb(dbPath = defaultDbPath()): RadarDb {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  db.exec(SCHEMA_PROGRESS);
  // 구버전 DB 마이그레이션 — 컬럼이 없으면 붙인다 (기존 행은 NULL로 남는다)
  const cols = new Set((db.prepare(`PRAGMA table_info(items)`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('relevant')) db.exec(`ALTER TABLE items ADD COLUMN relevant INTEGER`);
  if (!cols.has('reason')) db.exec(`ALTER TABLE items ADD COLUMN reason TEXT`);
  if (!cols.has('service')) {
    db.exec(`ALTER TABLE items ADD COLUMN service TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_items_service ON items(service)`);
  }
  if (!cols.has('country')) {
    // 이 컬럼이 붙기 전에 모은 앱 리뷰는 전부 국내 스토어 조회분이지만,
    // 그렇다고 'kr'로 채우지는 않는다 — 추측한 값과 실제로 확인한 값이 섞이면
    // 국가별 집계에서 어느 쪽이 사실인지 구분할 수 없다. NULL로 두고 재수집에 맡긴다.
    db.exec(`ALTER TABLE items ADD COLUMN country TEXT`);
  }
  // 목록을 작성일 최신순으로 정렬하고 기간으로 거른다 — 건수가 늘어도 정렬이 풀스캔이 되지 않게
  db.exec(`CREATE INDEX IF NOT EXISTS idx_items_posted ON items(posted_at)`);

  // 요약 표의 기본키 확장. 표를 갈아치우는 작업이라 중간에 끊기면 요약을 잃는다. 통째로 묶는다.
  const sumCols = new Set(
    (db.prepare(`PRAGMA table_info(channel_summaries)`).all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );
  if (sumCols.size > 0 && !sumCols.has('country')) {
    db.transaction(() => db.exec(MIGRATE_SUMMARY_COUNTRY))();
  }
  return db;
}

/** 관련성 필터: relevant=0(무관 판정)만 제외. NULL(구버전 데이터)은 관련으로 취급 */
const RELEVANT = `(relevant IS NULL OR relevant != 0)`;

/**
 * 하루치 범위 조건. `substr(collected_at,1,10) = ?`는 인덱스를 못 타서 풀스캔이 되므로
 * 사전순 범위 비교로 idx_items_collected를 그대로 쓴다.
 * collected_at은 'YYYY-MM-DDT…' 형식이라 'YYYY-MM-DD' < 'YYYY-MM-DDT…' < 'YYYY-MM-(DD+1)'이 성립한다.
 * 파라미터는 날짜 문자열을 두 번 바인딩한다.
 */
const DAY_RANGE = `collected_at >= ? AND collected_at < date(?, '+1 day')`;

/** 중복(source+sourceId)은 무시하고 신규 건수만 반환 */
export function insertItems(db: RadarDb, items: RawItem[]): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO items (source, source_id, url, author, content, rating, posted_at, collected_at, keyword, service, country)
    VALUES (@source, @sourceId, @url, @author, @content, @rating, @postedAt, @collectedAt, @keyword, @service, @country)
  `);
  const now = localIso();
  let inserted = 0;
  const run = db.transaction((rows: RawItem[]) => {
    for (const r of rows) {
      const res = stmt.run({
        source: r.source,
        sourceId: r.sourceId,
        url: r.url ?? null,
        author: r.author ?? null,
        content: r.content,
        rating: r.rating ?? null,
        postedAt: r.postedAt ?? null,
        collectedAt: now,
        keyword: r.keyword ?? null,
        service: r.service ?? null,
        country: r.country ?? null,
      });
      inserted += res.changes;
    }
  });
  run(items);
  return inserted;
}

function rowToItem(r: Record<string, unknown>): ItemRow {
  return {
    id: r.id as number,
    source: r.source as string,
    sourceId: r.source_id as string,
    url: (r.url as string) ?? undefined,
    author: (r.author as string) ?? undefined,
    content: r.content as string,
    rating: (r.rating as number) ?? undefined,
    postedAt: (r.posted_at as string) ?? undefined,
    collectedAt: r.collected_at as string,
    keyword: (r.keyword as string) ?? undefined,
    service: (r.service as string) ?? undefined,
    country: (r.country as string) ?? undefined,
    sentiment: (r.sentiment as ItemRow['sentiment']) ?? undefined,
    category: (r.category as ItemRow['category']) ?? undefined,
    severity: (r.severity as ItemRow['severity']) ?? undefined,
    team: (r.team as ItemRow['team']) ?? undefined,
    summary: (r.summary as string) ?? undefined,
    relevant: r.relevant == null ? undefined : Boolean(r.relevant),
    reason: (r.reason as string) ?? undefined,
    taggedAt: (r.tagged_at as string) ?? undefined,
  };
}

/**
 * 아직 분류되지 않은 건수.
 *
 * 실행 전에 분류 호출이 몇 번 필요한지 추산하는 데 쓴다. getUntagged로 세면 본문까지
 * 수천 건을 읽어 오므로 화면 렌더에 쓰기엔 무겁다.
 */
export function countUntagged(db: RadarDb): number {
  return (db.prepare(`SELECT COUNT(*) c FROM items WHERE tagged_at IS NULL`).get() as { c: number })
    .c;
}

export function getUntagged(db: RadarDb, limit = 2000): ItemRow[] {
  const rows = db
    .prepare(`SELECT * FROM items WHERE tagged_at IS NULL ORDER BY id DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToItem);
}

export function saveTags(db: RadarDb, tags: Map<number, TagResult>): void {
  const stmt = db.prepare(`
    UPDATE items SET sentiment=@sentiment, category=@category, severity=@severity,
      team=@team, summary=@summary, relevant=@relevant, reason=@reason, tagged_at=@taggedAt WHERE id=@id
  `);
  const now = localIso();
  const run = db.transaction(() => {
    for (const [id, t] of tags)
      // undefined는 better-sqlite3가 바인딩을 거부한다 — 근거를 못 받은 건은 NULL로 넣는다
      stmt.run({ id, ...t, relevant: t.relevant ? 1 : 0, reason: t.reason ?? null, taggedAt: now });
  });
  run();
}

/** 특정 날짜(YYYY-MM-DD, collected_at 기준)에 수집된 관련 아이템 (무관 판정 제외) */
export function getItemsByDate(db: RadarDb, date: string): ItemRow[] {
  const rows = db
    .prepare(`SELECT * FROM items WHERE ${DAY_RANGE} AND ${RELEVANT} ORDER BY id DESC`)
    .all(date, date) as Record<string, unknown>[];
  return rows.map(rowToItem);
}

/** 해당 날짜에 관련성 필터로 제외된 건수 */
export function countIrrelevantForDate(db: RadarDb, date: string): number {
  return (
    db.prepare(`SELECT COUNT(*) as c FROM items WHERE ${DAY_RANGE} AND relevant = 0`).get(date, date) as {
      c: number;
    }
  ).c;
}

/**
 * 최근 수집 목록.
 *
 * 무관 판정 글은 지우지 않고 남겨 두므로(판정 검증용), 그냥 다 보여주면
 * 동음이의어 노이즈가 목록을 덮어 정작 봐야 할 글이 묻힌다. 그래서 기본은 관련 글만 보여주고
 * 무관 글은 따로 꺼내 볼 수 있게 한다.
 */
export type RelevanceFilter = 'relevant' | 'irrelevant' | 'all';

/** 조건들을 WHERE 절로 조립한다. 남는 조건이 없으면 절 자체를 만들지 않는다 */
function where(...conds: (string | null)[]): string {
  const on = conds.filter(Boolean);
  return on.length ? `WHERE ${on.join(' AND ')}` : '';
}

function relevanceCond(filter: RelevanceFilter): string | null {
  if (filter === 'relevant') return RELEVANT;
  if (filter === 'irrelevant') return `relevant = 0`;
  return null;
}

/**
 * 서비스 필터 — 여러 서비스를 함께 추적할 때 하나만 떼어 본다.
 * 조건과 바인딩 파라미터가 항상 짝을 이뤄야 해서 둘을 같이 만든다.
 */
const serviceCond = (service?: string): string | null => (service ? `service = ?` : null);
const serviceParams = (service?: string): string[] => (service ? [service] : []);

/**
 * 작성일(posted_at) 기준 기간 필터. `from`은 'YYYY-MM-DD'.
 *
 * posted_at은 소스마다 형식이 다르다('2026-06-03' · '2026-07-30T20:07:39-07:00' · '…Z').
 * 전부 ISO 계열이라 사전순 비교가 날짜 비교와 같은 결과를 준다.
 * 값이 없는 건(디시 검색 결과 일부 등)은 날짜를 알 수 없으므로 기간을 걸면 빠진다.
 */
const postedFromCond = (from?: string): string | null => (from ? `posted_at >= ?` : null);
const postedFromParams = (from?: string): string[] => (from ? [from] : []);

/**
 * 카테고리 필터 — 집계 표에서 '앱 오류 9건'을 보고 그 9건이 실제로 어떤 글인지
 * 바로 열어 볼 수 있어야 한다. 숫자만 보여주면 판단의 근거를 확인할 방법이 없다.
 */
const categoryCond = (category?: string): string | null => (category ? `category = ?` : null);
const categoryParams = (category?: string): string[] => (category ? [category] : []);

/**
 * 국가 필터 — 같은 앱이라도 스토어 국가마다 반응이 갈린다.
 *
 * 커뮤니티와 SNS 글은 country가 NULL이므로 국가를 지정하면 목록에서 빠진다. 그게 의도다.
 * 국가별로 보는 건 앱 리뷰에서만 뜻이 있고, 커뮤니티 글을 특정 국가에 끼워 넣으면
 * 근거 없는 분류가 된다.
 */
const countryCond = (country?: string): string | null => (country ? `country = ?` : null);
const countryParams = (country?: string): string[] => (country ? [country] : []);

/**
 * 채널 필터 — 수집 진행 화면에서 '이 작업이 뭘 가져왔나'를 열어 보는 데 쓴다.
 *
 * 네이버만 예외다. 수집 작업은 'naver' 하나인데 저장은 'naver-blog'와 'naver-cafe'로
 * 갈린다. 작업 단위로 필터하려면 접두사로 맞춰야 한다. 등호로 비교하면 0건이 나온다.
 */
const sourceCond = (source?: string): string | null =>
  source ? (source === 'naver' ? `source LIKE 'naver%'` : `source = ?`) : null;
const sourceParams = (source?: string): string[] =>
  source && source !== 'naver' ? [source] : [];

/**
 * 감성 필터 — 브리핑의 '부정 3'을 눌러 그 3건이 실제로 어떤 글인지 열어 볼 수 있어야 한다.
 * 숫자만 보여주면 판단의 근거를 확인할 방법이 없다.
 */
const sentimentCond = (sentiment?: string): string | null =>
  sentiment ? `sentiment = ?` : null;
const sentimentParams = (sentiment?: string): string[] => (sentiment ? [sentiment] : []);

/** 목록 조회 조건 — 인자가 늘어 순서로 넘기면 헷갈린다 */
export interface ItemQuery {
  filter?: RelevanceFilter;
  service?: string;
  /** 작성일이 이 날짜 이후인 것만 (YYYY-MM-DD) */
  postedFrom?: string;
  category?: string;
  /** 앱 리뷰를 가져온 스토어 국가 (소문자 두 자). 지정하면 국가가 없는 커뮤니티 글은 빠진다 */
  country?: string;
  /** 수집 채널. 'naver'는 naver-blog와 naver-cafe를 함께 잡는다 */
  source?: string;
  /** 감성 (positive | neutral | negative) */
  sentiment?: string;
}

/** 조건과 바인딩 순서가 어긋나면 조용히 엉뚱한 값이 걸린다 — 둘을 같은 순서로 만든다 */
function queryWhere(q: ItemQuery): { sql: string; params: string[] } {
  return {
    sql: where(
      relevanceCond(q.filter ?? 'all'),
      serviceCond(q.service),
      postedFromCond(q.postedFrom),
      categoryCond(q.category),
      countryCond(q.country),
      sourceCond(q.source),
      sentimentCond(q.sentiment),
    ),
    params: [
      ...serviceParams(q.service),
      ...postedFromParams(q.postedFrom),
      ...categoryParams(q.category),
      ...countryParams(q.country),
      ...sourceParams(q.source),
      ...sentimentParams(q.sentiment),
    ],
  };
}

export function getRecentItems(db: RadarDb, limit = 50, q: ItemQuery = {}, offset = 0): ItemRow[] {
  const { sql, params } = queryWhere(q);
  // 작성일 최신순. 날짜를 못 가져온 건은 뒤로 밀고, 그 안에서는 수집 순서를 쓴다.
  // (id DESC만 쓰면 작성일 열의 값이 뒤죽박죽으로 보인다)
  const rows = db
    .prepare(
      `SELECT * FROM items ${sql}
       ORDER BY (posted_at IS NULL OR posted_at = '') ASC, posted_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Record<string, unknown>[];
  return rows.map(rowToItem);
}

/** 기간 필터를 적용한 총 건수 (페이저용) */
export function countItems(db: RadarDb, q: ItemQuery = {}): number {
  const { sql, params } = queryWhere(q);
  return (db.prepare(`SELECT COUNT(*) as c FROM items ${sql}`).get(...params) as { c: number }).c;
}

/** 탭에 표시할 건수 — 현재 서비스·기간 선택을 그대로 반영한다 */
export function countByRelevance(
  db: RadarDb,
  service?: string,
  postedFrom?: string,
): { relevant: number; irrelevant: number } {
  return {
    relevant: countItems(db, { filter: 'relevant', service, postedFrom }),
    irrelevant: countItems(db, { filter: 'irrelevant', service, postedFrom }),
  };
}

export interface SourceCoverage {
  source: string;
  count: number;
  /** 작성일 범위 (YYYY-MM-DD). 날짜를 못 가져온 소스는 undefined */
  oldest?: string;
  newest?: string;
}

/**
 * 소스별로 지금까지 실제로 어디까지 긁어왔는지.
 *
 * 상한을 키우면 최근 글이 더 온다고 오해하기 쉽다. 앱 리뷰는 이미 있는 걸 다 가져오는
 * 중이라 값을 키우면 **더 옛날 리뷰**가 딸려올 뿐인데, 실제 범위를 보여주면 바로 드러난다.
 */
export function sourceCoverage(db: RadarDb): SourceCoverage[] {
  return db
    .prepare(
      `SELECT source,
              COUNT(*) as count,
              MIN(NULLIF(substr(posted_at, 1, 10), '')) as oldest,
              MAX(NULLIF(substr(posted_at, 1, 10), '')) as newest
       FROM items GROUP BY source ORDER BY count DESC`,
    )
    .all() as SourceCoverage[];
}

/** 서비스 선택 칩에 표시할 건수. service가 비어 있는 구버전 데이터는 뺀다 */
export function countByService(
  db: RadarDb,
  filter: RelevanceFilter = 'relevant',
  postedFrom?: string,
  country?: string,
): { service: string; count: number }[] {
  return db
    .prepare(
      `SELECT service, COUNT(*) as count FROM items
       ${where(
         relevanceCond(filter),
         `service IS NOT NULL`,
         postedFromCond(postedFrom),
         countryCond(country),
       )}
       GROUP BY service ORDER BY count DESC`,
    )
    .all(...postedFromParams(postedFrom), ...countryParams(country)) as {
    service: string;
    count: number;
  }[];
}

/**
 * 목록 탭의 카테고리 칩 건수.
 *
 * 집계 표에서 카테고리를 눌러 목록으로 들어오면 그 카테고리만 보이는데, 거기서 다른
 * 카테고리로 옮길 방법이 없으면 브리핑 탭으로 되돌아가 다시 눌러야 한다.
 * 서비스와 기간처럼 칩으로 전환할 수 있어야 한다.
 */
export function countByCategory(
  db: RadarDb,
  filter: RelevanceFilter = 'relevant',
  service?: string,
  postedFrom?: string,
  country?: string,
): { category: string; count: number }[] {
  return db
    .prepare(
      `SELECT category, COUNT(*) as count FROM items
       ${where(
         relevanceCond(filter),
         `category IS NOT NULL`,
         serviceCond(service),
         postedFromCond(postedFrom),
         countryCond(country),
       )}
       GROUP BY category ORDER BY count DESC`,
    )
    .all(
      ...serviceParams(service),
      ...postedFromParams(postedFrom),
      ...countryParams(country),
    ) as {
    category: string;
    count: number;
  }[];
}

/**
 * 국가별 앱 리뷰 건수와 부정 비율.
 *
 * 국내 스토어만 보던 동안 해외 반응이 얼마나 빠져 있었는지가 이 표에서 바로 드러난다.
 * country가 NULL인 행(커뮤니티 글, 그리고 국가 기록 전에 모은 앱 리뷰)은 제외한다 —
 * 국가를 모르는 건을 특정 국가로 세면 집계가 사실과 달라진다.
 */
export function countByCountry(
  db: RadarDb,
  filter: RelevanceFilter = 'relevant',
  service?: string,
  postedFrom?: string,
): { country: string; count: number; negative: number }[] {
  return db
    .prepare(
      `SELECT country,
              COUNT(*) as count,
              SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) as negative
       FROM items
       ${where(
         relevanceCond(filter),
         `country IS NOT NULL`,
         serviceCond(service),
         postedFromCond(postedFrom),
       )}
       GROUP BY country ORDER BY count DESC`,
    )
    .all(...serviceParams(service), ...postedFromParams(postedFrom)) as {
    country: string;
    count: number;
    negative: number;
  }[];
}

/**
 * 감성별 건수. 목록 탭의 감성 칩에 쓴다.
 *
 * 브리핑 카드는 부정 건수만 강조해서 보여준다. 긍정과 중립이 각각 몇 건인지, 그리고
 * 그 글들이 실제로 무엇인지는 목록에서 확인해야 한다.
 */
export function countBySentiment(
  db: RadarDb,
  filter: RelevanceFilter = 'relevant',
  service?: string,
  postedFrom?: string,
  country?: string,
): { sentiment: string; count: number }[] {
  return db
    .prepare(
      `SELECT sentiment, COUNT(*) as count FROM items
       ${where(
         relevanceCond(filter),
         `sentiment IS NOT NULL`,
         serviceCond(service),
         postedFromCond(postedFrom),
         countryCond(country),
       )}
       GROUP BY sentiment ORDER BY count DESC`,
    )
    .all(
      ...serviceParams(service),
      ...postedFromParams(postedFrom),
      ...countryParams(country),
    ) as { sentiment: string; count: number }[];
}

export interface CategoryCount {
  category: string;
  count: number;
  negative: number;
}

export function categoryCountsForDate(
  db: RadarDb,
  date: string,
  service?: string,
): CategoryCount[] {
  return db
    .prepare(
      `SELECT category, COUNT(*) as count,
              SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) as negative
       FROM items ${where(DAY_RANGE, `category IS NOT NULL`, RELEVANT, serviceCond(service))}
       GROUP BY category ORDER BY count DESC`,
    )
    .all(date, date, ...serviceParams(service)) as CategoryCount[];
}

const WINDOW_BEFORE = `collected_at < ? AND collected_at >= date(?, '-' || ? || ' days')`;

/**
 * 직전 N일(기준일 제외) 중 **실제로 수집이 있었던 날 수**.
 *
 * 급증 판정의 전제 조건이다. 0이면 비교할 기준선이 없다는 뜻이므로,
 * 이때 나온 '평균 0건'을 근거로 급증이라고 말하면 안 된다.
 */
export function countCollectionDays(db: RadarDb, beforeDate: string, days = 7): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT substr(collected_at, 1, 10)) as c FROM items WHERE ${WINDOW_BEFORE}`,
      )
      .get(beforeDate, beforeDate, days) as { c: number }
  ).c;
}

/**
 * 직전 N일(기준일 제외)의 카테고리별 일평균 언급량.
 *
 * 나누는 값은 N이 아니라 **실제 수집일 수**다. 스케줄러를 이제 막 켰거나 며칠 걸렀을 때
 * 7로 나누면 기준선이 실제보다 몇 배 낮게 잡혀, 평소와 같은 양도 급증으로 찍힌다.
 * 수집일이 하루도 없으면 평균을 낼 근거가 없으므로 빈 Map을 준다.
 */
export function categoryDailyAverage(db: RadarDb, beforeDate: string, days = 7): Map<string, number> {
  const collectedDays = countCollectionDays(db, beforeDate, days);
  if (collectedDays === 0) return new Map();
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) * 1.0 / ? as avg
       FROM items
       WHERE category IS NOT NULL AND ${RELEVANT} AND ${WINDOW_BEFORE}
       GROUP BY category`,
    )
    .all(collectedDays, beforeDate, beforeDate, days) as { category: string; avg: number }[];
  return new Map(rows.map((r) => [r.category, r.avg]));
}

export interface DashboardStats {
  total: number;
  today: number;
  bySource: { source: string; count: number }[];
  bySentiment: { sentiment: string; count: number }[];
}

export interface PitchStats {
  total: number;
  tagged: number;
  irrelevant: number;
  negative: number;
  urgent: number;
  bySource: { source: string; count: number }[];
  byCategory: { category: string; count: number }[];
  collectDays: number;
  firstCollectedAt?: string;
  lastCollectedAt?: string;
}

/** 발표용 누적 지표 — 화면에 쓰는 숫자는 전부 실제 DB 집계에서 나온다 */
export function getPitchStats(db: RadarDb): PitchStats {
  const one = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
  const span = db
    .prepare(
      `SELECT MIN(collected_at) as first, MAX(collected_at) as last,
              COUNT(DISTINCT substr(collected_at,1,10)) as days FROM items`,
    )
    .get() as { first?: string; last?: string; days: number };
  return {
    total: one(`SELECT COUNT(*) as c FROM items`),
    tagged: one(`SELECT COUNT(*) as c FROM items WHERE tagged_at IS NOT NULL`),
    irrelevant: one(`SELECT COUNT(*) as c FROM items WHERE relevant = 0`),
    negative: one(`SELECT COUNT(*) as c FROM items WHERE sentiment = 'negative' AND ${RELEVANT}`),
    urgent: one(
      `SELECT COUNT(*) as c FROM items
       WHERE sentiment = 'negative' AND severity IN ('high','critical') AND ${RELEVANT}`,
    ),
    bySource: db
      .prepare(`SELECT source, COUNT(*) as count FROM items GROUP BY source ORDER BY count DESC`)
      .all() as { source: string; count: number }[],
    byCategory: db
      .prepare(
        `SELECT category, COUNT(*) as count FROM items
         WHERE category IS NOT NULL AND ${RELEVANT} GROUP BY category ORDER BY count DESC`,
      )
      .all() as { category: string; count: number }[],
    collectDays: span.days,
    firstCollectedAt: span.first ?? undefined,
    lastCollectedAt: span.last ?? undefined,
  };
}

export function getDashboardStats(db: RadarDb, date: string, service?: string): DashboardStats {
  const sp = serviceParams(service);
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM items ${where(serviceCond(service))}`).get(...sp) as {
      c: number;
    }
  ).c;
  const today = (
    db
      .prepare(`SELECT COUNT(*) as c FROM items ${where(DAY_RANGE, serviceCond(service))}`)
      .get(date, date, ...sp) as { c: number }
  ).c;
  const bySource = db
    .prepare(
      `SELECT source, COUNT(*) as count FROM items ${where(serviceCond(service))}
       GROUP BY source ORDER BY count DESC`,
    )
    .all(...sp) as { source: string; count: number }[];
  const bySentiment = db
    .prepare(
      `SELECT sentiment, COUNT(*) as count FROM items
       ${where(`sentiment IS NOT NULL`, RELEVANT, serviceCond(service))} GROUP BY sentiment`,
    )
    .all(...sp) as { sentiment: string; count: number }[];
  return { total, today, bySource, bySentiment };
}

/**
 * 채널 하나에 대한 하루치 AI 요약.
 *
 * 토큰·비용을 함께 저장하는 이유: 요약은 이 도구에서 유일하게 '분류'가 아닌 LLM 용도라
 * 비용이 어디서 늘었는지 분리해서 볼 수 있어야 한다. 화면과 발표 자료가 이 값을 그대로 쓴다.
 */
export interface ChannelSummary {
  date: string;
  source: string;
  /** 서비스명. 여러 서비스를 함께 추적하지 않으면 빈 문자열 */
  service: string;
  /**
   * 앱 리뷰를 가져온 스토어 국가. 국가가 없는 채널(커뮤니티, SNS)은 빈 문자열.
   *
   * 국가를 섞어 한 장으로 요약하면 국가마다 다른 이슈가 평균에 묻힌다. 한 국가에서
   * 잘 도는 기능이 다른 국가에서는 불만 1순위인 경우가 실제로 있다.
   */
  country: string;
  total: number;
  negative: number;
  urgent: number;
  bullets: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt: string;
}

interface SummaryRow {
  date: string;
  source: string;
  service: string;
  country: string;
  total: number;
  negative: number;
  urgent: number;
  bullets: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

function rowToSummary(r: SummaryRow): ChannelSummary {
  let bullets: string[] = [];
  try {
    const parsed = JSON.parse(r.bullets) as unknown;
    if (Array.isArray(parsed)) bullets = parsed.filter((b): b is string => typeof b === 'string');
  } catch {
    // 저장된 값이 깨졌으면 요약 없이 집계만 보여준다
  }
  return {
    date: r.date,
    source: r.source,
    service: r.service,
    // 구버전 행에는 이 컬럼이 없다 (마이그레이션이 빈 문자열로 채우지만 방어적으로 둔다)
    country: r.country ?? '',
    total: r.total,
    negative: r.negative,
    urgent: r.urgent,
    bullets,
    model: r.model ?? undefined,
    inputTokens: r.input_tokens ?? undefined,
    outputTokens: r.output_tokens ?? undefined,
    costUsd: r.cost_usd ?? undefined,
    createdAt: r.created_at,
  };
}

/**
 * 같은 (날짜, 채널, 서비스, 국가)를 다시 요약하면 덮어쓴다.
 * 하루에 여러 번 수집해도 최신 것만 남는다.
 */
export function saveChannelSummary(db: RadarDb, s: Omit<ChannelSummary, 'createdAt'>): void {
  db.prepare(
    `INSERT INTO channel_summaries
       (date, source, service, country, total, negative, urgent, bullets, model, input_tokens, output_tokens, cost_usd, created_at)
     VALUES (@date, @source, @service, @country, @total, @negative, @urgent, @bullets, @model, @inputTokens, @outputTokens, @costUsd, @createdAt)
     ON CONFLICT(date, source, service, country) DO UPDATE SET
       total = excluded.total, negative = excluded.negative, urgent = excluded.urgent,
       bullets = excluded.bullets, model = excluded.model,
       input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
       cost_usd = excluded.cost_usd, created_at = excluded.created_at`,
  ).run({
    date: s.date,
    source: s.source,
    service: s.service,
    country: s.country ?? '',
    total: s.total,
    negative: s.negative,
    urgent: s.urgent,
    bullets: JSON.stringify(s.bullets),
    model: s.model ?? null,
    inputTokens: s.inputTokens ?? null,
    outputTokens: s.outputTokens ?? null,
    costUsd: s.costUsd ?? null,
    createdAt: localIso(),
  });
}

/** 특정 날짜의 채널별 요약. 건수 많은 채널 순 */
export function getChannelSummaries(db: RadarDb, date: string, service?: string): ChannelSummary[] {
  const rows = db
    .prepare(
      `SELECT * FROM channel_summaries
       ${where(`date = ?`, service ? `service = ?` : null)}
       ORDER BY total DESC`,
    )
    .all(date, ...(service ? [service] : [])) as SummaryRow[];
  return rows.map(rowToSummary);
}

/** 요약이 있는 날짜들 (최신순) — 화면에서 날짜를 넘겨 볼 수 있게 */
export function getSummaryDates(db: RadarDb, limit = 14): string[] {
  return (
    db
      .prepare(`SELECT DISTINCT date FROM channel_summaries ORDER BY date DESC LIMIT ?`)
      .all(limit) as { date: string }[]
  ).map((r) => r.date);
}

export interface TrendCell {
  date: string;
  source: string;
  /** 앱 리뷰의 스토어 국가. 국가가 없는 채널은 빈 문자열 (요약 카드와 같은 단위로 맞춘다) */
  country: string;
  count: number;
  negative: number;
}

/**
 * 날짜×채널 건수 격자 (작성일 기준, 최근 N일).
 *
 * 요약은 '그날 무슨 얘기가 있었나'를 말해 주지만 '늘고 있나'는 못 말한다.
 * 추이를 같이 보여줘야 하루치 요약이 맥락을 얻는다.
 */
export function getChannelTrend(db: RadarDb, days = 7, service?: string): TrendCell[] {
  return db
    .prepare(
      `SELECT substr(posted_at, 1, 10) AS date, source,
              COALESCE(country, '') AS country,
              COUNT(*) AS count,
              SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative
       FROM items
       ${where(
         `posted_at IS NOT NULL AND posted_at <> ''`,
         `substr(posted_at, 1, 10) >= date('now', 'localtime', '-' || ? || ' days')`,
         RELEVANT,
         serviceCond(service),
       )}
       GROUP BY date, source, country
       ORDER BY date, source, country`,
    )
    .all(days - 1, ...serviceParams(service)) as TrendCell[];
}

export type CollectTaskState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** 수집 작업 하나 — 화면이 완료와 진행과 대기를 갈라 보여주는 단위 */
export interface CollectTask {
  seq: number;
  service: string;
  source: string;
  /** 앱 스토어 국가. 국가 개념이 없는 소스는 빈 문자열 */
  country: string;
  state: CollectTaskState;
  /** 스토어나 검색이 돌려준 건수 */
  collected?: number;
  /** 그중 실제로 새로 저장된 건수 (이미 있는 건 UNIQUE로 걸러진다) */
  inserted?: number;
  /** 실패 사유나 건너뛴 이유. 왜 0건인지를 화면에서 알 수 있어야 한다 */
  note?: string;
  startedAt?: string;
  endedAt?: string;
}

interface ProgressRow {
  seq: number;
  service: string;
  source: string;
  country: string;
  state: string;
  collected: number | null;
  inserted: number | null;
  note: string | null;
  started_at: string | null;
  ended_at: string | null;
}

/**
 * 수집을 시작하며 작업 목록을 pending으로 기록한다. 반환값은 이번 실행 식별자.
 *
 * 이전 실행 기록은 지운다. 이 화면은 '지금 무엇을 하고 있나'를 보는 곳이라 지난 실행이
 * 섞이면 완료 목록만 끝없이 길어져 정작 진행 중인 것이 묻힌다.
 */
export function startCollectRun(
  db: RadarDb,
  tasks: { service: string; source: string; country: string }[],
): string {
  const runId = localIso();
  const ins = db.prepare(
    `INSERT INTO collect_progress (run_id, seq, service, source, country, state)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
  );
  db.transaction(() => {
    db.prepare(`DELETE FROM collect_progress`).run();
    tasks.forEach((t, i) => ins.run(runId, i, t.service, t.source, t.country));
  })();
  return runId;
}

/**
 * 작업 상태를 갱신한다.
 *
 * 건수와 사유는 COALESCE로 덮어쓴다 — running으로 바꿀 때 아직 모르는 값이 기존 값을
 * 지우면 안 된다. 시각은 상태 전이에 맞춰 한 번만 찍는다.
 */
export function markCollectTask(
  db: RadarDb,
  runId: string,
  seq: number,
  patch: { state: CollectTaskState; collected?: number; inserted?: number; note?: string },
): void {
  db.prepare(
    `UPDATE collect_progress SET
       state = @state,
       collected = COALESCE(@collected, collected),
       inserted = COALESCE(@inserted, inserted),
       note = COALESCE(@note, note),
       started_at = CASE WHEN @state = 'running' THEN @now ELSE started_at END,
       ended_at = CASE WHEN @state IN ('done', 'failed', 'skipped') THEN @now ELSE ended_at END
     WHERE run_id = @runId AND seq = @seq`,
  ).run({
    runId,
    seq,
    now: localIso(),
    state: patch.state,
    collected: patch.collected ?? null,
    inserted: patch.inserted ?? null,
    note: patch.note ?? null,
  });
}

/** 마지막 수집 실행의 작업 목록 (등록 순서) */
export function getCollectProgress(db: RadarDb): CollectTask[] {
  const rows = db
    .prepare(`SELECT * FROM collect_progress ORDER BY seq`)
    .all() as ProgressRow[];
  return rows.map((r) => ({
    seq: r.seq,
    service: r.service,
    source: r.source,
    country: r.country,
    state: r.state as CollectTaskState,
    collected: r.collected ?? undefined,
    inserted: r.inserted ?? undefined,
    note: r.note ?? undefined,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
  }));
}
