/*
  채널 게시판의 페이지 넘기기. 예전에는 카드 시안 경로 아래에 있었는데,
  시안을 걷어내면 운영 화면이 함께 죽으므로 운영 경로로 옮겼다.
*/
import { NextResponse } from 'next/server';

import { isChannelSourceId, loadChannelPage } from '../../../_channels/liveData';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get('source') ?? '';
  const page = Number(params.get('page') ?? '1');

  if (!isChannelSourceId(source) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    return NextResponse.json(
      { error: '잘못된 채널 또는 페이지입니다.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const items = await loadChannelPage(source, page);
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: '글 목록을 불러오지 못했습니다.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
