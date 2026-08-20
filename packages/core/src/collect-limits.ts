import type { RadarConfig } from './paths.js';

/**
 * 소스별 1회 수집 상한.
 *
 * 전수조사가 아니라 "검색 결과 상위 N개"를 가져오는 구조라, 이 값이 곧 한 번 돌 때의
 * 수집량이자 LLM 호출량이다. 디시, Threads 상한은 수집기 안에 상수로 박혀 있어
 * 설정으로 못 바꿨는데, 나머지와 같은 자리로 모은다.
 *
 * 우선순위: 대시보드에서 저장한 값 > private/feedback-radar.config.json의 collect > 기본값
 */
export interface CollectLimits {
  appstorePages: number;
  googlePlayReviewCount: number;
  naverBlogDisplay: number;
  naverCafeDisplay: number;
  dcinsidePosts: number;
  threadsPosts: number;
  xPosts: number;
  theqooPages: number;
}

/**
 * 소스 키는 items.source에 저장되는 값과 같게 맞춘다. 켜고 끄기 설정, 목록 필터, 저장된
 * 데이터가 같은 이름을 쓰면 화면의 건수와 실제 수집 범위가 어긋나지 않는다.
 */
export const SOURCE_KEYS = [
  'appstore',
  'googleplay',
  'naver-blog',
  'naver-cafe',
  'dcinside',
  'threads',
  'x',
  'theqoo',
] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export interface CollectLimitField {
  key: keyof CollectLimits;
  /** config.sources / 켜고 끄기에 쓰는 키 */
  configKey: SourceKey;
  label: string;
  /** 단위 설명: 소스마다 세는 단위가 달라서(페이지 vs 건, 앱당 vs 키워드당) 화면에 같이 보여준다 */
  unit: string;
  min: number;
  max: number;
  def: number;
  /** 이 값 1당 실제로 늘어나는 글 수 (총량 추산용) */
  perUnit: number;
  /** 무엇마다 도는지. 앱 소스는 국가별로 따로 조회해서 조회 횟수가 앱 개수와 다르다 */
  scope: 'appstore' | 'googleplay' | 'keyword';
  /** 이 상한이 실제로 무엇을 늘리는지: 값을 키운 결과를 오해하지 않게 */
  effect: string;
  /** 이 상한이 채우는 items.source 값들 (실제 수집 범위를 짝지어 보여주기 위함) */
  sources: readonly string[];
  /**
   * 저장된 설정이 없을 때 켜진 상태인지.
   * 지금은 여덟 소스 모두 켜짐이다. 돈이 드는 것은 소스가 아니라 X의 경로 선택이고,
   * 그 기본값은 무료인 `web`이다(X_MODE_DEFAULT 참고).
   */
  defaultOn: boolean;
  /** 종량 과금 소스의 경고 문구. 켜고 끄기 옆에 그대로 띄운다 */
  metered?: string;
  /**
   * 이 필드가 물려받을 예전 상한 키.
   *
   * 소스를 쪼개면 설정 키도 갈라져서, 이미 저장해 둔 값이 통째로 무효가 된다. 그러면 다음
   * 실행이 조용히 기본값으로 돌아가 수집량이 바뀐다. 예전 키를 폴백으로 읽어 그걸 막는다.
   */
  legacyKey?: string;
  /** 물려받을 예전 소스 키 (켜고 끄기 저장값) */
  legacyConfigKey?: string;
}

/**
 * 앱 리뷰(앱스토어, 구글플레이)와 검색 소스는 성격이 다르다.
 * 앱 리뷰는 그 앱에 달린 리뷰를 최신순으로 받으므로, 이미 다 받고 있다면
 * 값을 키워도 최근 글이 아니라 **더 옛날 리뷰**가 들어온다. 이걸 카드에 적어 둔다.
 */
