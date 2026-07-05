import type { Browser } from 'playwright';
import type { RawItem } from '@feedback-radar/core';
import { newPage } from '../browser.js';

/**
 * Threads 검색 (실험적).
 * 로그인 모달이 뜨지만 검색 결과 자체는 DOM에 렌더링된다 (2026-07 실측).
 * Meta의 클래스명은 난독화돼 있어 게시물 permalink(/post/)를 앵커로 삼아 추출한다.
 * 깨지면 이 소스만 빈 배열을 반환하고 파이프라인은 계속 돈다.
 */
export async function collectThreads(browser: Browser, keywords: string[]): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const page = await newPage(browser);
  try {
    for (const kw of keywords) {
      const url = `https://www.threads.com/search?q=${encodeURIComponent(kw)}&serp_type=default`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(8_000);

      const posts = await page.evaluate(() => {
        const seen = new Set<string>();
        const out: { href: string; text: string; time: string }[] = [];
        for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"]'))) {
          const href = a.href.split('?')[0];
          if (seen.has(href)) continue;
          // permalink에서 6단계까지 올라가며 게시물 컨테이너를 찾는다
          let container: HTMLElement | null = a;
          for (let i = 0; i < 6 && container; i++) {
            container = container.parentElement;
            if (container && container.innerText && container.innerText.length > 60) break;
          }
          if (!container) continue;
          seen.add(href);
          const time = container.querySelector('time')?.getAttribute('datetime') ?? '';
          const text = container.innerText.replace(/\s+/g, ' ').trim().slice(0, 500);
          if (text.length < 10) continue;
          out.push({ href, text, time });
          if (out.length >= 30) break;
        }
        return out;
      });

      for (const p of posts) {
        items.push({
          source: 'threads',
          sourceId: p.href,
          url: p.href,
          content: p.text,
          postedAt: p.time || undefined,
          keyword: kw,
        });
      }
    }
  } catch (e) {
    console.warn('  Threads 수집 실패 (실험적 소스):', (e as Error).message);
  } finally {
    await page.context().close();
  }
  return items;
}
