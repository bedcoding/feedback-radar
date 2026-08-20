import {
  CONFIG_KEY,
  isReadOnlyMode,
  RELEVANT,
  UNTAGGED,
  type CategoryCount,
  type ChannelSummary,
  type CollectTask,
  type CollectTaskState,
  type DashboardStats,
  type ItemQuery,
  type ItemRow,
  type PitchStats,
  type RawItem,
  type RelevanceFilter,
  type SourceCoverage,
  type TagResult,
  type TrendCell,
} from './types.js';
import { openPostgresDb, postgresConfigured, type PostgresDb } from './postgres.js';
import { loadConfig as loadConfigFromDisk, loadPrivateEnv, type RadarConfig } from './paths.js';
import { localDate, localIso } from './time.js';

export interface RadarStore {
  readonly backend: 'postgres';
  readonly readOnly: boolean;
  close(): Promise<void>;
  getSetting(key: string): Promise<string | undefined>;
  setSetting(key: string, value: string): Promise<void>;
  getSettings(): Promise<Record<string, string>>;
  /** 테넌트 설정. DB에 없으면 파일에서 읽어 한 번 심고 그 값을 돌려준다 */
  getConfig(): Promise<RadarConfig>;
  setConfig(config: RadarConfig): Promise<void>;
  insertItems(items: RawItem[]): Promise<number>;
  countUntagged(): Promise<number>;
  getUntagged(limit?: number): Promise<ItemRow[]>;
  saveTags(tags: Map<number, TagResult>): Promise<void>;
  resetTags(options?: { since?: string }): Promise<number>;
  getItemsByDate(date: string): Promise<ItemRow[]>;
  getItemsByPostedDate(date: string): Promise<ItemRow[]>;
  countIrrelevantForPostedDate(date: string): Promise<number>;
  categoryCountsForPostedDate(date: string, service?: string): Promise<CategoryCount[]>;
  postedDates(limit?: number): Promise<{ date: string; count: number }[]>;
  postedDatesCollectedSince(since: string): Promise<string[]>;
  countUndatedItems(): Promise<number>;
  countIrrelevantForDate(date: string): Promise<number>;
  getRecentItems(limit?: number, query?: ItemQuery, offset?: number): Promise<ItemRow[]>;
  countItems(query?: ItemQuery): Promise<number>;
  sourceCoverage(): Promise<SourceCoverage[]>;
  countByService(filter?: RelevanceFilter, postedFrom?: string, country?: string): Promise<{ service: string; count: number }[]>;
  countByCategory(filter?: RelevanceFilter, service?: string, postedFrom?: string, country?: string): Promise<{ category: string; count: number }[]>;
  countByCountry(filter?: RelevanceFilter, service?: string, postedFrom?: string): Promise<{ country: string; count: number; negative: number }[]>;
  countCountryless(filter?: RelevanceFilter, service?: string, postedFrom?: string): Promise<{ count: number; negative: number }>;
  deleteItems(ids: number[]): Promise<number>;
  countBySource(filter?: RelevanceFilter, service?: string, postedFrom?: string, country?: string): Promise<{ source: string; count: number; negative: number }[]>;
  countByLang(filter?: RelevanceFilter, service?: string, postedFrom?: string, country?: string): Promise<{ lang: string; count: number; negative: number }[]>;
  countBySentiment(filter?: RelevanceFilter, service?: string, postedFrom?: string, country?: string): Promise<{ sentiment: string; count: number }[]>;
  categoryCountsForDate(date: string, service?: string): Promise<CategoryCount[]>;
  countCollectionDays(beforeDate: string, days?: number): Promise<number>;
  countPostedDays(beforeDate: string, days?: number): Promise<number>;
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
    reason: (row.reason as string | null) ?? undefined,
    lang: (row.lang as string | null) ?? undefined,
    taggedAt: (row.tagged_at as string | null) ?? undefined,
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

/**
 * 국가 칩의 '미확인' 값.
 *
 * 실제 국가 코드(두 자)와 겹치지 않아야 해서 세 글자로 둔다. `items.country`를 추측으로
 * 채우지 않는다는 규칙 때문에 커뮤니티, SNS 글의 국가는 계속 비어 있고, 그 글들을 볼 방법이
 * 필요하다.
 */
export const COUNTRY_NONE = 'none';

function itemWhere(query: ItemQuery = {}, initial: string[] = []): WhereResult {
  const conditions = [...initial];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => { params.push(value); conditions.push(`${column} = $${params.length}`); };
  if ((query.filter ?? 'all') === 'relevant') conditions.push(RELEVANT);
  if (query.filter === 'irrelevant') conditions.push('relevant = 0');
  if (query.filter === 'untagged') conditions.push(UNTAGGED);
  if (query.service) add('service', query.service);
  if (query.postedFrom) { params.push(query.postedFrom); conditions.push(`posted_at >= $${params.length}`); }
  if (query.category) add('category', query.category);
  // COUNTRY_NONE은 '국가가 없는 글'이다. 앱 리뷰만 country를 채우므로 커뮤니티, SNS 글이
  // 여기 들어온다. 이 값이 없으면 국가를 고를 때마다 그 글들이 조용히 사라져 헷갈린다.
  if (query.country === COUNTRY_NONE) conditions.push('country IS NULL');
  else if (query.country) add('country', query.country);
  if (query.source) query.source === 'naver' ? conditions.push("source LIKE 'naver%'") : add('source', query.source);
  if (query.sentiment) add('sentiment', query.sentiment);
  if (query.lang) add('lang', query.lang);
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

  /**
   * 테넌트 설정을 DB에서 읽는다.
   *
   * 아직 심기지 않았으면 파일(또는 RADAR_CONFIG_JSON)에서 읽어 한 번 옮겨 담는다. 기존
   * 설치가 별도 마이그레이션 없이 그대로 넘어오게 하려는 것이고, 새 설치는 npm run setup이
   * 깔아 준 프리셋이 그대로 올라간다.
   *
   * 조회 전용(배포본)에서는 심지 않고 읽은 값만 돌려준다. 쓸 수 없는 것이 정상이고,
   * 로컬에서 한 번 심고 나면 배포본도 같은 값을 DB에서 보게 된다.
   */
  async getConfig(): Promise<RadarConfig> {
    const raw = await this.getSetting(CONFIG_KEY);
    if (raw) {
      try {
        return JSON.parse(raw) as RadarConfig;
      } catch (error) {
        // 저장된 값이 깨졌다고 화면을 멈추지는 않는다. 파일이나 자리표시자로 이어 간다.
        console.warn(`[설정] DB의 설정을 해석하지 못해 파일로 넘어갑니다: ${(error as Error).message}`);
      }
    }
    const fromDisk = loadConfigFromDisk();
    if (!this.readOnly) await this.setSetting(CONFIG_KEY, JSON.stringify(fromDisk));
    return fromDisk;
  }

  async setConfig(config: RadarConfig) {
    writable(this);
    await this.setSetting(CONFIG_KEY, JSON.stringify(config));
  }

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
      for (const [id, tag] of tags) await client.query(`UPDATE ${this.table('items')} SET sentiment=$2, category=$3, severity=$4, team=$5, summary=$6, relevant=$7, reason=$8, lang=$9, tagged_at=$10 WHERE id=$1`, [id, tag.sentiment, tag.category, tag.severity, tag.team, tag.summary, tag.relevant ? 1 : 0, tag.reason ?? null, tag.lang ?? null, now]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  /**
   * 태그를 지워 재분류 대상으로 만든다. `since`를 주면 그 날짜 이후 수집분만 대상이다.
   *
   * 범위를 좁힐 수단이 필요한 이유: 분류 체계를 조금 바꿨을 때 전체를 되돌리면 수천 건이
   * 다시 LLM으로 가고, 대부분은 결과가 같다. 최근 며칠만 다시 보는 편이 값이 크다.
   */
  async resetTags(options: { since?: string } = {}) { writable(this); const sql = options.since ? `UPDATE ${this.table('items')} SET tagged_at = NULL WHERE collected_at >= $1` : `UPDATE ${this.table('items')} SET tagged_at = NULL`; const result = await this.db.pool.query(sql, options.since ? [options.since] : []); return result.rowCount ?? 0; }
  /**
   * 글을 지운다. 정리 스크립트(clean-duplicates)만 쓴다.
   *
   * 되돌릴 수 없으므로 화면에서는 부르지 않는다. 원문(content, author)을 지우는 유일한 경로라
   * 호출부가 dry-run을 기본으로 두는 것을 전제로 한다.
   */
  async deleteItems(ids: number[]) { writable(this); if (ids.length === 0) return 0; const result = await this.db.pool.query(`DELETE FROM ${this.table('items')} WHERE id = ANY($1::bigint[])`, [ids]); return result.rowCount ?? 0; }

  async getItemsByDate(date: string) { return (await this.rows(`SELECT * FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2 AND ${RELEVANT} ORDER BY id DESC`, [date, nextDate(date, 1)])).map(rowToItem); }
  async countIrrelevantForDate(date: string) { return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2 AND relevant = 0`, [date, nextDate(date, 1)]); }

  /**
   * **작성일 기준** 조회. 브리핑이 쓰는 경로다.
   *
   * 수집일로 묶으면 "오늘 긁어온 것"이 나온다. 앱 리뷰는 오늘 수집해도 작성일이 몇 달 전이라,
   * 그날 무슨 일이 있었는지를 보려면 글이 쓰인 날로 묶어야 한다. 작성일이 없는 글(카페 API가
   * 안 주는 경우, 시각 없는 리뷰)은 어느 날짜에도 들어가지 않으므로 countUndatedItems로 따로 센다.
   */
  async getItemsByPostedDate(date: string) { return (await this.rows(`SELECT * FROM ${this.table('items')} WHERE SUBSTRING(posted_at,1,10) = $1 AND ${RELEVANT} ORDER BY posted_at DESC, id DESC`, [date])).map(rowToItem); }
  async countIrrelevantForPostedDate(date: string) { return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE SUBSTRING(posted_at,1,10) = $1 AND relevant = 0`, [date]); }
  async categoryCountsForPostedDate(date: string, service?: string) { const params: unknown[] = [date]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return numberRows(await this.rows(`SELECT category, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} WHERE SUBSTRING(posted_at,1,10) = $1 AND category IS NOT NULL AND ${RELEVANT}${serviceSql} GROUP BY category ORDER BY count DESC`, params), ['count', 'negative']) as unknown as CategoryCount[]; }

  /**
   * 글이 실제로 쓰인 날짜 목록 (최신순). 화면의 날짜 선택이 이 값으로 만들어진다.
   *
   * 브리핑이 있는 날짜(getSummaryDates)와 다르다. 이쪽은 '데이터가 있는 날'이고 그쪽은
   * '요약을 만들어 둔 날'이다. 달력에서 고를 수 있어야 하는 것은 전자다.
   */
  async postedDates(limit = 400) { return numberRows(await this.rows(`SELECT SUBSTRING(posted_at,1,10) AS date, COUNT(*) AS count FROM ${this.table('items')} WHERE posted_at IS NOT NULL AND posted_at <> '' AND ${RELEVANT} GROUP BY date ORDER BY date DESC LIMIT $1`, [limit]), ['count']) as unknown as { date: string; count: number }[]; }

  /**
   * 이번 실행에서 새로 들어온 글들의 **작성일 목록**.
   *
   * 브리핑을 작성일로 묶으면 한 번 수집해도 여러 날짜의 브리핑이 낡는다. 앱 리뷰 하나가
   * 석 달 전 글일 수 있어서다. 그 날짜들만 다시 만들면 되고, 전체를 다시 돌 이유는 없다.
   */
  async postedDatesCollectedSince(since: string) { return (await this.rows(`SELECT DISTINCT SUBSTRING(posted_at,1,10) AS date FROM ${this.table('items')} WHERE collected_at >= $1 AND posted_at IS NOT NULL AND posted_at <> '' AND ${RELEVANT} ORDER BY date DESC`, [since])).map((r) => r.date as string); }

  /** 작성일을 못 가져온 글 수. 날짜별 브리핑에서 통째로 빠지므로 화면에 알려야 한다 */
  async countUndatedItems() { return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE (posted_at IS NULL OR posted_at = '') AND ${RELEVANT}`); }
  async getRecentItems(limit = 50, query: ItemQuery = {}, offset = 0) { const w = itemWhere(query); return (await this.rows(`SELECT * FROM ${this.table('items')} ${w.sql} ORDER BY (posted_at IS NULL OR posted_at = '') ASC, posted_at DESC, id DESC LIMIT $${w.params.length + 1} OFFSET $${w.params.length + 2}`, [...w.params, limit, offset])).map(rowToItem); }
  async countItems(query: ItemQuery = {}) { const w = itemWhere(query); return this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} ${w.sql}`, w.params); }
  async sourceCoverage() { return numberRows(await this.rows(`SELECT source, COUNT(*) AS count, MIN(NULLIF(SUBSTRING(posted_at, 1, 10), '')) AS oldest, MAX(NULLIF(SUBSTRING(posted_at, 1, 10), '')) AS newest FROM ${this.table('items')} GROUP BY source ORDER BY count DESC`), ['count']) as unknown as SourceCoverage[]; }
  private aggregateWhere(filter: RelevanceFilter, values: { service?: string; postedFrom?: string; country?: string }, initial: string[]) { return itemWhere({ filter, ...values }, initial); }
  async countByService(filter: RelevanceFilter = 'relevant', postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { postedFrom, country }, ['service IS NOT NULL']); return numberRows(await this.rows(`SELECT service, COUNT(*) AS count FROM ${this.table('items')} ${w.sql} GROUP BY service ORDER BY count DESC`, w.params), ['count']) as unknown as { service: string; count: number }[]; }
  async countByCategory(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { service, postedFrom, country }, ['category IS NOT NULL']); return numberRows(await this.rows(`SELECT category, COUNT(*) AS count FROM ${this.table('items')} ${w.sql} GROUP BY category ORDER BY count DESC`, w.params), ['count']) as unknown as { category: string; count: number }[]; }
  async countByCountry(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string) { const w = this.aggregateWhere(filter, { service, postedFrom }, ['country IS NOT NULL']); return numberRows(await this.rows(`SELECT country, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} ${w.sql} GROUP BY country ORDER BY count DESC`, w.params), ['count', 'negative']) as unknown as { country: string; count: number; negative: number }[]; }
  /** 국가가 비어 있는 글(커뮤니티, SNS) 건수. 국가 칩의 '미확인' 칸이 쓴다 */
  async countCountryless(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string) { const w = this.aggregateWhere(filter, { service, postedFrom }, ['country IS NULL']); const rows = numberRows(await this.rows(`SELECT COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} ${w.sql}`, w.params), ['count', 'negative']); return { count: toNumber(rows[0]?.count), negative: toNumber(rows[0]?.negative) }; }
  /**
   * 채널별 건수. 목록 탭의 채널 칩이 쓴다.
   *
   * 국가 칩과 달리 `source`는 모든 글에 채워져 있어서 빠지는 건이 없다. 국가는 앱 리뷰에만
   * 있으므로 국가를 고르면 커뮤니티 글이 통째로 빠지는데, 채널은 그런 구멍이 없다.
   */
  async countBySource(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { service, postedFrom, country }, []); return numberRows(await this.rows(`SELECT source, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} ${w.sql} GROUP BY source ORDER BY count DESC`, w.params), ['count', 'negative']) as unknown as { source: string; count: number; negative: number }[]; }

  /** 언어별 건수. 국가와 다른 축이다(국가는 스토어, 언어는 글에 쓰인 말) */
  async countByLang(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { service, postedFrom, country }, ['lang IS NOT NULL']); return numberRows(await this.rows(`SELECT lang, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} ${w.sql} GROUP BY lang ORDER BY count DESC`, w.params), ['count', 'negative']) as unknown as { lang: string; count: number; negative: number }[]; }

  async countBySentiment(filter: RelevanceFilter = 'relevant', service?: string, postedFrom?: string, country?: string) { const w = this.aggregateWhere(filter, { service, postedFrom, country }, ['sentiment IS NOT NULL']); return numberRows(await this.rows(`SELECT sentiment, COUNT(*) AS count FROM ${this.table('items')} ${w.sql} GROUP BY sentiment ORDER BY count DESC`, w.params), ['count']) as unknown as { sentiment: string; count: number }[]; }

  async categoryCountsForDate(date: string, service?: string) { const params: unknown[] = [date, nextDate(date, 1)]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return numberRows(await this.rows(`SELECT category, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2 AND category IS NOT NULL AND ${RELEVANT}${serviceSql} GROUP BY category ORDER BY count DESC`, params), ['count', 'negative']) as unknown as CategoryCount[]; }
  async countCollectionDays(beforeDate: string, days = 7) { return this.count(`SELECT COUNT(DISTINCT SUBSTRING(collected_at,1,10)) AS count FROM ${this.table('items')} WHERE collected_at < $1 AND collected_at >= $2`, [beforeDate, nextDate(beforeDate, -days)]); }
  /**
   * 기준선도 **작성일 기준**이다. 급증 판정이 '그날 작성된 글'과 '직전 며칠에 작성된 글'을
   * 비교하는 것이라, 한쪽만 수집일로 세면 비교 대상이 어긋난다.
   */
  async countPostedDays(beforeDate: string, days = 7) { return this.count(`SELECT COUNT(DISTINCT SUBSTRING(posted_at,1,10)) AS count FROM ${this.table('items')} WHERE posted_at IS NOT NULL AND posted_at <> '' AND SUBSTRING(posted_at,1,10) < $1 AND SUBSTRING(posted_at,1,10) >= $2`, [beforeDate, nextDate(beforeDate, -days)]); }
  async categoryDailyAverage(beforeDate: string, days = 7) { const n = await this.countPostedDays(beforeDate, days); if (!n) return new Map<string, number>(); const rows = await this.rows(`SELECT category, COUNT(*)::double precision / $1 AS avg FROM ${this.table('items')} WHERE category IS NOT NULL AND ${RELEVANT} AND posted_at IS NOT NULL AND posted_at <> '' AND SUBSTRING(posted_at,1,10) < $2 AND SUBSTRING(posted_at,1,10) >= $3 GROUP BY category`, [n, beforeDate, nextDate(beforeDate, -days)]); return new Map(rows.map((r) => [r.category as string, toNumber(r.avg)])); }

  async getPitchStats() {
    const one = (await this.rows(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE tagged_at IS NOT NULL) AS tagged, COUNT(*) FILTER (WHERE relevant = 0) AS irrelevant, COUNT(*) FILTER (WHERE sentiment='negative' AND ${RELEVANT}) AS negative, COUNT(*) FILTER (WHERE sentiment='negative' AND severity IN ('high','critical') AND ${RELEVANT}) AS urgent, COUNT(DISTINCT SUBSTRING(collected_at,1,10)) AS collect_days, MIN(collected_at) AS first_collected_at, MAX(collected_at) AS last_collected_at FROM ${this.table('items')}`))[0] ?? {};
    const bySource = numberRows(await this.rows(`SELECT source, COUNT(*) AS count FROM ${this.table('items')} GROUP BY source ORDER BY count DESC`), ['count']) as unknown as PitchStats['bySource'];
    const byCategory = numberRows(await this.rows(`SELECT category, COUNT(*) AS count FROM ${this.table('items')} WHERE category IS NOT NULL AND ${RELEVANT} GROUP BY category ORDER BY count DESC`), ['count']) as unknown as PitchStats['byCategory'];
    return { total: toNumber(one.total), tagged: toNumber(one.tagged), irrelevant: toNumber(one.irrelevant), negative: toNumber(one.negative), urgent: toNumber(one.urgent), bySource, byCategory, collectDays: toNumber(one.collect_days), firstCollectedAt: (one.first_collected_at as string | null) ?? undefined, lastCollectedAt: (one.last_collected_at as string | null) ?? undefined };
  }
  async getDashboardStats(date: string, service?: string) {
    const params: unknown[] = []; const serviceSql = service ? ` WHERE service = $${params.push(service)}` : '';
    const total = await this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')}${serviceSql}`, params);
    const dayParams: unknown[] = [date, nextDate(date, 1)]; const dayService = service ? ` AND service = $${dayParams.push(service)}` : '';
    const today = await this.count(`SELECT COUNT(*) AS count FROM ${this.table('items')} WHERE collected_at >= $1 AND collected_at < $2${dayService}`, dayParams);
    const bySource = numberRows(await this.rows(`SELECT source, COUNT(*) AS count FROM ${this.table('items')}${serviceSql} GROUP BY source ORDER BY count DESC`, params), ['count']) as unknown as DashboardStats['bySource'];
    const sentimentParams: unknown[] = []; const sentimentService = service ? ` AND service = $${sentimentParams.push(service)}` : '';
    const bySentiment = numberRows(await this.rows(`SELECT sentiment, COUNT(*) AS count FROM ${this.table('items')} WHERE sentiment IS NOT NULL AND ${RELEVANT}${sentimentService} GROUP BY sentiment`, sentimentParams), ['count']) as unknown as DashboardStats['bySentiment'];
    return { total, today, bySource, bySentiment };
  }

  async saveChannelSummary(s: Omit<ChannelSummary, 'createdAt'>) { writable(this); await this.db.pool.query(`INSERT INTO ${this.table('channel_summaries')} (date, source, service, country, total, negative, urgent, bullets, model, input_tokens, output_tokens, cost_usd, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (date, source, service, country) DO UPDATE SET total=EXCLUDED.total, negative=EXCLUDED.negative, urgent=EXCLUDED.urgent, bullets=EXCLUDED.bullets, model=EXCLUDED.model, input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens, cost_usd=EXCLUDED.cost_usd, created_at=EXCLUDED.created_at`, [s.date, s.source, s.service, s.country ?? '', s.total, s.negative, s.urgent, JSON.stringify(s.bullets), s.model ?? null, s.inputTokens ?? null, s.outputTokens ?? null, s.costUsd ?? null, localIso()]); }
  async getChannelSummaries(date: string, service?: string) { const params: unknown[] = [date]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return (await this.rows(`SELECT * FROM ${this.table('channel_summaries')} WHERE date = $1${serviceSql} ORDER BY total DESC`, params)).map(rowToSummary); }
  async getSummaryDates(limit = 14) { return (await this.rows(`SELECT DISTINCT date FROM ${this.table('channel_summaries')} ORDER BY date DESC LIMIT $1`, [limit])).map((r) => r.date as string); }
  async getChannelTrend(days = 7, service?: string) { const params: unknown[] = [nextDate(localDate(), -(days - 1))]; const serviceSql = service ? ` AND service = $${params.push(service)}` : ''; return numberRows(await this.rows(`SELECT SUBSTRING(posted_at,1,10) AS date, source, COALESCE(country,'') AS country, COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative FROM ${this.table('items')} WHERE posted_at IS NOT NULL AND posted_at <> '' AND SUBSTRING(posted_at,1,10) >= $1 AND ${RELEVANT}${serviceSql} GROUP BY date, source, country ORDER BY date, source, country`, params), ['count', 'negative']) as unknown as TrendCell[]; }

  async startCollectRun(tasks: { service: string; source: string; country: string }[]) {
    writable(this); const runId = localIso(); const client = await this.db.pool.connect();
    try { await client.query('BEGIN'); await client.query(`DELETE FROM ${this.table('collect_progress')}`); for (const [seq, task] of tasks.entries()) await client.query(`INSERT INTO ${this.table('collect_progress')} (run_id, seq, service, source, country, state) VALUES ($1,$2,$3,$4,$5,'pending')`, [runId, seq, task.service, task.source, task.country]); await client.query('COMMIT'); return runId; }
    catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async markCollectTask(runId: string, seq: number, patch: { state: CollectTaskState; collected?: number; inserted?: number; note?: string }) { writable(this); const now = localIso(); await this.db.pool.query(`UPDATE ${this.table('collect_progress')} SET state=$3, collected=COALESCE($4,collected), inserted=COALESCE($5,inserted), note=COALESCE($6,note), started_at=CASE WHEN $3='running' THEN $7 ELSE started_at END, ended_at=CASE WHEN $3 IN ('done','failed','skipped') THEN $7 ELSE ended_at END WHERE run_id=$1 AND seq=$2`, [runId, seq, patch.state, patch.collected ?? null, patch.inserted ?? null, patch.note ?? null, now]); }
  async getCollectProgress() { const rows = await this.rows(`SELECT * FROM ${this.table('collect_progress')} ORDER BY seq`); return rows.map((r) => ({ seq: toNumber(r.seq), service: r.service as string, source: r.source as string, country: r.country as string, state: r.state as CollectTaskState, collected: r.collected == null ? undefined : toNumber(r.collected), inserted: r.inserted == null ? undefined : toNumber(r.inserted), note: (r.note as string | null) ?? undefined, startedAt: (r.started_at as string | null) ?? undefined, endedAt: (r.ended_at as string | null) ?? undefined })); }
}

