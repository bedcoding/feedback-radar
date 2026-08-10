import type { Category, Sentiment, Severity, Team } from './taxonomy.js';

/** 수집기가 반환하는 원시 아이템 */
export interface RawItem {
  source: string;      // 'appstore' | 'googleplay' | 'naver-blog' | 'naver-cafe' | 'dcinside' | 'threads' ...
  sourceId: string;    // 소스 내 고유 ID (리뷰 id, 게시글 URL 등)
  url?: string;
  author?: string;
  content: string;
  rating?: number;     // 앱 리뷰 별점 (1~5)
  postedAt?: string;   // ISO 문자열
  keyword?: string;    // 검색에 사용된 키워드
  service?: string;    // 어느 서비스에 대한 반응인지 (여러 서비스를 함께 추적할 때 구분용)
  /**
   * 앱 리뷰를 어느 국가 스토어에서 가져왔는지 (소문자 두 자, 예: 'kr' 'us' 'jp').
   *
   * 같은 패키지라도 스토어 국가를 바꾸면 리뷰 풀이 통째로 달라진다. 국내 스토어만 조회하면
   * 해외 이용자 반응은 한 건도 들어오지 않고, 국가를 잘못 넣으면 오류 없이 0건이 된다.
   * 커뮤니티와 SNS 수집에는 해당하는 국가가 없으므로 비워 둔다.
   */
  country?: string;
}

export interface TagResult {
  sentiment: Sentiment;
  category: Category;
  severity: Severity;
  team: Team;
  summary: string;
  /** 이 글이 실제로 우리 서비스에 관한 것인지 (동음이의어 노이즈 필터, false면 집계에서 제외) */
  relevant: boolean;
  /**
   * relevant를 그렇게 판단한 근거 한 줄.
   *
   * 걸러진 글 탭은 "판정이 맞는지 확인"이 목적인데, true/false만 있으면 확인할 방법이 없다.
   * 근거가 있어야 오탐을 찾아 excludeHints, 키워드를 고칠 수 있다.
   * 근거를 못 받았을 수도 있어(구버전 데이터, 형식 이탈) 선택 필드로 둔다.
   */
  reason?: string;
}

export interface ItemRow extends RawItem, Partial<TagResult> {
  id: number;
  collectedAt: string;
  taggedAt?: string;
}

/** 태거에 넘기는 최소 정보: service는 서비스별 관련성 기준을 고르는 데 쓴다 */
export interface TaggableItem {
  id: number;
  content: string;
  rating?: number;
  source: string;
  service?: string;
}

/**
 * 배치 하나가 끝날 때마다 그 배치 결과로 호출된다 (누적이 아니라 이번 것만).
 *
 * 전체 재분류는 1천 건 넘게 수십 분이 걸리는데, 결과를 끝에 한 번만 저장하면
 * 중간에 끊겼을 때 그동안 쓴 호출이 통째로 날아간다. 배치마다 저장해 두면
 * 저장된 건은 tagged_at이 채워져 다음 실행에서 대상에서 빠지므로,
 * 다시 돌리는 것만으로 남은 것부터 이어서 한다.
 */
export type TagProgress = (batchResults: Map<number, TagResult>) => void;

/**
 * 분류 한 번에 실제로 쓴 자원.
 *
 * `models`가 핵심이다. haiku, sonnet, opus는 **별칭**이라 지정값만으로는 어떤 버전이 돌았는지
 * 알 수 없다. CLI가 `--output-format json`으로 돌려주는 modelUsage 키가 정식 모델 ID이고,
 * 그게 "opus를 골랐는데 정말 opus가 돌았나"를 확인할 수 있는 유일한 근거다.
 * 예전에는 이 값을 콘솔에만 찍어서 화면에서는 확인할 방법이 없었다.
 */
export interface TaggerUsage {
  /** CLI/API가 보고한 정식 모델 ID (예: claude-haiku-4-5-20251001) */
  models: string[];
  inputTokens: number;
  outputTokens: number;
  /** 종량제 환산 금액. 구독(CLI)으로 돌면 실청구는 0이다 */
  costUsd: number;
  /** 이번에 분류한 건수 */
  items: number;
  /**
   * 캐시에서 읽은 입력 토큰. 프롬프트 캐시가 실제로 맞았는지를 말해 주는 유일한 값이다.
   *
   * 분류 프롬프트의 앞부분(시스템 프롬프트, 분류 스키마, 도메인 사전)은 배치마다 같아서
   * 캐시가 맞아야 정상이다. 이 값이 계속 0이면 앞부분에 매번 바뀌는 값이 섞였다는 뜻이고,
   * 그때는 입력 토큰을 전액 다시 결제하고 있는 셈인데 화면에 없으면 알아챌 수 없다.
   * 캐시 정보를 주지 않는 태거도 있어 선택 필드로 둔다.
   */
  cacheReadTokens?: number;
  /** 캐시에 새로 쓴 입력 토큰. 읽기와 나란히 봐야 캐시가 도는지 새로 쓰기만 하는지 갈린다 */
  cacheCreationTokens?: number;
}

