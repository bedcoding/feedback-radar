import { normalizeInstant, type RawItem } from '@feedback-radar/core';
import { ascToken, readAscCredentials } from './asc-jwt.js';

/**
 * 앱스토어 리뷰 — App Store Connect 고객 리뷰 API.
 *
 * **예전 iTunes RSS 경로를 버렸다.** 그 주소(`itunes.apple.com/{국가}/rss/...`)는 Apple의
 * robots.txt가 `Disallow: /*​/rss/*`로 막아 둔 대상이었다. 편해서 쓰던 뒷문이지 Apple이
 * 쓰라고 준 문이 아니었고, 실제로 2026-08 실측에서 리뷰를 아예 안 주기 시작했다.
 *
 * 바뀐 점 셋:
 *
 * 1. **인증이 생겼다.** 판매자 계정마다 발급한 팀 키로 서명한 JWT가 필요하다 (asc-jwt.ts)
 * 2. **국가를 조회 조건으로 쓰지 않는다.** RSS는 국가별 주소가 따로였는데 이 API는 앱 단위로
 *    전 국가 리뷰를 함께 준다. 국가는 이제 조회 파라미터가 아니라 **각 리뷰가 들고 오는 값**이다
 *    (`territory`). 그래서 호출 수가 앱×국가에서 앱 하나로 줄고, 국가 표기는 더 정확해진다
 * 3. **자사 앱만 읽을 수 있다.** 키가 계정에 묶이기 때문이다. 지금 대상이 전부 자사 앱이라
 *    손실은 없지만, 경쟁사 앱은 이 경로로 영원히 못 본다
 */

const BASE = 'https://api.appstoreconnect.apple.com/v1';

/** 한 번에 받을 수 있는 최대치. Apple 상한이 200이다 */
const PAGE_SIZE = 200;

/** 응답에서 실제로 읽는 필드만 요청한다. `reviewerNickname`은 일부러 뺐다 — 아래 참고 */
const FIELDS = 'rating,title,body,createdDate,territory';

interface ReviewResource {
  id?: string;
  attributes?: {
    rating?: number;
    title?: string | null;
    body?: string | null;
    createdDate?: string;
    territory?: string;
  };
}

interface ReviewsResponse {
  data?: ReviewResource[];
  links?: { next?: string };
  meta?: { paging?: { total?: number } };
  errors?: { status?: string; code?: string; title?: string; detail?: string }[];
}

/**
 * Apple이 주는 territory는 ISO alpha-3(`KOR`)이고 이 저장소의 country는 소문자 alpha-2(`kr`)다.
 * 변환표가 필요한 이유는 `Intl`에 alpha-3 → alpha-2 변환이 없어서다.
 *
 * 표에 없는 코드가 오면 버리지 않고 **소문자로 낮춰 그대로 담는다.** 세 글자가 남으면
 * 화면의 국가 칩에 눈에 띄게 나타나므로, 조용히 사라지는 것보다 낫다.
 */
const ALPHA2_BY_ALPHA3: Record<string, string> = {
  KOR: 'kr', USA: 'us', JPN: 'jp', CHN: 'cn', TWN: 'tw', HKG: 'hk', SGP: 'sg',
  THA: 'th', VNM: 'vn', IDN: 'id', MYS: 'my', PHL: 'ph', IND: 'in', AUS: 'au',
  NZL: 'nz', GBR: 'gb', IRL: 'ie', FRA: 'fr', DEU: 'de', ESP: 'es', ITA: 'it',
  PRT: 'pt', NLD: 'nl', BEL: 'be', CHE: 'ch', AUT: 'at', SWE: 'se', NOR: 'no',
  DNK: 'dk', FIN: 'fi', POL: 'pl', CZE: 'cz', RUS: 'ru', TUR: 'tr', BRA: 'br',
  MEX: 'mx', ARG: 'ar', CAN: 'ca', SAU: 'sa', ARE: 'ae', ZAF: 'za',
};

const toAlpha2 = (territory?: string): string | undefined => {
  if (!territory) return undefined;
  return ALPHA2_BY_ALPHA3[territory.toUpperCase()] ?? territory.toLowerCase();
};

export interface AppStoreOptions {
  /** 숫자 App Store ID 또는 리소스 ID */
  appId: string;
  /** 자격증명 접미사. 판매자 계정이 갈리면 서비스마다 다르다 (기본 'A') */
  ascKey?: string;
  /** 받을 쪽수 상한. 1쪽 = 200건 */
  pages?: number;
  service?: string;
  /**
   * 이 시각보다 새로 쓰인 리뷰만 담는다 (ISO 문자열).
   *
   * **경계 날짜 절단 방침.** RSS 시절 sourceId는 숫자였고 이 API는 UUID를 준다. 체계가 달라
   * 중복 판정(`ON CONFLICT`)이 이어지지 않으므로, 경계 없이 돌리면 이미 있는 리뷰가 새 ID로
   * 통째로 다시 들어온다. 경계를 두면 그 위만 새로 담기고 아래는 예전 적재분이 그대로 산다.
   *
   * 값은 daily.ts가 DB의 최신 작성일에서 뽑아 넣는다. 상수로 박지 않는 이유는 앱마다
   * 마지막 수집 시점이 다르고, 사람이 날짜를 적어 넣게 하면 그 값이 곧 낡기 때문이다.
   */
  since?: string;
}

