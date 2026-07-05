import fs from 'node:fs';
import path from 'node:path';

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
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.join(privateDir(), 'data', 'feedback-radar.db');
}

export function reportsDir(): string {
  return path.join(privateDir(), 'reports');
}

export interface RadarConfig {
  tenant: string;
  displayName: string;
  keywords: string[];
  appstore?: { appId: string; country: string };
  googlePlay?: { appId: string; lang: string; country: string };
  sources: Record<string, boolean>;
  collect?: { googlePlayReviewCount?: number; appstorePages?: number; naverDisplay?: number };
  /** LLM 태거 시스템 프롬프트에 주입할 서비스 도메인 용어·분류 힌트 (테넌트별로 작성) */
  domainPrompt?: string;
  /**
   * 휴리스틱 관련성 필터용 문맥 단어. 짧은 검색 키워드(동음이의어)가 걸렸을 때
   * 이 단어들 중 하나가 같이 나와야 우리 서비스 글로 인정한다 (예: "웹툰", "만화").
   * LLM 태거는 이것 없이도 문맥으로 판단한다.
   */
  relevanceHints?: string[];
}

/** private/feedback-radar.config.json → (구버전 호환) 루트 → example 순으로 찾는다 */
export function loadConfig(): RadarConfig {
  const root = findRepoRoot();
  const candidates = [
    path.join(root, 'private', 'feedback-radar.config.json'),
    path.join(root, 'feedback-radar.config.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')) as RadarConfig;
  }
  const example = path.join(root, 'feedback-radar.config.example.json');
  console.warn(
    'private/feedback-radar.config.json이 없어 example 설정을 사용합니다. 복사해서 서비스에 맞게 수정하세요.',
  );
  return JSON.parse(fs.readFileSync(example, 'utf8')) as RadarConfig;
}
