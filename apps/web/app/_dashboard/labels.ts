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
  dcinside: '디시',
  threads: 'Threads',
  x: 'X',
  theqoo: '더쿠',
};

export const sourceLabel = (source: string): string => SOURCE_LABEL[source] ?? source;

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
