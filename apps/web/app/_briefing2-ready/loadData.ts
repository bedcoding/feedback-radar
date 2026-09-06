import {
  CONFIG_KEY,
  RELEVANT,
  loadPrivateEnv,
  localDate,
  openPostgresDb,
  type ChannelSummary,
  type TrendCell,
} from '@feedback-radar/core';
import { isBriefingDate } from './navigation';
import type { Briefing2Negative, Briefing2Query, Briefing2RawItem, Briefing2ReadyResult } from './types';

type Row = Record<string, unknown>;
const number = (value: unknown): number => value == null ? 0 : Number(value);
const optionalString = (value: unknown): string | undefined => value == null ? undefined : String(value);

function parseObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Stored local clock, without a timezone conversion. Date-only posts use 00:00
 * as a placeholder, so that value must not be presented as an observed time. */
function postedClock(posted?: string): string | undefined {
  if (!posted || posted.length < 16) return undefined;
  const clock = posted.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(clock) && clock !== '00:00' ? clock : undefined;
}

/** Keep saved bullets, ordering and usage metadata exactly as the full briefing. */
function summaryFromRow(row: Row): ChannelSummary {
  let bullets: string[] = [];
  try {
    const value: unknown = JSON.parse(row.bullets as string);
    if (Array.isArray(value)) bullets = value.filter((item): item is string => typeof item === 'string');
  } catch {}
  return {
    date: row.date as string,
    source: row.source as string,
    service: row.service as string,
    country: (row.country as string | null) ?? '',
    total: number(row.total),
    negative: number(row.negative),
    urgent: number(row.urgent),
    bullets,
    model: optionalString(row.model),
    inputTokens: row.input_tokens == null ? undefined : number(row.input_tokens),
    outputTokens: row.output_tokens == null ? undefined : number(row.output_tokens),
    costUsd: row.cost_usd == null ? undefined : number(row.cost_usd),
    createdAt: row.created_at as string,
  };
}

