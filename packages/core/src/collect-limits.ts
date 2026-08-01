import type { RadarConfig } from './paths.js';

/**
 * 소스별 1회 수집 상한.
 *
 * 전수조사가 아니라 "검색 결과 상위 N개"를 가져오는 구조라, 이 값이 곧 한 번 돌 때의
 * 수집량이자 LLM 호출량이다. 디시·Threads 상한은 수집기 안에 상수로 박혀 있어
 * 설정으로 못 바꿨는데, 나머지와 같은 자리로 모은다.
 *
 * 우선순위: 대시보드에서 저장한 값 > private/feedback-radar.config.json의 collect > 기본값
 */
export interface CollectLimits {
  appstorePages: number;
  googlePlayReviewCount: number;
  naverDisplay: number;
  dcinsidePosts: number;
  threadsPosts: number;
}

export interface CollectLimitField {
  key: keyof CollectLimits;
  label: string;
  /** 단위 설명 — 소스마다 세는 단위가 달라서(페이지 vs 건, 앱당 vs 키워드당) 화면에 같이 보여준다 */
  unit: string;
  min: number;
  max: number;
  def: number;
  /** 이 값 1당 실제로 늘어나는 글 수 (총량 추산용) */
  perUnit: number;
  /** 앱마다 도는지, 키워드마다 도는지 */
  scope: 'app' | 'keyword';
}

export const COLLECT_LIMIT_FIELDS: readonly CollectLimitField[] = [
  { key: 'appstorePages', label: '앱스토어', unit: '페이지 (앱당, 1페이지=50건)', min: 1, max: 10, def: 3, perUnit: 50, scope: 'app' },
  { key: 'googlePlayReviewCount', label: '구글플레이', unit: '건 (앱당)', min: 10, max: 1000, def: 200, perUnit: 1, scope: 'app' },
  // 네이버 오픈 API는 display 최댓값이 100이고, 키워드마다 블로그·카페를 각각 부른다
  { key: 'naverDisplay', label: '네이버', unit: '건 (키워드당, 블로그·카페 각각)', min: 10, max: 100, def: 50, perUnit: 2, scope: 'keyword' },
  { key: 'dcinsidePosts', label: '디시인사이드', unit: '건 (키워드당)', min: 10, max: 200, def: 50, perUnit: 1, scope: 'keyword' },
  { key: 'threadsPosts', label: 'Threads', unit: '건 (키워드당)', min: 10, max: 100, def: 30, perUnit: 1, scope: 'keyword' },
] as const;

/** 대시보드 설정 키 — 다른 설정과 섞이지 않게 접두사를 붙인다 */
export const collectLimitKey = (key: keyof CollectLimits): string => `collect.${key}`;

function pick(field: CollectLimitField, saved?: string, fromConfig?: number): number {
  for (const raw of [saved, fromConfig]) {
    if (raw === undefined || raw === '') continue;
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= field.min && n <= field.max) return n;
  }
  return field.def;
}

export function resolveCollectLimits(
  config: RadarConfig,
  settings: Record<string, string> = {},
): CollectLimits {
  const c = config.collect ?? {};
  const out = {} as CollectLimits;
  for (const f of COLLECT_LIMIT_FIELDS) {
    out[f.key] = pick(f, settings[collectLimitKey(f.key)], c[f.key]);
  }
  return out;
}

/**
 * 한 번 수집할 때 최대 몇 건이 들어오는지 추산.
 * 실제로는 검색 결과가 상한보다 적은 경우가 대부분이고, 중복은 저장 단계에서 걸러진다.
 */
export function estimateMaxPerRun(
  limits: CollectLimits,
  counts: { apps: number; keywords: number },
  enabled: Partial<Record<'appstore' | 'googleplay' | 'naver' | 'dcinside' | 'threads', boolean>>,
): number {
  const on = (k: keyof typeof enabled) => enabled[k] !== false;
  let total = 0;
  if (on('appstore')) total += limits.appstorePages * 50 * counts.apps;
  if (on('googleplay')) total += limits.googlePlayReviewCount * counts.apps;
  if (on('naver')) total += limits.naverDisplay * 2 * counts.keywords;
  if (on('dcinside')) total += limits.dcinsidePosts * counts.keywords;
  if (on('threads')) total += limits.threadsPosts * counts.keywords;
  return total;
}
