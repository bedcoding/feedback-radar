import { dropFlooding, normalizeInstant, X_READ_COST_USD, type RawItem } from '@feedback-radar/core';

/**
 * X(구 트위터) 최근 게시물 검색.
 *
 * **이 소스만 읽는 것 자체에 돈이 붙는다.** 2026년 2월부터 무료 등급이 없어져 신규 발급은
 * 종량제뿐이고, 읽기 1건에 $0.005다. 그래서 다른 수집기와 다른 원칙을 둔다.
 *
 * - **페이지를 넘기지 않는다.** 응답의 `next_token`을 따라가면 상한이 사라져 청구액도 사라진다.
 *   키워드마다 딱 한 번 부르고, 그 한 번이 최대 `limit`건이다. 이게 비용 상한의 근거다.
 * - **리트윗을 제외한다**(`-is:retweet`). 리트윗은 본문이 원글과 같아 저장 단계 중복 제거에
 *   걸리는데, 읽기 비용은 이미 나간 뒤다. 같은 돈으로 서로 다른 글을 더 많이 본다.
 * - **실제로 몇 건을 읽었는지 로그에 남긴다.** 청구액은 수집 결과가 아니라 읽은 건수로
 *   결정되므로, 중복이 걸러져 저장이 0건이어도 돈은 나간다. 그 차이를 눈에 보이게 둔다.
 *
 * 토큰이 없으면 조용히 건너뛴다. 키를 넣지 않은 사람에게는 비용이 0이어야 한다.
 */

/** 최근 검색(자체 발급 등급)의 쿼리 길이 제한 */
const MAX_QUERY_CHARS = 512;

/** 연산자를 붙일 자리를 남겨 둔다 */
const OPERATORS = ' -is:retweet';

interface XPost {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
}

interface XSearchResponse {
  data?: XPost[];
  includes?: { users?: { id: string; username?: string }[] };
  meta?: { result_count?: number };
  /** 오류 응답: 형태가 두 가지다 (문제 상세 하나, 부분 실패 배열) */
  detail?: string;
  title?: string;
  errors?: { message?: string; title?: string }[];
}

/**
 * 필드 파라미터 이름이 리브랜딩으로 바뀌었다. 문서 기준은 `post.fields`이고 예전 이름은
 * `tweet.fields`다. 어느 쪽을 받는지는 접근 등급에 따라 다를 수 있는데, 틀린 이름을 보내면
 * 400이 떨어져 수집이 조용히 0건이 된다. 첫 호출에서 한 번 확인하고 그 뒤로는 고정한다.
 */
const FIELD_PARAM_NAMES = ['post.fields', 'tweet.fields'] as const;

/**
 * 이번 달 남은 읽기 예산. 회당 상한만으로는 총액이 정해지지 않으므로 누적으로도 막는다.
 *
 * 여러 서비스가 각자 태스크로 병렬로 도는데, 같은 예산을 나눠 쓴다. Node는 단일 스레드라
 * `spend`의 누적이 서로 엇갈리지 않는다. 다만 이미 떠 있는 요청은 끝까지 가므로 마지막
 * 한 번은 예산을 조금 넘길 수 있다. 하드 상한이 아니라 브레이크라 그 정도면 된다.
 */
export interface XReadBudget {
  /** 지금 더 읽어도 되는 건수 */
  remaining: () => number;
  /** 읽은 만큼 차감 */
  spend: (reads: number) => void;
}

function buildUrl(fieldParam: string, query: string, limit: number): string {
  const params = new URLSearchParams({
    query,
    max_results: String(limit),
    [fieldParam]: 'created_at,lang',
    expansions: 'author_id',
    'user.fields': 'username',
  });
  return `https://api.x.com/2/tweets/search/recent?${params.toString()}`;
}

/**
 * 오류 응답에서 사람이 읽을 사유를 뽑는다.
 *
 * 401은 title과 detail이 똑같이 'Unauthorized'로 온다(실측). 그대로 이으면 같은 말이 두 번
 * 찍혀서 무슨 오류인지 대신 노이즈만 늘어난다. 중복을 걷고 하나도 못 건지면 상태 코드를 쓴다.
 */
function reasonOf(json: XSearchResponse | undefined, status: number): string {
  const parts = [json?.title, json?.detail, ...(json?.errors ?? []).map((e) => e.message ?? e.title)];
  const text = [...new Set(parts.filter(Boolean))].join(', ');
  return text || `HTTP ${status}`;
}

