import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit } from './check-bluesky-coverage.mjs';

const credentials = { BLUESKY_IDENTIFIER: 'example.invalid', BLUESKY_APP_PASSWORD: 'synthetic' };
test('bounded search deduplicates across queries and discards old/malformed records', async () => {
  let calls = 0;
  const post = { uri: 'at://did:plc:example/app.bsky.feed.post/123', record: { text: 'Example service', createdAt: new Date().toISOString(), langs: ['en'] } };
  const request = async (url, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    if (calls === 1) return Response.json({ accessJwt: 'synthetic-session' });
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('limit'), '20');
    assert.ok(parsed.searchParams.get('since'));
    return Response.json({ posts: [post, post, { ...post, uri: 'invalid' }, { ...post, record: { ...post.record, createdAt: '2000-01-01' } }] });
  };
  const result = await runAudit({ queries: [{ market: 'A', query: 'Example' }, { market: 'B', query: 'Example 2' }] }, request, credentials);
  assert.equal(result.uniquePosts, 1);
  assert.equal(result.rows[0].posts.length, 1);
  assert.equal(result.rows[1].posts[0].duplicate, true);
});
test('rate limit stops remaining queries and never copies upstream diagnostics', async () => {
  let calls = 0;
  const request = async () => ++calls === 1 ? Response.json({ accessJwt: 'synthetic-session' }) : new Response('sensitive detail', { status: 429 });
  const result = await runAudit({ queries: [{ market: 'A', query: 'Example' }, { market: 'B', query: 'Example 2' }] }, request, credentials);
  assert.equal(calls, 2);
  assert.equal(result.rows[0].error, 'Bluesky HTTP 429');
});
