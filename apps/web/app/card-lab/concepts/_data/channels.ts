export type CollectionMode = '자동 방식' | '수동 방식' | '중지됨';

export interface FeedbackItem {
  id?: string | number;
  title: string;
  excerpt: string;
  topic: string;
  createdAt: string;
  createdAtIso?: string;
  createdAtPrecision?: 'date' | 'minute';
  service?: string;
  url?: string;
}

export interface ChannelPostSample {
  id?: string | number;
  title: string;
  topic: string;
  createdAt: string;
  createdAtIso?: string;
  createdAtPrecision?: 'date' | 'minute';
  service?: string;
  url?: string;
}

export interface ChannelSample {
  id: string;
  name: string;
  initials: string;
  kind: string;
  dataOrigin?: 'sample' | 'database';
  mode: CollectionMode;
  lastSuccess: string;
  lastSuccessIso: string;
  count: number;
  lead: {
    title: string;
    summary: string;
    topic: string;
    evidence: string;
  };
  items: FeedbackItem[];
}

export interface ConceptMeta {
  number: string;
  slug: string;
  name: string;
  subtitle: string;
  question: string;
  tradeoff: string;
  layout: string;
  reference: string;
}

export const snapshotLabel = '샘플 데이터 · 기존 수집분은 2026.08.20까지';

export const channelPostSamples: Record<string, ChannelPostSample[]> = {
  googleplay: [
    { title: '결제 완료 후 코인이 바로 보이지 않아요', topic: '결제/코인', createdAt: '08:48' },
    { title: '알림을 켰는데도 이벤트 소식이 오지 않아요', topic: '알림', createdAt: '08:11' },
    { title: '검색 필터 선택값이 유지돼서 편합니다', topic: 'UI/사용성', createdAt: '07:46' },
    { title: '앱을 다시 열면 로그인부터 해야 해요', topic: '계정/로그인', createdAt: '07:20' },
    { title: '첫 화면이 뜨기까지 조금 오래 걸려요', topic: '성능', createdAt: '06:55' },
    { title: '업데이트 후 목록 스크롤이 부드러워졌어요', topic: '성능', createdAt: '06:32' },
  ],
  appstore: [
    { title: '보관함 버튼을 첫 화면에서 찾기 어려워요', topic: 'UI/사용성', createdAt: '07:58' },
    { title: '결제 취소 내역도 앱에서 확인하고 싶어요', topic: '결제/코인', createdAt: '07:31' },
    { title: '쿠폰 만료일을 더 크게 보여 주세요', topic: '이벤트', createdAt: '07:05' },
    { title: '글자 크기를 키우면 버튼이 겹쳐 보여요', topic: 'UI/사용성', createdAt: '06:44' },
    { title: '앱을 열어도 알림 배지가 남아 있어요', topic: '알림', createdAt: '06:18' },
    { title: '이번 업데이트 뒤 실행 속도가 빨라졌어요', topic: '성능', createdAt: '05:52' },
  ],
  threads: [
    { title: '오늘 쿠폰 어디서 받는지 아는 분?', topic: '이벤트', createdAt: '07:42' },
    { title: '새 검색 화면 생각보다 깔끔하네요', topic: '디자인', createdAt: '07:19' },
    { title: '앱 켤 때마다 로그인하는 건 저만 그런가요', topic: '계정/로그인', createdAt: '06:54' },
    { title: '결제 내역이 한참 뒤에 보였어요', topic: '결제/코인', createdAt: '06:28' },
    { title: '알림은 켰는데 이벤트 소식은 놓쳤네요', topic: '알림', createdAt: '06:03' },
    { title: '최근 본 항목 바로 가기가 꽤 편해요', topic: 'UI/사용성', createdAt: '05:41' },
  ],
  theqoo: [
    { title: '업데이트하고 보관함 어디로 갔는지 아는 사람', topic: 'UI/사용성', createdAt: '18:13' },
    { title: '오늘 출석 보상 놓친 건가?', topic: '이벤트', createdAt: '17:46' },
    { title: '로그인 계속 풀리는 사람 있어?', topic: '계정/로그인', createdAt: '17:18' },
    { title: '검색 조건 저장되는 건 편하더라', topic: 'UI/사용성', createdAt: '16:49' },
    { title: '결제했는데 잔액 늦게 뜬 사람 있어?', topic: '결제/코인', createdAt: '16:22' },
    { title: '앱 첫 화면 로딩 원래 이렇게 길었나', topic: '성능', createdAt: '15:57' },
  ],
  'naver-cafe': [
    { title: '자동 로그인 유지 설정 방법이 궁금합니다', topic: '계정/로그인', createdAt: '15:42' },
    { title: '이벤트 쿠폰 중복 적용 여부 아시는 분', topic: '이벤트', createdAt: '15:11' },
    { title: '결제 내역 갱신이 늦을 때 해결 방법', topic: '결제/코인', createdAt: '14:39' },
    { title: '보관함을 최근 사용순으로 보는 방법', topic: 'UI/사용성', createdAt: '14:05' },
    { title: '업데이트 후 알림이 오지 않습니다', topic: '알림', createdAt: '13:34' },
    { title: '검색 중 화면이 멈추는 현상이 있습니다', topic: '앱 오류', createdAt: '13:02' },
  ],
  dcinside: [
    { title: '업데이트하고 앱 켜지는 속도 느려진 사람', topic: '성능', createdAt: '19:22' },
    { title: '결제됐는데 잔액 안 뜨는 경우 있냐', topic: '결제/코인', createdAt: '18:51' },
    { title: '자동 로그인 왜 자꾸 풀리냐', topic: '계정/로그인', createdAt: '18:17' },
    { title: '검색 필터 저장되는 건 괜찮네', topic: 'UI/사용성', createdAt: '17:44' },
    { title: '이벤트 보상 어디서 받음', topic: '이벤트', createdAt: '17:12' },
    { title: '알림 설정 켰는데 아무것도 안 옴', topic: '알림', createdAt: '16:39' },
  ],
  x: [
    { title: '새 검색 필터 드디어 익숙해짐', topic: 'UI/사용성', createdAt: '13:46' },
    { title: '업데이트 후 첫 실행이 조금 느리다', topic: '성능', createdAt: '13:21' },
    { title: '결제 내역 반영만 빨라지면 좋겠다', topic: '결제/코인', createdAt: '12:58' },
    { title: '이벤트 알림이 늦게 온 듯', topic: '알림', createdAt: '12:32' },
    { title: '로그인 또 풀려서 다시 인증함', topic: '계정/로그인', createdAt: '12:05' },
    { title: '보관함 메뉴 위치 바뀐 건가', topic: 'UI/사용성', createdAt: '11:41' },
  ],
};

