import {
  categoryCountsForDate as sqliteCategoryCountsForDate,
  categoryDailyAverage as sqliteCategoryDailyAverage,
  countByCategory as sqliteCountByCategory,
  countByCountry as sqliteCountByCountry,
  countBySentiment as sqliteCountBySentiment,
  countByService as sqliteCountByService,
  countCollectionDays as sqliteCountCollectionDays,
  countIrrelevantForDate as sqliteCountIrrelevantForDate,
  countItems as sqliteCountItems,
  countUntagged as sqliteCountUntagged,
  getChannelSummaries as sqliteGetChannelSummaries,
  getChannelTrend as sqliteGetChannelTrend,
  getCollectProgress as sqliteGetCollectProgress,
  getDashboardStats as sqliteGetDashboardStats,
  getItemsByDate as sqliteGetItemsByDate,
  getPitchStats as sqliteGetPitchStats,
  getRecentItems as sqliteGetRecentItems,
  getSetting as sqliteGetSetting,
  getSettings as sqliteGetSettings,
  getSummaryDates as sqliteGetSummaryDates,
  getUntagged as sqliteGetUntagged,
  insertItems as sqliteInsertItems,
  isReadOnlyMode,
  markCollectTask as sqliteMarkCollectTask,
  openDb,
  openReadonlyDb,
  saveChannelSummary as sqliteSaveChannelSummary,
  saveTags as sqliteSaveTags,
  setSetting as sqliteSetSetting,
  sourceCoverage as sqliteSourceCoverage,
  startCollectRun as sqliteStartCollectRun,
  type CategoryCount,
  type ChannelSummary,
  type CollectTask,
  type CollectTaskState,
  type DashboardStats,
  type ItemQuery,
  type PitchStats,
  type RadarDb,
  type RelevanceFilter,
  type SourceCoverage,
  type TrendCell,
} from './db.js';
import { openPostgresDb, postgresConfigured, type PostgresDb } from './postgres.js';
import { loadPrivateEnv } from './paths.js';
import { localDate, localIso } from './time.js';
import type { ItemRow, RawItem, TagResult } from './types.js';

export interface RadarStore {
  readonly backend: 'sqlite' | 'postgres';
  readonly readOnly: boolean;
  close(): Promise<void>;
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
  getSettings(): Promise<Record<string, string>>;
  insertItems(items: RawItem[]): Promise<number>;
  countUntagged(): Promise<number>;
  getUntagged(limit?: number): Promise<ItemRow[]>;
  saveTags(tags: Map<number, TagResult>): Promise<void>;
  resetTags(): Promise<number>;
  getItemsByDate(date: string): Promise<ItemRow[]>;
  countIrrelevantForDate(date: string): Promise<number>;
  getRecentItems(limit?: number, query?: ItemQuery, offset?: number): Promise<ItemRow[]>;
  countItems(query?: ItemQuery): Promise<number>;
  sourceCoverage(): Promise<SourceCoverage[]>;
  countByService(filter?: RelevanceFilter, postedFrom?: string, country?: string): Promise<{ service: string; count: number }[]>;
  countByCategory(filter?: RelevanceFilter, service?: string, postedFrom?: string, country?: string): Promise<{ category: string; count: number }[]>;
  countByCountry(filter?: RelevanceFilter, service?: string, postedFrom?: string): Promise<{ country: string; count: number; negative: number }[]>;
  countBySentiment(filter?: RelevanceFilter, service?: string, postedFrom?: string, country?: string): Promise<{ sentiment: string; count: number }[]>;
  categoryCountsForDate(date: string, service?: string): Promise<CategoryCount[]>;
  countCollectionDays(beforeDate: string, days?: number): Promise<number>;
  categoryDailyAverage(beforeDate: string, days?: number): Promise<Map<string, number>>;
  getPitchStats(): Promise<PitchStats>;
  getDashboardStats(date: string, service?: string): Promise<DashboardStats>;
  saveChannelSummary(summary: Omit<ChannelSummary, 'createdAt'>): Promise<void>;
  getChannelSummaries(date: string, service?: string): Promise<ChannelSummary[]>;
  getSummaryDates(limit?: number): Promise<string[]>;
  getChannelTrend(days?: number, service?: string): Promise<TrendCell[]>;
  startCollectRun(tasks: { service: string; source: string; country: string }[]): Promise<string>;
  markCollectTask(runId: string, seq: number, patch: { state: CollectTaskState; collected?: number; inserted?: number; note?: string }): Promise<void>;
  getCollectProgress(): Promise<CollectTask[]>;
}

