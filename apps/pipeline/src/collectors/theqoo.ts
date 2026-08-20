import { dropFlooding, fromShortDateOrTime, type RawItem } from '@feedback-radar/core';

/**
 * 더쿠 게시판 수집 (로그인 불필요, 비용 0).
 *
 * **검색을 쓰지 않는다. 검색이 동작하지 않기 때문이다.** 게시판 한정 검색 URL은 200을 주지만
 * `search_keyword`를 무시하고 최신 목록을 그대로 돌려준다(2026-08 실측: 검색어를 바꿔도,
 * 없는 단어를 넣어도 결과가 목록과 동일했다). 통합검색(`act=IS`)은 HTTP 403이다.
 *
 * 그래서 **목록을 페이지 단위로 훑고 제목에서 키워드를 직접 거른다.** 대신 이런 성질이 있다.
 *
 * - **본문에만 서비스명이 있는 글은 놓친다.** 목록에는 제목만 오기 때문이다. 제목이 걸린 글에
 *   한해서만 본문을 추가로 읽는다(그게 분류 정확도를 가장 크게 올리는 지점이다).
 * - 정적 HTML이라 브라우저가 필요 없다. 디시, Threads와 달리 fetch만으로 끝난다.
 * - 활발한 게시판은 43분에 20건씩 올라온다(실측). 수집 주기가 길면 페이지를 더 넘겨야
 *   그 사이 글을 다 본다.
 *
 * 구조 의존: 목록은 `<tr>` 안에 `td.no`(번호 또는 '공지'), `td.title > a`, `td.time`이다.
 * 공지는 매 페이지 상단에 반복되므로 반드시 걸러야 한다(안 그러면 페이지마다 같은 8건이 들어온다).
 */

/** 한 페이지에 들어오는 글 수 (공지 제외, 2026-08 실측) */
const PER_PAGE = 20;

/**
 * 제목이 걸린 글의 본문을 읽을 최대 건수.
 *
 * 본문 요청은 글 하나에 한 번이라 상한이 없으면 요청이 폭증한다. 키워드가 제목에 있는 글만
 * 대상이라 실제로는 이 수에 닿는 일이 드물다.
 */
const MAX_BODY_FETCH = 30;

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface ListRow {
  id: string;
  url: string;
  title: string;
  time: string;
}

/** 사람이 목록을 넘기는 정도의 간격. 쉬지 않고 두들기면 차단당하고 서버에도 부담이다 */
export function pause(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() ** 1.8 * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchText(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`  더쿠: HTTP ${res.status} (${url})`);
      return undefined;
    }
    return await res.text();
  } catch (e) {
    console.warn(`  더쿠 요청 실패: ${(e as Error).message}`);
    return undefined;
  }
}

/**
 * HTML 태그를 걷어내고 공백을 정리한다.
 *
 * **script와 style을 먼저 지운다.** 태그만 벗기면 그 안의 코드가 본문으로 남는다
 * (실측: `var nowDocumentSrl = 4319584500;`이 모든 글 끝에 붙어 들어왔다). LLM에 그대로
 * 가면 토큰을 쓰고 분류 품질도 떨어진다.
 */
function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 목록 페이지에서 글 행을 뽑는다. **공지는 버린다.**
 *
 * 공지는 페이지마다 같은 것이 반복돼서, 걸러내지 않으면 페이지를 넘길수록 같은 글이 쌓인다.
 */
export function parseList(html: string, board: string): ListRow[] {
  const out: ListRow[] = [];
  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const no = row.match(/<td class="no">([\s\S]*?)<\/td>/);
    if (no && strip(no[1]).includes('공지')) continue;
    const link = row.match(/<td class="title">\s*<a href="(\/[^"]+)">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const path = link[1].split('?')[0];
    const id = path.split('/').pop() ?? '';
    if (!id || !path.includes(`/${board}/`)) continue;
    const time = row.match(/<td class="time">([\s\S]*?)<\/td>/);
    out.push({
      id,
      url: `https://theqoo.net${path}`,
      title: strip(link[2]),
      time: time ? strip(time[1]) : '',
    });
  }
  return out;
}

/**
 * 글 본문. `article`이나 `.rd_body` 안에 있고, 없으면 빈 문자열이다.
 *
 * 본문을 못 찾아도 제목만으로 저장한다. 제목이 이미 키워드에 걸린 글이라 버릴 이유가 없다.
 */
export function parseBody(html: string): string {
  const block =
    html.match(/<div class="rd_body[^"]*">([\s\S]*?)<\/div>\s*<\/div>/) ??
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
  if (!block) return '';
  // 인용, 서명 블록은 본문이 아니다
  const cleaned = block[1].replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ');
  /**
   * 본문 뒤에 붙는 화면 부품 문구를 잘라낸다.
   *
   * 본문 컨테이너가 버튼 영역까지 감싸고 있어서 `목록 스크랩 ( 0 ) 공유`가 매 글에 따라온다.
   * 사람이 쓴 말이 아니라서 분류에 도움이 안 되고, 모든 글에 같은 꼬리가 붙으면 본문 기준
   * 중복 판정(dropFlooding)까지 흐려진다.
   */
  return strip(cleaned)
    .replace(/\s*목록\s*스크랩\s*\([\s\d,]*\)\s*(공유)?\s*$/, '')
    .replace(/\s*(신고|수정|삭제|답글)\s*$/, '')
    .trim()
    .slice(0, 800);
}

export async function collectTheqoo(
  keywords: string[],
  boards: string[],
  pages = 5,
  service?: string,
): Promise<RawItem[]> {
  if (boards.length === 0) {
    console.log('  더쿠: 게시판이 지정되지 않아 건너뜁니다 (설정의 theqoo.boards)');
    return [];
  }
  const needles = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const items: RawItem[] = [];
  let scanned = 0;
  let bodyFetched = 0;

  for (const board of boards) {
    const seen = new Set<string>();
    for (let page = 1; page <= pages; page++) {
      const html = await fetchText(`https://theqoo.net/${board}?page=${page}`);
      if (!html) break;
      const rows = parseList(html, board);
      if (rows.length === 0) {
        console.warn(`  더쿠(${board}): ${page}쪽에서 글을 찾지 못했습니다 (구조 변경 가능)`);
        break;
      }
      scanned += rows.length;

      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        const lower = row.title.toLowerCase();
        if (!needles.some((n) => lower.includes(n))) continue;

        // 제목이 걸린 글만 본문을 읽는다. 분류 정확도가 가장 크게 오르는 지점이다
        let body = '';
        if (bodyFetched < MAX_BODY_FETCH) {
          await pause(1_200, 3_000);
          const detail = await fetchText(row.url);
          if (detail) {
            body = parseBody(detail);
            bodyFetched += 1;
          }
        }
        items.push({
          source: 'theqoo',
          service,
          sourceId: row.id,
          url: row.url,
          content: body ? `${row.title}\n${body}` : row.title,
          postedAt: fromShortDateOrTime(row.time),
          // 어느 키워드에 걸렸는지 남긴다. 노이즈가 왜 들어왔는지 추적하는 단서다
          keyword: needles.find((n) => lower.includes(n)),
        });
      }
      await pause(2_500, 6_000);
    }
  }

  const { kept, dropped } = dropFlooding(items);
  console.log(
    `  더쿠: ${scanned}건 훑어 ${kept.length}건 (본문 ${bodyFetched}건 확인${dropped.length ? `, 반복 ${dropped.length}건 제외` : ''})`,
  );
  return kept;
}
