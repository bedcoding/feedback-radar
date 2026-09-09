import type { Result, CrawlState } from './collect';

type Group = { result: Result; state: CrawlState };
// Refresh before the retention deadline, independently of search pagination.
export async function refreshStored(groups: Group[], key: string, fetcher: typeof fetch = fetch, now = Date.now()) {
  const due = now - 25 * 86400_000;
  const stamp = new Date(now).toISOString();
  let calls = 0;
  const signal = AbortSignal.timeout(25_000);
  async function request(endpoint: string, ids: string[]): Promise<Map<string, any>> {
    if (calls >= 40) throw new Error('refresh-budget');
    calls++;
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('id', ids.join(','));
    if (endpoint === 'comments') url.searchParams.set('textFormat', 'plainText');
    const response = await fetcher(url, {headers:{'X-Goog-Api-Key':key},cache:'no-store',signal});
    if (response.status === 404 && endpoint === 'comments') {
      const error = await response.json();
      if (error?.error?.errors?.[0]?.reason === 'commentNotFound') {
        if (ids.length === 1) return new Map<string, any>();
        const middle = Math.ceil(ids.length / 2);
        return new Map([...(await request(endpoint, ids.slice(0,middle))), ...(await request(endpoint, ids.slice(middle)))]);
      }
    }
    if (!response.ok) throw new Error('refresh-unavailable');
    const body = await response.json();
    if (!Array.isArray(body.items)) throw new Error('refresh-invalid-response');
    return new Map<string, any>(body.items.map((item: any) => [item.id, item]));
  }
  try {
    const videos = groups.flatMap(g => [...g.result.videos, ...g.state.pending].map(v => ({g,v})));
    const ids = [...new Set(videos.filter(({g,v}) => Date.parse(v.metadataFetchedAt ?? v.fetchedAt ?? g.result.checkedAt) <= due).map(({v}) => v.id))];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i,i+50);
      const found = await request('videos',batch);
      for (const g of groups) {
        const update = (v: Result['videos'][number]) => {
          if (!batch.includes(v.id)) return true;
          const item = found.get(v.id);
          if (!item) return false;
          v.title = item.snippet.title ?? '';
          v.metadataFetchedAt = stamp;
          return true;
        };
        g.result.videos = g.result.videos.filter(update);
        g.state.pending = g.state.pending.filter(update);
      }
    }
    const commentIds = [...new Set(groups.flatMap(g => g.result.videos.flatMap(v => v.comments.filter(c => Date.parse(c.fetchedAt ?? v.fetchedAt ?? g.result.checkedAt) <= due).map(c => c.id))))];
    for (let i = 0; i < commentIds.length; i += 50) {
      const batch = commentIds.slice(i,i+50);
      const found = await request('comments',batch);
      for (const g of groups) for (const v of g.result.videos) {
        v.comments = v.comments.filter(c => {
          if (!batch.includes(c.id)) return true;
          const item = found.get(c.id);
          if (!item) return false;
          c.text = item.snippet.textOriginal ?? item.snippet.textDisplay ?? '';
          c.publishedAt = item.snippet.publishedAt ?? '';
          c.fetchedAt = stamp;
          return true;
        });
      }
    }
    return {calls, pending:false};
  } catch {
    // A failed request is not evidence that the originals were deleted.
    return {calls, pending:true};
  }
}
