import { openRadarStore, type ItemQuery, type ItemRow } from '@feedback-radar/core';

import { ALL_CHANNEL_ID } from './data';
import type { ChannelPostSample, ChannelSample, CollectionMode, FeedbackItem } from './data';

export const CHANNEL_PAGE_SIZE = 50;
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

export interface ChannelBoardData {
  channels: ChannelSample[];
  /** 이번 쪽에 보일 글. 실데이터를 못 읽으면 없고 화면이 샘플로 떨어진다 */
  posts?: ChannelPostSample[];
  /** 고른 채널에서 지금 조건에 걸린 전체 건수. 쪽 수 계산에 쓴다 */
  selectedTotal?: number;
  label: string;
  live: boolean;
}

/** DB에 새 수집 채널이 추가돼도 게시판 페이지 이동이 함께 동작하도록 ID 형식만 제한한다. */
function singleLine(value: string | undefined, limit: number): string {
  const text = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return '내용 없음';
  /*
    **글자 단위로 자른다.** slice 는 UTF-16 코드 단위라, 이모지나 수식 문자(𝐴 같은)를
    반쪽만 남기고 끊을 수 있다. 그렇게 남은 조각은 그 자체로는 글자가 아니라서
    서버가 HTML로 내보낼 때 U+FFFD 로 바뀌는데, 클라이언트는 원래 조각을 그대로 들고
    있으므로 두 글자가 달라져 하이드레이션이 깨진다. 실제로 X 게시글 제목에서 났다.
  */
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join('').trimEnd()}…` : text;
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

function sourceName(source: string): string {
  return SOURCE_META[source]?.name ?? source;
}

/* 저장된 행 하나를 화면이 쓰는 글로. 채널 이름을 실어 '전체'에서도 출처가 보이게 한다 */
function itemFromRow(item: ItemRow): FeedbackItem {
  const precision = timestampPrecision(item.source, item.postedAt);
  return {
    id: item.id,
    title: titleFromContent(item.content),
    excerpt: singleLine(item.summary || item.content, 180),
    topic: item.category || '미분류',
    sourceLabel: sourceName(item.source),
    createdAt: item.postedAt ? formatTimestamp(item.postedAt, precision) : '작성일 미확인',
    createdAtIso: item.postedAt,
    createdAtPrecision: item.postedAt ? precision : undefined,
    service: item.service || '서비스 미확인',
    url: item.url,
  };
}

/*
  왼쪽 목록에 세울 채널 한 칸.

  글 목록은 고른 채널만 따로 읽으므로 여기서는 건수와 수집 시각만 채운다.
  lead 는 이 화면이 쓰지 않지만 타입이 요구해서 건수로 채워 둔다.
*/
function buildChannel(
  source: string,
  count: number,
  collectedAt: string | undefined,
  fallback?: ChannelSample,
): ChannelSample {
  const meta = SOURCE_META[source] ?? {
    name: source,
    initials: source.slice(0, 2).toUpperCase(),
    kind: '수집 채널',
  };

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
    lead: {
      title: `${count.toLocaleString('ko-KR')}건`,
      summary: '',
      topic: meta.kind,
      evidence: `저장 ${count.toLocaleString('ko-KR')}건`,
    },
    items: [],
  };
}

export interface ChannelBoardRequest {
  /* 칩이 걸어 놓은 조건. source 는 여기 넣지 않는다 — 채널은 왼쪽 목록이 정한다 */
  query: ItemQuery;
  /* 왼쪽 목록에서 고른 채널. ALL_CHANNEL_ID 면 전 채널을 합쳐 본다 */
  selected: string;
  page: number;
}

/*
  게시판 한 화면 분.

  예전에는 채널마다 50건씩 미리 읽어 클라이언트가 들고 있다가 눌릴 때 갈아 끼웠다.
  채널이 여덟이면 400건을 매번 읽는데 화면에 뜨는 건 그중 50건뿐이었다. 지금은
  주소가 상태를 들고 있으므로 **고른 채널의 그 쪽만** 읽는다.

  왼쪽 목록의 건수는 source 를 뺀 조건으로 센다. 칩 건수와 같은 규칙이다 —
  자기 축은 빼야 "이 채널로 옮기면 몇 건인지"가 보인다.
*/
export async function loadChannelBoardData(
  fallbackChannels: ChannelSample[],
  fallbackLabel: string,
  request: ChannelBoardRequest,
): Promise<ChannelBoardData> {
  const { query, selected, page } = request;
  let db: Awaited<ReturnType<typeof openRadarStore>> | undefined;
  try {
    db = await openRadarStore();
    const railQuery: ItemQuery = { ...query, source: undefined };
    const pageQuery: ItemQuery =
      selected === ALL_CHANNEL_ID ? railQuery : { ...railQuery, source: selected };

    const [counts, collections, rows, selectedTotal] = await Promise.all([
      db.countItemsBySource(railQuery),
      db.latestCollectionBySource(),
      db.getRecentItems(CHANNEL_PAGE_SIZE, pageQuery, (page - 1) * CHANNEL_PAGE_SIZE),
      db.countItems(pageQuery),
    ]);
    if (!counts.length) {
      return { channels: fallbackChannels, label: fallbackLabel, live: false };
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
        countsBySource.get(source) ?? 0,
        collectionBySource.get(source),
        fallbackBySource.get(source),
      ),
    );
    const total = counts.reduce((sum, entry) => sum + entry.count, 0);
    const lastCollected = collections
      .map((entry) => entry.lastCollected)
      .filter(Boolean)
      .sort()
      .at(-1);

    /*
      '전체'를 목록 맨 앞에 세운다.

      채널을 하나씩 눌러 보는 것만으로는 "지금 어디서 무슨 말이 나오는지"를 시간순으로
      볼 수 없다. 채널별 최신 몇 건을 여덟 번 읽는 것과, 전 채널을 한 줄로 세운 것은
      답하는 질문이 다르다.
    */
    const allChannel: ChannelSample = {
      id: ALL_CHANNEL_ID,
      name: '전체',
      initials: '전체',
      kind: `채널 ${channels.length}곳 합계`,
      dataOrigin: 'database',
      mode: '자동 방식',
      lastSuccess: lastCollected ? formatTimestamp(lastCollected, 'minute') : '수집 기록 없음',
      lastSuccessIso: lastCollected ?? '',
      count: total,
      lead: {
        topic: '전 채널',
        title: `관련 글 ${total.toLocaleString('ko-KR')}건`,
        summary: '모든 채널의 글을 최신 작성순으로 이어서 봅니다.',
        evidence: `채널 ${channels.length}곳`,
      },
      items: [],
    };

    return {
      channels: [allChannel, ...channels],
      posts: rows.map(itemFromRow),
      selectedTotal,
      label: `PostgreSQL 실데이터 · 관련 글 ${total.toLocaleString('ko-KR')}건`,
      live: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[채널 게시판] 실데이터를 읽지 못해 샘플을 표시합니다: ${message}`);
    return { channels: fallbackChannels, label: fallbackLabel, live: false };
  } finally {
    await db?.close().catch(() => {});
  }
}
