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
  console.log(
    '  claude CLI도 API 키도 없어 휴리스틱 태거를 사용합니다 (분류 정확도가 낮습니다).\n' +
      '  → `npm install -g @anthropic-ai/claude-code` 후 `claude` 로그인 시 구독 요금으로 자동 전환됩니다.\n' +
      '  → 설치했는데도 이 메시지가 보이면 실행 파일이 PATH에 없는 것입니다. private/.env에 CLAUDE_CLI_CMD로 전체 경로를 지정하세요.',
  );
  return heuristicTagger;
}
