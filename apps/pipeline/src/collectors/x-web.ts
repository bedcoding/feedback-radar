import fs from 'node:fs';
import type { Browser } from 'playwright';
import {
  dropFlooding,
  normalizeInstant,
  resolveXPace,
  X_LONG_BREAK_MULT,
  X_SESSION_PATH,
  type RawItem,
  type XPace,
} from '@feedback-radar/core';
import { newPage } from '../browser.js';

/**
 * X 검색 (로그인 세션 사용, 비용 0).
 *
 * **이 경로는 공식 API가 아니다.** X는 비로그인 검색을 막아 뒀으므로 사람이 직접 로그인해
 * 저장한 세션(`npm run x-login`)을 재사용한다. 그래서 다음을 전제로 만들었다.
 *
 * - **임시 계정으로 쓴다.** 정지될 수 있고, 정지되면 그 계정만 버리고 새로 넣는다.
 * - **깨지는 방식이 조용한 0건이다.** 예외가 아니라 결과가 비는 형태로 실패한다. 그대로 두면
 *   "글이 없어서 0건"과 구별되지 않아 몇 주 뒤에 안다. 그래서 막힌 사유를 반드시 판별해
 *   호출부에 돌려주고, 화면이 그걸 배너로 띄운다.
 * - **요청 간격을 사람 수준으로 띄운다.** 쉬지 않고 두들기면 rate limit에 걸려 계정이 빨리
 *   죽고 서버에도 부담이다. 아래 `pause`가 그 목적이다. 다만 브라우저 지문을 위조하거나
 *   캡차를 우회하는 것은 하지 않는다. 그건 이 도구가 할 일이 아니고, 해도 오래 못 간다.
 *
 * 구조 의존: 검색 결과는 `article[data-testid="tweet"]`이다. data-testid는 X 자체 테스트가
 * 쓰는 값이라 클래스명보다는 오래 버티지만, 그래도 언제든 바뀔 수 있다.
 */

/** 왜 못 긁었는지. 호출부가 이 값을 저장해 화면에 띄운다 */
export type XWebBlock =
  | 'no-session'
  | 'login-required'
  | 'rate-limited'
  | 'account-locked'
  | 'no-results-container';

export interface XWebResult {
  items: RawItem[];
  /** 막혔으면 사유. 정상이면 undefined */
  blocked?: XWebBlock;
  /** 사람이 읽을 설명 (화면 배너에 그대로 쓴다) */
  note?: string;
}

/**
 * 배너 문구. **조치를 화면 기준으로 적는다.**
 *
 * 세션은 설정 탭의 `X 세션` 칸에서 넣고 지울 수 있다. 배너에서 터미널 명령을 안내하면
 * 화면 안에서 끝낼 수 있는 일을 셸로 내보내는 셈이라, 읽는 사람이 굳이 터미널을 연다.
 */
export const X_BLOCK_NOTE: Record<XWebBlock, string> = {
  'no-session':
    'X 세션이 없습니다. 설정 탭의 [X 세션] 칸에 임시 계정의 auth_token 쿠키를 넣으세요.',
  'login-required':
    'X 세션이 만료되었거나 로그아웃되었습니다. 설정 탭의 [X 세션] 칸에 새 쿠키를 넣으세요.',
  'rate-limited':
    'X가 호출 한도로 막았으니 수집 주기를 늘리거나 키워드를 줄이고, 반복되면 계정을 바꾸세요.',
  'account-locked':
    'X 계정이 제한되었습니다. 다른 임시 계정의 쿠키를 설정 탭의 [X 세션] 칸에 넣으세요.',
  'no-results-container':
    'X 검색 결과 구조를 찾지 못했습니다. 페이지가 바뀐 것 같으니 수집기를 점검해야 합니다.',
};

/** 본문으로 인정할 최소 길이(공백 정규화 후). 이보다 짧으면 계정명, 날짜 껍데기다 */
const MIN_BODY = 20;

