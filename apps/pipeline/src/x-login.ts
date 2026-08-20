import readline from 'node:readline';
import { chromium } from 'playwright';
import { writeXSession, X_AUTH_COOKIE, X_CSRF_COOKIE, X_SESSION_PATH } from '@feedback-radar/core';

/**
 * X 세션 저장 (터미널 경로).
 *
 * **보통은 이 스크립트가 필요 없다.** 대시보드 설정 탭의 `X 세션` 칸에 쿠키를 붙여넣으면 되고,
 * 그게 같은 파일을 만든다. 이쪽은 브라우저를 띄워 직접 로그인하고 싶을 때와, 화면을 띄우기
 * 어려운 환경(원격 셸 등)에서 쓴다.
 *
 * - `npm run x-login`: 브라우저를 띄워 사람이 로그인하고, 끝난 상태의 쿠키와 로컬스토리지를 저장
 * - `npm run x-login -- --cookie`: 이미 로그인해 둔 브라우저의 쿠키를 붙여넣기
 *
 * 임시 계정으로 만들어라. 정지되거나 막히면 다시 돌려 새 계정 세션을 넣으면 된다.
 *
 * **브라우저 경로에서는 [Google로 계속]과 [Apple로 계속]이 작동하지 않는다.** 구글이 자동화로
 * 제어되는 브라우저의 OAuth를 거부하기 때문이다("브라우저 또는 앱이 안전하지 않을 수 있습니다").
 * X가 아니라 구글이 막는 것이라 계정을 바꿔도 같다. 그 계정을 쓰려면 쿠키를 넣어라.
 */

/**
 * 프롬프트를 순서대로 띄우고 한 줄씩 받는다. 모자라면 빈 문자열로 채운다.
 *
 * **`rl.question`을 쓰지 않는다.** 파이프로 값을 넣으면 첫 줄을 소비하지 않고 프롬프트만
 * 연달아 출력한 뒤 멈춘다(Node readline의 동작이고, 그 상태로는 스크립트 검증이 불가능하다).
 * `for await`로 line 이벤트를 받으면 대화형 터미널과 파이프에서 모두 같게 동작한다.
 *
 * `output`을 주지 않는 것도 의도다. readline이 화면 제어를 하지 않으므로 터미널 자체 echo가
 * 살아 있어 붙여넣은 값이 보이고, 값을 코드가 다시 출력하는 일은 없다.
 */
async function readAnswers(prompts: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  const rl = readline.createInterface({ input: process.stdin });
  process.stdout.write(prompts[0]);
  for await (const line of rl) {
    out.push(line.trim());
    if (out.length >= prompts.length) break;
    process.stdout.write(prompts[out.length]);
  }
  rl.close();
  while (out.length < prompts.length) out.push('');
  return out;
}

/**
 * 이미 로그인된 브라우저의 쿠키를 받아 세션 파일을 만든다.
 *
 * 값을 명령줄 인자로 받지 않는 것은 의도다. 인자로 주면 셸 히스토리에 계정 접근권이 그대로 남는다.
 */
async function fromCookie(): Promise<void> {
  console.log('이미 로그인해 둔 브라우저에서 쿠키를 복사해 붙여넣는 방식입니다.\n');
  console.log('  1. 그 브라우저에서 x.com 접속 (로그인된 상태)');
  console.log('  2. 개발자도구 열기 (F12 또는 Cmd+Option+I)');
  console.log('  3. Application 탭 > 좌측 Storage > Cookies > https://x.com');
  console.log(`  4. ${X_AUTH_COOKIE} 행의 Value를 복사\n`);
  console.log('붙여넣은 값은 화면에 다시 출력하지 않고, 셸 히스토리에도 남지 않습니다.\n');

  const [auth, csrf] = await readAnswers([
    `${X_AUTH_COOKIE}: `,
    `${X_CSRF_COOKIE} (없으면 그냥 Enter): `,
  ]);
  if (!writeXSession(auth, csrf)) {
    console.warn(`\n${X_AUTH_COOKIE} 값이 비어 있어 저장하지 않았습니다.`);
    process.exit(1);
  }
  console.log(`\n저장 완료: ${X_SESSION_PATH}`);
  console.log('npm run collect -- --source=x 로 한 번 돌려 실제로 열리는지 확인하세요.');
  process.exit(0);
}

/** 브라우저를 띄워 사람이 로그인하게 하고, 그 상태를 저장한다 */
async function fromBrowser(): Promise<void> {
  console.log('X 로그인 창을 엽니다. 버릴 수 있는 임시 계정으로 로그인하고, 타임라인이 보이면 이 터미널에서 Enter를 누르세요.');
  console.log(`세션은 ${X_SESSION_PATH}에 저장되고 git에는 올라가지 않습니다.\n`);

  // 반드시 headed로 띄운다. 사람이 로그인해야 하기 때문이다.
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: 'ko-KR', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded' });

  // 터미널 Enter를 기다린다. 로그인 완료 판정을 자동화하면 2단계 인증, 캡차 등에서
  // 오판하므로, 사람이 "다 됐다"를 눌러 주는 편이 확실하다.
  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });

  /**
   * 저장 전에 로그인이 실제로 끝났는지 본다.
   *
   * 로그인이 안 된 채 Enter를 누르면 빈 세션이 저장되고, 그 사실은 다음 수집에서야
   * '세션 만료' 배너로 드러난다. 여기서 걸러 주면 그 한 바퀴를 줄인다.
   */
  const cookies = await ctx.cookies();
  const loggedIn = cookies.some((c) => c.name === X_AUTH_COOKIE && c.value);
  if (!loggedIn) {
    console.warn(`\n로그인이 확인되지 않아 세션을 저장하지 않았습니다 (${X_AUTH_COOKIE} 쿠키 없음).`);
    console.warn('구글이나 애플 버튼으로 막혔다면 대시보드 설정 탭에서 쿠키를 직접 넣으세요.');
    await browser.close();
    process.exit(1);
  }

  await ctx.storageState({ path: X_SESSION_PATH });
  console.log(`\n저장 완료: ${X_SESSION_PATH}`);
  await browser.close();
  process.exit(0);
}

const useCookie = process.argv.includes('--cookie');
(useCookie ? fromCookie() : fromBrowser()).catch((e) => {
  console.error('세션 저장 실패:', (e as Error).message);
  process.exit(1);
});
