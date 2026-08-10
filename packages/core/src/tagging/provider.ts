export type ApiProvider = 'anthropic' | 'openai';
export type TaggerSelection = 'auto' | 'cli' | 'openai' | 'anthropic' | 'heuristic';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.4-nano';

export const OPENAI_MODEL_CHOICES = [
  {
    value: 'gpt-5.4-nano',
    label: 'GPT-5.4 nano',
    role: '분류·추출 추천',
    recommended: true,
    price: { input: 0.2, cachedInput: 0.02, output: 1.25 },
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT-5.4 mini',
    role: '품질 우선',
    recommended: false,
    price: { input: 0.75, cachedInput: 0.075, output: 4.5 },
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 mini',
    role: '균형형',
    recommended: false,
    price: { input: 0.25, cachedInput: 0.025, output: 2 },
  },
  {
    value: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    role: '안정적 지시 이행',
    recommended: false,
    price: { input: 0.4, cachedInput: 0.1, output: 1.6 },
  },
  {
    value: 'gpt-5-nano',
    label: 'GPT-5 nano',
    role: '최저 비용',
    recommended: false,
    price: { input: 0.05, cachedInput: 0.005, output: 0.4 },
  },
] as const;

export function getOpenAIModelChoice(model: string) {
  return OPENAI_MODEL_CHOICES.find(
    (choice) => model === choice.value || model.startsWith(`${choice.value}-`),
  );
}

/** 표준 API 단가 기준 환산값. 계정의 무료 토큰이나 별도 할인이 있으면 실제 청구액과 다르다. */
export function estimateOpenAITextCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number,
): number {
  const choice = getOpenAIModelChoice(model);
  if (!choice) return 0;
  const cached = Math.min(inputTokens, Math.max(0, cachedInputTokens));
  const uncached = Math.max(0, inputTokens - cached);
  return (
    (uncached * choice.price.input +
      cached * choice.price.cachedInput +
      outputTokens * choice.price.output) /
    1_000_000
  );
}

export const TAGGER_SELECTION_CHOICES = [
  { value: 'auto', label: '자동 (Claude CLI 우선)' },
  { value: 'cli', label: 'Claude 구독 (CLI)' },
  { value: 'openai', label: 'OpenAI API' },
  { value: 'anthropic', label: 'Anthropic API' },
  { value: 'heuristic', label: '키워드 규칙' },
] as const;

export function isApiProvider(value: unknown): value is ApiProvider {
  return value === 'anthropic' || value === 'openai';
}

export function selectedApiProvider(): ApiProvider | undefined {
  const direct = process.env.TAGGER_MODE;
  if (isApiProvider(direct)) return direct;

  const configured = process.env.TAGGER_API_PROVIDER;
  if (isApiProvider(configured)) return configured;

  // 기존 설치는 Anthropic API를 먼저 썼다. 둘 다 설정된 경우 명시적인 provider가 없으면
  // 그 동작을 유지하고, OpenAI 키만 새로 넣은 설치에서는 자동으로 OpenAI를 고른다.
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return undefined;
}

export function providerKeySet(provider: ApiProvider): boolean {
  return provider === 'openai'
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * 대시보드에서 저장한 태거 선택을 웹과 스케줄러 프로세스에 똑같이 적용한다.
 * API 키는 settings/DB에 넣지 않고 레포 루트 .env에서만 읽는다.
 */
export function applyTaggerSettings(settings: Record<string, string>): void {
  if (Object.hasOwn(settings, 'taggerMode')) {
    const selection = settings.taggerMode as TaggerSelection | '';
    if (!selection || selection === 'auto') {
      delete process.env.TAGGER_MODE;
      delete process.env.TAGGER_API_PROVIDER;
    } else if (selection === 'openai' || selection === 'anthropic') {
      process.env.TAGGER_MODE = selection;
      process.env.TAGGER_API_PROVIDER = selection;
    } else if (selection === 'cli' || selection === 'heuristic') {
      process.env.TAGGER_MODE = selection;
      delete process.env.TAGGER_API_PROVIDER;
    }
  }

  if (Object.hasOwn(settings, 'openaiModel')) {
    process.env.OPENAI_MODEL = settings.openaiModel.trim() || DEFAULT_OPENAI_MODEL;
  }
}
