import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { privateDir } from '@feedback-radar/core';

/**
 * 발표 자료용 캡처 이미지 서빙.
 *
 * 캡처본에는 실서비스 데이터가 찍혀 있어 public/이 아니라 gitignore되는
 * private/deck-assets/에 둔다. 이름은 허용 목록으로만 받아 경로 조작을 막는다.
 * 캡처 생성: `npm run shots`
 */

const ALLOWED = new Set(['dashboard-full', 'dashboard-scheduler', 'dashboard-table', 'report']);

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!ALLOWED.has(name)) return new Response('Not found', { status: 404 });

  try {
    const buf = await readFile(path.join(privateDir(), 'deck-assets', `${name}.png`));
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response('아직 캡처되지 않았습니다. npm run shots 를 실행하세요.', { status: 404 });
  }
}