/** 오류 응답에서 사람이 읽을 사유를 뽑는다 */
function reasonOf(json: ReviewsResponse | undefined, status: number): string {
  const first = json?.errors?.[0];
  const text = [first?.title, first?.detail].filter(Boolean).join(' — ');
  return text || `HTTP ${status}`;
}

export async function collectAppStore(opts: AppStoreOptions): Promise<RawItem[]> {
  const { appId, ascKey = 'A', pages = 1, service, since } = opts;

  const cred = readAscCredentials(ascKey);
  if (!cred) {
    console.log(`  앱스토어(${service ?? appId}): ASC_KEY_${ascKey.toUpperCase()}_* 미설정, 스킵`);
    return [];
  }

  // 토큰 수명이 19분이라 한 회차 안에서는 다시 만들 일이 없다
  const token = ascToken(cred);
  const items: RawItem[] = [];

  /*
    🔴 `sort=-createdDate`를 반드시 명시한다.

    Apple이 기본 정렬을 문서에 적어 두지 않았다. 명시하지 않으면 최신 리뷰가 첫 쪽에 없을 수
    있고, 그러면 쪽 상한 때문에 정작 필요한 최근 글을 못 받는다. 조용히 일어나는 실패다.
    내림차순이라 경계보다 오래된 항목이 나오는 순간 그 뒤는 볼 필요가 없다.
  */
  let url =
    `${BASE}/apps/${encodeURIComponent(appId)}/customerReviews` +
    `?limit=${PAGE_SIZE}&sort=-createdDate&fields%5BcustomerReviews%5D=${encodeURIComponent(FIELDS)}`;

  for (let page = 0; page < Math.max(1, pages); page++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      console.warn(`  앱스토어(${service ?? appId}) 요청 실패: ${(e as Error).message}`);
      break;
    }

    const json = (await res.json().catch(() => undefined)) as ReviewsResponse | undefined;

    if (!res.ok) {
      /*
        상태별로 고쳐야 할 곳이 다르다. 뭉뚱그리면 어디를 손댈지 알 수 없다.
        - 401: JWT 문제. 시계 어긋남이거나 dsaEncoding 누락 (asc-jwt.ts 참고)
        - 403: 키 역할 부족. Customer Support로 발급했다면 Admin으로 재발급
        - 404: 이 계정의 앱이 아니다. ascKey를 잘못 짝지었을 가능성이 크다
        - 429: 시간당 한도. 재시도하지 않고 다음 회차로 넘긴다
      */
      const hint =
        res.status === 401 ? ' (JWT 확인: 시계·dsaEncoding)'
        : res.status === 403 ? ' (키 역할 부족 — Admin으로 재발급 검토)'
        : res.status === 404 ? ` (이 계정의 앱이 아닐 수 있음 — ascKey=${ascKey})`
        : res.status === 429 ? ' (시간당 한도, 이번 회차는 여기까지)'
        : '';
      console.warn(`  앱스토어(${service ?? appId}) ${page + 1}쪽 오류: ${reasonOf(json, res.status)}${hint}`);
      break;
    }

    const rows = json?.data ?? [];
    if (rows.length === 0) break;

    let reachedBoundary = false;
    for (const row of rows) {
      const a = row.attributes;
      if (!row.id || !a) continue;
      const postedAt = normalizeInstant(a.createdDate);
      // 경계보다 오래된 것이 나오면 그 뒤는 전부 더 오래된 것이다 (내림차순)
      if (since && postedAt && postedAt <= since) {
        reachedBoundary = true;
        break;
      }
      const title = a.title ?? '';
      const body = a.body ?? '';
      if (!title && !body) continue;
      items.push({
        source: 'appstore',
        sourceId: row.id,
        service,
        country: toAlpha2(a.territory),
        /*
          이 API는 리뷰 낱개 주소를 주지 않는다. 앱의 리뷰 목록으로 보낸다.
          국가 세그먼트는 그 리뷰의 territory를 쓴다 — 없으면 미국 스토어로 떨어지는데
          한국 리뷰를 미국 페이지에서 찾게 되므로 기본값을 kr로 둔다.
        */
        url: `https://apps.apple.com/${toAlpha2(a.territory) ?? 'kr'}/app/id${appId}?see-all=reviews`,
        // author를 담지 않는다. 리뷰 작성자명은 계정 표시명이라 실명인 경우가 흔하고,
        // 이 도구는 '누가'가 아니라 '무엇이 불만인가'를 집계한다 (FIELDS에서도 뺐다)
        content: title && body && title !== body ? `${title}\n${body}` : body || title,
        rating: typeof a.rating === 'number' ? a.rating : undefined,
        postedAt,
      });
    }
    if (reachedBoundary) break;

    // 다음 쪽은 커서가 붙은 완성된 주소로 온다. 직접 조립하지 않는다
    const next = json?.links?.next;
    if (!next) break;
    url = next;
  }

  return items;
}
