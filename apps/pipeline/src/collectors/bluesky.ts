import { dropFlooding, normalizeInstant, type RawItem } from '@feedback-radar/core';

/**
 * 블루스카이(AT Protocol) 키워드 검색.
 *
 * **이 저장소에서 유일하게 운영자가 수집을 환영하는 소스다.** robots.txt에 이렇게 적혀 있다.
 *
 * > Hello Friends! If you are considering bulk or automated crawling, you may want to look
 * > in to our protocol (API), including a firehose of updates. ... By default, may crawl
 * > anything on this domain.
 *
 * 그래서 다른 수집기와 원칙이 몇 가지 다르다.
 *
 * - **페이지를 넘긴다.** 읽기에 돈이 붙지 않으므로 X처럼 첫 쪽에서 끊을 이유가 없다.
 *   대신 쪽수 상한과 경계 날짜(`since`) 둘로 멈춘다.
 * - **작성자 핸들을 저장하지 않는다.** 핸들은 개인 식별자에 가깝고 이 도구는 '누가'가 아니라
 *   '무엇이 불만인가'를 집계한다(앱 리뷰·다음 카페와 같은 기준). 다만 **원문 주소를 만들려면
 *   핸들이 필요해서** URL 안에는 남는다. 그건 공개 게시물의 위치이지 우리가 따로 쌓는 축이 아니다.
 * - **언어를 가리지 않는다.** 실측에서 한국어 1,183건 대비 해외 1,236건이 나왔다
 *   (영어·중국어·프랑스어·일본어·포르투갈어·스페인어·독일어·태국어). 해외 진출 시장의
 *   반응이 실제로 여기 있어서, 언어로 거르면 그 절반을 버린다.
 *
 * 자격증명이 없으면 조용히 건너뛴다.
 */

/** 앱뷰(검색·타임라인)와 인증(세션 발급)이 같은 호스트다 */
const BASE = 'https://bsky.social/xrpc';

/** 한 번에 받을 수 있는 최대치 */
const PAGE_SIZE = 100;

interface PostRecord {
  text?: string;
  createdAt?: string;
  langs?: string[];
  /** 리포스트·인용이 아닌 원글인지 가리는 데 쓴다 */
  $type?: string;
}

interface Post {
  /** `at://did:plc:.../app.bsky.feed.post/{rkey}` — 전역 고유 */
  uri?: string;
  cid?: string;
  author?: { handle?: string; did?: string };
  record?: PostRecord;
}

interface SearchResponse {
  posts?: Post[];
  cursor?: string;
  error?: string;
  message?: string;
}

/**
 * 세션 토큰 캐시.
 *
 * `accessJwt`는 두 시간쯤 살아 있는데, 키워드마다 세션을 새로 발급하면 로그인 시도가
 * 키워드 수만큼 쌓여 계정이 잠길 수 있다. 한 회차 안에서는 한 번만 받는다.
 */
let cached: { jwt: string; at: number } | undefined;

/** 캐시 수명. 실제 만료(약 2시간)보다 짧게 잡아 경계에서 401을 맞지 않게 한다 */
const SESSION_TTL_MS = 90 * 60_000;