const OLDER = '값을 키우면 최근 글이 아니라 더 옛날 리뷰가 들어옵니다';
const WIDER = '값을 키우면 검색 결과를 더 깊이 훑습니다';
/** 목록을 훑는 소스. 검색이 없어 페이지를 넘기는 방식이라 '깊이'의 뜻이 다르다 */
const DEEPER = '값을 키우면 더 오래된 글까지 내려갑니다';

/**
 * X 검색만 유일하게 읽는 것 자체에 돈이 붙는다. 2026년 2월부터 무료 등급이 없어져
 * 신규 발급은 종량제뿐이고, 읽기 1건에 $0.005다(1,000건당 $5).
 *
 * 다른 소스는 상한을 키워도 늘어나는 건 시간과 분류 호출인데, 이쪽은 상한이 곧 청구액이다.
 * 그래서 화면에 단가를 같이 띄운다.
 *
 * 채널 자체는 기본 켜짐이다(defaultOn: true). 돈이 드는 것은 채널이 아니라 경로이고,
 * 경로 기본값은 무료인 `web`이다(X_MODE_DEFAULT). 종량제 `api`로 바꾸는 것은 사람이
 * 명시적으로 고르게 되어 있으니, 채널을 켜 둔다고 해서 기본 상태에서 돈이 나가지 않는다.
 * ⚠ X_MODE_DEFAULT 를 'api' 로 바꾸려면 이 기본값도 같이 다시 판단할 것.
 */
const X_METERED = '읽기 1건당 $0.005 청구됩니다. 키워드마다 이 값만큼 읽습니다';

export const COLLECT_LIMIT_FIELDS: readonly CollectLimitField[] = [
  { key: 'appstorePages', configKey: 'appstore', label: '앱스토어', unit: '페이지 (앱당, 1페이지=50건)', min: 1, max: 10, def: 3, perUnit: 50, scope: 'appstore', effect: OLDER, sources: ['appstore'], defaultOn: true },
  { key: 'googlePlayReviewCount', configKey: 'googleplay', label: '구글플레이', unit: '건 (앱당)', min: 10, max: 1000, def: 200, perUnit: 1, scope: 'googleplay', effect: OLDER, sources: ['googleplay'], defaultOn: true },
  // 네이버 오픈 API는 display 최댓값이 100이고, 블로그와 카페가 별도 엔드포인트다.
  // 블로그는 작성일을 주고 카페는 주지 않아 기간 필터에 걸리는 정도가 다르다. 그래서 따로 켠다.
  { key: 'naverBlogDisplay', configKey: 'naver-blog', label: '네이버 블로그', unit: '건 (키워드당)', min: 10, max: 100, def: 50, perUnit: 1, scope: 'keyword', effect: WIDER, sources: ['naver-blog'], defaultOn: true, legacyKey: 'naverDisplay', legacyConfigKey: 'naver' },
  { key: 'naverCafeDisplay', configKey: 'naver-cafe', label: '네이버 카페', unit: '건 (키워드당)', min: 10, max: 100, def: 50, perUnit: 1, scope: 'keyword', effect: WIDER, sources: ['naver-cafe'], defaultOn: true, legacyKey: 'naverDisplay', legacyConfigKey: 'naver' },
  { key: 'dcinsidePosts', configKey: 'dcinside', label: '디시인사이드', unit: '건 (키워드당)', min: 10, max: 200, def: 50, perUnit: 1, scope: 'keyword', effect: WIDER, sources: ['dcinside'], defaultOn: true },
  { key: 'threadsPosts', configKey: 'threads', label: 'Threads', unit: '건 (키워드당)', min: 10, max: 100, def: 30, perUnit: 1, scope: 'keyword', effect: WIDER, sources: ['threads'], defaultOn: true },
  { key: 'xPosts', configKey: 'x', label: 'X', unit: '건 (키워드당, 최근 7일)', min: 10, max: 100, def: 20, perUnit: 1, scope: 'keyword', effect: WIDER, sources: ['x'], defaultOn: true, metered: X_METERED },
  /**
   * 더쿠는 검색이 동작하지 않아 목록을 훑는다. 그래서 단위가 '키워드당 건수'가 아니라 '페이지'다.
   * 값을 키우면 더 오래된 글까지 내려가고, 그 안에서 키워드가 걸린 것만 남는다.
   * perUnit이 낮은 것은 페이지에 20건이 있어도 대부분 우리와 무관하기 때문이다(실측 70건 중 17건).
   */
  { key: 'theqooPages', configKey: 'theqoo', label: '더쿠', unit: '쪽 (게시판당, 1쪽=20건)', min: 1, max: 20, def: 5, perUnit: 5, scope: 'keyword', effect: DEEPER, sources: ['theqoo'], defaultOn: true },
] as const;

