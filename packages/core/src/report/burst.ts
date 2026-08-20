import type { ItemRow } from '../types.js';

/**
 * 하루 안의 급증(버스트)과 그 안에서 반복되는 주제를 찾는다.
 *
 * **기존 급증 감지가 못 잡는 것이 있다.** 그쪽은 '직전 7일 평균 대비 3배 + 최소 5건'을
 * **카테고리별, 하루 단위**로 본다. 그래서 두 가지가 새어 나간다.
 *
 * - **시간 축이 없다.** 배포 직후 반응은 두세 시간에 몰리고 끝난다. 하루가 끝나야 판정되므로
 *   당일 브리핑에는 안 뜨고, 다음 날에는 이미 지나간 일이 된다.
 *   실측(2026-08-20): 한 기능 개편 반응 13건이 12~14시 3시간에 12건(92%) 몰렸다.
 * - **카테고리로 갈린다.** 같은 사건이 '기타 9, 앱 오류 3, 정책 1'로 흩어지면 어느 카테고리도
 *   임계를 못 넘는다. 그래서 카테고리가 아니라 **본문에서 반복되는 말**로 묶는다.
 *
 * 이 파일은 DB를 모른다. 하루치 글 목록만 받아 계산하므로 브리핑과 화면이 같은 결과를 쓴다.
 */

/** 버스트로 볼 최소 건수. 이보다 적으면 우연과 구별되지 않는다 */
const MIN_BURST_ITEMS = 5;
/** 묶어서 볼 시간 폭(시간). 배포 직후 반응이 대체로 이 안에 몰린다 */
const WINDOW_HOURS = 3;
/**
 * '집중'으로 볼 배수. 하루가 24시간에 고르게 퍼졌을 때의 기대치 대비다.
 *
 * **비율(예: 그날의 50% 이상)로 판정하면 안 된다.** 실측(2026-08-20)에서 한 사건 반응이
 * 12~14시에 80건 몰렸는데, 그날 전체가 231건이라 비율로는 35%였다. 50% 문턱을 두면
 * 이렇게 뚜렷한 집중을 놓친다. 평소 언급량이 많은 서비스일수록 비율은 낮게 나오기 때문이다.
 *
 * 그래서 기존 급증 감지와 같은 방식(평균 대비 배수)을 시간 축에 쓴다. 균등 기대치는
 * `건수 × 3/24`이고, 위 사례는 28.9건 기대에 80건이라 2.8배다.
 *
 * 한계: 하루를 균등하다고 가정한다. 실제로는 새벽이 적고 저녁이 많아서, 활동이 많은
 * 시간대가 배수를 조금 더 쉽게 넘긴다. 직전 며칠의 같은 시간대와 비교하는 편이 정확하지만
 * 그러려면 시각이 있는 과거 데이터가 충분히 쌓여야 한다.
 */
const MIN_MULTIPLE = 2;

/** 주제 후보로 볼 최소 반복 수 */
const MIN_TOPIC_REPEAT = 3;
/** 주제어 최소 길이. 한 글자는 조사, 감탄사와 구별되지 않는다 */
const MIN_TERM_LENGTH = 2;

/**
 * 주제어에서 뺄 말.
 *
 * 어느 서비스에서나 잦은 일반어만 넣는다. **서비스명이나 업종 용어를 여기 적지 않는다**
 * (저장소만 보고 무엇을 모니터링하는지 알 수 없어야 한다). 서비스별 제외어는 설정의
 * excludeHints를 쓰는 쪽이 맞고, 여기 목록은 업종 중립이다.
 *
 * **판정 어휘를 반드시 넣는다.** 요약문(summary)은 LLM이 쓴 문장이라 '불만', '요청', '반응'
 * 같은 말이 거의 모든 줄에 들어간다. 그것이 가장 많이 반복되는 말이 되어 실제 주제를 밀어낸다
 * (실측: 상위 주제어가 '불만' 10건으로 나와 무슨 불만인지 알 수 없었다).
 */
