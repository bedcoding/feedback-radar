import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { defaultDbPath } from './paths.js';
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
  sentiment TEXT,
  category TEXT,
  severity TEXT,
  team TEXT,
  summary TEXT,
  relevant INTEGER,
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
  // 구버전 DB 마이그레이션: relevant 컬럼(관련성 필터)이 없으면 추가
  const cols = db.prepare(`PRAGMA table_info(items)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'relevant')) {
    db.exec(`ALTER TABLE items ADD COLUMN relevant INTEGER`);
  }
  return db;
}

/** 관련성 필터: relevant=0(무관 판정)만 제외. NULL(구버전 데이터)은 관련으로 취급 */
const RELEVANT = `(relevant IS NULL OR relevant != 0)`;

/** 중복(source+sourceId)은 무시하고 신규 건수만 반환 */
export function insertItems(db: RadarDb, items: RawItem[]): number {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO items (source, source_id, url, author, content, rating, posted_at, collected_at, keyword)
    VALUES (@source, @sourceId, @url, @author, @content, @rating, @postedAt, @collectedAt, @keyword)
  `);
  const now = new Date().toISOString();
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
    sentiment: (r.sentiment as ItemRow['sentiment']) ?? undefined,
    category: (r.category as ItemRow['category']) ?? undefined,
    severity: (r.severity as ItemRow['severity']) ?? undefined,
    team: (r.team as ItemRow['team']) ?? undefined,
    summary: (r.summary as string) ?? undefined,
    relevant: r.relevant == null ? undefined : Boolean(r.relevant),
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
      team=@team, summary=@summary, relevant=@relevant, tagged_at=@taggedAt WHERE id=@id
  `);
  const now = new Date().toISOString();
  const run = db.transaction(() => {
    for (const [id, t] of tags) stmt.run({ id, ...t, relevant: t.relevant ? 1 : 0, taggedAt: now });
  });
  run();
}

/** 특정 날짜(YYYY-MM-DD, collected_at 기준)에 수집된 관련 아이템 (무관 판정 제외) */
export function getItemsByDate(db: RadarDb, date: string): ItemRow[] {
  const rows = db
    .prepare(`SELECT * FROM items WHERE substr(collected_at, 1, 10) = ? AND ${RELEVANT} ORDER BY id DESC`)
    .all(date) as Record<string, unknown>[];
  return rows.map(rowToItem);
}

/** 해당 날짜에 관련성 필터로 제외된 건수 */
export function countIrrelevantForDate(db: RadarDb, date: string): number {
  return (
    db
      .prepare(`SELECT COUNT(*) as c FROM items WHERE substr(collected_at,1,10) = ? AND relevant = 0`)
      .get(date) as { c: number }
  ).c;
}

export function getRecentItems(db: RadarDb, limit = 50): ItemRow[] {
  const rows = db
    .prepare(`SELECT * FROM items ORDER BY id DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToItem);
}

export interface CategoryCount {
  category: string;
  count: number;
  negative: number;
}

export function categoryCountsForDate(db: RadarDb, date: string): CategoryCount[] {
  return db
    .prepare(
      `SELECT category, COUNT(*) as count,
              SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) as negative
       FROM items WHERE substr(collected_at,1,10) = ? AND category IS NOT NULL AND ${RELEVANT}
       GROUP BY category ORDER BY count DESC`,
    )
    .all(date) as CategoryCount[];
}

/** 직전 N일(기준일 제외)의 카테고리별 일평균 언급량 */
export function categoryDailyAverage(db: RadarDb, beforeDate: string, days = 7): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT category, COUNT(*) * 1.0 / ? as avg
       FROM items
       WHERE category IS NOT NULL AND ${RELEVANT}
         AND substr(collected_at,1,10) < ?
         AND substr(collected_at,1,10) >= date(?, '-' || ? || ' days')
       GROUP BY category`,
    )
    .all(days, beforeDate, beforeDate, days) as { category: string; avg: number }[];
  return new Map(rows.map((r) => [r.category, r.avg]));
}

export interface DashboardStats {
  total: number;
  today: number;
  bySource: { source: string; count: number }[];
  bySentiment: { sentiment: string; count: number }[];
}

export function getDashboardStats(db: RadarDb, date: string): DashboardStats {
  const total = (db.prepare(`SELECT COUNT(*) as c FROM items`).get() as { c: number }).c;
  const today = (
    db.prepare(`SELECT COUNT(*) as c FROM items WHERE substr(collected_at,1,10)=?`).get(date) as { c: number }
  ).c;
  const bySource = db
    .prepare(`SELECT source, COUNT(*) as count FROM items GROUP BY source ORDER BY count DESC`)
    .all() as { source: string; count: number }[];
  const bySentiment = db
    .prepare(
      `SELECT sentiment, COUNT(*) as count FROM items WHERE sentiment IS NOT NULL AND ${RELEVANT} GROUP BY sentiment`,
    )
    .all() as { sentiment: string; count: number }[];
  return { total, today, bySource, bySentiment };
}