/** X 종량제 읽기 단가(달러). 2026-08 기준 1,000건당 $5 */
export const X_READ_COST_USD = 0.005;

/**
 * 종량제 API로 처음 실행할 때 쓰는 보수적인 기본값.
 * 저장한 값이 생기면 그 값이 우선하므로 강제 상한이 아니라 첫 시작점일 뿐이다.
 *
 * 배포판은 수집부터 브리핑까지를 요청 하나(최대 5분) 안에서 끝내므로 여기서 아껴 둔다.
 * 앱 리뷰는 최신순이라 값을 줄여도 최근 글은 그대로 들어오고, 줄어드는 것은 더 옛날
 * 리뷰까지 훑는 깊이뿐이다(OLDER 참고). 그래서 시간 예산을 이쪽에서 먼저 깎는다.
 */
export const API_COLLECT_DEFAULTS: Readonly<CollectLimits> = {
  appstorePages: 1,
  googlePlayReviewCount: 30,
  naverBlogDisplay: 10,
  naverCafeDisplay: 10,
  dcinsidePosts: 10,
  threadsPosts: 10,
  xPosts: 10,
  theqooPages: 2,
};

/** 소스 켜기/끄기 설정 키 */
const scoped = (key: string, settingScope?: string): string =>
  settingScope ? `${settingScope}.${key}` : key;

export const sourceEnabledKey = (k: SourceKey, settingScope?: string): string =>
  scoped(`sources.${k}`, settingScope);

const FIELD_BY_SOURCE = new Map<SourceKey, CollectLimitField>(
  COLLECT_LIMIT_FIELDS.map((f) => [f.configKey, f]),
);

/** 소스별 정의. 화면과 파이프라인이 같은 메타데이터를 본다 */
export const sourceField = (k: SourceKey): CollectLimitField | undefined => FIELD_BY_SOURCE.get(k);

/** '1', '0'만 저장된 값으로 인정한다. 빈 문자열과 없는 값은 '저장한 적 없음' */
function savedFlag(raw?: string): boolean | undefined {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return undefined;
}

/**
 * 어떤 소스를 돌릴지.
 *
 * 우선순위: 대시보드에서 끈 것 > 예전 키로 저장해 둔 것 > config.sources > 소스별 기본값.
 * `only`를 주면 그 소스 하나만 돌린다 (한 소스만 다시 훑어보고 싶을 때).
 */
export function resolveSources(
  config: RadarConfig,
  settings: Record<string, string> = {},
  only?: SourceKey,
  options: { settingScope?: string } = {},
): Record<SourceKey, boolean> {
  const out = {} as Record<SourceKey, boolean>;
  for (const k of SOURCE_KEYS) {
    if (only) {
      out[k] = k === only;
      continue;
    }
    const legacy = FIELD_BY_SOURCE.get(k)?.legacyConfigKey;
    const saved =
      savedFlag(settings[sourceEnabledKey(k, options.settingScope)]) ??
      (legacy
        ? savedFlag(settings[scoped(`sources.${legacy}`, options.settingScope)])
        : undefined);
    if (saved !== undefined) {
      out[k] = saved;
      continue;
    }
    const fromConfig = config.sources?.[k] ?? (legacy ? config.sources?.[legacy] : undefined);
    out[k] = fromConfig ?? FIELD_BY_SOURCE.get(k)?.defaultOn ?? true;
  }
  return out;
}

