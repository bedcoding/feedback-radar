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
  },
  {
    source: 'googleplay',
    content: '오늘 아침부터 결제 오류 계속 뜹니다. 카드 등록도 안 돼요',
    rating: 1,
    sentiment: 'negative',
    category: '결제/코인',
    severity: 'high',
    team: '결제',
  },
  {
    source: 'dcinside',
    content: '나만 결제 안 되나? 방금부터 계속 실패 뜨는데',
    sentiment: 'negative',
    category: '결제/코인',
    severity: 'high',
    team: '결제',
  },
  {
    source: 'appstore',
    content: '업데이트 후에 앱이 자꾸 튕겨요. 재설치해도 똑같습니다',
    rating: 2,
    sentiment: 'negative',
    category: '앱 오류',
    severity: 'high',
    team: '앱개발',
  },
  {
    source: 'googleplay',
    content: '로딩이 너무 느려졌어요. 예전에는 안 이랬는데',
    rating: 2,
    sentiment: 'negative',
    category: '앱 오류',
    severity: 'medium',
    team: '앱개발',
  },
  {
    source: 'naver-cafe',
    content: '로그인이 계속 풀려서 다시 인증해야 해요. 불편합니다',
    sentiment: 'negative',
    category: '계정/로그인',
    severity: 'high',
    team: '앱개발',
  },
  {
    source: 'appstore',
    content: '이번 이벤트 쿠폰이 적용이 안 되는데 저만 그런가요?',
    rating: 3,
    sentiment: 'neutral',
    category: '이벤트/프로모션',
    severity: 'medium',
    team: '마케팅',
  },
  {
    source: 'naver-blog',
    content: '이번에 새로 나온 기능 써봤는데 생각보다 편하네요. 추천합니다',
    sentiment: 'positive',
    category: '콘텐츠/작품',
    severity: 'low',
    team: '콘텐츠',
  },
  {
    source: 'googleplay',
    content: '전반적으로 만족스럽게 잘 쓰고 있어요. UI도 깔끔합니다',
    rating: 5,
    sentiment: 'positive',
    category: '콘텐츠/작품',
    severity: 'low',
    team: '콘텐츠',
  },
  {
    source: 'dcinside',
    content: '오늘 점심 뭐 먹지 고민되네 다들 뭐 드심?',
    sentiment: 'neutral',
    category: '기타',
    severity: 'low',
    team: '기타',
    relevant: false,
  },
  {
    source: 'threads',
    content: '주말에 새로 산 신발 후기 올려봅니다 색깔 예쁨',
    sentiment: 'neutral',
    category: '기타',
    severity: 'low',
    team: '기타',
    relevant: false,
  },
];

const items: ItemRow[] = RAW.map((d, i) => ({
  id: i + 1,
  source: d.source,
  sourceId: `demo-${i + 1}`,
  url: undefined,
  content: d.content,
  rating: d.rating,
  collectedAt: '',
  sentiment: d.sentiment,
  category: d.category,
  severity: d.severity,
  team: d.team,
  relevant: d.relevant ?? true,
}));

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

/** 마지막 단계에서 보여줄 브리핑 예시 — 위 집계와 같은 숫자를 쓴다 */
export const DEMO_REPORT = {
  collected: DAY.collected,
  irrelevant: DAY.irrelevant,
  sourceLine: SOURCE_LINE.map(([label, n]) => `${label} ${n}`).join(' · '),
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
