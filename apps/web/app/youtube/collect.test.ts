import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectYouTube, parseKeywords } from './collect';
const comment = (id: string) => ({ id, snippet: { textOriginal: 'Example feedback', publishedAt: '2026-01-01T00:00:00Z' } });
test('validates keyword budgets before making requests', () => {
  assert.deepEqual(parseKeywords([' Example ', 'Example']), ['Example']);
  for (const invalid of [[], [''], Array(6).fill('Example'), ['a'.repeat(101)], [1]]) assert.throws(() => parseKeywords(invalid));
});
test('deduplicates videos and retrieves omitted replies while preserving disabled status', async () => {
  const paths: string[] = [];
  const fake = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.has('key'), false);
    assert.equal((init?.headers as Record<string, string>)['X-Goog-Api-Key'], 'synthetic');
    paths.push(url.pathname);
    if (url.pathname.endsWith('/search')) return Response.json({ items: ['videoA', 'videoB'].map(videoId => ({ id: { videoId }, snippet: { title: 'Example video' } })) });
    if (url.searchParams.get('videoId') === 'videoB') return Response.json({ error: { errors: [{ reason: 'commentsDisabled' }] } }, { status: 403 });
    if (url.pathname.endsWith('/commentThreads')) return Response.json({ items: [{ snippet: { topLevelComment: comment('parent'), totalReplyCount: 2 }, replies: { comments: [comment('reply1')] } }] });
    return Response.json({ items: [comment('reply1'), comment('reply2')] });
  }) as typeof fetch;
  const result = await collectYouTube('synthetic', ['Example', 'Service A'], fake);
  assert.equal(result.videos.length, 2);
  assert.deepEqual(result.videos[0].comments.map(c => c.id), ['parent', 'reply1', 'reply2']);
  assert.equal(result.videos[1].status, '댓글 사용 중지');
  assert.equal(paths.filter(p => p.endsWith('/commentThreads')).length, 2);
  assert.equal(result.limited, false);
});
test('stops pagination and reports partial results', async () => {
  let page = 0;
  const fake = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) return Response.json({ items: [{ id: { videoId: 'videoA' }, snippet: { title: 'Example' } }] });
    page++;
    return Response.json({ items: [{ snippet: { topLevelComment: comment(`p${page}`), totalReplyCount: 0 } }], nextPageToken: 'more' });
  }) as typeof fetch;
  const result = await collectYouTube('synthetic', ['Example'], fake);
  assert.equal(page, 2);
  assert.equal(result.limited, true);
  assert.equal(result.videos[0].comments.length, 2);
});
test('quota failure stops subsequent video calls without claiming completeness', async () => {
  let count = 0;
  const fake = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/search')) return Response.json({ items: ['videoA', 'videoB'].map(videoId => ({ id: { videoId } })) });
    count++;
    return Response.json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
  }) as typeof fetch;
  const result = await collectYouTube('synthetic', ['Example'], fake);
  assert.equal(count, 1);
  assert.equal(result.limited, true);
  assert.equal(result.videos[0].status, 'YouTube 일일 할당량 소진');
});