export async function collectX(
  keywords: string[],
  limit = 20,
  service?: string,
  budget?: XReadBudget,
): Promise<RawItem[]> {
  const token = process.env.X_BEARER_TOKEN?.trim();
  if (!token) {
    console.log('  X: X_BEARER_TOKEN 미설정, 스킵');
    return [];
  }

  const items: RawItem[] = [];
  let readCount = 0;
  // 첫 호출에서 확인한 필드 파라미터 이름을 뒤 키워드에서 재사용한다
  let fieldParam: string | undefined;

  for (const kw of keywords) {
    /**
     * 예산을 먼저 본다. 이번 호출은 최대 limit건을 읽으므로 그만큼이 안 남았으면
     * 시작하지 않는다. 남은 예산보다 적게 읽는 편이 조금 넘기는 것보다 낫다.
     */
    if (budget && budget.remaining() < limit) {
      console.warn(`  X: 이번 달 예산 한도에 걸려 남은 키워드를 건너뜁니다 (${kw} 이후)`);
      break;
    }
    // 구문 그대로 찾는다. 따옴표가 없으면 단어가 쪼개져 매칭돼 무관한 글이 크게 늘고,
    // 그 글들도 읽은 건수로 과금된다.
    const query = `"${kw}"${OPERATORS}`.slice(0, MAX_QUERY_CHARS);
    const names = fieldParam ? [fieldParam] : FIELD_PARAM_NAMES;
    let json: XSearchResponse | undefined;
    let ok = false;

    for (const name of names) {
      let res: Response;
      try {
        // 타임아웃이 없으면 응답이 지연될 때 키워드마다 매달려 수집이 멈춘 것처럼 보인다
        res = await fetch(buildUrl(name, query, limit), {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        console.warn(`  X 요청 실패 (${kw}): ${(e as Error).message}`);
        break;
      }
      json = (await res.json().catch(() => undefined)) as XSearchResponse | undefined;
      if (res.ok) {
        fieldParam = name;
        ok = true;
        break;
      }
      // 400은 파라미터 이름 문제일 수 있어 남은 이름으로 한 번 더 시도한다.
      // 401(토큰), 429(호출 한도)는 이름을 바꿔도 같은 결과라 여기서 끝낸다.
      if (res.status === 429) {
        console.warn(`  X: 호출 한도 초과, "${kw}" 건너뜀`);
        break;
      }
      if (res.status !== 400 || name === FIELD_PARAM_NAMES[FIELD_PARAM_NAMES.length - 1]) {
        console.warn(`  X 실패 (${kw}): ${reasonOf(json, res.status)}`);
        break;
      }
    }
    if (!ok || !json) continue;

    // 청구는 저장 건수가 아니라 읽은 건수로 결정된다
    const reads = json.meta?.result_count ?? json.data?.length ?? 0;
    readCount += reads;
    budget?.spend(reads);

    const nameById = new Map(
      (json.includes?.users ?? []).map((u) => [u.id, u.username]).filter(([, n]) => n) as [
        string,
        string,
      ][],
    );
    for (const p of json.data ?? []) {
      const username = p.author_id ? nameById.get(p.author_id) : undefined;
      items.push({
        source: 'x',
        service,
        sourceId: p.id,
        // 작성자를 못 붙였어도 열리는 형태로 만든다
        url: `https://x.com/${username ?? 'i'}/status/${p.id}`,
        author: username,
        content: p.text,
        // created_at은 UTC라 그대로 두면 다른 소스와 사전순 비교가 어긋난다
        postedAt: normalizeInstant(p.created_at),
        keyword: kw,
      });
    }
  }

  if (readCount > 0) {
    const cost = (readCount * X_READ_COST_USD).toFixed(2);
    console.log(`  X: ${readCount}건 읽음 (환산 $${cost}, 저장 전 기준)`);
  }
  // web 경로와 같은 이유로 본문 반복을 걸러낸다. 읽은 돈은 이미 나갔지만 분류 호출은 아낀다
  const { kept, dropped } = dropFlooding(items);
  if (dropped.length > 0) console.log(`  X: 같은 글 반복 ${dropped.length}건 제외`);
  return kept;
}
