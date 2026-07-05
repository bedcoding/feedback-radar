import type { Tagger } from '../types.js';
import { createClaudeTagger } from './claude.js';
import { createClaudeCliTagger, isClaudeCliAvailable } from './claude-cli.js';
import { heuristicTagger } from './heuristic.js';

/**
 * 태거 선택 우선순위:
 * 1. TAGGER_MODE 환경변수로 강제 (cli | api | heuristic)
 * 2. 자동: claude CLI 사용 가능(구독, 무료) → ANTHROPIC_API_KEY 있음(API) → 휴리스틱
 */
export async function resolveTagger(forceHeuristic = false): Promise<Tagger> {
  if (forceHeuristic) return heuristicTagger;

  const mode = process.env.TAGGER_MODE;
  if (mode === 'heuristic') return heuristicTagger;
  if (mode === 'api') return createClaudeTagger();
  if (mode === 'cli') return createClaudeCliTagger();

  if (await isClaudeCliAvailable()) return createClaudeCliTagger();
  if (process.env.ANTHROPIC_API_KEY) return createClaudeTagger();
  console.log('  (claude CLI도 API 키도 없어 휴리스틱 태거 사용 — 맥북에 Claude Code 설치 시 자동으로 구독 모드가 됩니다)');
  return heuristicTagger;
}