function writable(store: RadarStore): void {
  if (store.readOnly) throw new Error('현재 DB는 조회 전용입니다. PostgreSQL 연결을 확인한 뒤 다시 시도하세요.');
}

class SqliteStore implements RadarStore {
  readonly backend: RadarStore['backend'];
  readonly readOnly: boolean;

  constructor(private readonly db: RadarDb, options: { readOnly: boolean }) {
    this.backend = 'sqlite';
    this.readOnly = options.readOnly;
  }

  async close(): Promise<void> { this.db.close(); }
  async getSetting(key: string) { return sqliteGetSetting(this.db, key); }
  async setSetting(key: string, value: string) { writable(this); sqliteSetSetting(this.db, key, value); }
  async getSettings() { return sqliteGetSettings(this.db); }
  async insertItems(items: RawItem[]) { writable(this); return sqliteInsertItems(this.db, items); }
  async countUntagged() { return sqliteCountUntagged(this.db); }
  async getUntagged(limit = 2000) { return sqliteGetUntagged(this.db, limit); }
  async saveTags(tags: Map<number, TagResult>) { writable(this); sqliteSaveTags(this.db, tags); }
  async resetTags() { writable(this); return this.db.prepare(`UPDATE items SET tagged_at = NULL`).run().changes; }
  async getItemsByDate(date: string) { return sqliteGetItemsByDate(this.db, date); }
  async countIrrelevantForDate(date: string) { return sqliteCountIrrelevantForDate(this.db, date); }
  async getRecentItems(limit = 50, query: ItemQuery = {}, offset = 0) { return sqliteGetRecentItems(this.db, limit, query, offset); }
  async countItems(query: ItemQuery = {}) { return sqliteCountItems(this.db, query); }
  async sourceCoverage() { return sqliteSourceCoverage(this.db); }
  async countByService(filter: RelevanceFilter = 'relevant', postedFrom?: string, country?: string) { return sqliteCountByService(this.db, filter, postedFrom, country); }
  async countByCategory(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { return sqliteCountByCategory(this.db, filter, service, postedFrom, country); }
  async countByCountry(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string) { return sqliteCountByCountry(this.db, filter, service, postedFrom); }
  async countBySentiment(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { return sqliteCountBySentiment(this.db, filter, service, postedFrom, country); }
  async categoryCountsForDate(date: string, service?: string) { return sqliteCategoryCountsForDate(this.db, date, service); }
  async countCollectionDays(beforeDate: string, days = 7) { return sqliteCountCollectionDays(this.db, beforeDate, days); }
  async categoryDailyAverage(beforeDate: string, days = 7) { return sqliteCategoryDailyAverage(this.db, beforeDate, days); }
  async getPitchStats() { return sqliteGetPitchStats(this.db); }
  async getDashboardStats(date: string, service?: string) { return sqliteGetDashboardStats(this.db, date, service); }
  async saveChannelSummary(summary: Omit<ChannelSummary, 'createdAt'>) { writable(this); sqliteSaveChannelSummary(this.db, summary); }
  async getChannelSummaries(date: string, service?: string) { return sqliteGetChannelSummaries(this.db, date, service); }
  async getSummaryDates(limit = 14) { return sqliteGetSummaryDates(this.db, limit); }
  async getChannelTrend(days = 7, service?: string) { return sqliteGetChannelTrend(this.db, days, service); }
  async startCollectRun(tasks: { service: string; source: string; country: string }[]) { writable(this); return sqliteStartCollectRun(this.db, tasks); }
  async markCollectTask(runId: string, seq: number, patch: { state: CollectTaskState; collected?: number; inserted?: number; note?: string }) { writable(this); sqliteMarkCollectTask(this.db, runId, seq, patch); }
  async getCollectProgress() { return sqliteGetCollectProgress(this.db); }
}

function nextDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number { return value == null ? 0 : Number(value); }

function numberRows<T extends Record<string, unknown>>(rows: T[], keys: string[]): T[] {
  return rows.map((row) => {
    const copy = { ...row };
    for (const key of keys) (copy as Record<string, unknown>)[key] = toNumber(copy[key]);
    return copy;
  });
}

function rowToItem(row: Record<string, unknown>): ItemRow {
  return {
    id: toNumber(row.id), source: row.source as string, sourceId: row.source_id as string,
    url: (row.url as string | null) ?? undefined, author: (row.author as string | null) ?? undefined,
    content: row.content as string, rating: row.rating == null ? undefined : toNumber(row.rating),
    postedAt: (row.posted_at as string | null) ?? undefined, collectedAt: row.collected_at as string,
    keyword: (row.keyword as string | null) ?? undefined, service: (row.service as string | null) ?? undefined,
    country: (row.country as string | null) ?? undefined,
    sentiment: (row.sentiment as ItemRow['sentiment'] | null) ?? undefined,
    category: (row.category as ItemRow['category'] | null) ?? undefined,
    severity: (row.severity as ItemRow['severity'] | null) ?? undefined,
    team: (row.team as ItemRow['team'] | null) ?? undefined,
    summary: (row.summary as string | null) ?? undefined,
    relevant: row.relevant == null ? undefined : Boolean(toNumber(row.relevant)),
    reason: (row.reason as string | null) ?? undefined, taggedAt: (row.tagged_at as string | null) ?? undefined,
  };
}

function rowToSummary(row: Record<string, unknown>): ChannelSummary {
  let bullets: string[] = [];
  try {
    const value = JSON.parse(row.bullets as string) as unknown;
    if (Array.isArray(value)) bullets = value.filter((v): v is string => typeof v === 'string');
  } catch {}
  return {
    date: row.date as string, source: row.source as string, service: row.service as string,
    country: (row.country as string | null) ?? '', total: toNumber(row.total),
    negative: toNumber(row.negative), urgent: toNumber(row.urgent), bullets,
    model: (row.model as string | null) ?? undefined,
    inputTokens: row.input_tokens == null ? undefined : toNumber(row.input_tokens),
    outputTokens: row.output_tokens == null ? undefined : toNumber(row.output_tokens),
    costUsd: row.cost_usd == null ? undefined : toNumber(row.cost_usd), createdAt: row.created_at as string,
  };
}

interface WhereResult { sql: string; params: unknown[] }

function itemWhere(query: ItemQuery = {}, initial: string[] = []): WhereResult {
  const conditions = [...initial];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => { params.push(value); conditions.push(`${column} = $${params.length}`); };
  if ((query.filter ?? 'all') === 'relevant') conditions.push('(relevant IS NULL OR relevant != 0)');
  if (query.filter === 'irrelevant') conditions.push('relevant = 0');
  if (query.service) add('service', query.service);
  if (query.postedFrom) { params.push(query.postedFrom); conditions.push(`posted_at >= $${params.length}`); }
  if (query.category) add('category', query.category);
  if (query.country) add('country', query.country);
  if (query.source) query.source === 'naver' ? conditions.push("source LIKE 'naver%'") : add('source', query.source);
  if (query.sentiment) add('sentiment', query.sentiment);
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

class PostgresStore implements RadarStore {
  readonly backend = 'postgres' as const;
  readonly readOnly: boolean;
  private readonly prefix: string;

  constructor(private readonly db: PostgresDb) { this.readOnly = db.readOnly; this.prefix = `"${db.schema}"`; }
  private table(name: string) { return `${this.prefix}."${name}"`; }
  private async rows(sql: string, params: unknown[] = []) { return (await this.db.pool.query(sql, params)).rows as Record<string, unknown>[]; }
  private async count(sql: string, params: unknown[] = []) { return toNumber((await this.rows(sql, params))[0]?.count); }
  async close() { await this.db.pool.end(); }
  async getSetting(key: string) { return (await this.rows(`SELECT value FROM ${this.table('settings')} WHERE key = $1`, [key]))[0]?.value as string | undefined; }
  async setSetting(key: string, value: string) { writable(this); await this.db.pool.query(`INSERT INTO ${this.table('settings')} (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]); }
  async getSettings() { const rows = await this.rows(`SELECT key, value FROM ${this.table('settings')}`); return Object.fromEntries(rows.map((r) => [r.key as string, r.value as string])); }

  async insertItems(items: RawItem[]) {
    writable(this); if (!items.length) return 0;
    const client = await this.db.pool.connect(); const now = localIso(); let inserted = 0;
    try {
      await client.query('BEGIN');
      for (let offset = 0; offset < items.length; offset += 200) {
        const params: unknown[] = [];
        const values = items.slice(offset, offset + 200).map((item) => {
          const row = [item.source, item.sourceId, item.url ?? null, item.author ?? null,
            item.content, item.rating ?? null, item.postedAt ?? null, now, item.keyword ?? null,
            item.service ?? null, item.country ?? null];
          const placeholders = row.map((value) => { params.push(value); return `$${params.length}`; });
          return `(${placeholders.join(',')})`;
        });
        const result = await client.query(`INSERT INTO ${this.table('items')} (source, source_id, url, author, content, rating, posted_at, collected_at, keyword, service, country) VALUES ${values.join(',')} ON CONFLICT (source, source_id) DO NOTHING`, params);
        inserted += result.rowCount ?? 0;
      }
      await client.query('COMMIT'); return inserted;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }

  async countUntagged() { return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE tagged_at IS NULL`); }
  async getUntagged(limit = 2000) { return (await this.rows(`SELECT * FROM ${this.table('items')} WHERE tagged_at IS NULL ORDER BY id DESC LIMIT $1`, [limit])).map(rowToItem); }
  async saveTags(tags: Map<number, TagResult>) {
    writable(this); if (!tags.size) return;
    const client = await this.db.pool.connect(); const now = localIso();
    try {
      await client.query('BEGIN');
      for (const [id, tag] of tags) await client.query(`UPDATE ${this.table('items')} SET sentiment=$2, category=$3, severity=$4, team=$5, summary=$6, relevant=$7, reason=$8, tagged_at=$9 WHERE id=$1`, [id, tag.sentiment, tag.category, tag.severity, tag.team, tag.summary, tag.relevant ? 1 : 0, tag.reason ?? null, now]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async resetTags() { writable(this); const result = await this.db.pool.query(`UPDATE ${this.table('items')} SET tagged_at = NULL`); return result.rowCount ?? 0; }

  async getItemsByDate(date: string) { return (await this.rows(`SELECT * FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2 AND (relevant IS NULL OR relevant != 0) ORDER BY id DESC`, [date, nextDate(date, 1)])).map(rowToItem); }
  async countIrrelevantForDate(date: string) { return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2 AND relevant = 0`, [date, nextDate(date, 1)]); }
  async getRecentItems(limit = 50, query: ItemQuery = {}, offset = 0) { const w = itemWhere(query); return (await this.rows(`SELECT * FROM ${this.table('items')} ${w.sql} ORDER BY (posted_at IS NULL OR posted_at = '') ASC, posted_at DESC, id DESC LIMIT $${w.params.length + 1} OFFSET $${w.params.length + 2}`, [...w.params, limit, offset])).map(rowToItem); }
  async countItems(query: ItemQuery = {}) { const w = itemWhere(query); return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} ${w.sql}`, w.params); }
  async sourceCoverage() { return numberRows(await this.rows(`SELECT source, COUNT(*) AS count, MIN(NULLIF(SUBSTRING(posted_at, 1, 10), '')) AS oldest, MAX(NULLIF(SUBSTRING(posted_at, 1, 10), '')) AS newest FROM ${this.table('items')} GROUP BY source ORDER BY count DESC`), ['count']) as unknown as SourceCoverage[]; }
  private aggregateWhere(filter: RelevanceFilter, values: { service?: string; postedFrom?: string; country?: string }, initial: string[]) { return itemWhere({ filter, ...values }, initial); }
  async countByService(filter: RelevanceFilter = 'relevant', postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { postedFrom, country }, ['service IS NOT NULL']); return numberRows(await this.rows(`SELECT service, COUNT(*) AS count FROM ${this.table('items')} ${w.sql} GROUP BY service ORDER BY count DESC`, w.params), ['count']) as unknown as { service: string; count: number }[]; }
  async countByCategory(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { service, postedFrom, country }, ['category IS NOT NULL']); return numberRows(await this.rows(`SELECT category, COUNT(*) AS count FROM ${this.table('items')} ${w.sql} GROUP BY category ORDER BY count DESC`, w.params), ['count']) as unknown as { category: string; count: number }[]; }
  async countByCountry(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string) { const w = this.aggregateWhere(filter, { service, postedFrom }, ['country IS NOT NULL']); return numberRows(await this.rows(`SELECT country, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} ${w.sql} GROUP BY country ORDER BY count DESC`, w.params), ['count', 'negative']) as unknown as { country: string; count: number; negative: number }[]; }
  async countBySentiment(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { service, postedFrom, country }, ['sentiment IS NOT NULL']); return numberRows(await this.rows(`SELECT sentiment, COUNT(*) AS count FROM ${this.table('items')} ${w.sql} GROUP BY sentiment ORDER BY count DESC`, w.params), ['count']) as unknown as { sentiment: string; count: number }[]; }

  async categoryCountsForDate(date: string, service?: string) { const params: unknown[] = [date, nextDate(date, 1)]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return numberRows(await this.rows(`SELECT category, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2 AND category IS NOT NULL AND (relevant IS NULL OR relevant != 0)${serviceSql} GROUP BY category ORDER BY count DESC`, params), ['count', 'negative']) as unknown as CategoryCount[]; }
  async countCollectionDays(beforeDate: string, days = 7) { return this.count(`SELECT COUNT(DISTINCT SUBSTRING(collected_at,1,10)) AS count FROM ${this.table('items')} WHERE collected_at < $1 AND collected_at >= $2`, [beforeDate, nextDate(beforeDate, -days)]); }
  async categoryDailyAverage(beforeDate: string, days = 7) { const n = await this.countCollectionDays(beforeDate, days); if (!n) return new Map<string, number>(); const rows = await this.rows(`SELECT category, COUNT(*)::double precision / $1 AS avg FROM ${this.table('items')} WHERE category IS NOT NULL AND (relevant IS NULL OR relevant != 0) AND collected_at < $2 AND collected_at >= $3 GROUP BY category`, [n, beforeDate, nextDate(beforeDate, -days)]); return new Map(rows.map((r) => [r.category as string, toNumber(r.avg)])); }

  async getPitchStats() {
    const one = (await this.rows(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE tagged_at IS NOT NULL) AS tagged, COUNT(*) FILTER (WHERE relevant = 0) AS irrelevant, COUNT(*) FILTER (WHERE sentiment='negative' AND (relevant IS NULL OR relevant != 0)) AS negative, COUNT(*) FILTER (WHERE sentiment='negative' AND severity IN ('high','critical') AND (relevant IS NULL OR relevant != 0)) AS urgent, COUNT(DISTINCT SUBSTRING(collected_at,1,10)) AS collect_days, MIN(collected_at) AS first_collected_at, MAX(collected_at) AS last_collected_at FROM ${this.table('items')}`))[0] ?? {};
    const bySource = numberRows(await this.rows(`SELECT source, COUNT(*) AS count FROM ${this.table('items')} GROUP BY source ORDER BY count DESC`), ['count']) as unknown as PitchStats['bySource'];
    const byCategory = numberRows(await this.rows(`SELECT category, COUNT(*) AS count FROM ${this.table('items')} WHERE category IS NOT NULL AND (relevant IS NULL OR relevant != 0) GROUP BY category ORDER BY count DESC`), ['count']) as unknown as PitchStats['byCategory'];
    return { total: toNumber(one.total), tagged: toNumber(one.tagged), irrelevant: toNumber(one.irrelevant), negative: toNumber(one.negative), urgent: toNumber(one.urgent), bySource, byCategory, collectDays: toNumber(one.collect_days), firstCollectedAt: (one.first_collected_at as string | null) ?? undefined, lastCollectedAt: (one.last_collected_at as string | null) ?? undefined };
  }
  async getDashboardStats(date: string, service?: string) {
    const params: unknown[] = []; const serviceSql = service ? ` WHERE service = $${params.push(service)}` : '';
    const total = await this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')}${serviceSql}`, params);
    const dayParams: unknown[] = [date, nextDate(date, 1)]; const dayService = service ? ` AND service = $${dayParams.push(service)}` : '';
    const today = await this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2${dayService}`, dayParams);
    const bySource = numberRows(await this.rows(`SELECT source, COUNT(*) AS count FROM ${this.table('items')}${serviceSql} GROUP BY source ORDER BY count DESC`, params), ['count']) as unknown as DashboardStats['bySource'];
    const sentimentParams: unknown[] = []; const sentimentService = service ? ` AND service = $${sentimentParams.push(service)}` : '';
    const bySentiment = numberRows(await this.rows(`SELECT sentiment, COUNT(*) AS count FROM ${this.table('items')} WHERE sentiment IS NOT NULL AND (relevant IS NULL OR relevant != 0)${sentimentService} GROUP BY sentiment`, sentimentParams), ['count']) as unknown as DashboardStats['bySentiment'];
    return { total, today, bySource, bySentiment };
  }

  async saveChannelSummary(s: Omit<ChannelSummary, 'createdAt'>) { writable(this); await this.db.pool.query(`INSERT INTO ${this.table('channel_summaries')} (date, source, service, country, total, negative, urgent, bullets, model, input_tokens, output_tokens, cost_usd, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (date, source, service, country) DO UPDATE SET total=EXCLUDED.total, negative=EXCLUDED.negative, urgent=EXCLUDED.urgent, bullets=EXCLUDED.bullets, model=EXCLUDED.model, input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens, cost_usd=EXCLUDED.cost_usd, created_at=EXCLUDED.created_at`, [s.date, s.source, s.service, s.country ?? '', s.total, s.negative, s.urgent, JSON.stringify(s.bullets), s.model ?? null, s.inputTokens ?? null, s.outputTokens ?? null, s.costUsd ?? null, localIso()]); }
  async getChannelSummaries(date: string, service?: string) { const params: unknown[] = [date]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return (await this.rows(`SELECT * FROM ${this.table('channel_summaries')} WHERE date = $1${serviceSql} ORDER BY total DESC`, params)).map(rowToSummary); }
  async getSummaryDates(limit = 14) { return (await this.rows(`SELECT DISTINCT date FROM ${this.table('channel_summaries')} ORDER BY date DESC LIMIT $1`, [limit])).map((r) => r.date as string); }
  async getChannelTrend(days = 7, service?: string) { const params: unknown[] = [nextDate(localDate(), -(days - 1))]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return numberRows(await this.rows(`SELECT SUBSTRING(posted_at,1,10) AS date, source, COALESCE(country,'') AS country, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} WHERE posted_at IS NOT NULL AND posted_at <> '' AND SUBSTRING(posted_at,1,10) >= $1 AND (relevant IS NULL OR relevant != 0)${serviceSql} GROUP BY date, source, country ORDER BY date, source, country`, params), ['count', 'negative']) as unknown as TrendCell[]; }

  async startCollectRun(tasks: { service: string; source: string; country: string }[]) {
    writable(this); const runId = localIso(); const client = await this.db.pool.connect();
    try { await client.query('BEGIN'); await client.query(`DELETE FROM ${this.table('collect_progress')}`); for (const [seq, task] of tasks.entries()) await client.query(`INSERT INTO ${this.table('collect_progress')} (run_id, seq, service, source, country, state) VALUES ($1,$2,$3,$4,$5,'pending')`, [runId, seq, task.service, task.source, task.country]); await client.query('COMMIT'); return runId; }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async markCollectTask(runId: string, seq: number, patch: { state: CollectTaskState; collected?: number; inserted?: number; note?: string }) { writable(this); const now = localIso(); await this.db.pool.query(`UPDATE ${this.table('collect_progress')} SET state=$3, collected=COALESCE($4,collected), inserted=COALESCE($5,inserted), note=COALESCE($6,note), started_at=CASE WHEN $3='running' THEN $7 ELSE started_at END, ended_at=CASE WHEN $3 IN ('done','failed','skipped') THEN $7 ELSE ended_at END WHERE run_id=$1 AND seq=$2`, [runId, seq, patch.state, patch.collected ?? null, patch.inserted ?? null, patch.note ?? null, now]); }
  async getCollectProgress() { const rows = await this.rows(`SELECT * FROM ${this.table('collect_progress')} ORDER BY seq`); return rows.map((r) => ({ seq: toNumber(r.seq), service: r.service as string, source: r.source as string, country: r.country as string, state: r.state as CollectTaskState, collected: r.collected == null ? undefined : toNumber(r.collected), inserted: r.inserted == null ? undefined : toNumber(r.inserted), note: (r.note as string | null) ?? undefined, startedAt: (r.started_at as string | null) ?? undefined, endedAt: (r.ended_at as string | null) ?? undefined })); }
}

/** PostgreSQL 설정 시 PostgreSQL만 사용한다. 배포 화면의 장애 폴백은 `/tour`가 담당한다. */
export async function openRadarStore(): Promise<RadarStore> {
  loadPrivateEnv();
  if (!postgresConfigured()) {
    const readOnly = isReadOnlyMode();
    return new SqliteStore(readOnly ? openReadonlyDb() : openDb(), { readOnly });
  }
  return new PostgresStore(await openPostgresDb({ readOnly: isReadOnlyMode() }));
}
