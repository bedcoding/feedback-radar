import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { planTagBatches } from '../collect-limits.js';
import { loadConfig } from '../paths.js';
import type { TagResult, Tagger, TaggerUsage } from '../types.js';
import { TagSchema } from './claude.js';
import { buildBatchPrompt } from './claude-cli.js';
import { heuristicTagger } from './heuristic.js';
import { DEFAULT_OPENAI_MODEL, estimateOpenAITextCost } from './provider.js';

const DEFAULT_BATCH_SIZE = 25;

const BatchTagSchema = z.object({
  results: z.array(
    TagSchema.extend({
      index: z.number().int().describe('입력 항목 번호. 1부터 시작'),
    }),
  ),
});

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

function reasoningEffort(model: string): ReasoningEffort | undefined {
  const configured = process.env.OPENAI_REASONING_EFFORT?.trim();
  if (configured && ['none', 'low', 'medium', 'high', 'xhigh'].includes(configured)) {
    return configured as ReasoningEffort;
  }
  // GPT-5.4 mini/nano는 none을 지원하고 분류에는 별도 추론이 필요하지 않다.
  return model.startsWith('gpt-5.4-') ? 'none' : undefined;
}

function parsedTags(parsed: z.infer<typeof BatchTagSchema> | null, batchLen: number): Map<number, TagResult> {
  const out = new Map<number, TagResult>();
  for (const entry of parsed?.results ?? []) {
    if (entry.index < 1 || entry.index > batchLen || out.has(entry.index - 1)) continue;
    out.set(entry.index - 1, {
      sentiment: entry.sentiment,
      category: entry.category,
      severity: entry.severity,
      team: entry.team,
      summary: entry.summary.trim().slice(0, 100),
      relevant: entry.relevant,
      reason: entry.reason.trim().slice(0, 60) || undefined,
    });
  }
  return out;
}

/** OpenAI Responses API + Structured Outputs 기반 배치 태거. */
export function createOpenAITagger(): Tagger {
  const client = new OpenAI({ maxRetries: 2, timeout: 120_000 });
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const effort = reasoningEffort(model);
  const config = loadConfig();
  let lastUsage: TaggerUsage | undefined;

  return {
    name: `openai(${model})`,
    usage: () => lastUsage,
    async tag(items, opts = {}) {
      const { onBatch, shouldStop, onCall, batchSize } = opts;
      const out = new Map<number, TagResult>();
      const models = new Set<string>();
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadTokens = 0;
      let costUsd = 0;
      let consecutiveFailures = 0;
      const plan = planTagBatches(items.length, batchSize ?? DEFAULT_BATCH_SIZE);
      let offset = 0;

      for (let call = 0; call < plan.length; call++) {
        if (shouldStop?.()) break;
        const batch = items.slice(offset, offset + plan[call]);
        offset += plan[call];
        let batchTags = new Map<number, TagResult>();

        if (consecutiveFailures < 2) {
          try {
            const { prompt, instructions } = buildBatchPrompt(
              config.displayName,
              config.domainPrompt,
              config.excludeHints,
              batch,
              'structured',
            );
            onCall?.({
              index: call + 1,
              total: plan.length,
              items: batch.length,
              chars: prompt.length,
              instructions,
              lines: batch.map((it) => ({
                id: it.id,
                source: it.source,
                text: it.content.replace(/\s+/g, ' ').slice(0, 90),
              })),
              usageSoFar: { inputTokens, outputTokens, costUsd, cacheReadTokens },
            });

            const response = await client.responses.parse({
              model,
              input: prompt,
              store: false,
              max_output_tokens: Math.min(8_192, Math.max(1_024, batch.length * 300)),
              ...(effort ? { reasoning: { effort } } : {}),
              text: { format: zodTextFormat(BatchTagSchema, 'feedback_tags') },
            });
            batchTags = parsedTags(response.output_parsed, batch.length);
            const usedModel = response.model || model;
            models.add(usedModel);
            const usedInput = response.usage?.input_tokens ?? 0;
            const usedOutput = response.usage?.output_tokens ?? 0;
            const usedCache = response.usage?.input_tokens_details?.cached_tokens ?? 0;
            inputTokens += usedInput;
            outputTokens += usedOutput;
            cacheReadTokens += usedCache;
            costUsd += estimateOpenAITextCost(usedModel, usedInput, usedOutput, usedCache);
            consecutiveFailures = batchTags.size === 0 ? consecutiveFailures + 1 : 0;
            console.log(
              `  OpenAI 호출 ${call + 1}/${plan.length}: ${batchTags.size}/${batch.length}건 분류 (${usedModel})`,
            );
          } catch (error) {
            consecutiveFailures += 1;
            console.warn(`  OpenAI 배치 실패, 휴리스틱 폴백: ${(error as Error).message}`);
          }
        }

        const missing = batch.filter((_, index) => !batchTags.has(index));
        const fallback = missing.length ? await heuristicTagger.tag(missing) : new Map();
        const done = new Map<number, TagResult>();
        batch.forEach((item, index) => {
          const tag = batchTags.get(index) ?? fallback.get(item.id);
          if (tag) {
            out.set(item.id, tag);
            done.set(item.id, tag);
          }
        });
        try {
          onBatch?.(done);
        } catch (error) {
          console.warn(`  중간 저장 실패 (계속 진행): ${(error as Error).message}`);
        }
      }

      lastUsage = {
        models: [...models],
        inputTokens,
        outputTokens,
        costUsd,
        cacheReadTokens,
        items: out.size,
      };
      if (models.size > 0) {
        console.log(
          `  OpenAI 합계: 모델 ${[...models].join(', ')}, 입력 ${inputTokens.toLocaleString()} / ` +
            `출력 ${outputTokens.toLocaleString()} 토큰, 캐시 읽기 ${cacheReadTokens.toLocaleString()}, ` +
            `표준가 환산 $${costUsd.toFixed(4)}`,
        );
      }
      return out;
    },
  };
}
