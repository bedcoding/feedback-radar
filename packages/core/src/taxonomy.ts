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

/**
 * 휴리스틱 태거가 쓰는 카테고리 판별 키워드 — **업종 중립 기본값**이다.
 *
 * 업종·서비스 특화 용어(자체 재화 이름, 콘텐츠 단위 용어, 은어 등)는 코드가 아니라
 * gitignore되는 설정 파일의 `categoryKeywords`에 둔다. 저장소만 보고 어떤 업종의
 * 어떤 서비스를 모니터링하는지 알 수 없어야 하기 때문이고, 그래야 다른 서비스에
 * 이식할 때도 코드를 건드리지 않는다. 설정값은 기본값에 더해진다(대체가 아니라 병합).
 */
export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  '결제/코인': ['결제', '환불', '충전', '금액', '청구', '구매', '자동결제', '영수증', '취소'],
  '앱 오류': ['오류', '버그', '튕', '렉', '로딩', '멈춤', '실행', '업데이트 후', '깨짐', '에러', '느려'],
  '콘텐츠/작품': ['콘텐츠', '작품', '품질', '번역', '오탈자', '업로드', '재생'],
  '정책/검열': ['정책', '약관', '이용약관', '규제', '제한', '신고', '차단', '심사'],
  '이벤트/프로모션': ['이벤트', '세일', '쿠폰', '무료', '프로모션', '할인', '보너스'],
  '계정/로그인': ['로그인', '계정', '탈퇴', '가입', '비밀번호', '인증', '연동'],
  기타: [],
};

/** 기본 키워드 사전에 테넌트 설정의 키워드를 더한다 (중복 제거) */
export function mergeCategoryKeywords(
  extra?: Partial<Record<Category, string[]>>,
): Record<Category, string[]> {
  if (!extra) return CATEGORY_KEYWORDS;
  const merged = {} as Record<Category, string[]>;
  for (const cat of CATEGORIES) {
    merged[cat] = [...new Set([...CATEGORY_KEYWORDS[cat], ...(extra[cat] ?? [])])];
  }
  return merged;
}

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