export interface OpenRadarStoreOptions {
  /** 일반 Vercel 화면은 조회 전용이고, 수동 수집 액션에서만 PostgreSQL 쓰기를 연다. */
  allowVercelWrite?: boolean;
}

/**
 * 저장소를 연다. 접속처는 PostgreSQL 하나뿐이다.
 *
 * 접속 정보가 없으면 여기서 곧바로 실패한다. 예전에는 로컬 SQLite로 떨어졌는데, 그러면
 * 빈 DB가 자동으로 만들어지면서 화면이 "아직 데이터가 없습니다"로 멀쩡하게 떴다.
 * 접속 실패보다 알아채기 어려운 상태다. 배포 화면의 장애 폴백은 `/tour`가 담당한다.
 */
export async function openRadarStore(options: OpenRadarStoreOptions = {}): Promise<RadarStore> {
  loadPrivateEnv();
  if (!postgresConfigured()) {
    throw new Error(
      'DATABASE_URL이 없습니다. 레포 루트 .env에 접속 정보를 한 줄로 적으세요:\n' +
        '  DATABASE_URL=postgresql://사용자:비밀번호@호스트:5432/DB이름?sslmode=require',
    );
  }
  // 일반 조회는 배포에서 읽기 전용이고, 수동 수집 액션만 쓰기를 연다.
  const allowVercelWrite = options.allowVercelWrite === true && process.env.VERCEL === '1';
  const readOnly = isReadOnlyMode() && !allowVercelWrite;
  return new PostgresStore(await openPostgresDb({ readOnly }));
}
