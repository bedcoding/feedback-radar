import type { ItemRow } from '@feedback-radar/core';
import type { DashboardData } from '../_dashboard/DashboardView';

/**
 * 둘러보기(/tour) 전용 예시 데이터.
 *
 * DB도 설정도 읽지 않는다 — 클론 직후 머신에서도, 아직 한 번도 수집하지 않은
 * 상태에서도 화면이 똑같이 보여야 하기 때문이다. 내용은 어느 서비스에나 있을 법한
 * 일반적인 피드백으로 채워 특정 업종이 드러나지 않게 했다.
 */

interface Demo {
  source: string;
  content: string;
  rating?: number;
  sentiment: ItemRow['sentiment'];
  category: ItemRow['category'];
  severity: ItemRow['severity'];
  team: ItemRow['team'];
  relevant?: boolean;
  /** 며칠 전 글인지 — 작성일 열과 기간 필터를 보여주기 위해 */
  daysAgo: number;
  /** 검색으로 걸린 글이면 어떤 검색어에 걸렸는지 */
  keyword?: string;
  /** 관련/무관을 그렇게 판단한 근거 */
  reason: string;
}

const RAW: Demo[] = [
  {
    source: 'appstore',
    content: '결제했는데 충전이 안 들어와요. 고객센터도 답이 없네요',
    rating: 1,
    sentiment: 'negative',
    category: '결제/코인',
    severity: 'critical',
    team: '결제',
    daysAgo: 0,
    reason: '앱 리뷰 채널',
  },
  {
    source: 'googleplay',
    content: '오늘 아침부터 결제 오류 계속 뜹니다. 카드 등록도 안 돼요',
    rating: 1,
    sentiment: 'negative',
    category: '결제/코인',
    severity: 'high',
    team: '결제',
    daysAgo: 0,
    reason: '앱 리뷰 채널',
  },
  {
    source: 'dcinside',
    content: '나만 결제 안 되나? 방금부터 계속 실패 뜨는데',
    sentiment: 'negative',
    category: '결제/코인',
    severity: 'high',
    team: '결제',
    daysAgo: 0,
    keyword: '{서비스명}',
    reason: '결제 실패 호소',
  },
  {
    source: 'appstore',
    content: '업데이트 후에 앱이 자꾸 튕겨요. 재설치해도 똑같습니다',
    rating: 2,
    sentiment: 'negative',
    category: '앱 오류',
    severity: 'high',
    team: '앱개발',
    daysAgo: 1,
    reason: '앱 리뷰 채널',
  },
  {
    source: 'googleplay',
    content: '로딩이 너무 느려졌어요. 예전에는 안 이랬는데',
    rating: 2,
    sentiment: 'negative',
    category: '앱 오류',
    severity: 'medium',
    team: '앱개발',
    daysAgo: 2,
    reason: '앱 리뷰 채널',
  },
  {
    source: 'naver-cafe',
    content: '로그인이 계속 풀려서 다시 인증해야 해요. 불편합니다',
    sentiment: 'negative',
    category: '계정/로그인',
    severity: 'high',
    team: '앱개발',
    daysAgo: 3,
    keyword: '{서비스명} 로그인',
    reason: '로그인 세션 문제 언급',
  },
  {
    source: 'appstore',
    content: '이번 이벤트 쿠폰이 적용이 안 되는데 저만 그런가요?',
    rating: 3,
    sentiment: 'neutral',
    category: '이벤트/프로모션',
    severity: 'medium',
    team: '마케팅',
    daysAgo: 5,
    reason: '앱 리뷰 채널',
  },
  {
    source: 'naver-blog',
    content: '이번에 새로 나온 기능 써봤는데 생각보다 편하네요. 추천합니다',
    sentiment: 'positive',
    category: '콘텐츠/작품',
    severity: 'low',
    team: '콘텐츠',
    daysAgo: 9,
    keyword: '{서비스명}',
    reason: '서비스 기능 사용 후기',
  },
  {
    source: 'googleplay',
    content: '전반적으로 만족스럽게 잘 쓰고 있어요. UI도 깔끔합니다',
    rating: 5,
    sentiment: 'positive',
    category: '콘텐츠/작품',
    severity: 'low',
    team: '콘텐츠',
    daysAgo: 12,
    reason: '앱 리뷰 채널',
  },
  {
    source: 'dcinside',
    content: '오늘 점심 뭐 먹지 고민되네 다들 뭐 드심?',
    sentiment: 'neutral',
    category: '기타',
    severity: 'low',
    team: '기타',
    relevant: false,
    daysAgo: 0,
    keyword: '{서비스명}',
    reason: '잡담, 서비스 언급 없음',
  },
  {
    source: 'threads',
    content: '주말에 새로 산 신발 후기 올려봅니다 색깔 예쁨',
    sentiment: 'neutral',
    category: '기타',
    severity: 'low',
    team: '기타',
    relevant: false,
    daysAgo: 4,
    keyword: '{서비스명}',
    reason: '동음이의어, 쇼핑 후기 문맥',
  },
];

