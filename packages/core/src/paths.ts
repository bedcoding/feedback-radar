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
      `.env 자동 로드를 건너뜁니다 — Node ${process.version}에는 process.loadEnvFile이 없습니다 (20.12 이상 필요). ` +
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
  appstore?: { appId: string; country?: string };
  googlePlay?: { appId: string; lang?: string; country?: string };
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
