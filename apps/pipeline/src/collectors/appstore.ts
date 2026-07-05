import type { RawItem } from '@feedback-radar/core';

interface RssEntry {
  id?: { label?: string };
  author?: { name?: { label?: string } };
  'im:rating'?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  updated?: { label?: string };
}

/** 애플 공식 iTunes RSS — 인증 불필요, 페이지당 50건 */
export async function collectAppStore(appId: string, country = 'kr', pages = 3): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
    const res = await fetch(url);
    if (!res.ok) break;
    const json = (await res.json()) as { feed?: { entry?: RssEntry | RssEntry[] } };
    const raw = json.feed?.entry;
    if (!raw) break;
    const entries = Array.isArray(raw) ? raw : [raw];
    for (const e of entries) {
      const id = e.id?.label;
      const title = e.title?.label ?? '';
      const body = e.content?.label ?? '';
      if (!id || (!title && !body)) continue;
      items.push({
        source: 'appstore',
        sourceId: id,
        url: `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
        author: e.author?.name?.label,
        content: title && body && title !== body ? `${title}\n${body}` : body || title,
        rating: e['im:rating']?.label ? Number(e['im:rating'].label) : undefined,
        postedAt: e.updated?.label,
      });
    }
  }
  return items;
}
