import { loadPrivateEnv, isReadOnlyMode } from '@feedback-radar/core';
import { parseKeywords } from '../collect';
import { accumulate, loadCollection } from '../storage';
export const runtime = 'nodejs';
export const maxDuration = 120;
let busy = false;
let lastRun = 0;
export async function POST(request: Request) {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin');
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || isReadOnlyMode() || (origin !== `http://${host}` && origin !== `https://${host}`)) {
    return Response.json({ error: '로컬 화면에서만 실행할 수 있습니다.' }, { status: 403 });
  }
  loadPrivateEnv();
  if (isReadOnlyMode()) return Response.json({ error: '조회 전용 화면에서는 실행할 수 없습니다.' }, { status: 403 });
  if (!process.env.YOUTUBE_API_KEY?.trim()) return Response.json({ error: 'YouTube API 키를 설정하고 서버를 다시 시작해 주세요.' }, { status: 503 });
  let keywords: string[];
  try { keywords = parseKeywords((await request.json()).keywords); }
  catch { return Response.json({ error: '검색어는 한 줄에 하나씩, 최대 5개 입력해 주세요.' }, { status: 400 }); }
  if (busy || Date.now() - lastRun < 60_000) return Response.json({ error: '이전 조회가 끝난 뒤 1분 후 다시 실행해 주세요.' }, { status: 429 });
  busy = true;
  lastRun = Date.now();
  try { return Response.json(await accumulate(process.env.YOUTUBE_API_KEY.trim(), keywords), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'YouTube 조회에 실패했습니다. API 활성화·키 제한·일일 할당량을 확인해 주세요.' }, { status: 502 }); }
  finally { busy = false; }
}

export async function GET(request: Request) {
  loadPrivateEnv();
  const host = request.headers.get('host') ?? '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || isReadOnlyMode()) return Response.json({error:'로컬 전용'}, {status:403});
  try { return Response.json(await loadCollection(), {headers:{'Cache-Control':'no-store'}}); }
  catch { return Response.json({error:'저장된 결과를 읽지 못했습니다.'}, {status:500}); }
}
