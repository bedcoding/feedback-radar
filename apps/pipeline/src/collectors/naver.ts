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

async function search(endpoint: string, query: string, display: number): Promise<NaverItem[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  const url = `https://openapi.naver.com/v1/search/${endpoint}.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  let res: Response;
  try {
    // 타임아웃이 없으면 응답이 지연될 때 키워드마다 수 분씩 매달려 수집이 멈춘 것처럼 보인다
    res = await fetch(url, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`네이버 API 요청 실패 (${endpoint}): ${(e as Error).message}`);
    return [];
  }
  if (!res.ok) {
    console.warn(`네이버 API 실패 (${endpoint}): HTTP ${res.status}`);
    return [];
  }
  const json = (await res.json()) as { items?: NaverItem[] };
  return json.items ?? [];
}

/** 네이버 오픈 API (무료 일 25,000회): 키 없으면 조용히 스킵 */
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
