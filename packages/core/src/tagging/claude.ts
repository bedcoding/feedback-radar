import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { CATEGORIES, SENTIMENTS, SEVERITIES, TEAMS } from '../taxonomy.js';
import { loadConfig } from '../paths.js';
import type { TagResult, Tagger } from '../types.js';
import { heuristicTagger } from './heuristic.js';

const TagSchema = z.object({
  sentiment: z.enum(SENTIMENTS).describe('글의 전반적 감성'),
  category: z.enum(CATEGORIES).describe('가장 핵심적인 주제 카테고리 하나'),
  severity: z
    .enum(SEVERITIES)
    .describe('서비스 관점 심각도. 결제 실패·데이터 유실·집단 불만 조짐은 critical'),
  team: z.enum(TEAMS).describe('이 건을 확인해야 할 담당 조직'),
  summary: z.string().describe('한국어 한 문장 요약 (60자 이내). 원문에 없는 내용을 지어내지 말 것'),
  relevant: z
    .boolean()
    .describe(
      '이 글이 실제로 우리 서비스/앱에 관한 내용이면 true. 같은 단어의 다른 의미(동음이의어, 타업종 제품·재료 등)로 걸린 무관한 글이면 false. 앱 리뷰 채널(appstore/googleplay)은 항상 true',
    ),
});

// 시스템 프롬프트 = 공통 분류 원칙 + 테넌트별 도메인 사전(feedback-radar.config.json의 domainPrompt).
// 서비스 특화 용어(재화 이름, 이벤트 명칭, 팬덤 은어 등)는 전부 설정 파일에서 온다.
// NOTE: Haiku 4.5의 prompt cache 최소 프리픽스는 4096 토큰이라, 실운영 단계에서
// domainPrompt에 용어 사전·few-shot을 충분히 채워야 캐시가 실제로 동작한다
// (usage.cache_read_input_tokens 로 검증).
function buildSystemPrompt(displayName: string, domainPrompt?: string): string {
  const base = `너는 '${displayName}' 서비스의 고객 피드백 분류 담당자다.
앱스토어 리뷰, 커뮤니티 게시글, SNS 반응을 하나씩 읽고 정해진 스키마로 분류한다.

분류 원칙:
- 가장 먼저 relevant를 판단한다: 검색 키워드가 동음이의어라서 전혀 다른 주제(타업종 재료·제품 등)의 글이 섞여 들어올 수 있다. 우리 서비스와 무관하면 relevant=false로 표시한다 (나머지 필드는 형식상 채우되 대충 채워도 됨)
- 감성은 서비스에 대한 감성이다. 콘텐츠 내용에 대한 슬픔/분노는 서비스 부정이 아니다
- 결제 실패, 환불 불가, 계정 접근 불가는 심각도 high~critical
- 단순 감상평은 심각도 low
- summary는 반드시 원문에 실제로 있는 내용만 담는다`;
  return domainPrompt ? `${base}\n\n서비스 도메인 지식:\n${domainPrompt}` : base;
}

async function tagOne(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  content: string,
  source: string,
  rating?: number,
): Promise<TagResult | null> {
  const meta = [`채널: ${source}`, rating != null ? `별점: ${rating}/5` : null].filter(Boolean).join(', ');
  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `[${meta}]\n${content.slice(0, 2000)}` }],
    output_config: { format: zodOutputFormat(TagSchema) },
  });
  return response.parsed_output ?? null;
}

/** 동시성 제한 실행기 */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Claude 기반 건별 태거.
 * - 모델: TAGGER_MODEL 환경변수 (기본 claude-haiku-4-5 — 분류 작업 비용 최적)
 * - 스키마는 structured outputs로 강제되므로 파싱 실패가 없다
 * - 개별 건 실패 시 휴리스틱으로 폴백 (파이프라인이 죽지 않게)
 * TODO(M2): 볼륨이 커지면 Batch API로 전환해 50% 할인 적용
 */
export function createClaudeTagger(): Tagger {
  const client = new Anthropic();
  const model = process.env.TAGGER_MODEL || 'claude-haiku-4-5';
  const config = loadConfig();
  const systemPrompt = buildSystemPrompt(config.displayName, config.domainPrompt);
  return {
    name: `claude(${model})`,
    async tag(items) {
      const out = new Map<number, TagResult>();
      await pool(items, 4, async (it) => {
        try {
          const tag = await tagOne(client, model, systemPrompt, it.content, it.source, it.rating);
          if (tag) {
            out.set(it.id, tag);
            return;
          }
        } catch (e) {
          console.warn(`  태깅 실패 (id=${it.id}), 휴리스틱 폴백:`, (e as Error).message);
        }
        const fallback = await heuristicTagger.tag([it]);
        const t = fallback.get(it.id);
        if (t) out.set(it.id, t);
      });
      return out;
    },
  };
}

