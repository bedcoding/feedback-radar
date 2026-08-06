/**
 * 크로스포스팅 도배(같은 글을 여러 게시판에 뿌리는 광고, 홍보 스팸) 탐지.
 *
 * 왜 UNIQUE 제약으로 안 잡히나: 도배는 **같은 본문을 서로 다른 갤러리에 각각 새 글로** 올린다.
 * 글마다 URL이 정당하게 달라서 `UNIQUE(source, source_id)`도, 수집기의 URL 기준 중복 제거도
 * 통과한다. 실측(2026-08) 한 건은 같은 본문이 갤러리 20곳(대학, 공군, 수능, 부동산, 화장품 …)에
 * 흩어져 있었고, 검색 키워드가 그 글의 키워드 나열에 섞여 있어서 전부 걸려 들어왔다.
 *
 * 그래서 판정 기준은 URL이 아니라 **본문**이다. 본문이 같은 글이 서로 다른 출처에서
 * 임계치 이상 나오면 도배로 보고 대표 1건만 남긴다. 남기는 이유: 실제로 우리 서비스를
 * 언급하는 도배글일 수도 있어서 존재 자체는 보이는 게 낫다.
 */

/** 도배 판정 대상이 되는 최소 본문 길이. 짧은 글은 서로 무관하게 같을 수 있다("굿", "재밌어요") */
const MIN_LENGTH = 30;
/** 비교에 쓰는 앞부분 길이: 뒤쪽에 붙는 잡다한 꼬리(조회수 등)에 흔들리지 않게 */
const COMPARE_HEAD = 120;

/** 공백, 기호를 지우고 앞부분만 남긴 비교용 키 */
function contentKey(content: string): string {
  return content
    .replace(/\s+/g, '')
    .replace(/[.,!?~…"'`|\-–—()[\]{}<>/\\*#@:;]/g, '')
    .slice(0, COMPARE_HEAD);
}

export interface FloodGroup {
  /** 이 본문이 몇 개의 서로 다른 글로 올라와 있는지 */
  count: number;
  /** 사람이 알아볼 수 있게 앞부분만 */
  preview: string;
}

export interface FloodResult<T> {
  kept: T[];
  /** 도배로 판단해 제외한 것들 */
  dropped: T[];
  groups: FloodGroup[];
}

/**
 * 같은 본문이 `minRepeat`개 이상 반복되면 첫 건만 남긴다.
 *
 * @param minRepeat 도배로 볼 최소 반복 수. 2는 우연(같은 사람이 두 곳에 올림)일 수 있어 기본 3.
 */
export function dropFlooding<T extends { content: string }>(
  items: T[],
  minRepeat = 3,
): FloodResult<T> {
  const byKey = new Map<string, T[]>();
  const short: T[] = [];
  for (const it of items) {
    if (it.content.length < MIN_LENGTH) {
      short.push(it);
      continue;
    }
    const k = contentKey(it.content);
    const bucket = byKey.get(k);
    if (bucket) bucket.push(it);
    else byKey.set(k, [it]);
  }

  const kept: T[] = [...short];
  const dropped: T[] = [];
  const groups: FloodGroup[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < minRepeat) {
      kept.push(...bucket);
      continue;
    }
    kept.push(bucket[0]);
    dropped.push(...bucket.slice(1));
    groups.push({
      count: bucket.length,
      preview: bucket[0].content.replace(/\s+/g, ' ').slice(0, 40),
    });
  }
  groups.sort((a, b) => b.count - a.count);
  return { kept, dropped, groups };
}
