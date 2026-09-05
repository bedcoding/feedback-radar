import { openRadarStore, type ItemRow } from '@feedback-radar/core';

import type { ChannelPostSample, ChannelSample, CollectionMode } from './channels';

export const CONCEPT09_PAGE_SIZE = 50;
const SOURCE_ORDER = [
  'googleplay',
  'appstore',
  'threads',
  'theqoo',
  'naver-cafe',
  'naver-blog',
  'dcinside',
  'x',
] as const;
export const CONCEPT09_SOURCES: readonly string[] = SOURCE_ORDER;
const SOURCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SOMETIMES_DATE_ONLY_SOURCES = new Set(['theqoo', 'dcinside', 'daum-cafe']);

const SOURCE_META: Record<string, { name: string; initials: string; kind: string }> = {
  googleplay: { name: '구글플레이', initials: 'GP', kind: '앱 리뷰 · KR/JP/US' },
  appstore: { name: '앱스토어', initials: 'AS', kind: '앱 리뷰 · KR/JP' },
  threads: { name: 'Threads', initials: 'TH', kind: '소셜 · 키워드 검색' },
  theqoo: { name: '더쿠', initials: '더', kind: '커뮤니티 · 게시판' },
  'naver-cafe': { name: 'N카페', initials: 'NC', kind: '커뮤니티 · 카페' },
  'naver-blog': { name: 'N블로그', initials: 'NB', kind: '블로그 · 키워드 검색' },
  'daum-cafe': { name: '다음카페', initials: 'DK', kind: '커뮤니티 · 카페' },
  dcinside: { name: '디시', initials: 'DC', kind: '커뮤니티 · 갤러리' },
  x: { name: 'X', initials: 'X', kind: '소셜 · 키워드 검색' },
};

export interface Concept09Data {
  channels: ChannelSample[];
  label: string;
  live: boolean;
}

/** DB에 새 수집 채널이 추가돼도 게시판 페이지 이동이 함께 동작하도록 ID 형식만 제한한다. */
export function isConcept09SourceId(source: string): boolean {
  return SOURCE_ID_PATTERN.test(source);
}

