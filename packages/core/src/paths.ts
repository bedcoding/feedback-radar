import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

/**
 * private/.env → 레포 루트 .env 순으로 1회 로드한다.
 * 수집 프로세스뿐 아니라 웹(Next.js)에서도 호출해야 DB_PATH 같은 값이 양쪽에 동일하게 적용된다.
 */
export function loadPrivateEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (typeof process.loadEnvFile !== 'function') {
    console.warn(
      `.env 자동 로드를 건너뜁니다. Node ${process.version}에는 process.loadEnvFile이 없습니다 (20.12 이상 필요). ` +
        '환경변수를 직접 export하거나 Node를 올려 주세요.',
    );
    return;
  }
  const root = findRepoRoot();
  for (const p of [path.join(root, 'private', '.env'), path.join(root, '.env')]) {
    if (!fs.existsSync(p)) continue;
    try {
      process.loadEnvFile(p);
      return;
    } catch (e) {
      console.warn(`.env 로드 실패 (${p}):`, (e as Error).message);
    }
  }
}

/** cwd에서 위로 올라가며 feedback-radar.config(.example).json이 있는 레포 루트를 찾는다 */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'feedback-radar.config.example.json')) ||
      fs.existsSync(path.join(dir, 'feedback-radar.config.json'))
    )
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/**
 * 비공개 파일 전용 폴더 — 여기만 gitignore되고, 다른 머신으로 옮길 때 이 폴더 하나만 압축하면 된다.
 * 내용물: 테넌트 설정, .env, DB(data/), 리포트(reports/), 내부 문서
 */
