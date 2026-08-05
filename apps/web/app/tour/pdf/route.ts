import fs from 'node:fs';
import path from 'node:path';
import { privateDir } from '@feedback-radar/core';

/**
 * 둘러보기 PDF 내려주기.
 *
 * 파일은 실데이터가 찍혀 있을 수 있어 gitignore되는 private/deck-assets/에만 둔다. 그래서
 * 정적 파일로 서빙할 수 없고(public/이 아니다) 이 라우트를 거친다. /pitch/shot/[name]과 같은
 * 이유, 같은 방식이다.
 *
 * ?live=1 이면 실데이터판, 없으면 예시 데이터판.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const live = new URL(req.url).searchParams.get('live') === '1';
  const name = `tour-deck${live ? '-live' : ''}.pdf`;
  const file = path.join(privateDir(), 'deck-assets', name);

  if (!fs.existsSync(file)) {
    return new Response(
      `아직 만들어지지 않았습니다. 둘러보기 화면의 [PDF 만들기]를 누르거나 터미널에서 npm run deck${
        live ? ' -- --live' : ''
      } 를 실행하세요.`,
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const buf = fs.readFileSync(file);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      // inline이 아니라 attachment로 둔다 — 버튼을 누른 사람은 파일을 원하는 것이다
      'Content-Disposition': `attachment; filename="${name}"`,
      // 다시 구운 파일이 옛 것으로 보이면 안 된다
      'Cache-Control': 'no-store',
    },
  });
}
