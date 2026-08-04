import { normalizeInstant, type RawItem } from '@feedback-radar/core';

interface RssEntry {
  id?: { label?: string };
  author?: { name?: { label?: string } };
  'im:rating'?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  updated?: { label?: string };
}

/** 애플 공식 iTunes RSS — 인증 불필요, 페이지당 50건 */
export async function collectAppStore(
  appId: string,
  country = 'kr',
  pages = 3,
  service?: string,
): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
    let res: Response;
    try {
      // 타임아웃이 없으면 애플이 응답을 붙들 때 페이지마다 수 분씩 매달리고,
      // 상주 스케줄러는 그 시간 내내 다음 주기를 건너뛴다
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      console.warn(`  앱스토어 ${page}쪽 요청 실패: ${(e as Error).message}`);
      break;
    }
    // 0건으로 끝났을 때 이유를 남긴다 — 조용히 break하면 429·503을 '리뷰 없음'으로 오해한다
    if (!res.ok) {
      console.warn(`  앱스토어 ${page}쪽 응답 오류: HTTP ${res.status}`);
      break;
    }
    const json = (await res.json()) as { feed?: { entry?: RssEntry | RssEntry[] } };
    const raw = json.feed?.entry;
    if (!raw) {
      // HTTP 200이면서 entry만 비는 응답이 온다. 2쪽 이후라면 '더 없음'이라 정상이지만,
      // 1쪽부터 비면 그 앱의 리뷰를 하나도 못 받은 것이다. 조용히 0건으로 끝나면
      // '리뷰가 없는 앱'과 구분이 안 돼 원인을 찾을 수 없다.
      // 2026-08 실측: 애플이 이 RSS로 리뷰 제공을 멈춘 것으로 보인다(피드 골격만 오고
      // first/last/next 링크가 전부 빈 문자열). 그 경우 App Store Connect API로 옮겨야 한다.
      if (page === 1) {
        console.warn(
          `  앱스토어(id=${appId}, ${country}): 응답은 정상(HTTP 200)인데 리뷰가 0건입니다. ` +
            'iTunes RSS가 더 이상 리뷰를 주지 않는 상태일 수 있습니다 (App Store Connect API 전환 검토).',
        );
      }
      break;
    }
    const entries = Array.isArray(raw) ? raw : [raw];
    for (const e of entries) {
      const id = e.id?.label;
      const title = e.title?.label ?? '';
      const body = e.content?.label ?? '';
      if (!id || (!title && !body)) continue;
      items.push({
        source: 'appstore',
        sourceId: id,
        service,
        // 어느 국가 스토어에서 온 리뷰인지 남긴다 — 같은 앱도 국가마다 반응이 갈린다
        country,
        url: `https://apps.apple.com/${country}/app/id${appId}?see-all=reviews`,
        author: e.author?.name?.label,
        content: title && body && title !== body ? `${title}\n${body}` : body || title,
        rating: e['im:rating']?.label ? Number(e['im:rating'].label) : undefined,
        // 애플 RSS는 미국 태평양 오프셋(예: ...-07:00)으로 준다 — 로컬 기준으로 맞춰야
        // 다른 소스와 사전순 비교가 성립한다
        postedAt: normalizeInstant(e.updated?.label),
      });
    }
  }
  return items;
}
