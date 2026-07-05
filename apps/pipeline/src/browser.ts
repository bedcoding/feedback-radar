import { chromium, type Browser } from 'playwright';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * 시스템에 설치된 Edge/Chrome을 우선 사용해 브라우저 바이너리 다운로드 없이 동작.
 * 서버 배포 시에는 `npx playwright install chromium` 후 채널 없이 실행된다.
 */
export async function launchBrowser(): Promise<Browser> {
  for (const channel of ['msedge', 'chrome', undefined] as const) {
    try {
      return await chromium.launch({ headless: true, channel });
    } catch {
      // 다음 채널 시도
    }
  }
  throw new Error('사용 가능한 Chromium 계열 브라우저가 없습니다. `npx playwright install chromium`을 실행하세요.');
}

export async function newPage(browser: Browser) {
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });
  return ctx.newPage();
}