/**
 * 배치 사이에 물어보는 중단 신호. true를 돌려주면 남은 배치를 포기한다.
 *
 * 분류는 수십 분이 걸리고 배치마다 LLM을 부른다. 상한을 크게 두고 실행했다는 걸
 * 뒤늦게 알아차렸을 때 멈출 방법이 없으면 남은 호출이 전부 나간다. 배치 경계는
 * 이미 처리한 건이 저장된 시점이라 안전하게 끊을 수 있는 자리다.
 */
export type ShouldStop = () => boolean;

/**
 * LLM 호출 한 번을 보내기 직전의 정보.
 *
 * 분류는 수십 분 동안 화면에 진행 바만 남는다. 그동안 무엇을 근거로 판정하는지 볼 수
 * 없으면, 결과를 신뢰할지 판단할 근거가 사람에게 없고 프롬프트를 고칠 단서도 없다.
 * 지시부는 호출마다 같아서 그대로 보여주면 이 도구가 AI를 어떻게 쓰는지가 드러난다.
 */
export interface TagCall {
  /** 몇 번째 호출인지 (1부터) */
  index: number;
  /** 이번 분류에서 보낼 호출 수 */
  total: number;
  /** 이 호출에 담은 글 수 */
  items: number;
  /** 프롬프트 전체 길이(문자). 항목이 길수록 커진다 */
  chars: number;
  /**
   * 호출마다 똑같은 지시부 전문. 프롬프트 캐시가 맞는 구간이기도 하다
   * (이 부분이 바뀌면 캐시가 깨져 입력 토큰을 전액 다시 낸다).
   */
  instructions: string;
  /**
   * 이 호출에 실제로 담긴 글들. 한 줄씩 짧게 자른다.
   *
   * 건수만 보이면 "25건 보냈다"까지만 알 수 있고 무엇을 판정 중인지는 여전히 모른다.
   * 원문 전체를 화면에 흘리면 카드가 덮이므로 앞부분만 남긴다. id를 함께 주므로
   * 나중에 목록에서 그 글을 찾아 판정 결과와 맞춰 볼 수 있다.
   */
  lines: { id: number; source: string; text: string }[];
  /** 직전 호출까지 쌓인 사용량. 실행이 끝나기 전에도 비용을 볼 수 있게 한다 */
  usageSoFar?: Pick<TaggerUsage, 'inputTokens' | 'outputTokens' | 'costUsd'> & {
    cacheReadTokens?: number;
  };
}

/**
 * tag()의 부가 인수. 인수 자리를 늘리는 대신 객체로 받는다. 호출부에서
 * `tag(items, undefined, undefined, cb)` 같은 빈 자리가 생기지 않게 한다.
 */
export interface TagOptions {
  onBatch?: TagProgress;
  shouldStop?: ShouldStop;
  /** 호출을 보내기 직전에 불린다 */
  onCall?: (call: TagCall) => void;
  /**
   * 한 호출에 담을 글 수 상한. 없으면 태거 기본값.
   *
   * 크게 잡으면 호출 수가 줄어 효율이 좋고, 작게 잡으면 결과가 화면에 빨리 뜬다.
   * 어느 쪽이 맞는지는 쓰는 사람이 판단할 문제라 설정으로 열어 둔다.
   */
  batchSize?: number;
}

export interface Tagger {
  name: string;
  tag(items: TaggableItem[], opts?: TagOptions): Promise<Map<number, TagResult>>;
  /**
   * 마지막 tag() 호출에서 쓴 자원. LLM을 쓰지 않는 태거(휴리스틱)는 구현하지 않는다.
   * tag()의 반환값을 늘리지 않는 이유: 호출부 대부분은 태그 결과만 필요하다.
   */
  usage?: () => TaggerUsage | undefined;
}

/* ── 저장소 조회 타입 ──────────────────────────────────────────────────────
   구현은 store.ts(PostgreSQL)에 있고 여기에는 모양만 둔다. 웹과 파이프라인이
   이 타입들만 보고 쓰므로, 저장소를 바꿔도 화면 코드는 건드릴 일이 없다. */

/**
 * 스케줄러와 대시보드가 공유하는 실행 제어 키.
 *
 * 두 프로세스는 메모리를 공유하지 않아서 신호를 변수로 넘길 수 없다. 같은 DB의 settings
 * 표를 거친다. 키를 상수로 두는 이유: 양쪽 문자열이 어긋나면 버튼이 조용히 안 먹는다.
 */
export const RUN_CANCEL_KEY = 'runCancelAt';

/** 지금 보내는 LLM 프롬프트 정보가 담기는 키 (화면에 그대로 띄운다) */
export const RUN_TAG_CALL_KEY = 'runTagCall';