const STOPWORDS = new Set([
  '그리고', '그런데', '그래서', '하지만', '근데', '진짜', '너무', '정말', '완전', '이거',
  '저거', '그거', '이건', '저건', '그건', '이번', '지금', '아직', '다시', '그냥', '좀',
  '많이', '조금', '계속', '자꾸', '엄청', '개인', '사람', '생각', '느낌', '내용', '경우',
  '때문', '이유', '방법', '문제', '부분', '정도', '이상', '이하', '관련', '대한', '위해',
  // LLM 요약문의 상투어. 이걸 빼지 않으면 주제 대신 이 말들이 뽑힌다
  '불만', '불편', '요청', '반응', '언급', '지적', '호소', '의사', '표출', '문의', '안내',
  '공유', '소개', '정리', '확인', '얘기', '이야기', '글임', '내용임', '개선', '추천',
  '이용자', '사용자', '독자', '고객', '플랫폼', '서비스', '작품', '업데이트', '기능',
  // 어미와 부사. '않는다', '됐다'처럼 서술어 조각이 주제어로 올라오는 것을 막는다
  '않는다', '한다는', '된다는', '있다는', '없다는', '했다는', '싫다는', '좋다는',
  '요즘', '예전', '앞으로', '아까', '방금', '오늘', '어제', '내일', '이제', '벌써',
]);

export interface BurstTopic {
  /** 반복된 말 */
  term: string;
  count: number;
  /** 그중 부정 판정 */
  negative: number;
  /** 사람이 확인할 대표 글 */
  samples: ItemRow[];
}

export interface BurstWindow {
  /** 구간 시작 시각(0~23) */
  startHour: number;
  endHour: number;
  count: number;
  negative: number;
  /** 그날 전체 중 이 구간의 비율(0~1). 판정 기준이 아니라 읽는 사람을 위한 참고값이다 */
  share: number;
  /** 균등 분포 기대치의 몇 배인지. 이 값이 판정 기준이다 */
  multiple: number;
  /** 이 구간에서 반복된 주제 (많은 순) */
  topics: BurstTopic[];
}

export interface BurstResult {
  /** 시각을 확인할 수 있어 계산에 쓴 건수 */
  dated: number;
  /** 작성 시각이 없어 제외된 건수. 이 값이 크면 아래 판정을 믿을 수 없다 */
  undated: number;
  /** 시간대별 건수 (0~23) */
  byHour: number[];
  /** 집중이 확인된 구간. 없으면 빈 배열 */
  windows: BurstWindow[];
}

/** 'YYYY-MM-DDTHH:mm...' 에서 시(0~23)를 뽑는다. 못 읽으면 undefined */
function hourOf(postedAt?: string): number | undefined {
  if (!postedAt || postedAt.length < 13) return undefined;
  const h = Number(postedAt.slice(11, 13));
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : undefined;
}

/**
 * 본문에서 주제어 후보를 뽑는다.
 *
 * 형태소 분석기를 쓰지 않는다. 의존성이 늘고, 커뮤니티 글의 축약과 은어에는 어차피 약하다.
 * 대신 **공백으로 끊고 조사로 보이는 꼬리만 떼는** 수준으로 둔다. 목적이 '무슨 말이 반복되나'를
 * 세는 것이라 이 정도로 충분하고, 틀려도 반복 횟수가 낮아 후보에서 밀린다.
 */
function terms(text: string, exclude: Set<string>): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[\s,.!?~…"'`|()[\]{}<>/\\*#@:;\-]+/)) {
    const w = raw.replace(/[0-9]+/g, '').trim();
    if (w.length < MIN_TERM_LENGTH) continue;
    /**
     * 한글이 아닌 말은 버린다.
     *
     * 영어 관사, 전치사가 그대로 후보가 되면 상위를 차지한다(실측: 'the'가 19건으로 1위였다).
     * 한국어 커뮤니티 반응을 묶는 것이 목적이라 이 손실은 감당할 만하다.
     */
    if (!/[가-힣]/.test(w)) continue;
    // 조사로 보이는 한 글자 꼬리를 뗀다 (이/가/은/는/을/를/의/에/도/만 등)
    const stem = w.replace(/[이가은는을를의에도만과와로으랑]$/, '');
    const term = stem.length >= MIN_TERM_LENGTH ? stem : w;
    if (STOPWORDS.has(term) || exclude.has(term)) continue;
    /**
     * 서술어 조각을 버린다. 목록에 일일이 적는 것보다 어미 형태로 막는 편이 새 표현에도 버틴다.
     * '~다는', '~한다', '~했다' 같은 꼬리는 주제가 아니라 문장의 일부다.
     */
    if (/(다는|한다|했다|된다|됐다|이다|있다|없다|같다)$/.test(term)) continue;
    out.add(term);
  }
  return [...out];
}