/** 문자열이 실제 소스 키인지 (URL, 폼 입력 검증용) */
export function asSourceKey(v: unknown): SourceKey | undefined {
  return SOURCE_KEYS.includes(v as SourceKey) ? (v as SourceKey) : undefined;
}

/** 대시보드 설정 키: 다른 설정과 섞이지 않게 접두사를 붙인다 */
export const collectLimitKey = (key: keyof CollectLimits, settingScope?: string): string =>
  scoped(`collect.${key}`, settingScope);

function pick(
  field: CollectLimitField,
  candidates: (string | number | undefined)[],
): number {
  for (const raw of candidates) {
    if (raw === undefined || raw === '') continue;
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= field.min && n <= field.max) return n;
  }
  return field.def;
}

export function resolveCollectLimits(
  config: RadarConfig,
  settings: Record<string, string> = {},
  options: { apiDefaults?: boolean; settingScope?: string } = {},
): CollectLimits {
  const c = (config.collect ?? {}) as Record<string, number | undefined>;
  const out = {} as CollectLimits;
  for (const f of COLLECT_LIMIT_FIELDS) {
    const saved = settings[collectLimitKey(f.key, options.settingScope)];
    const savedLegacy = f.legacyKey
      ? settings[scoped(`collect.${f.legacyKey}`, options.settingScope)]
      : undefined;
    // API 모드도 사용자가 화면에서 저장한 값은 존중한다. 아직 저장한 적이 없을 때만
    // 로컬 config의 큰 수집량 대신 종량제용 낮은 시작값을 쓴다.
    out[f.key] = pick(
      f,
      options.apiDefaults
        ? [saved, savedLegacy, API_COLLECT_DEFAULTS[f.key]]
        : [saved, savedLegacy, c[f.key], f.legacyKey ? c[f.legacyKey] : undefined],
    );
  }
  return out;
}

/**
 * 한 번 수집할 때 최대 몇 건이 들어오는지 추산.
 * 실제로는 검색 결과가 상한보다 적은 경우가 대부분이고, 중복은 저장 단계에서 걸러진다.
 *
 * **앱 소스는 '앱 개수'가 아니라 '조회 횟수'로 센다.** 한 앱을 국가별로 따로 조회하므로
 * 앱 3개를 세 국가에서 보면 조회가 9번이다. 앱 개수로 세면 추산이 국가 수만큼 적게 나오고,
 * 그 숫자를 보고 상한을 정하면 실제 수집량과 분류 호출이 예상을 크게 넘는다.
 * daily.ts가 만드는 작업 수와 같은 기준이어야 한다.
 */
export function estimateMaxPerRun(
  limits: CollectLimits,
  counts: { appstoreQueries: number; googlePlayQueries: number; keywords: number },
  enabled: Partial<Record<SourceKey, boolean>>,
): number {
  let total = 0;
  for (const f of COLLECT_LIMIT_FIELDS) {
    if (enabled[f.configKey] === false) continue;
    const n =
      f.scope === 'appstore'
        ? counts.appstoreQueries
        : f.scope === 'googleplay'
          ? counts.googlePlayQueries
          : counts.keywords;
    total += limits[f.key] * f.perUnit * n;
  }
  return total;
}

/**
 * 이번 실행에서 X 읽기로 나갈 예상 금액(달러).
 *
 * 다른 소스의 상한은 시간과 분류 호출만 늘리지만 이쪽은 그대로 청구된다. 중복 제거는
 * 저장 단계에서 일어나므로 **이미 본 글을 다시 읽어도 값은 그대로 나간다**. 그래서
 * 상한을 정하는 화면에서 금액을 함께 보여준다.
 */