async function session(): Promise<string | undefined> {
  const identifier = process.env.BLUESKY_IDENTIFIER?.trim();
  const password = process.env.BLUESKY_APP_PASSWORD?.trim();
  if (!identifier || !password) return undefined;

  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.jwt;

  let res: Response;
  try {
    res = await fetch(`${BASE}/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`  블루스카이 로그인 실패: ${(e as Error).message}`);
    return undefined;
  }
  const json = (await res.json().catch(() => undefined)) as
    | { accessJwt?: string; error?: string; message?: string }
    | undefined;
  if (!res.ok || !json?.accessJwt) {
    /*
      가장 흔한 원인이 **계정 본 비밀번호를 넣은 것**이다. 앱 비밀번호가 아니면 여기서 막힌다.
      메시지가 그냥 "Invalid identifier or password"라 원인을 알기 어려워 힌트를 붙인다.
    */
    const hint = res.status === 401 ? ' (앱 비밀번호가 맞는지 확인 — 계정 본 비밀번호로는 안 된다)' : '';
    console.warn(`  블루스카이 로그인 실패: ${json?.message ?? `HTTP ${res.status}`}${hint}`);
    return undefined;
  }
  cached = { jwt: json.accessJwt, at: Date.now() };
  return json.accessJwt;
}

/** `at://did/app.bsky.feed.post/{rkey}`에서 마지막 조각을 뽑는다 */
function rkeyOf(uri?: string): string | undefined {
  if (!uri) return undefined;
  const parts = uri.split('/');
  return parts[parts.length - 1] || undefined;
}

export interface BlueskyOptions {
  keywords: string[];
  /** 키워드당 받을 쪽수 상한. 1쪽 = 최대 100건 */
  pages?: number;
  service?: string;
  /**
   * 이 시각보다 새로 쓰인 글만 담는다 (ISO 문자열).
   *
   * `sort=latest`라 내림차순으로 오므로, 경계보다 오래된 글이 나오면 그 뒤는 볼 필요가 없다.
   * 값은 daily.ts가 DB의 최신 작성일에서 뽑아 넣는다.
   */
  since?: string;
}

export async function collectBluesky(opts: BlueskyOptions): Promise<RawItem[]> {
  const { keywords, pages = 2, service, since } = opts;

  const jwt = await session();
  if (!jwt) {
    console.log('  블루스카이: BLUESKY_IDENTIFIER/BLUESKY_APP_PASSWORD 미설정, 스킵');
    return [];
  }

  const items: RawItem[] = [];
  const seen = new Set<string>();

  for (const kw of keywords) {
    let cursor: string | undefined;
    let reachedBoundary = false;

    for (let page = 0; page < Math.max(1, pages) && !reachedBoundary; page++) {
      /*
        따옴표로 묶지 않는다. X와 달리 읽기가 무료라 정확 구문으로 좁힐 이유가 없고,
        블루스카이 검색은 구문 검색에서 결과가 크게 줄어든다(실측). 관련성 판단은
        뒤의 LLM 분류가 한다.
      */
      const url =
        `${BASE}/app.bsky.feed.searchPosts?q=${encodeURIComponent(kw)}` +
        `&limit=${PAGE_SIZE}&sort=latest${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${jwt}` },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        console.warn(`  블루스카이 요청 실패 (${kw}): ${(e as Error).message}`);
        break;
      }

      const json = (await res.json().catch(() => undefined)) as SearchResponse | undefined;

      if (!res.ok) {
        /*
          401은 세션 만료다. 캐시를 비워 다음 회차에서 다시 받게 하고 이번 회차는 접는다
          (여기서 바로 재발급하면 실패가 반복될 때 로그인 시도만 쌓인다).
        */
        if (res.status === 401) cached = undefined;
        const hint =
          res.status === 401 ? ' (세션 만료 — 다음 실행에서 재발급)'
          : res.status === 429 ? ' (호출 한도, 이번 회차는 여기까지)'
          : '';
        console.warn(
          `  블루스카이 실패 (${kw}): ${json?.message ?? json?.error ?? `HTTP ${res.status}`}${hint}`,
        );
        break;
      }

      const posts = json?.posts ?? [];
      if (posts.length === 0) break;

      for (const p of posts) {
        const rkey = rkeyOf(p.uri);
        const handle = p.author?.handle;
        const text = (p.record?.text ?? '').trim();
        if (!p.uri || !rkey || !handle || !text) continue;

        const postedAt = normalizeInstant(p.record?.createdAt);
        // 내림차순이라 경계보다 오래된 것이 나오면 그 뒤는 전부 더 오래된 것이다
        if (since && postedAt && postedAt <= since) {
          reachedBoundary = true;
          break;
        }
        // 같은 글이 여러 키워드에 걸릴 수 있다. 저장 단계에서도 걸러지지만 분류 호출을 아낀다
        if (seen.has(p.uri)) continue;
        seen.add(p.uri);

        items.push({
          source: 'bluesky',
          service,
          sourceId: p.uri,
          // 핸들은 저장하지 않지만 원문 주소를 만들려면 필요하다 (다음 카페와 같은 처리)
          url: `https://bsky.app/profile/${handle}/post/${rkey}`,
          content: text,
          postedAt,
          keyword: kw,
        });
      }

      cursor = json?.cursor;
      if (!cursor) break;
    }
  }

  // 봇·홍보 계정이 같은 문구를 반복해 올린다. 분류 호출을 아끼려고 저장 전에 접는다
  const { kept, dropped } = dropFlooding(items);
  if (dropped.length > 0) console.log(`  블루스카이: 같은 글 반복 ${dropped.length}건 제외`);
  return kept;
}
