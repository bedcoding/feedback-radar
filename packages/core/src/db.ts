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
    INSERT OR IGNORE INTO items (source, source_id, url, author, content, rating, posted_at, collected_at, keyword, service)
    VALUES (@source, @sourceId, @url, @author, @content, @rating, @postedAt, @collectedAt, @keyword, @service)
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

/** 목록 조회 조건 — 인자가 늘어 순서로 넘기면 헷갈린다 */
export interface ItemQuery {
  filter?: RelevanceFilter;
  service?: string;
  /** 작성일이 이 날짜 이후인 것만 (YYYY-MM-DD) */
  postedFrom?: string;
}

function queryWhere(q: ItemQuery): { sql: string; params: string[] } {
  return {
    sql: where(relevanceCond(q.filter ?? 'all'), serviceCond(q.service), postedFromCond(q.postedFrom)),
    params: [...serviceParams(q.service), ...postedFromParams(q.postedFrom)],
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

/** 서비스 선택 칩에 표시할 건수. service가 비어 있는 구버전 데이터는 뺀다 */
export function countByService(
  db: RadarDb,
  filter: RelevanceFilter = 'relevant',
  postedFrom?: string,
): { service: string; count: number }[] {
  return db
    .prepare(
      `SELECT service, COUNT(*) as count FROM items
       ${where(relevanceCond(filter), `service IS NOT NULL`, postedFromCond(postedFrom))}
       GROUP BY service ORDER BY count DESC`,
    )
    .all(...postedFromParams(postedFrom)) as { service: string; count: number }[];
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