/**
 * 관련성 필터: LLM이 우리 서비스 글이라고 판정한 것.
 *
 * `relevant IS NULL`이 두 가지 다른 상태를 겸한다는 것이 이 조건의 핵심이다.
 * `tagged_at`으로만 구별된다.
 *
 * | tagged_at | relevant | 상태 | 관련 글 |
 * |---|---|---|---|
 * | NULL | NULL | 방금 수집돼 아직 판정 전 | 아니다 |
 * | NULL | 1 | 재태깅 대기, 옛 판정이 살아 있다 | 맞다 |
 * | NULL | 0 | 재태깅 대기, 무관 판정 | 아니다 |
 * | 있음 | 1 | 관련 판정 | 맞다 |
 * | 있음 | 0 | 무관 판정 | 아니다 |
 * | 있음 | NULL | relevant 컬럼이 없던 시절 데이터 | 맞다 |
 *
 * 미분류를 관련으로 세면 수집 직후 수 분 동안 목록에 동음이의어 글이 그대로 올라온다.
 * 반대로 `relevant = 1`만 보면 retag 도중(tagged_at만 비운 상태)에 목록이 통째로 빈다.
 */
export const RELEVANT = `(relevant = 1 OR (relevant IS NULL AND tagged_at IS NOT NULL))`;

/** 아직 분류되지 않은 글. 관련성 판정이 아직 없다는 뜻이라 관련, 무관 어느 쪽도 아니다 */
export const UNTAGGED = `tagged_at IS NULL`;

/**
 * 조회 전용 모드인지.
 *
 * VERCEL은 배포 환경이 자동으로 넣어 주고, DEMO_READONLY는 로컬에서 그 상태를
 * 재현해 보기 위한 것이다.
 */
export function isReadOnlyMode(): boolean {
  return process.env.DEMO_READONLY === '1' || process.env.VERCEL === '1';
}

/**
 * 목록에 무엇을 보일지.
 *
 * 무관 판정 글을 지우지 않고 남기는 이유는 판정이 맞는지 확인할 길이 있어야 하기 때문이다.
 * 실제로 재검증에서 표본의 일부가 뒤집혔다.
 */
export type RelevanceFilter = 'relevant' | 'irrelevant' | 'untagged' | 'all';

export interface ItemQuery {
  filter?: RelevanceFilter;
  service?: string;
  /** 작성일이 이 날짜 이후인 것만 (YYYY-MM-DD) */
  postedFrom?: string;
  category?: string;
  /** 앱 리뷰를 가져온 스토어 국가 (소문자 두 자). 지정하면 국가가 없는 커뮤니티 글은 빠진다 */
  country?: string;
  /** 수집 채널. 'naver'는 naver-blog와 naver-cafe를 함께 잡는다 */
  source?: string;
  /** 감성 (positive | neutral | negative) */
  sentiment?: string;
}

export interface SourceCoverage {
  source: string;
  count: number;
  /** 작성일 범위 (YYYY-MM-DD). 날짜를 못 가져온 소스는 undefined */
  oldest?: string;
  newest?: string;
}

export interface CategoryCount {
  category: string;
  count: number;
  negative: number;
}

export interface DashboardStats {
  total: number;
  today: number;
  bySource: { source: string; count: number }[];
  bySentiment: { sentiment: string; count: number }[];
}

export interface PitchStats {
  total: number;
  tagged: number;
  irrelevant: number;
  negative: number;
  urgent: number;
  bySource: { source: string; count: number }[];
  byCategory: { category: string; count: number }[];
  collectDays: number;
  firstCollectedAt?: string;
  lastCollectedAt?: string;
}

export interface ChannelSummary {
  date: string;
  source: string;
  /** 서비스명. 여러 서비스를 함께 추적하지 않으면 빈 문자열 */
  service: string;
  /**
   * 앱 리뷰를 가져온 스토어 국가. 국가가 없는 채널(커뮤니티, SNS)은 빈 문자열.
   *
   * 국가를 섞어 한 장으로 요약하면 국가마다 다른 이슈가 평균에 묻힌다. 한 국가에서
   * 잘 도는 기능이 다른 국가에서는 불만 1순위인 경우가 실제로 있다.
   */
  country: string;
  total: number;
  negative: number;
  urgent: number;
  bullets: string[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  createdAt: string;
}

export interface TrendCell {
  date: string;
  source: string;
  /** 앱 리뷰의 스토어 국가. 국가가 없는 채널은 빈 문자열 (요약 카드와 같은 단위로 맞춘다) */
  country: string;
  count: number;
  negative: number;
}

export type CollectTaskState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface CollectTask {
  seq: number;
  service: string;
  source: string;
  /** 앱 스토어 국가. 국가 개념이 없는 소스는 빈 문자열 */
  country: string;
  state: CollectTaskState;
  /** 스토어나 검색이 돌려준 건수 */
  collected?: number;
  /** 그중 실제로 새로 저장된 건수 (이미 있는 건 UNIQUE로 걸러진다) */
  inserted?: number;
  /** 실패 사유나 건너뛴 이유. 왜 0건인지를 화면에서 알 수 있어야 한다 */
  note?: string;
  startedAt?: string;
  endedAt?: string;
}