export function privateDir(): string {
  const dir = path.join(findRepoRoot(), 'private');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function defaultDbPath(): string {
  loadPrivateEnv();
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.join(privateDir(), 'data', 'feedback-radar.db');
}

export function reportsDir(): string {
  return path.join(privateDir(), 'reports');
}

/** 모니터링 대상 서비스 하나 */
export interface ServiceConfig {
  /** 화면·리포트에 표시할 이름 */
  name: string;
  /** 이 서비스를 찾을 웹 검색 키워드 */
  keywords: string[];
  /**
   * `countries`가 스토어 국가 목록이고, `country`는 그중 첫 번째를 구버전 호환으로 남긴 값이다.
   * 읽을 때는 둘을 직접 보지 말고 storeCountries()를 쓴다.
   */
  appstore?: { appId: string; country?: string; countries?: string[] };
  googlePlay?: { appId: string; lang?: string; country?: string; countries?: string[] };
  /** 이 서비스에만 적용할 관련성 힌트 (전역 설정에 더해진다) */
  relevanceHints?: string[];
  excludeHints?: string[];
}

export interface RadarConfig {
  /** 설정 파일을 여러 개 굴릴 때 사람이 구분하려고 붙이는 이름 — 코드는 쓰지 않는다 */
  tenant?: string;
  displayName: string;
  /**
   * 여러 서비스를 한 대시보드에서 추적할 때 쓴다 (계열 서비스 묶음 등).
   * 비워 두면 아래 keywords·appstore·googlePlay를 서비스 하나로 취급한다 — 구버전 설정 호환.
   */
  services?: ServiceConfig[];
  keywords: string[];
  appstore?: { appId: string; country: string };
  googlePlay?: { appId: string; lang: string; country: string };
  sources: Record<string, boolean>;
  /** 소스별 1회 수집 상한. 대시보드에서 저장한 값이 있으면 그쪽이 우선한다 (collect-limits.ts) */
  collect?: {
    googlePlayReviewCount?: number;
    appstorePages?: number;
    naverDisplay?: number;
    dcinsidePosts?: number;
    threadsPosts?: number;
  };
  /** LLM 태거 시스템 프롬프트에 주입할 서비스 도메인 용어·분류 힌트 (테넌트별로 작성) */
  domainPrompt?: string;
  /**
   * 휴리스틱 관련성 필터용 문맥 단어. 짧은 검색 키워드(동음이의어)가 걸렸을 때
   * 이 단어들 중 하나가 같이 나와야 우리 서비스 글로 인정한다 (예: 업종 용어, 자체 재화 이름).
   * LLM 태거는 이것 없이도 문맥으로 판단한다.
   */
  relevanceHints?: string[];
  /**
   * 휴리스틱 태거의 카테고리 판별 키워드에 **더할** 서비스·업종 특화 용어.
   * 코드의 기본 사전은 업종 중립이라, 자체 재화 이름이나 업계 용어는 여기에 적는다.
   * 예: { "결제/코인": ["<자체 재화 이름>"], "콘텐츠/작품": ["<콘텐츠 단위 용어>"] }
   */
  categoryKeywords?: Record<string, string[]>;
  /**
   * 이 단어가 같이 나오면 우리 서비스 글이 아니라고 본다 (동음이의어 차단).
   * relevanceHints("있어야 관련")의 반대편으로, 노이즈가 특정 분야에 몰릴 때 효과가 크다.
   * 예: 브랜드명이 치과 재료·공예 재료 이름과 같다면 그 분야 단어들을 적는다.
   */
  excludeHints?: string[];
  /** 발표 자료(/pitch)의 시간 절감 계산에 쓰는 가정치 — 화면에 가정임을 함께 표기한다 */
  pitch?: {
    /** 사람이 글 1건을 읽고 분류·판단하는 데 걸리는 시간(초). 기본 30 */
    secondsPerItem?: number;
    /** 자동 생성된 브리핑 1장을 확인하는 데 걸리는 시간(분). 기본 10 */
    briefingMinutes?: number;
  };
}

/** private/feedback-radar.config.json → (구버전 호환) 루트 → example 순으로 찾는다 */
function configCandidates(): string[] {
  const root = findRepoRoot();
  return [
    path.join(root, 'private', 'feedback-radar.config.json'),
    path.join(root, 'feedback-radar.config.json'),
  ];
}

/**
 * 실제 테넌트 설정(비공개)이 있는지 여부.
 * false면 example 템플릿으로 동작 중이라는 뜻 — 클론 직후 상태이므로
 * 화면에는 서비스명 대신 자리표시자를 보여준다.
 */
export function hasPrivateConfig(): boolean {
  return configCandidates().some((p) => fs.existsSync(p));
}

/**
 * 설정을 서비스 목록으로 정규화한다.
 * services가 있으면 그대로, 없으면 최상위 keywords·appId를 서비스 하나로 본다.
 * 덕분에 기존 단일 서비스 설정이 그대로 동작한다.
 */
export function resolveServices(config: RadarConfig): ServiceConfig[] {
  if (config.services?.length) {
    return config.services.map((s) => ({
      ...s,
      relevanceHints: [...(config.relevanceHints ?? []), ...(s.relevanceHints ?? [])],
      excludeHints: [...(config.excludeHints ?? []), ...(s.excludeHints ?? [])],
    }));
  }
  return [
    {
      name: config.displayName,
      keywords: config.keywords,
      appstore: config.appstore,
      googlePlay: config.googlePlay,
      relevanceHints: config.relevanceHints,
      excludeHints: config.excludeHints,
    },
  ];
}

export function loadConfig(): RadarConfig {
  for (const p of configCandidates()) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) as RadarConfig;
  }
  const example = path.join(findRepoRoot(), 'feedback-radar.config.example.json');
  console.warn(
    'private/feedback-radar.config.json이 없어 example 설정을 사용합니다. 복사해서 서비스에 맞게 수정하세요.',
  );
  return JSON.parse(fs.readFileSync(example, 'utf8')) as RadarConfig;
}

/**
 * 설정 파일을 저장한다. 대시보드에서 추적 서비스를 추가하거나 지울 때 쓴다.
 *
 * 항상 private/ 안에 쓴다(구버전 루트 경로로는 쓰지 않는다). 덮어쓰기 전에 `.bak` 한 벌을
 * 남기는데, 앱 ID와 도메인 사전을 다시 채우는 비용이 커서 실수로 날리면 복구가 번거롭기 때문이다.
 */
