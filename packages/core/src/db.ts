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
  total INTEGER NOT NULL,
  negative INTEGER NOT NULL,
  urgent INTEGER NOT NULL,
  bullets TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (date, source, service)
);
`;

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

/** 목록 조회 조건 — 인자가 늘어 순서로 넘기면 헷갈린다 */
export interface ItemQuery {
  filter?: RelevanceFilter;
  service?: string;
  /** 작성일이 이 날짜 이후인 것만 (YYYY-MM-DD) */
  postedFrom?: string;
  category?: string;
  /** 앱 리뷰를 가져온 스토어 국가 (소문자 두 자). 지정하면 국가가 없는 커뮤니티 글은 빠진다 */
  country?: string;
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
    ),
    params: [
      ...serviceParams(q.service),
      ...postedFromParams(q.postedFrom),
      ...categoryParams(q.category),
      ...countryParams(q.country),
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

/** 같은 (날짜, 채널, 서비스)를 다시 요약하면 덮어쓴다 — 하루에 여러 번 수집해도 최신 것만 남는다 */
export function saveChannelSummary(db: RadarDb, s: Omit<ChannelSummary, 'createdAt'>): void {
  db.prepare(
    `INSERT INTO channel_summaries
       (date, source, service, total, negative, urgent, bullets, model, input_tokens, output_tokens, cost_usd, created_at)
     VALUES (@date, @source, @service, @total, @negative, @urgent, @bullets, @model, @inputTokens, @outputTokens, @costUsd, @createdAt)
     ON CONFLICT(date, source, service) DO UPDATE SET
       total = excluded.total, negative = excluded.negative, urgent = excluded.urgent,
       bullets = excluded.bullets, model = excluded.model,
       input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
       cost_usd = excluded.cost_usd, created_at = excluded.created_at`,
  ).run({
    date: s.date,
    source: s.source,
    service: s.service,
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
              COUNT(*) AS count,
              SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative
       FROM items
       ${where(
         `posted_at IS NOT NULL AND posted_at <> ''`,
         `substr(posted_at, 1, 10) >= date('now', 'localtime', '-' || ? || ' days')`,
         RELEVANT,
         serviceCond(service),
       )}
       GROUP BY date, source
       ORDER BY date, source`,
    )
    .all(days - 1, ...serviceParams(service)) as TrendCell[];
}
