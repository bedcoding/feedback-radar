import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateRoot = path.join(root, 'private');
function privatePath(value) {
  const target = path.resolve(root, value);
  const relative = path.relative(fs.realpathSync(privateRoot), target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Input and output must be inside private/.');
  let ancestor = path.dirname(target);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const actual = path.relative(fs.realpathSync(privateRoot), fs.realpathSync(ancestor));
  if (actual.startsWith('..') || path.isAbsolute(actual) || (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())) throw new Error('Private path cannot point outside private/.');
  return target;
}

export async function runAudit(plan, request = fetch, credentials = process.env) {
  if (!Array.isArray(plan.queries) || plan.queries.length < 1 || plan.queries.length > 24 ||
      plan.queries.some(q => typeof q?.query !== 'string' || !q.query.trim() || q.query.length > 200 || typeof q.market !== 'string' || (q.lang !== undefined && !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(q.lang)))) {
    throw new Error('Use 1–24 queries, each with market and query strings (query max 200 characters).');
  }
  const days = plan.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('days must be 1–90.');
  if (!credentials.BLUESKY_IDENTIFIER || !credentials.BLUESKY_APP_PASSWORD) throw new Error('Bluesky credentials are missing.');
  const base = 'https://bsky.social/xrpc/';
  async function call(endpoint, options) {
    let response;
    try { response = await request(base + endpoint, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Bluesky connection failed.'); }
    if (!response.ok) throw new Error(`Bluesky HTTP ${response.status}`);
    const data = await response.json().catch(() => null);
    if (!data) throw new Error('Invalid Bluesky response.');
    return data;
  }
  const session = await call('com.atproto.server.createSession', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: credentials.BLUESKY_IDENTIFIER, password: credentials.BLUESKY_APP_PASSWORD }),
  });
  if (typeof session.accessJwt !== 'string') throw new Error('Bluesky authentication failed.');
  const checkedAt = new Date().toISOString();
  const since = new Date(Date.parse(checkedAt) - days * 86400000).toISOString();
  const seen = new Set();
  const rows = [];
  for (const { market, query, lang } of plan.queries) {
    const params = new URLSearchParams({ q: query.trim(), since, until: checkedAt, sort: 'latest', limit: '20' });
    if (lang) params.set('lang', lang);
    try {
      const result = await call(`app.bsky.feed.searchPosts?${params}`, { headers: { Authorization: `Bearer ${session.accessJwt}` } });
      if (!Array.isArray(result.posts)) throw new Error('Invalid search response.');
      const localSeen = new Set();
      const posts = result.posts.slice(0, 20).flatMap(p => {
        const text = p.record?.text;
        const date = Date.parse(p.record?.createdAt);
        const parts = typeof p.uri === 'string' ? p.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/) : null;
        if (!parts || typeof text !== 'string' || !Number.isFinite(date) || date < Date.parse(since) || date > Date.parse(checkedAt) || localSeen.has(p.uri)) return [];
        localSeen.add(p.uri);
        const duplicate = seen.has(p.uri); seen.add(p.uri);
        return [{ url: `https://bsky.app/profile/${encodeURIComponent(parts[1])}/post/${encodeURIComponent(parts[2])}`,
          postedAt: p.record.createdAt, languages: Array.isArray(p.record.langs) ? p.record.langs.filter(l => typeof l === 'string') : [],
          excerpt: text.slice(0, 500), duplicate }];
      });
      rows.push({ market, query, lang, status: 'ok', returned: result.posts.length, inspected: posts.length,
        capped: result.posts.length >= 20 || Boolean(result.cursor), posts });
    } catch (error) {
      rows.push({ market, query, status: 'error', error: error.message });
      // Stop on rate limit/auth failures; do not amplify them with more requests.
      if (/HTTP (401|403|429)/.test(error.message)) break;
    }
  }
  return { checkedAt, since, until: checkedAt, limitPerQuery: 20, uniquePosts: seen.size, rows };
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/check-bluesky-coverage.mjs private/query-plan.json private/coverage.json');
  const inputPath = privatePath(input), outputPath = privatePath(output);
  if (fs.existsSync(outputPath)) throw new Error('Output already exists. Choose a new private filename.');
  for (const envFile of [path.join(root, '.env'), path.join(privateRoot, '.env')]) {
    if (fs.existsSync(envFile)) { process.loadEnvFile(envFile); break; }
  }
  const audit = await runAudit(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ queries: audit.rows.length, successful: audit.rows.filter(r => r.status === 'ok').length, uniquePosts: audit.uniquePosts }));
  if (audit.rows.some(r => r.status === 'error')) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
