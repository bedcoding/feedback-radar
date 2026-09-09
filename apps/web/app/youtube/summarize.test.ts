import assert from 'node:assert/strict';
import {test} from 'node:test';
import {summarizeChanged} from './summarize';
import type {Video} from './collect';
const fixture=():Video=>({id:'example',title:'Example',url:'https://example.invalid',status:'complete',commentCount:'3000',collectedCommentCount:'3000',summarizedCommentCount:'1000',summarizedAt:'2026-01-01',comments:[{id:'c',text:'Example feedback',url:'',reply:false,publishedAt:'2026-01-01'}]});
test('disabled summaries prevent model calls',async()=>{let calls=0;await summarizeChanged([fixture()],async()=>{calls++;return 'summary';},false);assert.equal(calls,0);});
test('successful summary advances baseline and identical count skips model',async()=>{const v=fixture();let calls=0;const generate=async()=>{calls++;return 'Example summary';};await summarizeChanged([v],generate,true);assert.equal(v.summarizedCommentCount,'3000');assert.equal(v.summary,'Example summary');await summarizeChanged([v],generate,true);assert.equal(calls,1);});
test('failed summary keeps previous baseline and retries later',async()=>{const v=fixture();await summarizeChanged([v],async()=>{throw new Error();},true);assert.equal(v.summarizedCommentCount,'1000');assert.equal(v.summaryError,true);});
test('incomplete collection is not marked as summarized',async()=>{const v=fixture();v.collectedCommentCount='1000';let calls=0;await summarizeChanged([v],async()=>{calls++;return 'summary';},true);assert.equal(calls,0);});