export function estimateXCostUsd(
  limits: CollectLimits,
  keywords: number,
  enabled: Partial<Record<SourceKey, boolean>>,
): number {
  if (enabled.x === false) return 0;
  return limits.xPosts * keywords * X_READ_COST_USD;
}

/**
 * 이 주기로 계속 돌 때 X에 나갈 한 달 예상액.
 *
 * 회당 금액만 보면 싸 보인다. 실제 청구액은 그 값에 한 달 실행 횟수를 곱한 것이고,
 * 그 곱셈이 화면 어디에도 없으면 주기를 줄인 결과를 청구서로 알게 된다.
 * 자동 수집이 꺼져 있으면(주기 0) 수동 실행뿐이라 예측할 근거가 없어 0을 준다.
 */
export function estimateXMonthlyUsd(perRunUsd: number, intervalHours: number): number {
  if (!(intervalHours > 0) || perRunUsd <= 0) return 0;
  return perRunUsd * (24 / intervalHours) * 30;
}

/**
 * X 한 달 예산 상한(달러).
 *
 * 회당 상한(`xPosts`)은 한 번에 얼마를 쓸지만 정한다. 총액은 그 값에 실행 횟수를 곱한
 * 것이라 상한만으로는 정해지지 않는다. 상한을 키우거나 주기를 줄이면 총액이 몇 배가 되고,
 * 코드에는 그걸 멈출 것이 없었다. 그래서 누적 기준의 브레이크를 따로 둔다.
 *
 * X 개발자 포털에도 청구 주기당 지출 한도가 있다(마이그레이션 계정 기본 $400).
 * 이 값은 그보다 앞단이다. 여기서 걸리면 호출 자체가 나가지 않는다.
 *
 * **0은 '제한 없음'이 아니라 '쓰지 않음'이다.** 무제한을 기본값으로 두면 안전장치가 아니다.
 */
/**
 * X를 어느 경로로 읽을지.
 *
 * - `web`: 저장해 둔 로그인 세션으로 검색 페이지를 읽는다. **비용 0.** 세션이 없거나 막히면
 *   건너뛰고 화면에 사유를 남긴다. 계정 정지와 구조 변경을 감수하는 경로다.
 * - `api`: 공식 X API. 약관 안이고 안정적이지만 읽기 1건당 $0.005가 청구된다.
 *
 * **기본은 `web`이다.** 기본값이 과금 경로면 켜는 순간 돈이 나가기 시작한다. 돈이 드는 쪽은
 * 사람이 명시적으로 고르게 둔다.
 */
export const X_MODE_KEY = 'x.mode';
export const X_MODES = ['web', 'api'] as const;
export type XMode = (typeof X_MODES)[number];
export const X_MODE_DEFAULT: XMode = 'web';

export const xModeKey = (settingScope?: string): string => scoped(X_MODE_KEY, settingScope);

export function resolveXMode(
  settings: Record<string, string> = {},
  settingScope?: string,
): XMode {
  const raw = settings[xModeKey(settingScope)];
  return X_MODES.includes(raw as XMode) ? (raw as XMode) : X_MODE_DEFAULT;
}

/**
 * X 웹 경로의 요청 속도.
 *
 * **값 하나로 전부 스케일한다.** 키워드 사이, 페이지를 읽는 시간, 스크롤 사이가 각각 따로
 * 노출되면 조절할 것이 넷이 되는데, 셋은 기준 간격에 비례해 정하면 될 값이다. 기준만 받아
 * 나머지를 파생시키면 "얼마나 느긋하게 돌 것인가" 하나로 정리된다.
 *
 * 긴 휴식 확률은 따로 둔다. 이건 간격의 크기가 아니라 **편차**를 정하는 값이라 성격이 다르다.
 * 0으로 두면 긴 휴식이 사라져 간격이 늘 비슷해지고, 그 일정함이 기계의 특징이 된다.
 */
