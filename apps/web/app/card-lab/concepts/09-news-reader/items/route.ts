import { NextResponse } from 'next/server';

import { isConcept09SourceId, loadConcept09ChannelPage } from '../../_data/liveChannels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = params.get('source') ?? '';
  const page = Number(params.get('page') ?? '1');

  if (!isConcept09SourceId(source) || !Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    return NextResponse.json(
      { error: '잘못된 채널 또는 페이지입니다.' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  try {
    const items = await loadConcept09ChannelPage(source, page);
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
