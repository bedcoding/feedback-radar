import type { RawItem } from '@feedback-radar/core';

interface NaverItem {
  title: string;
  link: string;
  description: string;
  postdate?: string; // blog only, YYYYMMDD
  cafename?: string;
  bloggername?: string;
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&[lg]t;/g, '');
}

async function search(endpoint: 'blog' | 'cafearticle', query: string, display: number): Promise<NaverItem[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return [];
  const url = `https://openapi.naver.com/v1/search/${endpoint}.json?query=${encodeURIComponent(query)}&display=${display}&sort=date`;
  const res = await fetch(url, {
    headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
  });
  if (!res.ok) {
    console.warn(`네이버 API 실패 (${endpoint}): HTTP ${res.status}`);
    return [];
  }
  const json = (await res.json()) as { items?: NaverItem[] };
  return json.items ?? [];
}

/** 네이버 오픈 API (무료 일 25,000회) — 키 없으면 조용히 스킵 */
export async function collectNaver(keywords: string[], display = 50): Promise<RawItem[]> {
  if (!process.env.NAVER_CLIENT_ID) {
    console.log('  네이버: NAVER_CLIENT_ID 미설정, 스킵');
    return [];
  }
  const items: RawItem[] = [];
  for (const kw of keywords) {
    for (const [endpoint, source] of [
      ['blog', 'naver-blog'],
      ['cafearticle', 'naver-cafe'],
    ] as const) {
      const results = await search(endpoint, kw, display);
      for (const r of results) {
        items.push({
          source,
          sourceId: r.link,
          url: r.link,
          author: r.bloggername ?? r.cafename,
          content: `${strip(r.title)}\n${strip(r.description)}`,
          postedAt: r.postdate
            ? `${r.postdate.slice(0, 4)}-${r.postdate.slice(4, 6)}-${r.postdate.slice(6, 8)}`
            : undefined,
          keyword: kw,
        });
      }
    }
  }
  return items;
}
