import fs from 'node:fs';
import path from 'node:path';

/** cwd에서 위로 올라가며 feedback-radar.config(.example).json이 있는 레포 루트를 찾는다 */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'feedback-radar.config.json')) ||
      fs.existsSync(path.join(dir, 'feedback-radar.config.example.json'))
    )
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function defaultDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  return path.join(findRepoRoot(), 'data', 'feedback-radar.db');
}

export function reportsDir(): string {
  return path.join(findRepoRoot(), 'reports');
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
}

export function loadConfig(): RadarConfig {
  const root = findRepoRoot();
  const real = path.join(root, 'feedback-radar.config.json');
  if (fs.existsSync(real)) return JSON.parse(fs.readFileSync(real, 'utf8')) as RadarConfig;
  const example = path.join(root, 'feedback-radar.config.example.json');
  console.warn('feedback-radar.config.json이 없어 feedback-radar.config.example.json을 사용합니다. 복사해서 서비스에 맞게 수정하세요.');
  return JSON.parse(fs.readFileSync(example, 'utf8')) as RadarConfig;
}
