import type { Browser } from 'playwright';
import type { RawItem } from '@feedback-radar/core';
import { newPage } from '../browser.js';

/**
 * 디시인사이드 통합검색 (로그인 불필요, 2026-07 실측 검증).
 * DOM 구조 변경에 대비해 특정 클래스명 대신 갤러리 글 링크(gall.dcinside.com) 기준으로 추출한다.
 */
export async function collectDcinside(
  browser: Browser,
  keywords: string[],
  service?: string,
  limit = 50,
): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const page = await newPage(browser);
  try {
    for (const kw of keywords) {
      const url = `https://search.dcinside.com/combine/q/${encodeURIComponent(kw)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3_000);

      // page.evaluate는 별도 컨텍스트라 바깥 변수를 못 본다 — 인자로 넘긴다
      const posts = await page.evaluate((max: number) => {
        const seen = new Set<string>();
        const out: { href: string; title: string; body: string; date: string }[] = [];
        for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
          const href = a.href;
          if (!href.includes('gall.dcinside.com') || !href.includes('no=')) continue;
          if (seen.has(href)) continue;
          const li = a.closest('li');
          if (!li) continue;
          seen.add(href);
          const title = a.textContent?.trim() ?? '';
          const body = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
          const dateMatch = body.match(/\d{4}\.\d{2}\.\d{2}/);
          out.push({ href, title, body: body.slice(0, 500), date: dateMatch?.[0] ?? '' });
          if (out.length >= max) break;
        }
        return out;
      }, limit);

      for (const p of posts) {
        if (!p.title && !p.body) continue;
        items.push({
          source: 'dcinside',
          service,
          sourceId: p.href,
          url: p.href,
          content: p.body || p.title,
          postedAt: p.date ? p.date.replaceAll('.', '-') : undefined,
          keyword: kw,
        });
      }
    }
  } finally {
    await page.context().close();
  }
  return items;
}
