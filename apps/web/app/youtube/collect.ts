export type Comment = { id: string; text: string; publishedAt: string; url: string; reply: boolean; fetchedAt?: string };
export type CrawlState = { searches: Record<string, { next?: string; exhausted?: boolean }>; pending: Video[] };
export type Video = { id: string; title: string; url: string; comments: Comment[]; status: string; nextComments?: string; commentsDone?: boolean; pendingReplies?: { parent: string; next?: string }[]; fetchedAt?: string; metadataFetchedAt?: string; commentCount?: string; countCheckedAt?: string; collectedCommentCount?: string; summarizedCommentCount?: string; summarizedAt?: string; summaryNeeded?: boolean; summary?: string; summarySampleSize?: number; summaryError?: boolean };
export function needsSummary(video: Video): boolean {
  return video.commentCount !== undefined && (!video.summarizedAt || video.summarizedCommentCount !== video.commentCount);
}
export type Result = { videos: Video[]; calls: number; limited: boolean; checkedAt: string; refreshPending?: boolean };
export function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 5 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 100)) {
    throw new Error('검색어는 100자 이내로 최대 5개 입력해 주세요.');
  }
  return [...new Set(value.map(v => (v as string).trim()))];
}
class ApiError extends Error { constructor(public reason: string) { super(reason); } }
export async function collectYouTube(key: string, keywords: string[], fetcher: typeof fetch = fetch, state?: CrawlState, maxCalls = 80, known?: Video[]): Promise<Result> {
  const result: Result = { videos: [], calls: 0, limited: false, checkedAt: new Date().toISOString() };
  const signal = AbortSignal.timeout(90_000);
  async function request(endpoint: string, params: Record<string, string>) {
    if (result.calls >= maxCalls) { result.limited = true; throw new ApiError('limit'); }
    result.calls++;
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let response: Response;
    try { response = await fetcher(url, { headers: { 'X-Goog-Api-Key': key }, cache: 'no-store', signal }); }
    catch { throw new ApiError('network'); }
    const body = await response.json();
    if (!response.ok) throw new ApiError(body?.error?.errors?.[0]?.reason ?? 'api');
    return body;
  }
  const ids = new Set<string>();
  if (state?.pending.length) result.videos = state.pending.splice(0, 20).map(v => ({...v, status:'조회 대기'}));
  else try { for (const q of keywords) {
    const cursor = state?.searches[q];
    let page;
    try { page = await request('search', { part: 'snippet', type: 'video', q, maxResults: state ? '20' : '5', order: 'relevance', ...(cursor?.next ? {pageToken:cursor.next} : {}) }); }
    catch(error) { if (state && error instanceof ApiError && error.reason === 'invalidPageToken') state.searches[q] = {}; throw error; }
    if (state) state.searches[q] = {next:page.nextPageToken, exhausted:!page.nextPageToken};
    for (const item of page.items ?? []) {
      const id = item.id?.videoId;
      if (!id || ids.has(id)) continue;
      ids.add(id);
      result.videos.push({id, title:item.snippet?.title ?? '', url:'https://www.youtube.com/watch?v='+encodeURIComponent(id), comments:[], status:'조회 대기', fetchedAt:result.checkedAt, metadataFetchedAt:result.checkedAt});
    }
  } } catch (error) { if (state) state.pending.push(...result.videos); throw error; }
  if (state) state.pending.push(...result.videos.splice(20));
  if (known && result.videos.length) {
    try {
      const stats = await request('videos', {part:'statistics',id:result.videos.map(v => v.id).join(',')});
      const counts = new Map<string,string>((stats.items ?? []).filter((v:any) => /^\d+$/.test(v.statistics?.commentCount ?? '')).map((v:any) => [v.id,String(v.statistics.commentCount)]));
      for (const video of result.videos) {
        const old = known.find(v => v.id === video.id);
        video.summarizedAt = old?.summarizedAt;
        video.summarizedCommentCount = old?.summarizedCommentCount;
        video.collectedCommentCount ??= old?.collectedCommentCount;
        const count = counts.get(video.id);
        if (count === undefined) { video.status = '댓글 수 확인 실패'; continue; }
        const changedDuringCollection = video.commentCount !== undefined && video.commentCount !== count;
        video.commentCount = count;
        video.countCheckedAt = result.checkedAt;
        video.summaryNeeded = needsSummary(video);
        if (changedDuringCollection) { video.nextComments = undefined; video.pendingReplies = []; video.commentsDone = false; }
        if (!video.nextComments && !video.pendingReplies?.length && old?.collectedCommentCount === count) video.status = '댓글 수 동일 (조회 생략)';
      }
    } catch (error) { if (state) state.pending.unshift(...result.videos); throw error; }
  }
  for (const video of result.videos) {
    video.comments = [];
    if (video.status === '댓글 수 동일 (조회 생략)') continue;
    if (video.status === '댓글 수 확인 실패') { result.limited = true; continue; }
    const seen = new Set<string>();
    const add = (item: any, reply: boolean) => {
      if (!item.id || seen.has(item.id)) return;
      seen.add(item.id);
      video.comments.push({ id: item.id, text: item.snippet?.textOriginal ?? item.snippet?.textDisplay ?? '', publishedAt: item.snippet?.publishedAt ?? '', url: `${video.url}&lc=${encodeURIComponent(item.id)}`, reply });
    };
    try {
      let token = state ? (video.nextComments ?? '') : '';
      video.fetchedAt = new Date().toISOString();
      let partial = false;
      for (let p = 0; p < 2 && !video.commentsDone; p++) {
        const page = await request('commentThreads', { part: 'snippet,replies', videoId: video.id, maxResults: '100', order: 'time', textFormat: 'plainText', ...(token ? { pageToken: token } : {}) });
        for (const thread of page.items ?? []) {
          add(thread.snippet.topLevelComment, false);
          const embedded = thread.replies?.comments ?? [];
          embedded.forEach((r: any) => add(r, true));
          if ((thread.snippet.totalReplyCount ?? 0) > embedded.length) {
            if (state) {
              video.pendingReplies ??= [];
              if (!video.pendingReplies.some(r => r.parent === thread.snippet.topLevelComment.id)) video.pendingReplies.push({parent:thread.snippet.topLevelComment.id});
              continue;
            }
            const replies = await request('comments', { part: 'snippet', parentId: thread.snippet.topLevelComment.id, maxResults: '100', textFormat: 'plainText' });
            (replies.items ?? []).forEach((r: any) => add(r, true));
            if (replies.nextPageToken) partial = true;
          }
        }
        token = page.nextPageToken ?? '';
        video.nextComments = token || undefined;
        if (state) video.commentsDone = !token;
        if (!token) break;
      }
      if (state) {
        while (video.pendingReplies?.length) {
          const pending = video.pendingReplies[0];
          const replies = await request('comments', {part:'snippet', parentId:pending.parent, maxResults:'100', textFormat:'plainText', ...(pending.next ? {pageToken:pending.next} : {})});
          (replies.items ?? []).forEach((r: any) => add(r, true));
          if (replies.nextPageToken) { pending.next = replies.nextPageToken; partial = true; break; }
          video.pendingReplies.shift();
        }
        partial ||= Boolean(video.pendingReplies?.length);
      }
      partial ||= Boolean(token);
      result.limited ||= partial;
      if (!partial && video.commentCount !== undefined) video.collectedCommentCount = video.commentCount;
      video.status = partial ? (state ? '일부 조회 (이어서 수집 예정)' : '일부 조회 · 다음 실행에서도 최신 댓글부터 확인') : video.comments.length ? '조회 완료' : '공개 댓글 없음';
    } catch (error) {
      const reason = error instanceof ApiError ? error.reason : 'api';
      video.status = reason === 'commentsDisabled' ? '댓글 사용 중지' : reason === 'limit' ? '이번 실행 호출 한도 도달' : reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' ? 'YouTube 일일 할당량 소진' : '조회 실패 · 다시 시도해 주세요';
      if (reason === 'commentsDisabled') { video.comments = []; video.nextComments = undefined; video.pendingReplies = []; }
      if (reason === 'invalidPageToken') { video.nextComments = undefined; video.commentsDone = false; if (video.pendingReplies?.[0]) video.pendingReplies[0].next = undefined; }
      if (reason !== 'commentsDisabled') result.limited = true;
      if (['limit', 'quotaExceeded', 'dailyLimitExceeded', 'network'].includes(reason)) break;
    }
  }
  if (state) {
    for (const video of result.videos) if (video.nextComments || video.pendingReplies?.length || video.status === '조회 대기' || /실패|한도|소진/.test(video.status)) state.pending.push({...video, comments:[]});
    result.limited ||= state.pending.length > 0;
  }
  return result;
}