export const channels: ChannelSample[] = [
  {
    id: 'googleplay',
    name: '구글플레이',
    initials: 'GP',
    kind: '앱 리뷰 · KR/JP/US',
    mode: '자동 방식',
    lastSuccess: '8월 20일 14:52',
    lastSuccessIso: '2026-08-20T14:52:00+09:00',
    count: 48,
    lead: {
      title: '결제 뒤 잔액 반영이 늦다는 리뷰가 여러 국가에서 반복됐습니다',
      summary:
        '결제 승인은 완료됐지만 충전 내역이 바로 보이지 않아 앱을 다시 실행했다는 경험이 한국과 일본 스토어에 모였습니다.',
      topic: '결제/코인',
      evidence: '유사 맥락 17건 · KR 11 · JP 4 · US 2',
    },
    items: [
      {
        title: '업데이트 뒤 알림 설정이 초기화됐다는 의견이 이어졌습니다',
        excerpt: '기존 알림 옵션이 기본값으로 돌아갔다는 리뷰가 집중됐습니다.',
        topic: '앱 오류',
        createdAt: '13:48',
      },
      {
        title: '검색 결과가 전보다 빨라졌다는 긍정 후기가 확인됐습니다',
        excerpt: '검색 화면의 대기 시간이 줄어 앱을 자주 열게 된다는 반응입니다.',
        topic: 'UI/사용성',
        createdAt: '11:42',
      },
      {
        title: '해외 카드 등록 실패가 일본 스토어에서 반복됐습니다',
        excerpt: '카드 인증 다음 단계로 넘어가지 않는다는 문의가 포함됐습니다.',
        topic: '결제/코인',
        createdAt: '10:27',
      },
      {
        title: '로그인 재인증을 자주 요구한다는 리뷰가 모였습니다',
        excerpt: '세션이 짧아졌다고 느낀 이용자들이 재인증 빈도를 언급했습니다.',
        topic: '계정/로그인',
        createdAt: '09:16',
      },
    ],
  },
  {
    id: 'appstore',
    name: '앱스토어',
    initials: 'AS',
    kind: '앱 리뷰 · KR/JP',
    mode: '자동 방식',
    lastSuccess: '8월 20일 11:10',
    lastSuccessIso: '2026-08-20T11:10:00+09:00',
    count: 26,
    lead: {
      title: '보관함 메뉴 위치를 찾기 어렵다는 리뷰가 반복됐습니다',
      summary:
        '업데이트 이후 보관함 진입 경로가 바뀌면서 기존 이용자가 메뉴를 다시 찾는 데 시간이 걸린다는 의견입니다.',
      topic: 'UI/사용성',
      evidence: '유사 맥락 8건 · KR 6 · JP 2',
    },
    items: [
      {
        title: '해외 카드 등록 단계에서 다음으로 넘어가지 않는다는 의견입니다',
        excerpt: '인증 완료 뒤 화면이 멈춘다는 일본 스토어 리뷰입니다.',
        topic: '결제/코인',
        createdAt: '10:41',
      },
      {
        title: '다크 모드의 가독성이 좋아졌다는 후기가 있었습니다',
        excerpt: '대비와 메뉴 구분이 이전 버전보다 선명하다는 평가입니다.',
        topic: 'UI/사용성',
        createdAt: '09:54',
      },
      {
        title: '업데이트 뒤 첫 실행이 느리다는 리뷰가 확인됐습니다',
        excerpt: '로고 화면에서 수 초간 머무른다는 경험이 공유됐습니다.',
        topic: '성능',
        createdAt: '09:12',
      },
      {
        title: '이벤트 쿠폰 적용 조건을 더 분명히 알려 달라는 요청입니다',
        excerpt: '쿠폰 대상과 제외 조건을 결제 전에 확인하고 싶다는 의견입니다.',
        topic: '이벤트',
        createdAt: '08:37',
      },
    ],
  },
  {
    id: 'threads',
    name: 'Threads',
    initials: 'TH',
    kind: '소셜 · 키워드 2개',
    mode: '자동 방식',
    lastSuccess: '8월 20일 09:35',
    lastSuccessIso: '2026-08-20T09:35:00+09:00',
    count: 12,
    lead: {
      title: '이벤트 혜택을 공유하는 게시물이 여러 건 확인됐습니다',
      summary:
        '쿠폰과 출석 보상을 정리한 이용자 게시물이 재공유되면서 이벤트 진입 경로에 대한 대화가 늘었습니다.',
      topic: '이벤트',
      evidence: '관련 게시물 5건 · 재공유 3건',
    },
    items: [
      {
        title: '검색 결과가 빨라져 앱을 자주 연다는 반응이 있었습니다',
        excerpt: '체감 속도 개선을 짧게 언급한 게시물이 확인됐습니다.',
        topic: 'UI/사용성',
        createdAt: '09:18',
      },
      {
        title: '폰트가 바뀐 것 같다는 가벼운 질문이 이어졌습니다',
        excerpt: '업데이트 전후 화면을 비교하는 댓글이 붙었습니다.',
        topic: '디자인',
        createdAt: '08:52',
      },
      {
        title: '새 화면의 탐색 방식이 더 편하다는 후기가 있었습니다',
        excerpt: '하단 메뉴 이동이 줄었다는 긍정 반응입니다.',
        topic: 'UI/사용성',
        createdAt: '08:31',
      },
      {
        title: '로그인 유지 시간이 짧아졌는지 묻는 글이 올라왔습니다',
        excerpt: '기기 변경 뒤 재로그인 경험을 공유한 짧은 게시물입니다.',
        topic: '계정/로그인',
        createdAt: '08:04',
      },
    ],
  },
  {
    id: 'theqoo',
    name: '더쿠',
    initials: '더',
    kind: '커뮤니티 · 게시판 3개',
    mode: '수동 방식',
    lastSuccess: '8월 18일 20:40',
    lastSuccessIso: '2026-08-18T20:40:00+09:00',
    count: 34,
    lead: {
      title: '새 UI는 익숙해지면 괜찮을 것 같다는 반응이 많았습니다',
      summary:
        '첫인상은 낯설지만 메뉴 위치를 익힌 뒤에는 이전보다 단순하다는 의견과 원래 배치를 선호한다는 반응이 함께 나타났습니다.',
      topic: 'UI/사용성',
      evidence: '관련 글 11건 · 댓글 반응 혼재',
    },
    items: [
      {
        title: '로딩 화면에서 넘어가지 않는다는 질문이 확인됐습니다',
        excerpt: '업데이트 직후 실행 환경과 해결 방법을 묻는 글입니다.',
        topic: '앱 오류',
        createdAt: '20:21',
      },
      {
        title: '이벤트 보상 수령 위치를 묻는 글이 반복됐습니다',
        excerpt: '보상함과 이벤트 페이지 중 어디에서 받는지 묻고 있습니다.',
        topic: '이벤트',
        createdAt: '19:48',
      },
      {
        title: '검색 필터가 전보다 편해졌다는 의견이 있었습니다',
        excerpt: '선택한 조건이 유지되는 점을 긍정적으로 평가했습니다.',
        topic: 'UI/사용성',
        createdAt: '19:16',
      },
      {
        title: '결제 실패가 카드사 문제인지 묻는 글이 올라왔습니다',
        excerpt: '다른 결제 수단에서는 정상이라는 추가 설명이 있었습니다.',
        topic: '결제/코인',
        createdAt: '18:44',
      },
    ],
  },
  {
    id: 'naver-cafe',
    name: 'N카페',
    initials: 'NC',
    kind: '커뮤니티 · 카페 2개',
    mode: '수동 방식',
    lastSuccess: '8월 17일 18:20',
    lastSuccessIso: '2026-08-17T18:20:00+09:00',
    count: 19,
    lead: {
      title: '로그인이 반복해서 풀린다는 이용 경험이 공유됐습니다',
      summary:
        '앱을 다시 열거나 네트워크를 전환할 때 재로그인이 필요했다는 경험담과 임시 해결 방법이 함께 공유됐습니다.',
      topic: '계정/로그인',
      evidence: '유사 경험 6건 · 해결 방법 2건',
    },
    items: [
      {
        title: '본인 인증 문자가 늦게 온다는 문의가 있었습니다',
        excerpt: '문자가 도착하기 전에 인증 시간이 끝난다는 내용입니다.',
        topic: '계정/로그인',
        createdAt: '18:02',
      },
      {
        title: '이벤트 쿠폰 적용 조건을 묻는 글이 확인됐습니다',
        excerpt: '신규 이용자와 기존 이용자의 적용 범위를 질문했습니다.',
        topic: '이벤트',
        createdAt: '17:36',
      },
      {
        title: '보관함 정렬 기준을 바꿔 달라는 요청이 있었습니다',
        excerpt: '최근 사용순을 기본값으로 선택하고 싶다는 제안입니다.',
        topic: 'UI/사용성',
        createdAt: '16:51',
      },
      {
        title: '해외 결제 승인 뒤 내역이 늦게 표시된다는 질문입니다',
        excerpt: '승인 문자와 앱 내역 사이에 시간 차가 있었다고 합니다.',
        topic: '결제/코인',
        createdAt: '16:10',
      },
    ],
  },
  {
    id: 'dcinside',
    name: '디시',
    initials: 'DC',
    kind: '커뮤니티 · 갤러리 1개',
    mode: '수동 방식',
    lastSuccess: '8월 19일 22:05',
    lastSuccessIso: '2026-08-19T22:05:00+09:00',
    count: 21,
    lead: {
      title: '결제 실패가 본인만의 문제인지 묻는 글이 올라왔습니다',
      summary:
        '특정 카드에서만 결제가 실패했다는 글에 비슷한 경험과 정상 작동 사례가 댓글로 이어졌습니다.',
      topic: '결제/코인',
      evidence: '관련 글 4건 · 댓글 13개',
    },
    items: [
      {
        title: '앱 실행 직후 종료된다는 경험이 공유됐습니다',
        excerpt: '재설치 후에는 실행됐다는 후속 댓글이 있습니다.',
        topic: '앱 오류',
        createdAt: '21:44',
      },
      {
        title: '새 검색 필터가 유용하다는 반응이 있었습니다',
        excerpt: '예전보다 원하는 항목을 빨리 찾는다는 평가입니다.',
        topic: 'UI/사용성',
        createdAt: '21:08',
      },
      {
        title: '로그인 세션 유지 시간을 늘려 달라는 의견입니다',
        excerpt: '자주 재로그인해야 해 불편하다는 짧은 글입니다.',
        topic: '계정/로그인',
        createdAt: '20:32',
      },
      {
        title: '이벤트 페이지 이동 경로를 공유한 글이 확인됐습니다',
        excerpt: '메뉴 순서를 캡처로 설명하는 정보성 게시물입니다.',
        topic: '이벤트',
        createdAt: '19:57',
      },
    ],
  },
  {
    id: 'x',
    name: 'X',
    initials: 'X',
    kind: '소셜 · 키워드 4개',
    mode: '중지됨',
    lastSuccess: '8월 14일 16:18',
    lastSuccessIso: '2026-08-14T16:18:00+09:00',
    count: 17,
    lead: {
      title: '알림이 오지 않는다는 글이 마지막 수집분에 포함됐습니다',
      summary:
        '알림 권한이 켜져 있는데도 이벤트 알림을 받지 못했다는 짧은 게시물이 마지막 저장 데이터에 남아 있습니다.',
      topic: '알림',
      evidence: '마지막 저장분 5건 · 이후 갱신 없음',
    },
    items: [
      {
        title: '업데이트 뒤 로그인이 풀렸다는 언급이 있었습니다',
        excerpt: '새 버전 설치 직후 다시 로그인했다는 게시물입니다.',
        topic: '계정/로그인',
        createdAt: '15:55',
      },
      {
        title: '새 기능이 편하다는 짧은 후기가 확인됐습니다',
        excerpt: '검색 필터와 최근 항목 접근을 긍정적으로 언급했습니다.',
        topic: 'UI/사용성',
        createdAt: '15:21',
      },
      {
        title: '쿠폰 등록 위치를 알려 주는 게시물이 공유됐습니다',
        excerpt: '설정 화면의 메뉴 경로를 짧게 설명했습니다.',
        topic: '이벤트',
        createdAt: '14:48',
      },
      {
        title: '이 채널은 8월 14일 이후 갱신되지 않았습니다',
        excerpt: '현재 화면은 마지막으로 저장된 과거 수집분을 사용합니다.',
        topic: '데이터 안내',
        createdAt: '14:12',
      },
    ],
  },
];

