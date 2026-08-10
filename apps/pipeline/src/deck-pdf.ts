import fs from 'node:fs';
import path from 'node:path';
import { openRadarStore, privateDir } from '@feedback-radar/core';
import { launchBrowser, newPage } from './browser.js';

/**
 * 둘러보기 단계를 그대로 PDF 한 장으로 굽는다.
 *
 * 발표 자료를 손으로 만들면 화면을 고칠 때마다 다시 캡처해 슬라이드에 갈아 끼워야 한다.
 * 그 수고가 아까워서 자료가 코드보다 뒤처지고, 뒤처진 자료를 발표하면 "실제 화면과 다르다"는
 * 지적을 받는다. 그래서 화면을 진실의 원본으로 두고 자료를 매번 새로 굽는다.
 *
 * 동작: /tour를 단계마다 열어(`?tab=…&tstep=N`) 오버레이가 그 단계를 띄운 상태를 찍고,
 * 이미지들을 한 페이지에 하나씩 담은 HTML을 만들어 PDF로 인쇄한다. PDF 병합 라이브러리를
 * 쓰지 않으려고 이 순서를 택했다 (의존성 하나를 아낀다).
 *
 * 사용법: 대시보드를 띄운 상태에서 `npm run deck`
 *   - 실데이터로 굽고 싶으면 `npm run deck -- --live` (오버레이가 /?tour=1 위에서 돈다)
 */

const BASE_URL = process.env.SHOTS_BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.join(privateDir(), 'deck-assets');
/** 슬라이드 크기. 16:9 가로 (발표 화면 기본 비율) */
const W = 1600;
const H = 900;

/**
 * 단계 수는 steps.tsx가 정한다. 여기서 숫자를 박으면 단계를 늘렸을 때 조용히 빠진다.
 * 화면에 찍힌 `N / M` 표시를 읽어 M을 알아낸다.
 */
async function readStepCount(page: Awaited<ReturnType<typeof newPage>>): Promise<number> {
  const text = await page.locator('.tour-step-no').first().innerText();
  const m = text.match(/\/\s*(\d+)/);
  if (!m) throw new Error(`단계 수를 읽지 못했습니다 (표시: "${text}")`);
  return Number(m[1]);
}

/** 이 단계가 어느 탭을 요구하는지: 오버레이가 옮긴 뒤의 URL에서 읽는다 */
async function currentTab(page: Awaited<ReturnType<typeof newPage>>): Promise<string> {
  const u = new URL(page.url());
  return u.searchParams.get('tab') ?? '(기본)';
}

function slideHtml(shots: { png: string; title: string }[], brand: string): string {
  const pages = shots
    .map(
      (s) => `
  <section class="slide">
    <img src="data:image/png;base64,${s.png}" alt="" />
  </section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<title>${brand} 둘러보기</title>
<style>
  @page { size: ${W}px ${H}px; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0b0f17; }
  .slide {
    width: ${W}px; height: ${H}px;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    /* 마지막 장 뒤에 빈 페이지가 붙지 않도록 break-after 대신 break-before를 쓴다 */
  }
  .slide + .slide { break-before: page; }
  .slide img { width: 100%; height: 100%; object-fit: cover; object-position: top center; }
</style></head>
<body>
${pages}
</body></html>`;
}

async function main(): Promise<void> {
  const live = process.argv.includes('--live');
  /*
    표지 문구에 쓸 서비스명만 필요하다. 설정이 DB로 옮겨져 접속이 필요해졌는데, 캡처가
    실패할 이유를 늘리지 않으려고 실패하면 자리표시자로 이어 간다. PDF는 화면을 찍는
    것이라 이 값이 없어도 본문은 그대로 나온다.
  */
  const config = await openRadarStore()
    .then(async (db) => {
      try {
        return await db.getConfig();
      } finally {
        await db.close();
      }
    })
    .catch((error) => {
      console.warn(`  설정을 읽지 못해 자리표시자로 굽습니다: ${(error as Error).message}`);
      return { displayName: '{서비스명}' } as Awaited<ReturnType<Awaited<ReturnType<typeof openRadarStore>>['getConfig']>>;
    });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await launchBrowser();
  const page = await newPage(browser);
  await page.setViewportSize({ width: W, height: H });

  const shots: { png: string; title: string }[] = [];
  const base = live ? `${BASE_URL}/?tour=1` : `${BASE_URL}/tour`;
  /**
   * pdf=1을 함께 붙인다. 화면이 이 값을 보고 PDF 버튼 자신을 숨긴다.
   * 안 숨기면 발표 자료 열네 장 전부에 "PDF 만들기" 버튼이 박힌다.
   */
  const join = (extra: string) => `${base}${base.includes('?') ? '&' : '?'}pdf=1&${extra}`;

  try {
    console.log(`둘러보기 PDF: ${base}`);
    await page.goto(join('tstep=1'), { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector('.tour-card', { timeout: 15_000 });
    const total = await readStepCount(page);
    console.log(`  단계 ${total}개`);

    for (let n = 1; n <= total; n++) {
      // 단계마다 새로 열어야 오버레이가 initial step을 다시 읽는다
      await page.goto(join(`tstep=${n}`), { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForSelector('.tour-card', { timeout: 15_000 });
      /*
        오버레이가 탭을 옮기고(라우터), 대상으로 스크롤하고, 설명 카드 위치를 잡을 때까지
        기다린다. TourOverlay의 보정 타이머가 800ms까지 도니 그보다 넉넉하게 준다.
      */
      await page.waitForTimeout(1400);
      const title = await page.locator('.tour-card h3').first().innerText();
      const tab = await currentTab(page);
      const buf = await page.screenshot({ type: 'png' });
      shots.push({ png: buf.toString('base64'), title });
      console.log(`  ✓ ${n}/${total} [${tab}] ${title}`);
    }

    console.log('PDF 인쇄');
    await page.setContent(slideHtml(shots, config.displayName), { waitUntil: 'load' });
    // 배경색과 이미지를 그대로 살린다. 안 켜면 어두운 테마가 흰 종이로 인쇄된다
    const file = path.join(OUT_DIR, `tour-deck${live ? '-live' : ''}.pdf`);
    await page.pdf({
      path: file,
      width: `${W}px`,
      height: `${H}px`,
      printBackground: true,
      pageRanges: `1-${shots.length}`,
    });
    console.log(`\n${shots.length}장 → ${file}`);
  } finally {
    await page.context().close();
    await browser.close();
  }
}

main().catch((e) => {
  console.error('PDF 생성 실패:', (e as Error).message);
  console.error('대시보드가 떠 있는지 확인하세요 (npm run dev 또는 npm run dev:web).');
  process.exit(1);
});
