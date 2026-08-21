import { dropFlooding, fromElapsedOrDate, type RawItem } from '@feedback-radar/core';

/**
 * 다음 카페 게시판 수집 (로그인 불필요, 비용 0).
 *
 * **모바일 경로를 쓴다.** 데스크톱(`cafe.daum.net/_c21_/bbs_list`)은 비로그인에게 목록을
 * 주지 않는다. HTTP 200에 88KB를 돌려주지만 글 링크가 0건이고 `MEMBER_ROLENAME: "비회원"`만
 * 들어 있다(2026-08 실측, 게시판 7개 전부). 모바일(`m.cafe.daum.net/{카페}/{게시판}`)은
 * 같은 게시판을 비로그인으로 내려준다.
 *
 * **브라우저가 필요 없다.** 목록이 Vue로 렌더되어 `<a href>`는 `javascript:`지만, 그 데이터가
 * `articles.push({...})` 형태로 HTML에 인라인되어 있다. 화면을 그리기 전의 원본이라 오히려
 * 파싱하기 쉽다(제목, 작성자, 시각, 조회수, 댓글수가 필드로 온다).
 *
 * **알아 둘 상한: 게시판당 최신 20건이다.** `?page=2`는 무시되고(같은 20건을 돌려준다) 끝까지
 * 스크롤해도 더 불러오지 않는다. 그래서 게시판 성격에 따라 커버 범위가 크게 갈린다.
 *
 * - 글이 몰리는 종합 게시판은 20건이 **1~2분 분량**이다(실측: 분당 19건). 수집 주기를 아무리
 *   줄여도 대부분을 놓치므로 이 경로로 볼 대상이 아니다.
 * - 주제별 게시판은 20건이 **며칠에서 몇 주**를 덮는다(실측: 11일, 25일). 이쪽이 맞다.
 *
 * 관심 주제의 게시판을 골라 지정하는 것이 이 수집기를 쓰는 방법이다. 과거 글까지 필요하면
 * 목록 훑기로는 닿지 않으므로 검색 기반 경로를 따로 두어야 한다.
 *
 * 구조 의존: 목록은 인라인 `articles.push({ dataid, title, writerNickname,
 * articleElapsedTime, ... })`, 본문은 `class="tx-content-container"`(다음 에디터 컨테이너)다.
 */

/** 게시판 하나가 내려주는 글 수. 페이지를 넘길 수 없어서 이것이 곧 상한이다 */
const PER_BOARD = 20;

/** 글 상세가 이 횟수만큼 403이면 그 게시판은 본문을 포기하고 제목만 쓴다 */
const FORBIDDEN_GIVE_UP = 3;

/**
 * 제목이 걸린 글의 본문을 읽을 최대 건수.
 *
 * 본문은 글 하나에 요청 하나다. 제목에 키워드가 있는 글만 대상이라 실제로는 이 수에
 * 닿는 일이 드물지만, 게시판을 여럿 지정하면 합계가 커질 수 있어 상한을 둔다.
 */
const MAX_BODY_FETCH = 30;

/** 모바일 경로라 모바일 UA를 보낸다. 데스크톱 UA로는 데스크톱 화면으로 밀린다 */
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const BASE = 'https://m.cafe.daum.net';

interface ListRow {
  /** 카페 안에서 유일하지 않다. 게시판이 다르면 같은 번호가 있어 sourceId에는 경로를 쓴다 */
  dataid: string;
  cafe: string;
  board: string;
  url: string;
  title: string;
  author: string;
  elapsed: string;
}

/** 사람이 목록을 넘기는 정도의 간격. 쉬지 않고 두들기면 차단당하고 서버에도 부담이다 */
function pause(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() ** 1.8 * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 페이지를 받는다. 성공하면 본문 문자열, 실패하면 **HTTP 상태 코드**(연결 실패는 0)다.
 *
 * 실패 사유를 숫자로 돌려주는 이유: 403이 반복되는 게시판은 권한이 막힌 것이라 계속
 * 두들길 이유가 없는데, undefined만 받으면 '없는 글'과 '막힌 게시판'을 구별할 수 없다.
 */
async function fetchText(url: string, quiet = false): Promise<number | string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (!quiet) console.warn(`  다음 카페: HTTP ${res.status} (${url})`);
      return res.status;
    }
    return await res.text();
  } catch (e) {
    if (!quiet) console.warn(`  다음 카페 요청 실패: ${(e as Error).message}`);
    return 0;
  }
}