export const conceptMeta: ConceptMeta[] = [
  {
    number: '01',
    slug: '01-channel-desk',
    name: '채널 데스크',
    subtitle: '채널 목록과 선택 채널 상세를 나란히 두는 마스터–디테일형',
    question: '특정 채널을 깊게 읽을 때',
    tradeoff: '채널 전체의 내용을 동시에 비교하기는 어렵습니다.',
    layout: 'desk',
    reference: 'Material list-detail · Linear split view',
  },
  {
    number: '02',
    slug: '02-newsstand',
    name: '뉴스스탠드',
    subtitle: '채널마다 대표 제목 하나와 얇은 보조 목록을 배치하는 모듈형',
    question: '각 채널의 핵심을 한눈에 훑을 때',
    tradeoff: '채널이 늘어나면 페이지가 길어집니다.',
    layout: 'grid',
    reference: 'NAVER News · Fluent cards',
  },
  {
    number: '03',
    slug: '03-channel-shelf',
    name: '채널 선반',
    subtitle: '채널 하나를 전체 폭의 한 행으로 사용해 같은 기준으로 비교하는 목록형',
    question: '채널별 정보를 공정하게 비교할 때',
    tradeoff: '한 화면에 보이는 채널 수가 적습니다.',
    layout: 'shelf',
    reference: 'Editorial index · Structured list',
  },
  {
    number: '04',
    slug: '04-front-page',
    name: '편집국 지면',
    subtitle: '대표 이슈의 크기를 키우고 나머지를 비대칭 지면에 배치하는 편집형',
    question: '가장 먼저 읽을 문제를 강조할 때',
    tradeoff: '대표 이슈를 정하는 편집 규칙이 필요합니다.',
    layout: 'mosaic',
    reference: 'Newspaper front page · Magazine grid',
  },
  {
    number: '05',
    slug: '05-issue-lens',
    name: '이슈 렌즈',
    subtitle: '채널 대신 결제·로그인·UI 같은 이슈를 중심으로 반응을 묶는 구조',
    question: '같은 문제가 여러 채널에 반복되는지 볼 때',
    tradeoff: '주제 분류와 중복 제거가 선행돼야 합니다.',
    layout: 'lens',
    reference: 'Google News Full Coverage · Feedly AI Feeds',
  },
  {
    number: '06',
    slug: '06-collection-timeline',
    name: '수집 타임라인',
    subtitle: '채널별 마지막 성공 시각을 실제 시간 순서로 보여주는 기록형',
    question: '언제 무엇이 들어왔는지 확인할 때',
    tradeoff: '콘텐츠보다 운영 로그처럼 보일 수 있습니다.',
    layout: 'timeline',
    reference: 'Datadog Events Explorer · Activity feed',
  },
  {
    number: '07',
    slug: '07-comparison-matrix',
    name: '비교 매트릭스',
    subtitle: '채널을 행으로 두고 대표 이슈·건수·시각을 열로 비교하는 표형',
    question: '채널 상태와 핵심을 빠르게 대조할 때',
    tradeoff: '뉴스보다 관리 도구의 인상이 강합니다.',
    layout: 'matrix',
    reference: 'Carbon data table · Expandable rows',
  },
  {
    number: '08',
    slug: '08-accordion',
    name: '채널 아코디언',
    subtitle: '대표 문장만 먼저 보여주고 필요한 채널을 펼쳐 읽는 점진 공개형',
    question: '복잡도를 낮추고 필요한 것만 열 때',
    tradeoff: '접힌 채널의 세부 내용은 한눈에 보이지 않습니다.',
    layout: 'accordion',
    reference: 'Progressive disclosure · Native details',
  },
  {
    number: '09',
    slug: '09-news-reader',
    name: '채널 게시판',
    subtitle: '채널을 고르고 수집 글을 조밀하게 훑은 뒤 원문을 여는 2단 목록형',
    question: '채널별 수집 글을 빠르게 훑고 원문을 확인할 때',
    tradeoff: '요약·분석보다 원문 탐색에 초점을 둡니다.',
    layout: 'board',
    reference: 'Forum lists · News inboxes',
  },
  {
    number: '10',
    slug: '10-channel-report',
    name: '채널 리포트',
    subtitle: '각 채널을 하나의 장으로 구성해 차분히 읽고 공유하는 문서형',
    question: '스냅샷을 보고서처럼 읽거나 공유할 때',
    tradeoff: '탐색보다 긴 읽기에 최적화돼 있습니다.',
    layout: 'report',
    reference: 'Editorial brief · Automated newsletter',
  },
];

