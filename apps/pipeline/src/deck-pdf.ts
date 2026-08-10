import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot, openRadarStore, privateDir } from '@feedback-radar/core';
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

/**
 * 실제로 설치된 오픈소스 목록. package.json에서 읽어 버전까지 함께 적는다.
 *
 * 손으로 적으면 의존성을 올린 뒤 문서만 옛 버전으로 남는다. 제출 자료에 들어가는 값이라
 * 어긋나면 곤란하다. 워크스페이스끼리의 참조는 외부 도구가 아니므로 뺀다.
 */
function installedPackages(): { name: string; version: string }[] {
  const root = findRepoRoot();
  const found = new Map<string, string>();
  /*
    개발 의존성 중에서도 typescript와 tsx는 함께 적는다. 언어와 실행기라서 "무엇으로 만들었나"에
    바로 답하는 항목인데, dependencies만 읽으면 통째로 빠진다. 타입 정의(@types)와 실행 편의
    도구는 기술 선택이라 보기 어려워 제외한다.
  */
  const devKeep = new Set(['typescript', 'tsx']);
  for (const dir of ['packages/core', 'apps/pipeline', 'apps/web']) {
    const file = path.join(root, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const [name, range] of Object.entries(parsed.dependencies ?? {})) {
      if (name.startsWith('@feedback-radar')) continue;
      found.set(name, range.replace(/^[\^~]/, ''));
    }
    for (const [name, range] of Object.entries(parsed.devDependencies ?? {})) {
      if (devKeep.has(name)) found.set(name, range.replace(/^[\^~]/, ''));
    }
  }
  return [...found.entries()]
    .map(([name, version]) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 마지막 장: 사용한 도구와 기술.
 *
 * 제출 요건이다. "생성형 AI, 오픈소스, 외부 API를 활용한 경우 사용한 도구와 기술을
 * 제출자료에 명시해야 합니다." 화면을 찍은 장들 뒤에 고정으로 한 장 붙인다.
 *
 * 코드를 쓴 도구와 제품이 실행 중 부르는 모델을 나눠 적는다. 둘 다 생성형 AI지만 심사에서
 * 묻는 것이 다르다. 앞은 개발 과정이고 뒤는 산출물의 동작이다.
 */
function creditsSlide(): string {
  const packages = installedPackages()
    .map((p) => `<li>${p.name} <span class="v">${p.version}</span></li>`)
    .join('');
  return `
  <section class="slide credits">
    <div class="wrap">
      <h2>사용한 도구와 기술</h2>
      <div class="cols">
        <div class="col">
          <h3>개발에 사용한 생성형 AI</h3>
          <ul>
            <li>Claude Code <span class="v">Opus 5</span></li>
            <li>OpenAI Codex <span class="v">ChatGPT 5.6 Sol</span></li>
          </ul>
          <h3>제품이 실행 중 호출하는 LLM</h3>
          <ul>
            <li>Claude Code CLI <span class="v">구독, claude-haiku-4-5 / claude-opus-5</span></li>
            <li>OpenAI API <span class="v">gpt-5.4-nano, 배포판 분류</span></li>
            <li>Anthropic API <span class="v">claude-haiku-4-5, 폴백</span></li>
          </ul>
          <h3>실행 환경</h3>
          <ul>
            <li>Node.js <span class="v">20.12 이상</span></li>
            <li>PostgreSQL <span class="v">11, 가비아 호스팅</span></li>
            <li>Vercel <span class="v">조회용 배포, 서버리스 함수</span></li>
          </ul>
        </div>
        <div class="col">
          <h3>오픈소스</h3>
          <ul class="pkgs">${packages}</ul>
          <h3>수집 대상과 방식</h3>
          <ul>
            <li>앱스토어 <span class="v">iTunes RSS, 공식 무인증</span></li>
            <li>구글플레이 <span class="v">google-play-scraper</span></li>
            <li>디시인사이드, Threads <span class="v">공개 페이지 브라우저 수집</span></li>
            <li>네이버 블로그, 카페 <span class="v">오픈 API, 코드만 있고 미사용</span></li>
          </ul>
          <p class="note">
            로그인이 필요한 채널은 수집하지 않는다. 약관 위반이고 계정 정지 하나로 파이프라인이
            멈추기 때문이다. 공식 API와 비로그인 공개 페이지만 사용한다.
          </p>
        </div>
      </div>
    </div>
  </section>`;
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

  /*
    마지막 장(사용한 도구와 기술). 화면 캡처가 아니라 텍스트로 조판한다.
    발표 화면에 띄우는 한 장이라 본문을 18px까지 키웠다. 15px로 짰을 때는 1600x900 안에서
    아래 절반이 비어 허전했다.
  */
  .credits { color: #dbe6f6; font: 400 17px/1.5 -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
  .credits .wrap { width: 100%; height: 100%; padding: 48px 72px; display: flex; flex-direction: column; }
  .credits h2 { font-size: 38px; font-weight: 700; color: #fff; margin-bottom: 28px; letter-spacing: -0.6px; }
  .credits .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; flex: 1; min-height: 0; }
  .credits h3 { font-size: 16px; font-weight: 700; color: #7aa2e3; margin: 0 0 9px; letter-spacing: 0.2px; }
  .credits h3 + ul { margin-bottom: 22px; }
  .credits ul { list-style: none; }
  .credits li { padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .credits .v { color: #8fa3bf; font-size: 16px; }
  /* 패키지는 수가 많아 두 단으로 흘린다 */
  .credits .pkgs { column-count: 2; column-gap: 34px; }
  .credits .note { margin-top: 24px; color: #8fa3bf; font-size: 16px; line-height: 1.7; }
</style></head>
<body>
${pages}
${creditsSlide()}
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