/**
 * HTML 태그를 걷어내고 공백을 정리한다.
 *
 * script와 style을 먼저 지운다. 태그만 벗기면 그 안의 코드가 본문으로 남는데, 이 페이지는
 * 목록 데이터까지 script에 들어 있어서 그대로 두면 본문에 JSON 한 덩어리가 붙는다.
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

/** 인라인 데이터의 한 필드. 값이 `Number("41")`이나 `"제목"`으로 와서 둘 다 받는다 */
function field(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}:\\s*(?:Number\\()?"?([^",\\n)]*)`));
  return m ? m[1].trim() : '';
}

/**
 * 목록 페이지의 인라인 데이터에서 글을 뽑는다.
 *
 * 공지는 이 배열에 들어오지 않는다(화면에서는 목록 위에 따로 그려진다). 더쿠와 달리
 * 공지를 걸러낼 필요가 없는 이유다.
 */
function parseList(html: string, cafe: string, board: string): ListRow[] {
  const out: ListRow[] = [];
  for (const block of html.match(/articles\.push\(\{[\s\S]*?\}\);/g) ?? []) {
    const dataid = field(block, 'dataid');
    const title = strip(field(block, 'title'));
    if (!dataid || !title) continue;
    /*
      글이 실제로 어느 게시판 것인지는 데이터의 fldid로 판단한다. 전체글보기 경로는
      여러 게시판의 글을 섞어 내려주므로, 요청한 게시판 이름을 그대로 쓰면 URL이 틀린다.
    */
    const fldid = field(block, 'fldid') || board;
    out.push({
      dataid,
      cafe,
      board: fldid,
      url: `${BASE}/${cafe}/${fldid}/${dataid}`,
      title,
      author: strip(field(block, 'writerNickname')),
      elapsed: field(block, 'articleElapsedTime'),
    });
  }
  return out;
}

/**
 * 글 본문. 다음 에디터가 감싸는 `tx-content-container` 안에 있다.
 *
 * **닫는 태그로 끝을 잡지 않는다.** 에디터가 본문을 `div`로 여러 겹 감싸기 때문에
 * (이미지 한 장에도 `figure-img` 래퍼가 붙는다) 첫 `</div>`에서 자르면 텍스트를 통째로
 * 놓친다. 실측에서 이미지 위주 게시판의 본문이 전부 빈 문자열로 나왔다. 대신 본문 뒤에
 * 오는 화면 부품(`foot_content`, 댓글 영역)을 끝 마커로 삼고, 남는 꼬리는 잘라낸다.
 *
 * 본문을 못 찾아도 제목만으로 저장한다. 제목이 이미 키워드에 걸린 글이라 버릴 이유가 없다.
 * 본문이 아예 없는 게시판도 있다(댓글로 대화하는 형식은 본문이 껍데기다).
 */
function parseBody(html: string): string {
  // 여는 태그의 '>' 다음부터 잡는다. 클래스 이름 위치에서 자르면 태그 잔재가 본문에 남는다
  const at = html.search(/class="[^"]*tx-content-container/);
  if (at < 0) return '';
  const open = html.indexOf('>', at);
  if (open < 0) return '';
  const rest = html.slice(open + 1);
  const endMarkers = [/class="[^"]*foot_content/, /id="cmtWrap/, /class="[^"]*view_cmt/];
  let end = rest.length;
  for (const m of endMarkers) {
    const i = rest.search(m);
    if (i > 0 && i < end) end = i;
  }
  return (
    strip(rest.slice(0, end))
      /*
        본문 컨테이너가 버튼 영역까지 감싸서 화면 부품 문구가 섞인다. 앞뒤만 지우면
        중간에 남으므로 전역으로 지운다. 사람이 쓴 말이 아니라서 분류에 도움이 안 되고,
        모든 글에 같은 문구가 붙으면 본문 기준 중복 판정(dropFlooding)까지 흐려진다.
      */
      .replace(/\s*(다음검색|현재 게시글 추가 기능 열기|북마크|공유하기|신고 센터로 신고)\s*/g, ' ')
      .replace(/\s*(목록|댓글\s*[\d,]+|글자크기 작게 가|글자크기 크게 가)\s*$/g, '')
      // 잘린 자리에 '>'가 없는 미완성 태그가 남는다. strip의 태그 정규식이 이것만 못 지운다
      .replace(/<[^>]*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 800)
  );
}

/**
 * `카페/게시판` 한 줄을 쪼갠다. 카페 하나에 게시판이 여러 개라 두 값이 함께 필요하다.
 * 형식이 틀린 줄은 조용히 버리지 않고 로그를 남긴다(설정 오타를 0건으로 끝내지 않는다).
 */
function splitBoard(entry: string): { cafe: string; board: string } | undefined {
  const [cafe, board] = entry.split('/');
  if (!cafe || !board) {
    console.warn(`  다음 카페: '${entry}'는 '카페/게시판' 형식이 아니어서 건너뜁니다`);
    return undefined;
  }
  return { cafe, board };
}

export async function collectDaumCafe(
  keywords: string[],
  boards: string[],
  perBoard = PER_BOARD,
  service?: string,
): Promise<RawItem[]> {
  if (boards.length === 0) {
    console.log('  다음 카페: 게시판이 지정되지 않아 건너뜁니다 (설정의 다음 카페 게시판)');
    return [];
  }
  const needles = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  const items: RawItem[] = [];
  let scanned = 0;
  let bodyFetched = 0;

  for (const entry of boards) {
    const target = splitBoard(entry);
    if (!target) continue;
    /** 이 게시판에서 글 상세가 403으로 막힌 횟수. 게시판마다 새로 센다 */
    let forbidden = 0;
    const html = await fetchText(`${BASE}/${target.cafe}/${target.board}`);
    if (typeof html !== 'string') continue;
    const rows = parseList(html, target.cafe, target.board).slice(0, perBoard);
    if (rows.length === 0) {
      console.warn(`  다음 카페(${entry}): 글을 찾지 못했습니다 (비공개 게시판이거나 구조 변경)`);
      continue;
    }
    scanned += rows.length;

    for (const row of rows) {
      const lower = row.title.toLowerCase();
      if (!needles.some((n) => lower.includes(n))) continue;

      /*
        제목이 걸린 글만 본문을 읽는다. 분류 정확도가 가장 크게 오르는 지점이다.

        본문이 막힌 게시판이 있다(댓글로 대화하는 형식은 글 상세가 403이다). 처음 몇 번으로
        판정하고 그 게시판의 나머지는 제목만 저장한다. 안 그러면 20건마다 같은 경고가 스무 줄
        쌓이고, 막힌 것을 알면서도 요청을 계속 보낸다.
      */
      let body = '';
      if (bodyFetched < MAX_BODY_FETCH && forbidden < FORBIDDEN_GIVE_UP) {
        await pause(1_200, 3_000);
        const detail = await fetchText(row.url, forbidden > 0);
        if (typeof detail === 'string') {
          body = parseBody(detail);
          bodyFetched += 1;
        } else if (detail === 403) {
          forbidden += 1;
          if (forbidden === FORBIDDEN_GIVE_UP) {
            console.log(`  다음 카페(${entry}): 글 상세가 막혀 있어 제목만 저장합니다`);
          }
        }
      }
      items.push({
        source: 'daum-cafe',
        service,
        // 게시판이 다르면 글 번호가 겹치므로 경로 전체를 id로 쓴다
        sourceId: `${row.cafe}/${row.board}/${row.dataid}`,
        url: row.url,
        author: row.author || undefined,
        content: body ? `${row.title}\n${body}` : row.title,
        postedAt: fromElapsedOrDate(row.elapsed),
        // 어느 키워드에 걸렸는지 남긴다. 노이즈가 왜 들어왔는지 추적하는 단서다
        keyword: needles.find((n) => lower.includes(n)),
      });
    }
    await pause(2_500, 6_000);
  }

  const { kept, dropped } = dropFlooding(items);
  console.log(
    `  다음 카페: ${scanned}건 훑어 ${kept.length}건 (본문 ${bodyFetched}건 확인${dropped.length ? `, 반복 ${dropped.length}건 제외` : ''})`,
  );
  return kept;
}
