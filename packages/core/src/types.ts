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
   * 근거가 있어야 오탐을 찾아 excludeHints·키워드를 고칠 수 있다.
   * 근거를 못 받았을 수도 있어(구버전 데이터·형식 이탈) 선택 필드로 둔다.
   */
  reason?: string;
}

export interface ItemRow extends RawItem, Partial<TagResult> {
  id: number;
  collectedAt: string;
  taggedAt?: string;
}

/** 태거에 넘기는 최소 정보 — service는 서비스별 관련성 기준을 고르는 데 쓴다 */
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
 * `models`가 핵심이다 — haiku·sonnet·opus는 **별칭**이라 지정값만으로는 어떤 버전이 돌았는지
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

export interface Tagger {
  name: string;
  tag(
    items: TaggableItem[],
    onBatch?: TagProgress,
    shouldStop?: ShouldStop,
  ): Promise<Map<number, TagResult>>;
  /**
   * 마지막 tag() 호출에서 쓴 자원. LLM을 쓰지 않는 태거(휴리스틱)는 구현하지 않는다.
   * tag()의 반환값을 늘리지 않는 이유: 호출부 대부분은 태그 결과만 필요하다.
   */
  usage?: () => TaggerUsage | undefined;
}
