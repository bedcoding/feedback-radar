import gplay from 'google-play-scraper';
import type { RawItem } from '@feedback-radar/core';

export async function collectGooglePlay(
  appId: string,
  lang = 'ko',
  country = 'kr',
  num = 200,
): Promise<RawItem[]> {
  const res = await gplay.reviews({ appId, lang, country, sort: gplay.sort.NEWEST, num });
  return res.data
    .filter((r) => r.text && r.text.trim().length > 0)
    .map((r) => ({
      source: 'googleplay',
      sourceId: r.id,
      url: `https://play.google.com/store/apps/details?id=${appId}&hl=${lang}&reviewId=${r.id}`,
      author: r.userName,
      content: r.text!,
      rating: r.score,
      postedAt: r.date ? new Date(r.date).toISOString() : undefined,
    }));
}
