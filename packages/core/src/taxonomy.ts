export const SENTIMENTS = ['positive', 'negative', 'neutral'] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const CATEGORIES = [
  '결제/코인',
  '앱 오류',
  '콘텐츠/작품',
  '정책/검열',
  '이벤트/프로모션',
  '계정/로그인',
  '기타',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const TEAMS = ['결제', '앱개발', '콘텐츠', '마케팅', 'CS', '기타'] as const;
export type Team = (typeof TEAMS)[number];

// 휴리스틱 태거 + LLM 프롬프트가 함께 쓰는 도메인 키워드 사전.
// 테넌트별로 확장 가능하도록 카테고리 → 키워드 매핑으로 유지한다.
export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  '결제/코인': ['결제', '코인', '환불', '충전', '돈', '금액', '청구', '구매', '할인가', '자동결제'],
  '앱 오류': ['오류', '버그', '튕', '렉', '로딩', '멈춤', '실행', '업데이트 후', '깨짐', '에러', '느려'],
  '콘텐츠/작품': ['작품', '작가', '완결', '연재', '스토리', '그림', '번역', '회차', '외전'],
  '정책/검열': ['검열', '심의', '삭제', '규제', '정책', '수위', '모자이크', '이용약관'],
  '이벤트/프로모션': ['이벤트', '세일', '쿠폰', '무료', '프로모션', '할인', '보너스'],
  '계정/로그인': ['로그인', '계정', '탈퇴', '가입', '비밀번호', '인증', '연동'],
  기타: [],
};

export const CATEGORY_TEAM: Record<Category, Team> = {
  '결제/코인': '결제',
  '앱 오류': '앱개발',
  '콘텐츠/작품': '콘텐츠',
  '정책/검열': 'CS',
  '이벤트/프로모션': '마케팅',
  '계정/로그인': '앱개발',
  기타: '기타',
};

export const NEGATIVE_HINTS = [
  '안됨', '안 됨', '안되', '안 들어', '못', '최악', '별로', '실망', '짜증', '화나',
  '불편', '느려', '오류', '환불', '탈퇴', '삭제했', '별 하나', '별한개', '문제',
];

export const POSITIVE_HINTS = [
  '좋아', '좋은', '최고', '재밌', '재미있', '추천', '감사', '만족', '꿀잼', '사랑',
];
