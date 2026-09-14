/**
 * 채널과 국가의 표시 이름. **클라이언트 컴포넌트에서도 쓸 수 있는 순수 함수만 둔다.**
 *
 * core에도 같은 함수(countryFlag, countryName)가 있지만 클라이언트 컴포넌트가 core를
 * import하면 paths.ts의 fs와 store.ts의 DB 드라이버가 번들에 딸려 들어와 빌드가 깨진다.
 * 그래서 클라이언트에서 필요한 표시 로직은 이 파일에 모은다.
 */

const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  naver: '네이버',
  'naver-blog': 'N블로그',
  'naver-cafe': 'N카페',
  'naver-news': 'N뉴스',
  dcinside: '디시',
  threads: 'Threads',
  x: 'X',
  bluesky: '블루스카이',
  theqoo: '더쿠',
  'daum-cafe': '다음카페',
};

export const sourceLabel = (source: string): string => SOURCE_LABEL[source] ?? source;

/**
 * 언어 표시명. 코드를 그대로 두면 'ko'가 무슨 뜻인지 화면에서 알 수 없다.
 * 목록에 없는 코드는 대문자로 보여준다(빈 칸으로 두면 칩이 사라진 것처럼 보인다).
 */
const LANG_LABEL: Record<string, string> = {
  ko: '한국어',
  en: '영어',
  ja: '일본어',
  zh: '중국어',
  es: '스페인어',
  fr: '프랑스어',
  de: '독일어',
  th: '태국어',
  vi: '베트남어',
  id: '인도네시아어',
  pt: '포르투갈어',
  ru: '러시아어',
};

export const langLabel = (lang: string): string => LANG_LABEL[lang] ?? lang.toUpperCase();

// 국가 이름 조회기. 렌더마다 만들면 낭비라 모듈에서 한 번만 만든다.
const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['ko'], { type: 'region' });
  } catch {
    return undefined;
  }
})();

/** 국가 코드의 한국어 이름. 'kr' → '대한민국'. 모르는 코드는 대문자 코드를 그대로 */
export function regionName(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return cc;
  try {
    return REGION_NAMES?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/**
 * 국가 코드를 국기 이모지로. 'kr' → 🇰🇷. 없는 국가면 빈 문자열.
 *
 * 형식만 보면 안 된다. 지역 표시 기호는 조합이 맞으면 무엇이든 렌더되므로 'jp'를 'ip'로
 * 잘못 써도 🇮🇵이 그려져서 오타가 정상처럼 보인다. Intl이 이름을 못 찾는 코드
 * (= 코드를 그대로 돌려주는 코드)는 국기를 만들지 않는다.
 */
export function flag(code: string): string {
  const cc = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return '';
  if (REGION_NAMES && regionName(cc) === cc.toUpperCase()) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 97));
}

/**
 * 작성 시각(HH:MM). 시각을 못 가져온 글은 빈 문자열이다.
 *
 * **`00:00`은 표시하지 않는다.** 목록에 날짜만 적히는 채널은 파서가 자정으로 채우므로
 * 그대로 띄우면 '자정에 쓴 글'로 읽힌다(실측 2026-08-21: 한 커뮤니티는 402건 중 395건,
 * 검색 API로 받는 채널은 402건 전부가 00:00이었다). 진짜 자정 글 몇 건을 잃는 대신
 * 없는 정보를 있는 것처럼 보이지 않게 한다.
 *
 * 저장 형식은 `2026-08-20T14:32:00.000+09:00`이라 11번째부터 다섯 자가 시각이다.
 * Date로 파싱하지 않는 이유는 day()와 같다(오프셋 때문에 값이 밀린다).
 */
export function postedClock(posted?: string): string {
  if (!posted || posted.length < 16) return '';
  const hm = posted.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hm) && hm !== '00:00' ? hm : '';
}

/**
 * 화면에 내보내는 본문에서 계정 멘션과 이메일을 가린다.
 *
 * **저장된 원문은 건드리지 않는다.** 판정을 검증하려면 글이 쓰인 그대로 남아 있어야 하고,
 * 원문 가공 규칙을 새로 만들지 않기로 한 것도 그 이유다. 여기서 가리는 것은 화면으로
 * 나가는 사본뿐이라 DB를 되돌릴 일이 없다.
 *
 * 이 도구는 작성자 핸들을 받지도 저장하지도 않는다. 그런데 본문 안에서 남의 계정을 부른
 * 자리는 그대로 남아 있었다(실측: 관련 글 5,200건 중 92건, 대부분 SNS 채널). 한쪽만 막힌
 * 상태라 같이 가린다. 이메일도 4건 있었다.
 *
 * 멘션은 앞이 줄머리나 공백일 때만 잡는다. 그래야 이메일 주소의 골뱅이가 두 번 걸리지
 * 않는다. 첫 글자를 문자로 제한하고 세 글자 이상만 보는 것은 '@3000원' 같은 값 표기를 멘션으로
 * 오인하지 않기 위해서다.
 */
export function maskContact(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***@***')
    .replace(/(^|[\s(\[])@[A-Za-z가-힣][A-Za-z0-9가-힣._-]{2,}/g, '$1@***');
}
