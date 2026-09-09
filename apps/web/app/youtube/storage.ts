import fs from 'node:fs/promises';
import path from 'node:path';
import { findRepoRoot } from '@feedback-radar/core';
import { collectYouTube, type CrawlState, type Result } from './collect';
import { summarizeChanged, generateSummary } from './summarize';
import { refreshStored } from './refresh';
import { postgresCollectionBackend } from './database';
export type Saved = { version: 1; keywords: string[]; groups: Record<string, { state: CrawlState; result: Result }> };
export type CollectionBackend = {
  read(): Promise<Saved>;
  write(saved: Saved): Promise<void>;
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  recordRun?(run: {startedAt:string; endedAt:string; status:string; calls:number; added:number; pending:number}): Promise<void>;
};
const empty = (): Saved => ({ version: 1, keywords: [], groups: {} });
export function prune(saved: Saved, now = Date.now()) {
  const cutoff = now - 30 * 86400_000;
  for (const group of Object.values(saved.groups)) {
    group.result.videos = group.result.videos.filter(v => Date.parse(v.metadataFetchedAt ?? v.fetchedAt ?? group.result.checkedAt) > cutoff);
    for (const video of group.result.videos) video.comments = video.comments.filter(c => Date.parse(c.fetchedAt ?? video.fetchedAt ?? group.result.checkedAt) > cutoff);
    for (const video of group.result.videos) if (video.summarizedAt && Date.parse(video.summarizedAt) <= cutoff) {
      delete video.summary; delete video.summarizedAt; delete video.summarizedCommentCount; delete video.summarySampleSize;
      video.summaryNeeded = true;
    }
    group.state.pending = group.state.pending.filter(v => Date.parse(v.metadataFetchedAt ?? v.fetchedAt ?? group.result.checkedAt) > cutoff);
    if (Date.parse(group.result.checkedAt) <= cutoff) group.state.searches = {};
  }
  return saved;
}
export function createCollectionStore(filename: string | CollectionBackend, fetcher: typeof fetch = fetch) {
const backend = typeof filename === 'string' ? undefined : filename;
const file = () => filename as string;
async function read(): Promise<Saved> {
  try {
    const saved: Saved = backend ? await backend.read() : JSON.parse(await fs.readFile(file(), 'utf8'));
    for (const group of Object.values(saved.groups)) for (const v of [...group.result.videos, ...group.state.pending]) {
      v.metadataFetchedAt ??= v.fetchedAt ?? group.result.checkedAt;
      for (const c of v.comments) c.fetchedAt ??= v.fetchedAt ?? group.result.checkedAt;
    }
    return saved;
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error; }
}
async function write(saved: Saved) {
  if (backend) { await backend.write(prune(saved)); return; }
  await fs.mkdir(path.dirname(file()), { recursive: true });
  const temporary = file() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(prune(saved)), { mode: 0o600 });
  await fs.rename(temporary, file());
}
const groupKey = (keywords: string[]) => JSON.stringify([...keywords].sort());
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const execute = () => backend ? backend.exclusive(work) : work();
  const next = queue.then(execute, execute); queue = next.catch(() => {}); return next;
}
function loadCollection() {
  return exclusive(async () => {
    const saved = prune(await read()); await write(saved);
    return { keywords: saved.keywords, result: saved.groups[groupKey(saved.keywords)]?.result };
  });
}
function accumulate(key: string, keywords: string[]) {
  return exclusive(async () => {
    const startedAt = new Date().toISOString();
    const saved = await read();
    const refresh = await refreshStored(Object.values(saved.groups), key, fetcher);
    prune(saved);
    const id = groupKey(keywords);
    const group = saved.groups[id] ?? { state: { searches: {}, pending: [] }, result: { videos: [], calls: 0, limited: false, checkedAt: new Date().toISOString() } };
    const before = new Set(group.result.videos.flatMap(v => v.comments.map(c => c.id)));
    let batch: Result;
    try { batch = await collectYouTube(key, keywords, fetcher, group.state, 80 - refresh.calls, group.result.videos); }
    catch (error) {
      saved.groups[id] = group; await write(saved);
      await backend?.recordRun?.({startedAt,endedAt:new Date().toISOString(),status:'failed',calls:refresh.calls,added:0,pending:group.state.pending.length});
      return {failure:true as const};
    }
    const videos = new Map(group.result.videos.map(v => [v.id, v]));
    for (const incoming of batch.videos) {
      const old = videos.get(incoming.id);
      // Keep each comment's original retrieval time; revisiting a video must not renew old text.
      const comments = new Map((old?.comments ?? []).map(c => [c.id, c]));
      for (const c of incoming.comments) comments.set(c.id, { ...c, fetchedAt: batch.checkedAt });
      if (incoming.status === '댓글 사용 중지') comments.clear();
      videos.set(incoming.id, { ...old, ...incoming, comments: [...comments.values()].filter(c => Date.parse(c.fetchedAt ?? old?.fetchedAt ?? batch.checkedAt) > Date.now() - 30 * 86400_000) });
    }
    await summarizeChanged([...videos.values()], generateSummary, process.env.YOUTUBE_SUMMARY_ENABLED === '1');
    group.result = { ...batch, calls: batch.calls + refresh.calls, refreshPending: refresh.pending, videos: [...videos.values()] };
    saved.groups[id] = group; saved.keywords = keywords;
    await write(saved);
    const added = batch.videos.flatMap(v => v.comments).filter(c => !before.has(c.id)).length;
    await backend?.recordRun?.({startedAt,endedAt:new Date().toISOString(),status:batch.limited || refresh.pending ? 'partial' : 'complete',calls:group.result.calls,added,pending:group.state.pending.length});
    return { ...group.result, added, pending: group.state.pending.length };
  }).then(result => { if ('failure' in result) throw new Error('YouTube collection failed'); return result; });
}

return { loadCollection, accumulate };
}
const store = createCollectionStore(postgresCollectionBackend(path.join(findRepoRoot(), 'private', 'youtube', 'collection.json')));
export const { loadCollection, accumulate } = store;