export const X_GAP_KEY = 'x.gapSeconds';
export const X_GAP_MIN = 3;
export const X_GAP_MAX = 120;
export const X_GAP_DEFAULT = 8;

export const X_LONG_BREAK_KEY = 'x.longBreakPct';
export const X_LONG_BREAK_MIN = 0;
export const X_LONG_BREAK_MAX = 50;
export const X_LONG_BREAK_DEFAULT = 15;

export const xGapKey = (settingScope?: string): string => scoped(X_GAP_KEY, settingScope);
export const xLongBreakKey = (settingScope?: string): string =>
  scoped(X_LONG_BREAK_KEY, settingScope);

/** 긴 휴식의 배수 범위. 기준 간격 상한의 몇 배까지 쉬는지 */
export const X_LONG_BREAK_MULT: readonly [number, number] = [2, 6];

export interface XPace {
  /** 키워드 사이 (ms) */
  gap: readonly [number, number];
  /** 페이지가 뜬 뒤 읽는 시간 (ms) */
  read: readonly [number, number];
  /** 스크롤 사이 (ms) */
  scroll: readonly [number, number];
  /** 긴 휴식이 끼어들 확률 (0~1) */
  longBreakChance: number;
}

function clampNumber(raw: string | undefined, min: number, max: number, def: number): number {
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
}

export function resolveXPace(
  settings: Record<string, string> = {},
  settingScope?: string,
): XPace {
  const seconds = clampNumber(
    settings[xGapKey(settingScope)],
    X_GAP_MIN,
    X_GAP_MAX,
    X_GAP_DEFAULT,
  );
  const pct = clampNumber(
    settings[xLongBreakKey(settingScope)],
    X_LONG_BREAK_MIN,
    X_LONG_BREAK_MAX,
    X_LONG_BREAK_DEFAULT,
  );
  const base = seconds * 1000;
  return {
    gap: [base, base * 2.4],
    read: [base * 0.45, base * 0.8],
    scroll: [base * 0.2, base * 0.4],
    longBreakChance: pct / 100,
  };
}

/**
 * 한 번 쉴 때의 기대 대기 시간(ms).
 *
 * 짧은 쪽은 `min + (max-min) * u^2.2`이고 균등분포 u에 대해 `E[u^2.2] = 1/3.2`이다.
 * 긴 휴식은 상한의 2~6배라 기대값이 4배다. 두 경우를 확률로 섞는다.
 */
function expectedPauseMs(range: readonly [number, number], chance: number): number {
  const [min, max] = range;
  const [lo, hi] = X_LONG_BREAK_MULT;
  const short = min + (max - min) / 3.2;
  return (1 - chance) * short + chance * max * ((lo + hi) / 2);
}

/**
 * 한 키워드에서 스크롤을 몇 번 돌지.
 *
 * 가져올 건수에 비례한다. X 타임라인은 한 번 내릴 때 대략 7건이 새로 붙어서, 상한이 크면
 * 그만큼 더 내려야 채워진다. 수집기의 루프 상한(12)을 넘지는 않는다.
 * 고정값으로 두면 상한을 줄여도 예상 시간이 그대로여서, 줄인 효과가 화면에 보이지 않는다.
 */
const PER_SCROLL_ITEMS = 7;
const MAX_SCROLL_ROUNDS = 12;

function scrollRounds(posts: number): number {
  return Math.min(MAX_SCROLL_ROUNDS, Math.max(1, Math.ceil(posts / PER_SCROLL_ITEMS)));
}