export function saveConfig(config: RadarConfig): void {
  const target = path.join(privateDir(), 'feedback-radar.config.json');
  if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * 저장용 서비스 배열.
 *
 * **여기서 resolveServices()를 쓰면 안 된다.** 그 함수는 전역 relevanceHints와 excludeHints를
 * 각 서비스에 병합해서 돌려준다. 그 결과를 그대로 파일에 쓰면 다음 저장에서 또 병합되어
 * 힌트가 저장할 때마다 불어난다. 파일에 쓸 값은 병합 전 원본이어야 한다.
 */
export function rawServices(config: RadarConfig): ServiceConfig[] {
  if (config.services?.length) return config.services;
  // services가 없던 설정은 최상위 값이 서비스 하나였다. 그걸 배열로 승격한다.
  return [
    {
      name: config.displayName,
      keywords: config.keywords,
      appstore: config.appstore,
      googlePlay: config.googlePlay,
    },
  ];
}

/** 화면에서 받은 새 서비스 입력값 */
export interface ServiceInput {
  name: string;
  keywords: string[];
  /** 앱스토어 숫자 ID (스토어 URL의 id 뒤 숫자) */
  appstoreId?: string;
  /** 구글플레이 패키지명 (스토어 URL의 id 파라미터) */
  googlePlayId?: string;
  /**
   * 스토어 국가 코드 목록. 비우면 kr 하나.
   *
   * 같은 앱이라도 국가를 바꾸면 리뷰 풀이 통째로 달라지므로, 해외에 서비스하는 앱은
   * 국가를 여러 개 넣어야 반응이 다 들어온다. 국내 스토어에 없는 앱을 kr로 두면
   * 응답이 비어서 수집이 오류 없이 0건으로 끝난다.
   */
  countries?: string[];
}

/**
 * 스토어 국가에서 언어 코드를 유추한다.
 *
 * 대부분 국가 코드와 언어 코드가 같아서(fr/fr, de/de) 화면에서 둘을 따로 받지 않는다.
 * 다른 것만 표로 둔다.
 *
 * 다만 lang은 보조 값일 뿐이다. 실측하면 스토어가 돌려주는 리뷰 언어는 lang이 아니라
 * 그 앱의 주 사용자층이 결정한다 (국가를 us로 두고 조회해도 프랑스어나 태국어 리뷰가 온다).
 * 실질적인 스위치는 country다.
 */
const LANG_BY_COUNTRY: Record<string, string> = {
  kr: 'ko',
  jp: 'ja',
  cn: 'zh',
  tw: 'zh',
  hk: 'zh',
  us: 'en',
  gb: 'en',
  au: 'en',
  ca: 'en',
  br: 'pt',
  mx: 'es',
};

export function langFor(country: string): string {
  return LANG_BY_COUNTRY[country.trim().toLowerCase()] ?? country.trim().toLowerCase();
}

/**
 * 조회할 스토어 국가 목록. 설정이 단수(country)든 복수(countries)든 여기로 통일해 읽는다.
 *
 * 국가가 아예 없으면 kr로 본다 — 앱 ID가 있는데 국가가 없는 설정은 구버전이고,
 * 그때는 국내 스토어만 조회하고 있었다.
 */
export function storeCountries(store?: { country?: string; countries?: string[] }): string[] {
  if (!store) return [];
  const list = store.countries?.length ? store.countries : store.country ? [store.country] : ['kr'];
  // 중복을 걷어낸다 — 같은 국가를 두 번 조회하면 호출만 늘고 결과는 UNIQUE 제약에 막힌다
  return [...new Set(list.map((c) => c.trim().toLowerCase()).filter(Boolean))];
}

/**
 * 국가 코드를 국기 이모지로. 'kr' → 🇰🇷
 *
 * 지역 표시 기호(Regional Indicator) 두 개를 이으면 그 나라 국기가 된다. 국가별 이모지를
 * 표로 관리하지 않아도 되고, 새 국가를 추가해도 이 함수를 고칠 일이 없다.
 */
export function countryFlag(code: string): string {
  const cc = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 97));
}

// Intl 인스턴스를 호출마다 만들면 느리다. 국가 목록은 런타임에 바뀌지 않으니 한 번만 만든다.
const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['ko'], { type: 'region' });
  } catch {
    return undefined;
  }
})();

