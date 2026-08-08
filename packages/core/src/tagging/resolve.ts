import type { Tagger } from '../types.js';
import { createClaudeTagger } from './claude.js';
import { createClaudeCliTagger, isClaudeCliAvailable } from './claude-cli.js';
import { heuristicTagger } from './heuristic.js';
import { createOpenAITagger } from './openai.js';
import { providerKeySet, selectedApiProvider, type ApiProvider } from './provider.js';
import { diagnoseTagger } from './status.js';

function apiTagger(provider: ApiProvider): Tagger {
  if (!providerKeySet(provider)) {
    const key = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
    console.warn(`  ${key}가 없어 키워드 규칙 태거를 사용합니다.`);
    return heuristicTagger;
  }
  return provider === 'openai' ? createOpenAITagger() : createClaudeTagger();
}

/**
 * 태거 선택 우선순위:
 * 1. TAGGER_MODE 환경변수로 강제 (cli | openai | anthropic | api | heuristic)
 * 2. api는 TAGGER_API_PROVIDER로 OpenAI/Anthropic을 고른다 (기존 api=Anthropic도 호환)
 * 3. 자동: claude CLI 사용 가능(구독) → 설정된 API 키 → 휴리스틱
 */
export async function resolveTagger(forceHeuristic = false): Promise<Tagger> {
  if (forceHeuristic) return heuristicTagger;

  const mode = process.env.TAGGER_MODE;
  if (mode === 'heuristic') return heuristicTagger;
  if (mode === 'cli') return createClaudeCliTagger();
  if (mode === 'openai' || mode === 'anthropic') return apiTagger(mode);
  if (mode === 'api') return apiTagger(selectedApiProvider() ?? 'anthropic');

  const provider = selectedApiProvider();
  if (provider && providerKeySet(provider)) {
    // API 키가 있는 자동 모드에서는 실행 파일 존재뿐 아니라 실제 Claude 추론 가능 여부까지
    // 확인한다. 로그인돼 있어도 조직 권한이 403으로 막힌 환경에서 API가 무시되는 일을 막는다.
    const status = await diagnoseTagger();
    if (status.mode === 'cli') return createClaudeCliTagger();
    if (status.mode === 'openai' || status.mode === 'anthropic') return apiTagger(status.mode);
  }
  if (await isClaudeCliAvailable()) return createClaudeCliTagger();
  console.log(
    '  claude CLI와 API 키가 없어 휴리스틱 태거를 사용합니다 (분류 정확도가 낮습니다).\n' +
      '  → `npm install -g @anthropic-ai/claude-code` 후 `claude` 로그인 시 구독 요금으로 자동 전환됩니다.\n' +
      '  → API를 쓰려면 private/.env에 OPENAI_API_KEY 또는 ANTHROPIC_API_KEY를 넣으세요.',
  );
  return heuristicTagger;
}
