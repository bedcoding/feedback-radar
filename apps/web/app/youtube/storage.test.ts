import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCollectionStore, prune } from './storage';
import { collectYouTube, type CrawlState } from './collect';

test('refreshes aging saved originals and preserves them after reopening', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-refresh-test-'));
  const file = path.join(dir, 'collection.json');
  const old = new Date(Date.now() - 29 * 86400_000).toISOString();
  const saved = {version:1,keywords:['Example'],groups:{'["Example"]':{state:{searches:{Example:{next:'next'}},pending:[]},result:{calls:0,limited:false,checkedAt:old,videos:[{id:'saved',title:'Previous',url:'https://example.invalid',fetchedAt:old,status:'complete',comments:[{id:'comment',text:'Previous',url:'',publishedAt:old,reply:false,fetchedAt:old}]}]}}}};
  const fake = (async(input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/videos')) return Response.json({items:[{id:'saved',snippet:{title:'Updated title'}}]});
    if (url.pathname.endsWith('/comments')) return Response.json({items:[{id:'comment',snippet:{textOriginal:'Updated text',publishedAt:old}}]});
    assert.equal(url.searchParams.get('pageToken'),'next');
    return Response.json({items:[]});
  }) as typeof fetch;
  try {
    await fs.writeFile(file,JSON.stringify(saved));
    await createCollectionStore(file,fake).accumulate('synthetic',['Example']);
    const result=(await createCollectionStore(file,fake).loadCollection()).result!;
    assert.equal(result.videos[0].title,'Updated title');
    assert.equal(result.videos[0].comments[0].text,'Updated text');
    assert.equal(result.calls,3);
  } finally { await fs.unlink(file).catch(()=>{}); await fs.rmdir(dir); }
});

test('persists twenty-video pages across store reloads and deduplicates a new cycle', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-store-test-'));
  const file = path.join(dir, 'collection.json');
  const tokens: (string | null)[] = [];
  const fake = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) {
      const next = url.searchParams.get('pageToken'); tokens.push(next);
      assert.equal(url.searchParams.get('maxResults'), '20');
      return Response.json({nextPageToken: next ? undefined : 'page2', items: Array.from({length:20}, (_, i) => ({id:{videoId:`video${i + (next ? 20 : 0)}`}, snippet:{title:'Example'}}))});
    }
    if (url.pathname.endsWith('/videos')) return Response.json({items:url.searchParams.get('id')!.split(',').map(id => ({id,statistics:{commentCount:'1'}}))});
    const id = url.searchParams.get('videoId');
    return Response.json({items:[{snippet:{topLevelComment:{id:`comment-${id}`, snippet:{textOriginal:'Example feedback'}}}}]});
  }) as typeof fetch;
  try {
    const first = await createCollectionStore(file, fake).accumulate('synthetic', ['Example']);
    assert.equal(first.videos.length, 20);
    const reloaded = createCollectionStore(file, fake);
    assert.equal((await reloaded.loadCollection()).result?.videos.length, 20);
    const second = await reloaded.accumulate('synthetic', ['Example']);
    assert.equal(second.videos.length, 40);
    assert.equal(second.added, 20);
    const third = await reloaded.accumulate('synthetic', ['Example']);
    assert.equal(third.videos.length, 40);
    assert.equal(third.added, 0);
    assert.deepEqual(tokens, [null, 'page2', null]);
  } finally { await fs.unlink(file).catch(() => {}); await fs.rmdir(dir); }
});

test('search failure preserves already fetched pages in the pending queue', async () => {
  const state: CrawlState = {searches:{}, pending:[]};
  const fake = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.searchParams.get('q') === 'Example B') throw new Error('offline');
    return Response.json({nextPageToken:'next', items:[{id:{videoId:'example'}}]});
  }) as typeof fetch;
  await assert.rejects(collectYouTube('synthetic', ['Example A','Example B'], fake, state));
  assert.equal(state.searches['Example A'].next, 'next');
  assert.equal(state.pending[0].id, 'example');
});

test('resumes reply pages without restarting completed top-level comments', async () => {
  const state: CrawlState = {searches:{}, pending:[]};
  let threads = 0;
  const replyTokens: (string | null)[] = [];
  const fake = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) return Response.json({items:[{id:{videoId:'example'}}]});
    if (url.pathname.endsWith('/commentThreads')) { threads++; return Response.json({items:[{snippet:{topLevelComment:{id:'parent',snippet:{}},totalReplyCount:200}}]}); }
    const next = url.searchParams.get('pageToken'); replyTokens.push(next);
    return Response.json({items:[{id:next?'reply2':'reply1',snippet:{}}],nextPageToken:next?undefined:'replies2'});
  }) as typeof fetch;
  await collectYouTube('synthetic', ['Example'], fake, state);
  assert.equal(state.pending.length, 1);
  await collectYouTube('synthetic', ['Example'], fake, state);
  assert.equal(threads, 1);
  assert.deepEqual(replyTokens, [null, 'replies2']);
  assert.equal(state.pending.length, 0);
});

test('prunes expired comments even when the video was recently revisited', () => {
  const now = Date.now();
  const old = new Date(now - 30 * 86400_000).toISOString();
  const recent = new Date(now).toISOString();
  const saved = prune({version:1,keywords:['Example'],groups:{example:{state:{searches:{},pending:[]},result:{calls:0,limited:false,checkedAt:recent,videos:[{id:'example',title:'Example',url:'https://example.invalid',status:'complete',fetchedAt:recent,comments:[{id:'old',text:'Expired',url:'',reply:false,publishedAt:'',fetchedAt:old},{id:'new',text:'Recent',url:'',reply:false,publishedAt:'',fetchedAt:recent}]}]}}}}, now);
  assert.deepEqual(saved.groups.example.result.videos[0].comments.map(c => c.id), ['new']);
});

test('continues top-level pages after a quota interruption without dropping waiting videos', async () => {
  const state: CrawlState = {searches:{},pending:[]};
  let quota = false;
  const pages: string[] = [];
  const fake = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) return Response.json({items:['one','two'].map(videoId => ({id:{videoId}}))});
    if (quota) return Response.json({error:{errors:[{reason:'quotaExceeded'}]}},{status:403});
    const id = url.searchParams.get('videoId');
    const token = url.searchParams.get('pageToken') ?? 'first';
    pages.push(`${id}:${token}`);
    return Response.json({items:[],nextPageToken:id === 'one' && token !== 'third' ? (token === 'first' ? 'second' : 'third') : undefined});
  }) as typeof fetch;
  await collectYouTube('synthetic',['Example'],fake,state);
  assert.equal(state.pending[0].nextComments,'third');
  quota = true;
  await collectYouTube('synthetic',['Example'],fake,state);
  assert.equal(state.pending.length,1);
  quota = false;
  await collectYouTube('synthetic',['Example'],fake,state);
  assert.equal(state.pending.length,0);
  assert.deepEqual(pages,['one:first','one:second','two:first','one:third']);
});