/** 국가 코드의 한국어 이름. 'kr' → '대한민국'. 모르는 코드는 대문자 코드를 그대로 돌려준다 */
export function countryName(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return cc;
  try {
    return REGION_NAMES?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/**
 * 실제로 존재하는 국가 코드인지.
 *
 * 형식 검사만으로는 오타를 잡을 수 없다. 'jp'를 'ip'로 잘못 쓰면 두 글자 소문자라
 * 형식은 통과하고, 지역 표시 기호 조합도 성립해서 국기까지 렌더된다(🇮🇵). 그러면
 * 화면상 멀쩡해 보이는데 수집만 조용히 0건이 된다. Intl은 모르는 코드에 대해
 * 코드 자체를 돌려주므로 그걸로 가른다.
 *
 * Intl 지역 데이터가 없는 런타임에서는 모든 코드가 미지로 나와 정상 국가까지 막히므로,
 * 그 경우에는 판단을 포기하고 통과시킨다 (형식 검사는 이미 통과한 값이다).
 */
export function isKnownCountry(code: string): boolean {
  if (!REGION_NAMES) return true;
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return false;
  return countryName(cc) !== cc;
}

export interface ConfigChange {
  config: RadarConfig;
  /** 값이 있으면 저장하지 않고 이 사유를 화면에 보여준다 */
  error?: string;
}

/**
 * 앱 ID 형식 검증.
 *
 * 형식만 본다. 실제로 존재하는 앱인지는 첫 수집에서 0건으로 드러난다. 그래도 형식을 막는
 * 이유는, 오타가 들어가면 수집이 조용히 0건이 되어 '리뷰가 없는 앱'과 구분이 안 되기 때문이다.
 */
function appIdError(
  appstoreId?: string,
  googlePlayId?: string,
  countries?: string[],
): string | undefined {
  if (appstoreId && !/^\d{6,12}$/.test(appstoreId)) {
    return '앱스토어 ID는 숫자만 넣습니다 (스토어 URL의 id 뒤 숫자).';
  }
  if (googlePlayId && !/^[a-zA-Z][\w.]*\.[\w.]+$/.test(googlePlayId)) {
    return '구글플레이는 패키지명을 넣습니다 (예: com.example.app).';
  }
  const bad = (countries ?? []).find((c) => !/^[a-z]{2}$/i.test(c));
  if (bad) return `국가는 두 글자 코드입니다 (예: kr, us, jp). '${bad}'는 형식이 아닙니다.`;
  // 형식은 맞지만 없는 국가인 경우. 여기서 막지 않으면 수집이 오류 없이 0건으로 끝난다.
  const unknown = (countries ?? []).find((c) => !isKnownCountry(c));
  if (unknown) return `'${unknown}'은 없는 국가 코드입니다 (오타 확인: kr, us, jp, fr, de, th, tw).`;
  if ((countries?.length ?? 0) > 8) {
    // 국가 하나가 스토어 호출 한 번이다. 앱 두 개에 국가 여덟 개면 한 번 수집에 16회 호출이 붙는다.
    return '국가는 8개까지 넣습니다 (국가마다 스토어를 따로 조회합니다).';
  }
  return undefined;
}

/** 입력받은 국가 목록을 정리한다. 아무것도 없으면 kr 하나로 본다 */
function normalizeCountries(input?: string[]): string[] {
  const list = (input ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  return list.length ? [...new Set(list)] : ['kr'];
}

/**
 * 화면 제목(displayName) 변경.
 *
 * 이 값은 화면 제목이면서 **LLM 프롬프트에도 들어간다** ("너는 '{displayName}' 서비스의
 * 고객 피드백 분류 담당자다"). 분류 기준이 되는 문장이라 너무 넓거나 엉뚱하면 판정이 흔들린다.
 */
export function updateDisplayName(config: RadarConfig, displayName: string): ConfigChange {
  const trimmed = displayName.trim();
  if (!trimmed) return { config, error: '화면 제목을 입력하세요.' };
  if (trimmed.length > 40) return { config, error: '화면 제목은 40자 이내로 넣습니다.' };
  return { config: { ...config, displayName: trimmed } };
}

/**
 * 분류 프롬프트에 주입되는 두 값을 바꾼다.
 *
 * domainPrompt는 "이 업종에서 이 단어가 무슨 뜻인지"를 알려 주는 문단이고, excludeHints는
 * 동음이의어로 걸린 글을 걷어내는 단어 목록이다. 둘 다 판정 품질을 직접 좌우하는데
 * 지금까지는 설정 파일을 손으로 고쳐야 했다. 오탐을 발견한 사람이 그 자리에서 고칠 수
 * 있어야 판정이 개선된다.
 *
 * 길이를 제한하는 이유: 이 문단은 **호출마다** 프롬프트 앞부분에 함께 실린다.
 */
export function updatePromptConfig(
  config: RadarConfig,
  input: { domainPrompt: string; excludeHints: string[] },
): ConfigChange {
  const domainPrompt = input.domainPrompt.trim();
  if (domainPrompt.length > 4000) {
    return {
      config,
      error: `도메인 지식은 4000자 이내로 넣습니다 (지금 ${domainPrompt.length}자, 호출마다 함께 전송됩니다).`,
    };
  }
  const excludeHints = [...new Set(input.excludeHints.map((h) => h.trim()).filter(Boolean))];
  if (excludeHints.length > 100) {
    return { config, error: `제외 단어는 100개 이내로 넣습니다 (지금 ${excludeHints.length}개).` };
  }
  return {
    config: {
      ...config,
      // 빈 값은 키를 없앤다. 빈 문자열이 남으면 프롬프트에 의미 없는 빈 줄이 생긴다
      domainPrompt: domainPrompt || undefined,
      excludeHints: excludeHints.length > 0 ? excludeHints : undefined,
    },
  };
}

/**
 * 추적 서비스를 추가한다.
 *
 * 검증에 걸리면 config를 그대로 돌려주고 사유를 담는다. 잘못된 값이 들어가면 수집이
 * 조용히 0건이 되거나(앱 ID 오타) 엉뚱한 검색이 돌아 LLM 호출만 낭비된다.
 */
export function addServiceToConfig(config: RadarConfig, input: ServiceInput): ConfigChange {
  const name = input.name.trim();
  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
  if (!name) return { config, error: '서비스 이름을 입력하세요.' };
  if (keywords.length === 0) return { config, error: '검색 키워드를 최소 하나 입력하세요.' };

  const current = rawServices(config);
  if (current.some((s) => s.name === name)) {
    return { config, error: `'${name}'은 이미 추적 중입니다.` };
  }
  const appstoreId = input.appstoreId?.trim();
  const googlePlayId = input.googlePlayId?.trim();
  const countries = normalizeCountries(input.countries);
  const idError = appIdError(appstoreId, googlePlayId, countries);
  if (idError) return { config, error: idError };

  // country에는 첫 국가를 남긴다 — countries를 모르는 구버전 코드가 읽어도 동작하게
  const added: ServiceConfig = {
    name,
    keywords,
    ...(appstoreId ? { appstore: { appId: appstoreId, country: countries[0], countries } } : {}),
    ...(googlePlayId
      ? {
          googlePlay: {
            appId: googlePlayId,
            lang: langFor(countries[0]),
            country: countries[0],
            countries,
          },
        }
      : {}),
  };
  return { config: { ...config, services: [...current, added] } };
}

/**
 * 이미 있는 서비스의 검색 키워드와 앱 ID를 고친다.
 *
 * 이름은 바꾸지 않는다. items.service에 이름이 그대로 들어 있어서, 이름을 바꾸면
 * 지금까지 모은 글이 어느 서비스 것인지 알 수 없게 된다(이름을 바꾸려면 새로 추가해야 한다).
 * relevanceHints처럼 화면에서 다루지 않는 값은 기존 것을 유지한다.
 */
export function updateServiceInConfig(
  config: RadarConfig,
  name: string,
  input: Omit<ServiceInput, 'name'>,
): ConfigChange {
  const current = rawServices(config);
  const idx = current.findIndex((s) => s.name === name);
  if (idx === -1) return { config, error: `'${name}'을 찾지 못했습니다.` };

  const keywords = input.keywords.map((k) => k.trim()).filter(Boolean);
  if (keywords.length === 0) return { config, error: '검색 키워드를 최소 하나 남겨야 합니다.' };

  const appstoreId = input.appstoreId?.trim();
  const googlePlayId = input.googlePlayId?.trim();
  const before = current[idx];
  // 국가를 비우면 기존 값을 지킨다 (모르고 비웠을 때 kr로 되돌아가면 해외 앱 수집이 끊긴다)
  const kept = storeCountries(before.googlePlay ?? before.appstore);
  const countries = input.countries?.some((c) => c.trim())
    ? normalizeCountries(input.countries)
    : kept.length
      ? kept
      : ['kr'];
  const idError = appIdError(appstoreId, googlePlayId, countries);
  if (idError) return { config, error: idError };

  const next = [...current];
  next[idx] = {
    ...before,
    keywords,
    // 빈 값으로 저장하면 그 소스를 끄는 뜻이다. JSON에서 키가 사라진다.
    appstore: appstoreId
      ? { appId: appstoreId, country: countries[0], countries }
      : undefined,
    googlePlay: googlePlayId
      ? {
          appId: googlePlayId,
          lang: langFor(countries[0]),
          country: countries[0],
          countries,
        }
      : undefined,
  };
  return { config: { ...config, services: next } };
}

/** 추적 서비스를 지운다. 이미 수집된 글은 남는다(그 서비스 이름으로 계속 조회할 수 있다) */
export function removeServiceFromConfig(config: RadarConfig, name: string): ConfigChange {
  const current = rawServices(config);
  const next = current.filter((s) => s.name !== name);
  if (next.length === current.length) return { config, error: `'${name}'을 찾지 못했습니다.` };
  // 전부 지우면 수집 대상이 없어져 파이프라인이 자리표시자를 검색하게 된다
  if (next.length === 0) return { config, error: '마지막 서비스는 지울 수 없습니다.' };
  return { config: { ...config, services: next } };
}
