import { fromDottedDateTime, type RawItem } from '@feedback-radar/core';

interface NaverItem {
  title: string;
  link: string;
  description: string;
  postdate?: string; // blog only, YYYYMMDD
  cafename?: string;
  bloggername?: string;
}

const ENTITIES: Record<string, string> = {
  quot: '"',
  amp: '&',
  lt: '<',
  gt: '>',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

/**
 * 블로그와 카페는 엔드포인트가 다르고, 응답에서 얻는 것도 다르다.
 * 블로그는 작성일(`postdate`)을 주고 카페는 주지 않아 기간 필터에 걸리는 정도가 다르다.
 * 그래서 한 번에 둘 다 돌리지 않고 채널을 인자로 받아 따로 켜고 끈다.
 */
export type NaverChannel = 'blog' | 'cafe';

const CHANNELS = {
  blog: { endpoint: 'blog', source: 'naver-blog', label: '네이버 블로그' },
  cafe: { endpoint: 'cafearticle', source: 'naver-cafe', label: '네이버 카페' },
} as const;

/** 검색 API가 붙이는 <b> 강조 태그를 걷어내고 HTML 엔티티를 원래 문자로 되돌린다 */
function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&(#?\w+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

/*
 * 2026-08 부터 검색 API 는 개발자센터(developers.naver.com)가 아니라
 * 네이버클라우드의 NAVER API HUB 에서 발급받는다. 개발자센터의 '사용 API' 목록에
 * '검색' 항목 자체가 없어져서 신규 발급이 불가능하다.
 *
 * 주소와 헤더가 둘 다 바뀌었다. 도메인만 갈아끼우면 안 된다.
 *   기존  https://openapi.naver.com/v1/search/blog.json
 *         X-Naver-Client-Id / X-Naver-Client-Secret
 *   HUB   https://naverapihub.apigw.ntruss.com/search/v1/blog   (.json 없음, 경로도 다름)
 *         X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
 *
 * ⚠ 개발자센터 드롭다운의 '카페' 를 골라 발급받은 키로는 안 된다. 그건 카페 가입·글쓰기용
 *   로그인 오픈 API 이고 access token 을 요구한다. 공개 카페 글 검색과는 다른 API 다.
 *
 * ⚠ 쇼핑·책·전문자료 검색은 2026-07-31 로 완전히 종료됐다. 대체 API 도 없다.
 *   블로그·뉴스·카페글 같은 일반 검색만 HUB 로 이관돼 살아 있다.
 */
const HUB_BASE = process.env.NAVER_API_BASE ?? 'https://naverapihub.apigw.ntruss.com/search/v1';

async function search(endpoint: 'blog' | 'cafearticle', query: string, display: number): Promise<NaverItem[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  const url = `${HUB_BASE}/${endpoint}?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  let res: Response;
  try {
    // 타임아웃이 없으면 응답이 지연될 때 키워드마다 수 분씩 매달려 수집이 멈춘 것처럼 보인다
    res = await fetch(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`네이버 API 요청 실패 (${endpoint}): ${(e as Error).message}`);
    return [];
  }
  if (!res.ok) {
    // 본문에 사유가 들어오므로 같이 찍는다. 401/403 이면 키, 404 면 경로 문제다
    const body = await res.text().catch(() => '');
    console.warn(`네이버 API 실패 (${endpoint}): HTTP ${res.status} ${body.slice(0, 200)}`);
    return [];
  }
  const json = (await res.json()) as { items?: NaverItem[] };
  return json.items ?? [];
}

/**
 * NAVER API HUB 검색: 키 없으면 조용히 스킵.
 *
 * 요금 (2026-08, ncloud 요금표 확인): 검색 API 는 무료 구간 하나뿐이다.
 *   월 775,000건까지 0원, 일 최대 25,000건 호출 제한. 유료 구간이 없다.
 *   (같은 HUB 의 검색어 트렌드·쇼핑 인사이트는 '한시적 무료' 라 나중에 유료화될 수 있다.
 *    검색 API 는 거기 해당하지 않는다.)
 *
 * 이 수집기가 쓰는 양은 display(기본 50) × 2(블로그·카페) × 키워드 수라, 한 번 돌려도
 * 수백 건 수준이다. 한도의 1% 도 안 쓴다.
 */
export async function collectNaver(
  channel: NaverChannel,
  keywords: string[],
  display = 50,
  service?: string,
): Promise<RawItem[]> {
  const { endpoint, source, label } = CHANNELS[channel];
  if (!process.env.NAVER_CLIENT_ID) {
    console.log(`  ${label}: NAVER_CLIENT_ID 미설정, 스킵`);
    return [];
  }
  const items: RawItem[] = [];
  for (const kw of keywords) {
    const results = await search(endpoint, kw, display);
    for (const r of results) {
      items.push({
        source,
        service,
        sourceId: r.link,
        url: r.link,
        author: r.bloggername ?? r.cafename,
        content: `${strip(r.title)}\n${strip(r.description)}`,
        // 블로그만 날짜를 준다(YYYYMMDD, 시각 없음). 카페는 API 응답에 작성일이 없어
        // '작성일 미확인'으로 남는다. 기간 필터를 걸면 빠지므로 화면에서 그 건수를 알려준다.
        // 날짜만 있는 값도 다른 소스와 같은 ISO로 맞춰야 사전순 비교가 성립한다.
        postedAt: r.postdate
          ? fromDottedDateTime(
              `${r.postdate.slice(0, 4)}.${r.postdate.slice(4, 6)}.${r.postdate.slice(6, 8)}`,
            )
          : undefined,
        keyword: kw,
      });
    }
  }
  return items;
}
