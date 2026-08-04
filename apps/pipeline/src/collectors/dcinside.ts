import type { Browser, Page } from 'playwright';
import { dropFlooding, fromDottedDateTime, type RawItem } from '@feedback-radar/core';
import { newPage } from '../browser.js';

/**
 * 디시인사이드 게시물 검색 (로그인 불필요, 2026-08 실측 검증).
 *
 * **엔드포인트는 `/post/`다.** 통합검색(`/combine/`)은 `/p/2`를 붙여도 1페이지와 똑같은
 * 20건을 주기 때문에 수집량 상한을 아무리 올려도 20건이 천장이었다. 게시물 검색은
 * 페이지당 25건에 페이지 이동이 실제로 먹는다.
 *
 * **검색 결과는 `.sch_result ul.sch_result_list > li` 안에만 있다.** 페이지를 앵커 단위로
 * 통째로 훑으면 우측 `section.right_content`의 위젯 — 실시간베스트(`id=dcbest`)와 추천글 —
 * 이 함께 걸린다. 검색어와 아무 상관 없는 글들이고, 실측에서 전체 링크 111개 중 71개(64%)가
 * 그쪽이었다. 그 글들은 LLM이 전부 '무관'으로 걸러내므로 분류 호출만 낭비된다.
 *
 * li 하나의 구조 (2026-08 실측):
 * ```html
 * <li>
 *   <a class="tit_txt" href="…/view/?id=<갤러리>&no=<번호>">제목</a>
 *   <p class="link_dsc_txt">본문 요약</p>
 *   <p class="link_dsc_txt dsc_sub">
 *     <a class="sub_txt">&lt;갤러리명&gt; 갤러리</a>
 *     <span class="date_time">2026.08.04 13:38</span>
 *   </p>
 * </li>
 * ```
 * 두 가지가 여기서 나온다.
 * - `tit_txt`와 `sub_txt`의 href가 **같다** — 앵커 기준으로 모으면 같은 글을 두 번 만난다.
 * - 시각이 `span.date_time`에 **분 단위까지** 있다. `li.textContent`를 통째로 쓰면 갤러리명과
 *   날짜가 본문에 섞여 들어가고(분류 품질이 떨어진다), 정규식으로 날짜만 뽑으면 시각을 버린다.
 *   시각이 없으면 같은 날짜 안에서는 수집 순서로 정렬돼 한 소스가 목록 상단을 점거한다.
 *
 * 클래스명에 기대는 만큼 DOM이 바뀌면 0건이 될 수 있다. 그래서 결과가 비면 예전처럼 앵커를
 * 훑는 방식으로 폴백하고(사이드바만 배제), 폴백을 썼다는 사실을 로그로 남긴다.
 */

/** 게시물 검색 페이지당 결과 수 (2026-08 실측) */
const PER_PAGE = 25;
/**
 * 한 키워드에 넘길 최대 페이지. 상한을 다 못 채워도 여기서 멈춘다 —
 * 페이지 이동이 막히거나(구조 변경) 결과가 무한히 반복될 때 루프에 갇히지 않게.
 */
const MAX_PAGES = 20;

interface DcPost {
  href: string;
  title: string;
  body: string;
  gallery: string;
  dateTime: string;
}

interface PageResult {
  posts: DcPost[];
  usedFallback: boolean;
}

