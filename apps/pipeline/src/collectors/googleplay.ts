import gplay from 'google-play-scraper';
import type { RawItem } from '@feedback-radar/core';

// google-play-scraper의 타입 선언이 sort를 enum '타입'으로 노출해(typeof가 아니라)
// gplay.sort.NEWEST가 타입 검사에서 막힌다. 런타임 값은 정상이라 값만 꺼내 쓴다.
const SORT_NEWEST = (gplay.sort as unknown as { NEWEST: typeof gplay.sort }).NEWEST;

export async function collectGooglePlay(
  appId: string,
  lang = 'ko',
  country = 'kr',
  num = 200,
  service?: string,
): Promise<RawItem[]> {
  const res = await gplay.reviews({ appId, lang, country, sort: SORT_NEWEST, num });
  return res.data
    .filter((r) => r.text && r.text.trim().length > 0)
    .map((r) => ({
      source: 'googleplay',
      sourceId: r.id,
      service,
      url: `https://play.google.com/store/apps/details?id=${appId}&hl=${lang}&reviewId=${r.id}`,
      author: r.userName,
      content: r.text!,
      rating: r.score,
      postedAt: r.date ? new Date(r.date).toISOString() : undefined,
    }));
}
