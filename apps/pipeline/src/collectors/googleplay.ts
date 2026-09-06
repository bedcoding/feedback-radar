import { normalizeInstant, type RawItem } from '@feedback-radar/core';
import { googlePlayToken } from './google-auth.js';

/**
 * 구글플레이 리뷰 — Play Developer API (androidpublisher v3).
 *
 * **예전 `google-play-scraper`를 버렸다.** 그 라이브러리는 스토어 웹 내부 주소
 * (`play.google.com/_/PlayStoreUi/data/batchexecute`)를 두드리는데, Google robots.txt가
 * `Disallow: /_`와 `Disallow: /store/getreviews`로 막아 둔 대상이다.
 *
 * 공식 API로 오면서 달라지는 것 넷:
 *
 * 1. 🔴 **최근 7일 안에 작성·수정된 리뷰만 온다.** 과거 백필이 불가능하다. 스케줄러가
 *    일주일 넘게 멈추면 그 구간은 영구 유실이다. 과거분은 Play Console의 CSV로 따로 채운다
 * 2. **댓글이 달린 리뷰만 온다.** 별점만 준 리뷰는 API에 나오지 않는다. 이 도구는 텍스트를
 *    분류하므로 실질 손실은 작다
 * 3. **국가 축이 사라진다.** 이 API에 country 파라미터가 없다. 응답의 `reviewerLanguage`는
 *    언어이지 국가가 아니라 대체재로 쓰면 안 된다. 그래서 country를 비운다
 * 4. **자사 앱만** 읽을 수 있다
 */

const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** 한 쪽 최대치. 지정하지 않으면 10건만 와서 조용히 끊긴다 */
const PAGE_SIZE = 100;

interface UserComment {
  text?: string;
  originalText?: string;
  lastModified?: { seconds?: string | number };
  starRating?: number;
  reviewerLanguage?: string;
}

interface Review {
  reviewId?: string;
  comments?: { userComment?: UserComment; developerComment?: unknown }[];
}

interface ReviewsResponse {
  reviews?: Review[];
  tokenPagination?: { nextPageToken?: string };
  error?: { code?: number; message?: string; status?: string };
}

/** 초 단위 epoch를 ISO로. 이 API는 문자열로 준다 */
function fromSeconds(seconds?: string | number): string | undefined {
  if (seconds == null) return undefined;
  const n = typeof seconds === 'string' ? Number(seconds) : seconds;
  if (!Number.isFinite(n)) return undefined;
  return normalizeInstant(new Date(n * 1000).toISOString());
}

export interface GooglePlayOptions {
  /** 패키지명 (예: com.example.app) */
  packageName: string;
  /** 받을 건수 상한 */
  limit?: number;
  service?: string;
  /**
   * 이 시각보다 새로 쓰인 리뷰만 담는다 (ISO 문자열).
   *
   * 앱스토어와 같은 경계 날짜 절단 방침이다. 다만 이쪽은 애초에 7일 창이라 겹치는 구간이
   * 작고, `reviewId` 체계가 스크래퍼 시절과 같은지 확인되지 않아 안전판으로 둔다.
   */
  since?: string;
}

export async function collectGooglePlay(opts: GooglePlayOptions): Promise<RawItem[]> {
  const { packageName, limit = 200, service, since } = opts;

  const token = await googlePlayToken();
  if (!token) {
    console.log(`  구글플레이(${service ?? packageName}): 자격증명 없음, 스킵`);
    return [];
  }

  const items: RawItem[] = [];
  let pageToken: string | undefined;

  /*
    페이지를 넘기지 않으면 상한을 200으로 둬도 100건에서 조용히 끊긴다.
    쪽수 대신 건수로 도는 이유는 이 소스의 설정 단위가 '앱당 건수'이기 때문이다.
  */
  while (items.length < limit) {
    const params = new URLSearchParams({ maxResults: String(Math.min(PAGE_SIZE, limit - items.length)) });
    if (pageToken) params.set('token', pageToken);

    let res: Response;
    try {
      res = await fetch(`${BASE}/${encodeURIComponent(packageName)}/reviews?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      console.warn(`  구글플레이(${service ?? packageName}) 요청 실패: ${(e as Error).message}`);
      break;
    }

    const json = (await res.json().catch(() => undefined)) as ReviewsResponse | undefined;

    if (!res.ok) {
      /*
        403이 가장 흔하고, 원인이 하나가 아니다. 개발자 계정마다 따로 초대·승인을 받으므로
        **앱 단위로 부분 실패**한다. 전체 건수만 보면 어느 앱이 빠졌는지 알 수 없다.
        그리고 필요한 권한 이름이 '리뷰 답글'이라, '앱 정보 보기'만 받으면 여기서 막힌다.
      */
      const hint =
        res.status === 403
          ? " (이 개발자 계정에 서비스 계정이 초대됐는지, '리뷰 답글' 권한이 있는지 확인)"
          : res.status === 401 ? ' (토큰 문제 — google-auth.ts)'
          : res.status === 429 ? ' (앱당 시간당 한도)'
          : '';
      console.warn(
        `  구글플레이(${service ?? packageName}) 오류: ${json?.error?.message ?? `HTTP ${res.status}`}${hint}`,
      );
      break;
    }

    const rows = json?.reviews ?? [];
    if (rows.length === 0) break;

    for (const r of rows) {
      /*
        🔴 `comments[0]`을 그냥 집으면 안 된다.

        이 배열에는 개발자 답글(`developerComment`)이 섞여 들어온다. 우리가 단 답글을
        고객 목소리로 저장하면 감성·카테고리 분류가 통째로 어긋난다.
      */
      const user = r.comments?.find((c) => c.userComment)?.userComment;
      if (!r.reviewId || !user) continue;

      /*
        `translationLanguage`를 요청하지 않았으므로 text가 원문이다. 그 파라미터를 넣으면
        본문이 번역문으로 바뀌어 LLM 분류 입력이 오염된다. originalText는 번역을 요청했을
        때만 채워지므로 여기서는 폴백으로만 둔다.
      */
      const content = (user.text ?? user.originalText ?? '').trim();
      if (!content) continue;

      /*
        ⚠️ 이 값은 작성일이 아니라 **최종 수정일**이다. 수정된 리뷰는 7일 창에 다시 들어오는데
        `ON CONFLICT DO NOTHING` 때문에 새 본문이 반영되지 않는다. 지금은 그대로 두지만,
        수정 반영이 필요해지면 저장 쪽을 UPSERT로 바꿔야 한다.
      */
      const postedAt = fromSeconds(user.lastModified?.seconds);
      if (since && postedAt && postedAt <= since) continue;

      items.push({
        source: 'googleplay',
        sourceId: r.reviewId,
        service,
        // 이 API에 국가 축이 없다. reviewerLanguage는 언어라 국가 대신 쓰면 안 된다
        country: undefined,
        url: `https://play.google.com/store/apps/details?id=${packageName}&reviewId=${r.reviewId}`,
        // 작성자명을 담지 않는다 (앱스토어와 같은 이유 — 계정 표시명이라 실명이 흔하다)
        content,
        rating: typeof user.starRating === 'number' ? user.starRating : undefined,
        postedAt,
      });
      if (items.length >= limit) break;
    }

    pageToken = json?.tokenPagination?.nextPageToken;
    if (!pageToken) break;
  }

  return items;
}