function singleLine(value: string | undefined, limit: number): string {
  const text = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return '내용 없음';
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function titleFromContent(value: string): string {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return singleLine(firstLine || value, 180);
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function timestampPrecision(source: string, value: string | undefined): 'date' | 'minute' {
  // 네이버 검색 API의 블로그 작성일은 YYYYMMDD뿐이라 시각을 추정하지 않는다.
  if (source === 'naver-blog') return 'date';
  // 게시판 목록이 오래된 글에 날짜만 주는 경우 수집기가 자정으로 정규화한다.
  if (
    value
    && SOMETIMES_DATE_ONLY_SOURCES.has(source)
    && /T00:00:00(?:\.000)?\+09:00$/.test(value)
  ) {
    return 'date';
  }
  return 'minute';
}

function formatTimestamp(value: string | undefined, precision: 'date' | 'minute' = 'minute'): string {
  const date = toDate(value);
  if (!date) return '시각 없음';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Seoul',
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const dateText = `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}`;
  return precision === 'date'
    ? dateText
    : `${dateText} ${valueFor('hour')}:${valueFor('minute')}`;
}

function modeFor(source: string, fallback?: ChannelSample): CollectionMode {
  return fallback?.mode ?? (source === 'x' ? '중지됨' : '수동 방식');
}

function buildChannel(
  source: string,
  rows: ItemRow[],
  count: number,
  collectedAt: string | undefined,
  fallback?: ChannelSample,
): ChannelSample {
  const meta = SOURCE_META[source] ?? {
    name: source,
    initials: source.slice(0, 2).toUpperCase(),
    kind: '수집 채널',
  };
  const items = rows.map((item) => {
    const precision = timestampPrecision(item.source, item.postedAt);
    return {
      id: item.id,
      title: titleFromContent(item.content),
      excerpt: singleLine(item.summary || item.content, 180),
      topic: item.category || '미분류',
      createdAt: item.postedAt ? formatTimestamp(item.postedAt, precision) : '작성일 미확인',
      createdAtIso: item.postedAt,
      createdAtPrecision: item.postedAt ? precision : undefined,
      service: item.service || '서비스 미확인',
      url: item.url,
    };
  });
  const first = items[0];

  return {
    id: source,
    name: meta.name,
    initials: meta.initials,
    kind: meta.kind,
    dataOrigin: 'database',
    mode: modeFor(source, fallback),
    lastSuccess: formatTimestamp(collectedAt),
    lastSuccessIso: collectedAt ?? '',
    count,
    lead: first
      ? {
          title: first.title,
          summary: first.excerpt,
          topic: first.topic,
          evidence: `저장 ${count.toLocaleString('ko-KR')}건 · 최근 ${items.length}건 표시`,
        }
      : (fallback?.lead ?? {
          title: '저장된 글이 없습니다',
          summary: '이 채널에서 표시할 글을 찾지 못했습니다.',
          topic: '미분류',
          evidence: '근거 0건',
        }),
    items,
  };
}

export async function loadConcept09Data(
  fallbackChannels: ChannelSample[],
  fallbackLabel: string,
): Promise<Concept09Data> {
  let db: Awaited<ReturnType<typeof openRadarStore>> | undefined;
  try {
    db = await openRadarStore();
    const [rows, counts, collections] = await Promise.all([
      db.getItemsByChannel(CONCEPT09_PAGE_SIZE, { filter: 'relevant' }),
      db.countItemsBySource({ filter: 'relevant' }),
      db.latestCollectionBySource(),
    ]);
    if (!rows.length || !counts.length) {
      return { channels: fallbackChannels, label: fallbackLabel, live: false };
    }

    const rowsBySource = new Map<string, ItemRow[]>();
    for (const row of rows) {
      const list = rowsBySource.get(row.source) ?? [];
      list.push(row);
      rowsBySource.set(row.source, list);
    }
    const countsBySource = new Map(counts.map((entry) => [entry.source, entry.count]));
    const collectionBySource = new Map(
      collections.map((entry) => [entry.source, entry.lastCollected]),
    );
    const fallbackBySource = new Map(fallbackChannels.map((channel) => [channel.id, channel]));
    const remaining = counts
      .map((entry) => entry.source)
      .filter((source) => !SOURCE_ORDER.includes(source as (typeof SOURCE_ORDER)[number]));
    const sources = [...SOURCE_ORDER, ...remaining].filter((source) => countsBySource.has(source));
    const channels = sources.map((source) =>
      buildChannel(
        source,
        rowsBySource.get(source) ?? [],
        countsBySource.get(source) ?? 0,
        collectionBySource.get(source),
        fallbackBySource.get(source),
      ),
    );
    const total = counts.reduce((sum, entry) => sum + entry.count, 0);

    return {
      channels,
      label: `PostgreSQL 실데이터 · 관련 글 ${total.toLocaleString('ko-KR')}건`,
      live: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Concept 09] 실데이터를 읽지 못해 샘플을 표시합니다: ${message}`);
    return { channels: fallbackChannels, label: fallbackLabel, live: false };
  } finally {
    await db?.close().catch(() => {});
  }
}

function postFromRow(item: ItemRow): ChannelPostSample {
  const precision = timestampPrecision(item.source, item.postedAt);
  return {
    id: item.id,
    title: titleFromContent(item.content),
    topic: item.category || '미분류',
    createdAt: item.postedAt ? formatTimestamp(item.postedAt, precision) : '작성일 미확인',
    createdAtIso: item.postedAt,
    createdAtPrecision: item.postedAt ? precision : undefined,
    service: item.service || '서비스 미확인',
    url: item.url,
  };
}

export async function loadConcept09ChannelPage(
  source: string,
  page: number,
): Promise<ChannelPostSample[]> {
  if (!isConcept09SourceId(source)) {
    throw new Error('알 수 없는 채널입니다.');
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    throw new Error('잘못된 페이지입니다.');
  }

  const db = await openRadarStore();
  try {
    const rows = await db.getRecentItems(
      CONCEPT09_PAGE_SIZE,
      { filter: 'relevant', source },
      (page - 1) * CONCEPT09_PAGE_SIZE,
    );
    return rows.map(postFromRow);
  } finally {
    await db.close().catch(() => {});
  }
}