/**
 * 사람이 화면을 보는 정도의 간격을 둔다.
 *
 * **균등 랜덤으로는 부족하다.** `min + random() * (max - min)`은 평균 근처에 값이 몰려서
 * 편차가 작고, 그 일정함이 곧 기계의 특징이다(5~12초로 뽑으면 대개 8초 안팎이 나온다).
 * 실제 사람의 간격은 짧은 쪽이 대부분이고 간헐적으로 아주 길다. 그 모양을 두 가지로 만든다.
 *
 * - 지수를 준 난수로 **짧은 쪽에 몰리게** 한다. `random() ** 2.2`는 작은 값이 훨씬 잦다
 * - 일정 확률로 **상한의 몇 배짜리 휴식**을 넣는다 (글을 읽거나 자리를 비우는 시간)
 *
 * 이걸 탐지 회피라고 부를 것은 아니다. 하는 일은 요청을 더 적게, 더 느리게 보내는 것뿐이다.
 * 지문을 위조하거나 캡차를 넘기는 것과는 방향이 반대다.
 *
 * 범위와 확률은 화면 설정에서 온다(`resolveXPace`). 기본값은 8초 기준이다.
 */
function pause(range: readonly [number, number], longBreakChance: number): Promise<void> {
  const [minMs, maxMs] = range;
  const [lo, hi] = X_LONG_BREAK_MULT;
  const ms =
    Math.random() < longBreakChance
      ? maxMs * (lo + Math.random() * (hi - lo))
      : minMs + Math.random() ** 2.2 * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

/** 배열을 섞는다. 매번 같은 키워드 순서로 도는 것도 사람의 사용 패턴은 아니다 */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function collectXWeb(
  browser: Browser,
  keywords: string[],
  service?: string,
  limit = 20,
  options: { sessionPath?: string; pace?: XPace } = {},
): Promise<XWebResult> {
  const sessionPath = options.sessionPath ?? X_SESSION_PATH;
  // 설정을 넘기지 않으면 기본값(8초 기준)으로 돈다
  const pace = options.pace ?? resolveXPace();
  if (!fs.existsSync(sessionPath)) {
    console.warn(`  X(웹): ${X_BLOCK_NOTE['no-session']}`);
    return { items: [], blocked: 'no-session', note: X_BLOCK_NOTE['no-session'] };
  }

  const items: RawItem[] = [];
  let blocked: XWebBlock | undefined;
  const page = await newPage(browser, sessionPath);
  try {
    for (const kw of shuffled(keywords)) {
      if (blocked) break;
      const url = `https://x.com/search?q=${encodeURIComponent(kw)}&f=live`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await pause(pace.read, pace.longBreakChance);

      /**
       * 막혔는지 먼저 본다. 결과가 0건인 것과 못 들어간 것은 완전히 다른 상황인데,
       * 화면에는 둘 다 '0건'으로 보인다. 여기서 구분하지 않으면 그 차이가 사라진다.
       */
      const state = await page.evaluate(() => {
        const url = location.href;
        const text = document.body?.innerText ?? '';
        return {
          /**
           * 로그인 벽 판정. **경로만 보면 안 된다.**
           *
           * 무효 세션으로 검색에 가면 `/i/jf/onboarding/web?...&mode=login`으로 밀린다(2026-08 실측).
           * 경로에 `login`이 없어서 경로만 보던 판정은 이걸 '구조 변경'으로 오진했다. X는 이 경로를
           * 여러 번 바꿔 왔으므로(`/login`, `/i/flow/login`, 지금은 `/i/jf/...`) 로그인 유도
           * 쿼리와 화면 표식까지 함께 본다. 하나가 바뀌어도 나머지가 잡는다.
           */
          onLogin:
            /[?&](mode=login|redirect_after_login)/.test(url) ||
            /\/(login|i\/flow\/login|i\/jf\/)/.test(url) ||
            Boolean(document.querySelector('[data-testid="google_sign_in_container"]')) ||
            /전화번호로 계속|Google로 계속|Sign in to X|이메일 또는 사용자 이름/.test(text),
          hasArticle: Boolean(document.querySelector('article[data-testid="tweet"]')),
          rateLimited: /rate limit|한도.*초과|잠시 후 다시/i.test(text),
          locked: /suspended|정지|제한된 계정|locked/i.test(text),
          emptyState: /검색 결과가 없|no results|일치하는 결과/i.test(text),
        };
      });
      /**
       * 글이 실제로 렌더됐으면 다른 신호는 보지 않는다. 위 판정들은 본문 텍스트에 기대므로
       * 정상 화면에서도 우연히 걸릴 수 있는데, 결과가 있다는 것은 들어갔다는 뜻이라 그게 이긴다.
       */
      if (!state.hasArticle) {
        if (state.onLogin) blocked = 'login-required';
        else if (state.rateLimited) blocked = 'rate-limited';
        else if (state.locked) blocked = 'account-locked';
        else if (!state.emptyState) blocked = 'no-results-container';
      }
      if (blocked) break;

      /**
       * 결과를 채우려면 스크롤이 필요하다(가상 스크롤이라 화면에 든 것만 DOM에 있다).
       * 한 번에 끝까지 내리지 않고 조금씩, 간격을 두고 내린다. 매 스크롤 뒤 수집량을 확인해
       * 목표를 채우거나 더 늘지 않으면 멈춘다.
       */
      const seen = new Map<string, { text: string; time: string; handle: string }>();
      let stagnant = 0;
      for (let round = 0; round < 12 && seen.size < limit && stagnant < 3; round++) {
        const before = seen.size;
        // evaluate 안에서 함수를 선언하지 않는다. esbuild가 넣는 __name 헬퍼가 브라우저에
        // 없어 수집이 통째로 죽는다 (dcinside.ts, threads.ts에 같은 주석이 있다).
        const batch = await page.evaluate((minBody: number) => {
          const out: { id: string; text: string; time: string; handle: string }[] = [];
          for (const art of Array.from(
            document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
          )) {
            const link = art.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
            const m = link?.href.match(/\/([^/]+)\/status\/(\d+)/);
            if (!m) continue;
            const body = art.querySelector<HTMLElement>('div[data-testid="tweetText"]');
            const text = (body?.innerText ?? '').replace(/\s+/g, ' ').trim();
            if (text.length < minBody) continue;
            out.push({
              id: m[2],
              text: text.slice(0, 500),
              time: art.querySelector('time')?.getAttribute('datetime') ?? '',
              handle: m[1],
            });
          }
          return out;
        }, MIN_BODY);

        for (const b of batch) if (!seen.has(b.id)) seen.set(b.id, b);
        stagnant = seen.size > before ? 0 : stagnant + 1;

        // 사람이 읽으며 내리는 정도로. 스크롤 양도 매번 다르게 둔다
        await page.mouse.wheel(0, 1_200 + Math.floor(Math.random() * 1_600));
        await pause(pace.scroll, pace.longBreakChance);
      }

      for (const [id, p] of seen) {
        items.push({
          source: 'x',
          service,
          sourceId: id,
          url: `https://x.com/${p.handle}/status/${id}`,
          author: p.handle,
          content: p.text,
          // <time datetime>은 UTC라 그대로 두면 다른 소스와 사전순 비교가 어긋난다
          postedAt: normalizeInstant(p.time),
          keyword: kw,
        });
      }
      console.log(`  X(웹) "${kw}": ${seen.size}건`);

      // 키워드 사이에는 더 크게 쉰다. 검색을 연달아 던지는 것이 가장 눈에 띈다
      await pause(pace.gap, pace.longBreakChance);
    }
  } catch (e) {
    console.warn('  X(웹) 수집 실패:', (e as Error).message);
  } finally {
    await page.context().close();
  }

  /**
   * 같은 본문을 반복해서 올리는 계정을 걸러낸다.
   *
   * 트윗 ID가 글마다 다르므로 `UNIQUE(source, source_id)`도 URL 기준 중복 제거도 통과한다.
   * 실측(2026-08)에서 한 계정이 같은 글을 3번 올려 그대로 3건이 저장됐고, 분류 호출도 3번
   * 나갔다. 판정 기준은 본문이다(dedupe.ts). 대표 1건은 남긴다.
   */
  const { kept, dropped, groups } = dropFlooding(items);
  if (dropped.length > 0) {
    console.log(
      `  X(웹): 같은 글 반복 ${dropped.length}건 제외 (묶음 ${groups.length}개, 최다 ${groups[0]?.count}회)`,
    );
  }
  if (blocked) {
    console.warn(`  X(웹) 중단: ${X_BLOCK_NOTE[blocked]}`);
    return { items: kept, blocked, note: X_BLOCK_NOTE[blocked] };
  }
  return { items: kept };
}
