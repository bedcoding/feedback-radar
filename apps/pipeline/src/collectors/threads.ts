import type { Browser } from 'playwright';
import { normalizeInstant, type RawItem } from '@feedback-radar/core';
import { newPage } from '../browser.js';

/**
 * Threads 검색 (실험적).
 * 로그인 모달이 뜨지만 검색 결과 자체는 DOM에 렌더링된다. Meta의 클래스명은 난독화돼 있어
 * 게시물 permalink(`/post/`)를 앵커로 삼아 추출한다. 깨지면 이 소스만 빈 배열을 반환한다.
 *
 * **게시물 하나에 링크가 두 개 있다** (2026-08 실측). 이게 수집 품질을 망치던 원인이다.
 * ```
 * /@user/post/ID         조상 6단계가 전부 10~44자 (계정명, "알림받기", 날짜뿐)
 * /@user/post/ID/media   조상 2단계에 215자 본문
 * ```
 * 둘은 href가 달라서 URL 기준 중복 제거를 그대로 통과한다. 앞쪽이 계정명과 날짜만 담긴
 * 항목으로 저장되고, LLM은 판단할 내용이 없어 전부 '무관'으로 떨어뜨린다.
 * 실측에서 수집 300건 중 201건이 그런 껍데기였고 유효율이 13.7%까지 내려갔다.
 *
 * 그래서 두 가지를 바꿨다.
 * - href에서 `/media` 같은 꼬리를 떼어 **게시물 단위로 묶는다**. 같은 게시물의 여러 링크 중
 *   본문이 가장 잘 담긴 것을 고른다.
 * - 컨테이너 판정을 **공백 정규화 후 길이**로 한다. `innerText.length`는 줄바꿈까지 세기 때문에
 *   `계정명\n\n\n날짜` 같은 껍데기가 60자를 넘겨 통과했다.
 */

/** 본문으로 인정할 최소 길이(공백 정규화 후). 이보다 짧으면 계정명, 날짜 껍데기다 */
const MIN_BODY = 40;

interface ThreadsPost {
  href: string;
  text: string;
  time: string;
}

export async function collectThreads(
  browser: Browser,
  keywords: string[],
  service?: string,
  limit = 30,
): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const page = await newPage(browser);
  let shellsDropped = 0;
  try {
    for (const kw of keywords) {
      const url = `https://www.threads.com/search?q=${encodeURIComponent(kw)}&serp_type=default`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(8_000);

      // evaluate 안에서는 함수를 선언하지 않는다. tsx(esbuild)가 넣는 `__name` 헬퍼가
      // 브라우저에 없어 수집이 통째로 죽는다 (dcinside.ts에 같은 주석이 있다).
      const { posts, shells } = await page.evaluate(
        (args: { max: number; minBody: number }) => {
          // 게시물 ID -> 지금까지 찾은 최선의 본문, 시각
          const byPost = new Map<string, { href: string; text: string; time: string }>();
          for (const a of Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'),
          )) {
            // /@user/post/ID 까지만 남긴다 (/media, ?query 등을 떼어 같은 게시물로 묶는다)
            const m = a.href.match(/^(https?:\/\/[^/]+\/@[^/]+\/post\/[^/?#]+)/);
            if (!m) continue;
            const key = m[1];

            // 가장 안쪽에서 임계값을 넘는 조상이 그 게시물의 본문이다.
            // 더 위로 올라가면 계정명과 옆 게시물까지 섞인다.
            let text = '';
            let time = '';
            for (let cur = a.parentElement, i = 0; cur && i < 6; cur = cur.parentElement, i++) {
              if (!time) time = cur.querySelector('time')?.getAttribute('datetime') ?? '';
              if (text) continue;
              const norm = (cur.innerText ?? '').replace(/\s+/g, ' ').trim();
              if (norm.length >= args.minBody) text = norm.slice(0, 500);
            }

            const prev = byPost.get(key);
            byPost.set(key, {
              href: key,
              // 본문은 더 긴 쪽을 쓰고, 시각은 어느 링크에서든 먼저 찾은 값을 지킨다
              text: (prev?.text.length ?? 0) >= text.length ? (prev?.text ?? '') : text,
              time: prev?.time || time,
            });
          }

          const out: { href: string; text: string; time: string }[] = [];
          let dropped = 0;
          for (const p of byPost.values()) {
            // 본문을 못 찾은 게시물은 버린다. 계정명, 날짜만 남은 항목을 저장하면
            // 분류 호출만 쓰고 결과는 '무관'이다.
            if (p.text.length < args.minBody) {
              dropped += 1;
              continue;
            }
            out.push(p);
            if (out.length >= args.max) break;
          }
          return { posts: out, shells: dropped };
        },
        { max: limit, minBody: MIN_BODY },
      );

      shellsDropped += shells;
      for (const p of posts as ThreadsPost[]) {
        items.push({
          source: 'threads',
          service,
          sourceId: p.href,
          url: p.href,
          content: p.text,
          // <time datetime>은 UTC라 그대로 두면 다른 소스와 사전순 비교가 어긋난다
          postedAt: normalizeInstant(p.time),
          keyword: kw,
        });
      }
    }
  } catch (e) {
    console.warn('  Threads 수집 실패 (실험적 소스):', (e as Error).message);
  } finally {
    await page.context().close();
  }

  if (shellsDropped > 0) {
    console.log(`  Threads: 본문 없는 껍데기 ${shellsDropped}건 제외 (분류 호출 절약)`);
  }
  return items;
}