/** 검색 결과 한 페이지를 긁는다 */
async function scrapePage(page: Page, url: string, want: number): Promise<PageResult> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(3_000);

  // evaluate에 넘긴 함수는 문자열로 직렬화돼 브라우저에서 실행된다. 그래서 이 안에
  // **함수를 선언하면 안 된다** — tsx(esbuild)가 이름 보존용 `__name` 호출을 끼워 넣는데
  // 브라우저 쪽엔 그 헬퍼가 없어 `__name is not defined`로 수집이 통째로 죽는다.
  // 판정은 조건을 그 자리에 풀어 쓴다.
  return page.evaluate((max: number) => {
    const seen = new Set<string>();
    const out: DcPost[] = [];

    // 1) 정상 경로 — 검색 결과 목록만
    for (const li of Array.from(
      document.querySelectorAll<HTMLLIElement>('.sch_result ul.sch_result_list > li'),
    )) {
      const titleEl = li.querySelector<HTMLAnchorElement>('a.tit_txt');
      if (!titleEl) continue;
      if (!titleEl.href.includes('gall.dcinside.com') || !titleEl.href.includes('no=')) continue;
      const href = titleEl.href;
      if (seen.has(href)) continue;
      seen.add(href);
      // dsc_sub은 갤러리명·날짜 줄이라 본문이 아니다
      const bodyEl = li.querySelector<HTMLParagraphElement>('p.link_dsc_txt:not(.dsc_sub)');
      out.push({
        href,
        title: titleEl.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        body: bodyEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        gallery:
          li
            .querySelector('a.sub_txt')
            ?.textContent?.replace(/\s*갤러리\s*$/, '')
            .trim() ?? '',
        dateTime: li.querySelector('span.date_time')?.textContent?.trim() ?? '',
      });
      if (out.length >= max) break;
    }
    if (out.length > 0) return { posts: out, usedFallback: false };

    // 2) 폴백 — 목록 구조를 못 찾았을 때. 사이드바 위젯은 그래도 배제한다
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = a.href;
      if (!href.includes('gall.dcinside.com') || !href.includes('no=')) continue;
      if (seen.has(href)) continue;
      // 실시간베스트·추천글 위젯은 검색 결과가 아니다
      if (a.closest('section.right_content')) continue;
      if (/[?&]id=dcbest(?:&|$)/.test(href)) continue;
      const li = a.closest('li');
      if (!li) continue;
      seen.add(href);
      const text = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
      out.push({
        href,
        title: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        body: text.slice(0, 500),
        gallery: '',
        dateTime: text.match(/\d{4}\.\d{2}\.\d{2}(?:\s+\d{2}:\d{2})?/)?.[0] ?? '',
      });
      if (out.length >= max) break;
    }
    return { posts: out, usedFallback: true };
  }, want);
}

export async function collectDcinside(
  browser: Browser,
  keywords: string[],
  service?: string,
  limit = 50,
): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const page = await newPage(browser);
  let fallbackKeywords = 0;
  try {
    for (const kw of keywords) {
      // 페이지를 넘겨도 같은 글이 다시 나올 수 있어 키워드 단위로 본다
      // (evaluate 안의 중복 제거는 페이지 하나에만 적용된다)
      const seenHrefs = new Set<string>();
      let collected = 0;
      let fellBack = false;

      for (let p = 1; p <= MAX_PAGES && collected < limit; p++) {
        const url = `https://search.dcinside.com/post/q/${encodeURIComponent(kw)}/p/${p}`;
        const { posts, usedFallback } = await scrapePage(page, url, PER_PAGE);
        if (usedFallback) fellBack = true;
        if (posts.length === 0) break;

        const fresh = posts.filter((x) => !seenHrefs.has(x.href));
        // 새 글이 하나도 없으면 페이지 이동이 안 먹는 것이다 (통합검색이 그랬다).
        // 더 넘겨도 같은 결과만 오므로 여기서 끊는다.
        if (fresh.length === 0) break;

        for (const post of fresh) {
          if (collected >= limit) break;
          seenHrefs.add(post.href);
          if (!post.title && !post.body) continue;
          // 제목과 본문을 따로 얻으므로 둘을 붙인다.
          // 갤러리명·날짜는 메타로 빼서 본문을 오염시키지 않는다.
          const content = [post.title, post.body].filter(Boolean).join('\n').slice(0, 800);
          items.push({
            source: 'dcinside',
            service,
            sourceId: post.href,
            url: post.href,
            author: post.gallery || undefined,
            content,
            postedAt: fromDottedDateTime(post.dateTime),
            keyword: kw,
          });
          collected += 1;
        }
      }
      if (fellBack && collected > 0) fallbackKeywords += 1;
    }
  } finally {
    await page.context().close();
  }

  if (fallbackKeywords > 0) {
    console.warn(
      `  디시: 검색 결과 목록(.sch_result_list)을 못 찾아 ${fallbackKeywords}개 키워드에서 폴백 경로를 썼습니다. DOM이 바뀐 것 같으니 수집기를 확인하세요.`,
    );
  }

  // 같은 글을 여러 갤러리에 뿌리는 도배는 URL이 전부 달라 중복 제거로 안 걸린다 (dedupe.ts 참고)
  const { kept, dropped, groups } = dropFlooding(items);
  if (dropped.length > 0) {
    const top = groups
      .slice(0, 3)
      .map((g) => `"${g.preview}…" ${g.count}곳`)
      .join(', ');
    console.log(`  디시: 도배 ${dropped.length}건 제외 (${top})`);
  }
  return kept;
}
