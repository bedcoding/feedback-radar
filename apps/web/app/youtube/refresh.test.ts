import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshStored } from './refresh';
import type { Result, CrawlState } from './collect';
const now = Date.now();
const old = new Date(now - 26 * 86400_000).toISOString();
const fixture = (): {result:Result;state:CrawlState} => ({state:{searches:{Example:{next:'next'}},pending:[]},result:{calls:0,limited:false,checkedAt:old,videos:[{id:'video',title:'Old title',url:'https://example.invalid',status:'complete',fetchedAt:old,comments:['keep','deleted'].map(id => ({id,text:'Old text',url:'',reply:false,publishedAt:old,fetchedAt:old}))}]}});
test('refreshes existing text and title without losing search progress, removes missing originals',async()=>{
  const group=fixture();
  const fake=(async(input:URL|RequestInfo)=>{
    const url=new URL(String(input));
    return Response.json({items:url.pathname.endsWith('/videos')?[{id:'video',snippet:{title:'Current title'}}]:[{id:'keep',snippet:{textOriginal:'Current text',publishedAt:old}}]});
  }) as typeof fetch;
  const result=await refreshStored([group],'synthetic',fake,now);
  assert.equal(result.calls,2);
  assert.equal(result.pending,false);
  assert.equal(group.result.videos[0].title,'Current title');
  assert.equal(group.result.videos[0].metadataFetchedAt,new Date(now).toISOString());
  assert.deepEqual(group.result.videos[0].comments.map(c=>c.id),['keep']);
  assert.equal(group.result.videos[0].comments[0].text,'Current text');
  assert.equal(group.result.videos[0].comments[0].fetchedAt,new Date(now).toISOString());
  assert.equal(group.state.searches.Example.next,'next');
});
test('network failure neither deletes originals nor renews unverified timestamps',async()=>{
  const group=fixture();const before=structuredClone(group);
  const fake=(async()=>{throw new Error('offline');}) as typeof fetch;
  assert.equal((await refreshStored([group],'synthetic',fake,now)).pending,true);
  assert.deepEqual(group,before);
});
test('isolates a missing comment in a failed batch so other comments can refresh',async()=>{
  const group=fixture();group.result.videos[0].metadataFetchedAt=new Date(now).toISOString();
  const fake=(async(input:URL|RequestInfo)=>{
    const ids=new URL(String(input)).searchParams.get('id')!;
    if(ids.includes('deleted')) return Response.json({error:{errors:[{reason:'commentNotFound'}]}},{status:404});
    return Response.json({items:[{id:'keep',snippet:{textOriginal:'Updated',publishedAt:old}}]});
  }) as typeof fetch;
  assert.equal((await refreshStored([group],'synthetic',fake,now)).pending,false);
  assert.deepEqual(group.result.videos[0].comments.map(c=>c.id),['keep']);
});
test('recent data needs no refresh calls',async()=>{
  const group=fixture();
  const fake=(async()=>{throw new Error('must not call');}) as typeof fetch;
  assert.deepEqual(await refreshStored([group],'synthetic',fake,now-2*86400_000),{calls:0,pending:false});
});