/** 한 구간의 글에서 반복 주제를 찾는다 */
function topicsOf(items: ItemRow[], exclude: Set<string>, limit = 3): BurstTopic[] {
  const byTerm = new Map<string, ItemRow[]>();
  for (const it of items) {
    // 요약이 있으면 그쪽이 정제돼 있어 주제를 더 잘 드러낸다
    const text = `${it.summary ?? ''} ${it.content ?? ''}`;
    for (const t of terms(text, exclude)) {
      const bucket = byTerm.get(t);
      if (bucket) bucket.push(it);
      else byTerm.set(t, [it]);
    }
  }
  const out: BurstTopic[] = [];
  for (const [term, bucket] of byTerm) {
    if (bucket.length < MIN_TOPIC_REPEAT) continue;
    out.push({
      term,
      count: bucket.length,
      negative: bucket.filter((i) => i.sentiment === 'negative').length,
      samples: bucket.slice(0, 3),
    });
  }
  /**
   * 부정이 많은 쪽을 먼저 올린다. 같은 횟수라면 그쪽이 먼저 볼 것이다.
   * 그리고 다른 주제어가 같은 글 묶음을 가리키는 경우가 많아(같은 사건의 다른 단어)
   * 상위 몇 개만 남긴다.
   */
  out.sort((a, b) => b.negative - a.negative || b.count - a.count);
  return out.slice(0, limit);
}

/**
 * 하루치 글에서 시간 집중과 그 주제를 찾는다.
 *
 * 작성 시각이 없는 글은 계산에서 뺀다(앱 리뷰는 작성일만 있고 시각이 없는 경우가 많다).
 * 뺀 건수를 함께 돌려주므로, 그 값이 크면 판정을 믿지 않을 근거가 된다.
 */
export function findBursts(items: ItemRow[], searchKeywords: string[] = []): BurstResult {
  /**
   * 검색 키워드는 주제어에서 뺀다.
   *
   * 그 말로 찾아온 글이라 거의 모든 글에 들어 있고, 반복 횟수 1위가 되면서 정보량은 0이다
   * (실측: 서비스명이 26건으로 1위였다). 키워드에 붙은 조사 꼬리도 같이 막아야 새어 나가지 않는다.
   */
  const exclude = new Set<string>();
  for (const k of searchKeywords) {
    const t = k.trim();
    if (!t) continue;
    exclude.add(t);
    exclude.add(t.replace(/[이가은는을를의에도만과와로으랑]$/, ''));
  }

  const byHour = Array<number>(24).fill(0);
  const hourly: ItemRow[][] = Array.from({ length: 24 }, () => []);
  let undated = 0;
  for (const it of items) {
    const h = hourOf(it.postedAt);
    if (h === undefined) {
      undated += 1;
      continue;
    }
    byHour[h] += 1;
    hourly[h].push(it);
  }
  const dated = items.length - undated;
  if (dated < MIN_BURST_ITEMS) return { dated, undated, byHour, windows: [] };

  /**
   * 3시간 창을 한 시간씩 옮기며 가장 몰린 구간을 찾는다.
   *
   * 겹치는 구간이 여럿 뽑히면 같은 사건이 여러 줄로 보이므로, 가장 큰 것 하나만 남기고
   * 그와 겹치는 구간은 버린다.
   */
  const candidates: BurstWindow[] = [];
  for (let start = 0; start + WINDOW_HOURS <= 24; start++) {
    const slice = hourly.slice(start, start + WINDOW_HOURS).flat();
    if (slice.length < MIN_BURST_ITEMS) continue;
    // 하루가 고르게 퍼졌다면 이 창에 들어올 건수
    const expected = (dated * WINDOW_HOURS) / 24;
    if (slice.length < expected * MIN_MULTIPLE) continue;
    const share = slice.length / dated;
    candidates.push({
      startHour: start,
      endHour: start + WINDOW_HOURS - 1,
      count: slice.length,
      negative: slice.filter((i) => i.sentiment === 'negative').length,
      share,
      multiple: slice.length / expected,
      topics: topicsOf(slice, exclude),
    });
  }
  candidates.sort((a, b) => b.count - a.count || b.share - a.share);

  const windows: BurstWindow[] = [];
  for (const c of candidates) {
    const overlaps = windows.some((w) => c.startHour <= w.endHour && w.startHour <= c.endHour);
    if (!overlaps) windows.push(c);
  }
  windows.sort((a, b) => a.startHour - b.startHour);
  return { dated, undated, byHour, windows };
}