export interface XPaceView {
  /** 입력칸 기본값 */
  gapSeconds: number;
  longBreakPct: number;
  /** 짧은 쪽 간격 범위(초) */
  shortSec: [number, number];
  /** 긴 휴식 범위(초) */
  longSec: [number, number];
  longPct: number;
  /** 키워드 수를 넘겼을 때 한 번 수집의 기대 소요(분) */
  runMinutes: number;
  /**
   * 그중 간격만으로 쓰는 시간(분).
   *
   * 상한을 줄여도 시간이 별로 안 줄어드는 경우가 있다. 스크롤만 상한에 비례하고 키워드 사이
   * 간격은 그대로이기 때문이다. 어느 쪽을 만져야 하는지 알려면 두 값이 갈려 있어야 한다.
   */
  gapMinutes: number;
}

/**
 * 이 설정이면 간격이 실제로 어떤 범위로 나오는지. 값을 정하는 화면에서 같이 보여준다.
 *
 * 입력칸에 적는 값은 **하한**이고 상한은 그 2.4배다. 그 관계를 화면에 적어 주지 않으면
 * "8초"를 8초 고정으로 읽는다.
 */
export function describeXPace(
  settings: Record<string, string> = {},
  keywords = 1,
  posts = X_GAP_DEFAULT,
  settingScope?: string,
): XPaceView {
  const pace = resolveXPace(settings, settingScope);
  const [lo, hi] = X_LONG_BREAK_MULT;
  // 키워드 사이와 페이지 로드 뒤 대기는 상한과 무관한 고정비다
  const fixedMs =
    expectedPauseMs(pace.gap, pace.longBreakChance) +
    expectedPauseMs(pace.read, pace.longBreakChance);
  const scrollMs = scrollRounds(posts) * expectedPauseMs(pace.scroll, pace.longBreakChance);
  const toMin = (ms: number) => Math.max(1, Math.round((ms * keywords) / 60_000));
  return {
    gapSeconds: Math.round(pace.gap[0] / 1000),
    longBreakPct: Math.round(pace.longBreakChance * 100),
    shortSec: [Math.round(pace.gap[0] / 1000), Math.round(pace.gap[1] / 1000)],
    longSec: [Math.round((pace.gap[1] * lo) / 1000), Math.round((pace.gap[1] * hi) / 1000)],
    longPct: Math.round(pace.longBreakChance * 100),
    runMinutes: toMin(fixedMs + scrollMs),
    gapMinutes: toMin(fixedMs),
  };
}

/**
 * 웹 경로가 막혔을 때 남기는 사유. 화면이 이 값을 읽어 배너를 띄운다.
 *
 * 스크래핑이 깨지는 방식은 예외가 아니라 **조용한 0건**이다. 그대로 두면 "글이 없어서 0건"과
 * 구별되지 않아, 정지된 걸 몇 주 뒤에 안다. 그래서 막힌 사유를 반드시 기록한다.
 */
export const X_WEB_BLOCKED_KEY = 'x.webBlocked';
export const xWebBlockedKey = (settingScope?: string): string =>
  scoped(X_WEB_BLOCKED_KEY, settingScope);

export const X_BUDGET_KEY = 'x.monthlyBudgetUsd';
export const X_BUDGET_MIN = 0;
export const X_BUDGET_MAX = 1000;
export const X_BUDGET_DEFAULT = 50;

export const xBudgetKey = (settingScope?: string): string => scoped(X_BUDGET_KEY, settingScope);

/** 이번 달 누적 읽기 건수를 담는 키. 달이 바뀌면 키가 바뀌어 저절로 리셋된다 */
export const xReadsKey = (month: string, settingScope?: string): string =>
  scoped(`x.reads.${month}`, settingScope);

/** 'YYYY-MM'. 로컬 날짜 기준이라 청구 주기와 하루쯤 어긋날 수 있다 (브레이크 용도라 그 정도면 된다) */
export const xUsageMonth = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function resolveXBudgetUsd(
  settings: Record<string, string> = {},
  settingScope?: string,
): number {
  const raw = settings[xBudgetKey(settingScope)];
  if (raw === undefined || raw === '') return X_BUDGET_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= X_BUDGET_MIN && n <= X_BUDGET_MAX ? n : X_BUDGET_DEFAULT;
}

