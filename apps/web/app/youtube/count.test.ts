import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectYouTube, needsSummary, type Video } from './collect';
const video = (): Video => ({id:'example',title:'Example',url:'https://example.invalid',status:'조회 완료',comments:[],commentCount:'1000',collectedCommentCount:'1000',summarizedCommentCount:'1000',summarizedAt:'2026-01-01T00:00:00Z'});
function api(count: string | undefined) {
  let comments = 0;
  const fetcher = (async(input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) return Response.json({items:[{id:{videoId:'example'}}]});
    if (url.pathname.endsWith('/videos')) return Response.json({items:[{id:'example',statistics:{commentCount:count}}]});
    comments++;
    return Response.json({items:[]});
  }) as typeof fetch;
  return {fetcher, calls:()=>comments};
}
test('unchanged count skips comments and needs no new summary',async()=>{
  const mock=api('1000');
  const r=await collectYouTube('synthetic',['Example'],mock.fetcher,{searches:{},pending:[]},80,[video()]);
  assert.equal(mock.calls(),0); assert.equal(r.videos[0].summaryNeeded,false);
  assert.equal(r.videos[0].status,'댓글 수 동일 (조회 생략)');
});
test('changed count fetches comments and preserves last successful summary baseline',async()=>{
  for(const count of ['3000','500','0']) {
    const mock=api(count);
    const r=await collectYouTube('synthetic',['Example'],mock.fetcher,{searches:{},pending:[]},80,[video()]);
    assert.equal(mock.calls(),1); assert.equal(r.videos[0].summaryNeeded,true);
    assert.equal(r.videos[0].summarizedCommentCount,'1000');
    assert.equal(r.videos[0].collectedCommentCount,count);
  }
});
test('missing count is not treated as zero or unchanged',async()=>{
  const mock=api(undefined);
  const state={searches:{},pending:[] as Video[]};
  const r=await collectYouTube('synthetic',['Example'],mock.fetcher,state,80,[video()]);
  assert.equal(mock.calls(),0); assert.equal(r.limited,true);assert.equal(state.pending.length,1);
});
test('first summary is needed even if comments were previously collected',()=>{
  const v=video(); delete v.summarizedAt;delete v.summarizedCommentCount;
  assert.equal(needsSummary(v),true);
});
test('unfinished collection continues even when count is unchanged',async()=>{
  const mock=api('1000');const pending={...video(),nextComments:'page2',commentsDone:false};
  await collectYouTube('synthetic',['Example'],mock.fetcher,{searches:{},pending:[pending]},80,[video()]);
  assert.equal(mock.calls(),1);
});