export const issueClusters = [
  {
    id: 'payment',
    name: '결제와 잔액 반영',
    summary: '결제 승인 뒤 잔액이나 내역이 늦게 보인다는 경험이 여러 채널에서 반복됐습니다.',
    channelIds: ['googleplay', 'appstore', 'naver-cafe', 'dcinside'],
    count: 27,
  },
  {
    id: 'login',
    name: '로그인과 재인증',
    summary: '업데이트나 네트워크 전환 이후 세션이 풀린다는 반응이 앱 리뷰와 커뮤니티에 함께 나타났습니다.',
    channelIds: ['googleplay', 'threads', 'naver-cafe', 'dcinside', 'x'],
    count: 18,
  },
  {
    id: 'navigation',
    name: '탐색과 메뉴 위치',
    summary: '보관함과 이벤트 진입 경로를 다시 찾는 이용자 반응이 확인됐습니다.',
    channelIds: ['appstore', 'theqoo', 'naver-cafe', 'dcinside'],
    count: 22,
  },
  {
    id: 'performance',
    name: '실행과 검색 속도',
    summary: '첫 실행 지연과 검색 속도 개선이 동시에 언급돼 버전·환경별 확인이 필요합니다.',
    channelIds: ['googleplay', 'appstore', 'threads', 'theqoo', 'dcinside'],
    count: 15,
  },
];