/** 이번 달 이미 읽은 건수 */
export function xReadsThisMonth(
  settings: Record<string, string> = {},
  month = xUsageMonth(),
  settingScope?: string,
): number {
  const n = Number(settings[xReadsKey(month, settingScope)]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 예산에서 앞으로 더 읽어도 되는 건수 */
export function xRemainingReads(budgetUsd: number, readsSoFar: number): number {
  return Math.max(0, Math.floor(budgetUsd / X_READ_COST_USD) - readsSoFar);
}


/**
 * 추산 건수를 분류 호출 횟수로 바꾼다.
 *
 * 비용은 건수가 아니라 **호출 횟수**로 결정된다. CLI 태거는 25건을 한 프롬프트에 묶어
 * 한 번 부르고, 호출마다 Claude Code 자체 시스템 프롬프트(실측 약 3만 토큰)를 싣는다.
 * 그래서 "몇 건 수집"보다 "몇 번 부를 것"이 실제 비용에 가깝다.
 *
 * 이미 쌓여 있는 미분류 건도 같은 실행에서 함께 처리되므로 더해서 센다.
 */
export const TAG_BATCH_SIZE = 25;
export const TAG_BATCH_MIN = 1;
export const TAG_BATCH_MAX = 100;

/** 한 호출에 담을 글 수 설정 키 */
export const TAG_BATCH_KEY = 'tagBatchSize';
export const tagBatchSettingKey = (settingScope?: string): string =>
  scoped(TAG_BATCH_KEY, settingScope);

/** 대시보드에서 저장한 배치 크기. 범위를 벗어나거나 없으면 기본값 */
export function resolveTagBatchSize(
  settings: Record<string, string> = {},
  settingScope?: string,
): number {
  const n = Math.round(Number(settings[tagBatchSettingKey(settingScope)]));
  return Number.isFinite(n) && n >= TAG_BATCH_MIN && n <= TAG_BATCH_MAX ? n : TAG_BATCH_SIZE;
}

/**
 * 첫 호출들의 크기. 뒤로 갈수록 커진다.
 *
 * 배치가 클수록 호출 수가 줄어 효율은 좋은데, 첫 결과가 나오기까지 1분 넘게 걸린다.
 * 그동안 진행 바가 0%에 멈춰 있어서 사람 눈에는 고장과 구별되지 않는다. 앞의 두세 번을
 * 작게 잡으면 30초 안에 숫자가 움직이기 시작하고, 그 뒤는 상한까지 키워 효율을 되찾는다.
 * 앞 세 호출의 지시부가 몇 번 더 나가지만 그건 캐시가 맞는 구간이라 값이 거의 없다.
 */
export const TAG_RAMP = [5, 10, 20] as const;

/**
 * 전체 건수를 호출별 크기 목록으로 나눈다. 예: 100건, 상한 25 → [5, 10, 20, 25, 25, 15]
 *
 * 배치 크기가 호출마다 다르므로 나눗셈으로는 호출 수를 셀 수 없다. 계획을 먼저 만들어
 * 두면 화면에 "N번째 / 전체 M번"을 정확히 띄울 수 있고, 비용 추산도 같은 값을 쓴다.
 */
export function planTagBatches(total: number, max = TAG_BATCH_SIZE): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(total));
  for (const size of TAG_RAMP) {
    if (left <= 0) return out;
    // 상한을 램프보다 작게 설정했으면 상한이 이긴다 (사용자가 지정한 값이 우선)
    const n = Math.min(size, max, left);
    out.push(n);
    left -= n;
  }
  while (left > 0) {
    const n = Math.min(max, left);
    out.push(n);
    left -= n;
  }
  return out;
}

export function estimateTagCalls(
  newItems: number,
  pendingItems = 0,
  max = TAG_BATCH_SIZE,
): number {
  return planTagBatches(newItems + pendingItems, max).length;
}