/** daysAgo를 실제 날짜로 — 언제 열어도 '오늘 기준 최근'으로 보이게 */
function dayBefore(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const items: ItemRow[] = RAW.map((d, i) => ({
  id: i + 1,
  source: d.source,
  sourceId: `demo-${i + 1}`,
  url: undefined,
  content: d.content,
  rating: d.rating,
  collectedAt: '',
  postedAt: dayBefore(d.daysAgo),
  keyword: d.keyword,
  sentiment: d.sentiment,
  category: d.category,
  severity: d.severity,
  team: d.team,
  relevant: d.relevant ?? true,
  reason: d.reason,
}));

/** 기간 칩에 보여줄 예시 건수 (데모라 눌러도 목록은 바뀌지 않는다) */
export const DEMO_PERIODS = [
  { key: 'all', label: '전체', count: 882 },
  { key: 'today', label: '오늘', count: 28 },
  { key: '7d', label: '최근 7일', count: 164 },
  { key: '30d', label: '최근 30일', count: 617 },
];

/** 수집량 카드용 예시 — 실제 화면에서는 설정값과 DB 집계가 들어간다 */
export const DEMO_COLLECT = {
  limits: {
    appstorePages: 3,
    googlePlayReviewCount: 200,
    naverDisplay: 50,
    dcinsidePosts: 50,
    threadsPosts: 30,
  },
  estimate: 990,
  on: { appstore: true, googleplay: true, naver: true, dcinside: true, threads: true },
  coverage: {
    appstore: { count: 312, oldest: '2024-03-11', newest: dayBefore(0) },
    googleplay: { count: 448, oldest: '2024-01-08', newest: dayBefore(0) },
    'naver-blog': { count: 96, oldest: '2025-02-19', newest: dayBefore(1) },
    'naver-cafe': { count: 74, oldest: '2025-04-02', newest: dayBefore(2) },
    dcinside: { count: 258, oldest: '2026-05-30', newest: dayBefore(0) },
    threads: { count: 96, oldest: '2025-06-14', newest: dayBefore(1) },
  },
};

/**
 * 하루치 집계값.
 *
 * 위 `items`는 실제 대시보드와 마찬가지로 '최근 수집 일부'만 보여주는 표라서,
 * 집계는 하루 전체 기준으로 따로 둔다. 화면·브리핑에 나오는 숫자가 서로 어긋나면
 * 설명 자체를 믿을 수 없게 되므로 여기 한 곳에서만 정의하고 전부 여기서 파생시킨다.
 */
const DAY = {
  totalAllTime: 1284,
  collected: 34,
  irrelevant: 6,
  categories: [
    { category: '결제/코인', count: 12, negative: 11 },
    { category: '콘텐츠/작품', count: 8, negative: 1 },
    { category: '앱 오류', count: 7, negative: 6 },
    { category: '계정/로그인', count: 4, negative: 3 },
    { category: '이벤트/프로모션', count: 3, negative: 1 },
  ],
  bySource: [
    { source: 'googleplay', count: 11 },
    { source: 'appstore', count: 9 },
    { source: 'dcinside', count: 8 },
    { source: 'naver-blog', count: 3 },
    { source: 'naver-cafe', count: 2 },
    { source: 'threads', count: 1 },
  ],
  /** 직전 7일 평균 — 급증 판정(3배 초과 & 5건 이상)의 기준값 */
  paymentDailyAverage: 2.1,
};

const negativeTotal = DAY.categories.reduce((n, c) => n + c.negative, 0);

export function demoDashboard(displayName: string, keywords: string[], today: string): DashboardData {
  return {
    displayName,
    keywords,
    today,
    stats: {
      total: DAY.totalAllTime,
      today: DAY.collected,
      bySource: DAY.bySource,
      bySentiment: [
        { sentiment: 'negative', count: negativeTotal },
        { sentiment: 'neutral', count: 7 },
        { sentiment: 'positive', count: DAY.collected - negativeTotal - 7 },
      ],
    },
    categories: DAY.categories,
    items,
    intervalHours: 8,
    lastRunAt: undefined,
    isRunning: false,
    runQueued: false,
  };
}

const SOURCE_LINE = [
  ['구글플레이', 11],
  ['앱스토어', 9],
  ['커뮤니티', 8],
  ['네이버', 5],
  ['Threads', 1],
] as const;

/**
 * 투어에서 인용할 예시 지표.
 * 실제 대시보드(/?tour=1)에서는 DB 집계값이 대신 들어간다.
 */
export const DEMO_METRICS = {
  total: 1284,
  irrelevant: 402,
  services: 1,
  secondsPerItem: 30,
  briefingMinutes: 10,
  days: 42,
};

/** 마지막 단계에서 보여줄 브리핑 예시 — 위 집계와 같은 숫자를 쓴다 */
export const DEMO_REPORT = {
  collected: DAY.collected,
  irrelevant: DAY.irrelevant,
  sourceLine: SOURCE_LINE.map(([label, n]) => `${label} ${n}`).join(', '),
  spike: {
    category: DAY.categories[0].category,
    count: DAY.categories[0].count,
    avg: DAY.paymentDailyAverage,
  },
  urgent: [
    { category: '결제/코인', team: '결제', severity: 'critical', text: '결제했는데 충전이 안 들어와요' },
    { category: '계정/로그인', team: '앱개발', severity: 'high', text: '로그인이 계속 풀려서 다시 인증해야 해요' },
  ],
  positive: '이번에 새로 나온 기능 써봤는데 생각보다 편하네요',
};