function recentTrendStart(today: string): string {
  // The trend follows the execution date, independently of the selected post day.
  const first = new Date(`${today}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 6);
  return first.toISOString().slice(0, 10);
}

/** Read the complete briefing and navigation metadata in one consistent snapshot.
 * No schema initialization, seeding, collection or generation is performed. Full
 * post text is fetched only once, for the selected date/service; service choices
 * use a separate lightweight name query so filtering cannot hide other services. */
export async function loadBriefing2ReadyData(query: Briefing2Query): Promise<Briefing2ReadyResult> {
  loadPrivateEnv();
  const db = await openPostgresDb({ readOnly: true });
  try {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // openPostgresDb validates the schema identifier; table names below are constants.
      const table = (name: string) => `"${db.schema}"."${name}"`;
      const today = localDate();
      const selectedService = query.service?.trim() || undefined;
      const configRows = await client.query(
        `SELECT value FROM ${table('settings')} WHERE key = $1`,
        [CONFIG_KEY],
      );
      const config = parseObject(configRows.rows[0]?.value);
      const displayName = typeof config.displayName === 'string' && config.displayName.trim()
        ? config.displayName.trim() : '피드백 레이더';
      const configuredServices = Array.isArray(config.services)
        ? config.services.flatMap((value: unknown) => {
            const service = parseObject(value);
            return typeof service.name === 'string' && service.name.trim() ? [service.name] : [];
          })
        : [];

      // Card navigation preserves the full briefing's postedDates(400), including
      // its global scope. Summary-only dates are used only to choose the default.
      const dateRows = await client.query(
        `SELECT SUBSTRING(posted_at,1,10) AS date FROM ${table('items')}` +
          ` WHERE posted_at IS NOT NULL AND posted_at <> '' AND ${RELEVANT}` +
          ' GROUP BY date ORDER BY date DESC LIMIT $1',
        [400],
      );
      let date: string;
      if (isBriefingDate(query.sdate)) {
        // An explicit valid empty day remains empty; do not silently replace it.
        date = query.sdate;
      } else {
        const availableRows = await client.query(
          'SELECT date FROM (' +
            `SELECT DISTINCT date FROM ${table('channel_summaries')}` +
            ` UNION SELECT DISTINCT SUBSTRING(posted_at,1,10) AS date FROM ${table('items')}` +
            ` WHERE posted_at IS NOT NULL AND posted_at <> '' AND ${RELEVANT}` +
            ') available ORDER BY date DESC LIMIT 400',
        );
        const availableDates = availableRows.rows.map(row => String(row.date)).filter(isBriefingDate);
        date = availableDates.find(day => day < today) ?? availableDates[0] ?? today;
      }

      // Preserve configured order, then the Korean alphabetical order used by the
      // service index. This query is deliberately unfiltered by selectedService.
      const serviceRows = await client.query(
        `SELECT service FROM ${table('channel_summaries')} WHERE date = $1` +
          ` UNION SELECT service FROM ${table('items')}` +
          ` WHERE SUBSTRING(posted_at,1,10) = $1 AND ${RELEVANT}`,
        [date],
      );
      const availableServices = serviceRows.rows.map(row => String(row.service ?? '')).filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ko') || (a < b ? -1 : a > b ? 1 : 0));
      const serviceOptions = [...new Set([...configuredServices, ...availableServices])];

      const filteredParams: unknown[] = [date];
      const serviceSql = selectedService ? ` AND service = $${filteredParams.push(selectedService)}` : '';
      const summaryRows = await client.query(
        `SELECT * FROM ${table('channel_summaries')} WHERE date = $1${serviceSql} ORDER BY total DESC`,
        filteredParams,
      );
      const itemRows = await client.query(
        'SELECT id, source, service, country, sentiment, category, summary, content,' +
          ` url, rating, severity, posted_at FROM ${table('items')}` +
          ` WHERE SUBSTRING(posted_at,1,10) = $1 AND ${RELEVANT}${serviceSql}` +
          ' ORDER BY posted_at DESC, id DESC',
        filteredParams,
      );
      const trendParams: unknown[] = [recentTrendStart(today)];
      const trendServiceSql = selectedService ? ` AND service = $${trendParams.push(selectedService)}` : '';
      const trendRows = await client.query(
        "SELECT SUBSTRING(posted_at,1,10) AS date, source, COALESCE(country,'') AS country," +
          " COUNT(*) AS count, SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS negative" +
          ` FROM ${table('items')} WHERE posted_at IS NOT NULL AND posted_at <> ''` +
          ` AND SUBSTRING(posted_at,1,10) >= $1 AND ${RELEVANT}${trendServiceSql}` +
          ' GROUP BY date, source, country ORDER BY date, source, country',
        trendParams,
      );
      // Global count, with neither a date/service filter nor relevance filtering.
      const pendingRows = await client.query(
        `SELECT COUNT(*) AS count FROM ${table('items')} WHERE tagged_at IS NULL`,
      );
      await client.query('COMMIT');

      const rawItems: Briefing2RawItem[] = itemRows.rows.map((row: Row) => ({
        id: number(row.id),
        source: row.source as string,
        service: optionalString(row.service),
        country: optionalString(row.country),
        sentiment: optionalString(row.sentiment),
        category: optionalString(row.category),
        text: optionalString(row.summary)?.trim() || String(row.content).replace(/\s+/g, ' ').slice(0, 160),
        url: safeUrl(row.url),
        rating: row.rating == null ? undefined : number(row.rating),
        time: postedClock(optionalString(row.posted_at)),
      }));
      const negatives: Record<string, Briefing2Negative[]> = {};
      const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      for (const row of itemRows.rows as Row[]) {
        if (row.sentiment !== 'negative') continue;
        const key = `${row.source}|${row.country ?? ''}|${row.service ?? ''}`;
        (negatives[key] ??= []).push({
          id: number(row.id),
          text: optionalString(row.summary)?.trim() || String(row.content).replace(/\s+/g, ' ').slice(0, 120),
          severity: optionalString(row.severity),
          rating: row.rating == null ? undefined : number(row.rating),
          url: safeUrl(row.url),
        });
      }
      for (const key of Object.keys(negatives)) {
        negatives[key] = negatives[key]
          .sort((a, b) => (rank[a.severity ?? 'low'] ?? 9) - (rank[b.severity ?? 'low'] ?? 9))
          .slice(0, 8);
      }
      const trend: TrendCell[] = trendRows.rows.map((row: Row) => ({
        date: row.date as string,
        source: row.source as string,
        country: row.country as string,
        count: number(row.count),
        negative: number(row.negative),
      }));
      return {
        displayName,
        selectedService,
        serviceOptions,
        notice: query.sdate && !isBriefingDate(query.sdate)
          ? '날짜 형식을 확인할 수 없어 최근 저장 자료를 표시합니다.' : undefined,
        data: {
          date,
          dates: dateRows.rows.map(row => row.date as string),
          summaries: summaryRows.rows.map(summaryFromRow),
          rawItems,
          trend,
          negatives,
          pendingCount: number(pendingRows.rows[0]?.count),
        },
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await db.pool.end();
  }
}
