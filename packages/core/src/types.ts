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
}

export interface TagResult {
  sentiment: Sentiment;
  category: Category;
  severity: Severity;
  team: Team;
  summary: string;
  /** 이 글이 실제로 우리 서비스에 관한 것인지 (동음이의어 노이즈 필터, false면 집계에서 제외) */
  relevant: boolean;
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

export interface Tagger {
  name: string;
  tag(items: TaggableItem[], onBatch?: TagProgress): Promise<Map<number, TagResult>>;
}
