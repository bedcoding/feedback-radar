import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { getItemsByDate, type ChannelSummary, type RadarDb } from '../db.js';
import { countryName, loadConfig } from '../paths.js';
import { resolveCliCmd, runClaude } from '../tagging/claude-cli.js';
import {
  DEFAULT_OPENAI_MODEL,
  estimateOpenAITextCost,
  providerKeySet,
  selectedApiProvider,
} from '../tagging/provider.js';
import type { ItemRow } from '../types.js';

/**
 * 채널별 하루치 AI 브리핑.
 *
 * **원문을 다시 보내지 않는다.** 분류 단계에서 항목마다 이미 60자 요약(`items.summary`)을
 * 만들어 뒀으므로, 여기서는 그 요약과 집계만 프롬프트에 넣는다. 원문을 다시 넣으면 같은
 * 텍스트를 두 번 결제하는 셈인데 얻는 게 없다. 요약에 필요한 건 '무슨 얘기가 몇 건'이고,
 * 그건 이미 분류 결과에 다 있다. 덕분에 채널당 입력이 수백 토큰 수준으로 끝난다.
 *
 * 호출 수도 채널 수만큼(하루 최대 5회)이다. 항목별로 부르면 수백 회가 되고, 하나로 합치면
 * 채널별 성격 차이(앱 리뷰 vs 커뮤니티)가 뭉개진다. 채널 단위가 그 사이의 지점이다.
 *
 * LLM을 못 쓰는 환경에서도 화면이 비지 않도록, 집계만으로 만든 문장을 대신 쓴다.
 */

/** 요약 대상에서 뺄 채널: 없음(전부 대상) */
const SEVERE = new Set(['high', 'critical']);
const BriefingSchema = z.object({
  bullets: z.array(z.string()).min(1).max(5),
});

export interface ChannelSummaryResult {
  summaries: Omit<ChannelSummary, 'createdAt'>[];
  /** LLM을 실제로 몇 채널에 썼는지 (0이면 전부 집계 기반) */
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  models: string[];
}

interface Channel {
  source: string;
  /** 스토어 국가. 국가가 없는 채널(커뮤니티, SNS)은 빈 문자열 */
  country: string;
  items: ItemRow[];
}

/**
 * 채널과 국가로 묶는다.
 *
 * 국가를 섞어 한 장으로 요약하면 국가별 이슈가 평균에 묻힌다. 국내 스토어는 조용한데
 * 일본 스토어에서 데이터 유실 호소가 몰리는 상황이 실제로 있고, 합쳐 놓으면 그게 안 보인다.
 * 국가가 없는 채널은 country가 빈 문자열이라 자연히 한 묶음으로 남는다.
 */
function bucket(items: ItemRow[]): Channel[] {
  const by = new Map<string, Channel>();
  for (const it of items) {
    const country = it.country ?? '';
    const key = `${it.source}|${country}`;
    const got = by.get(key);
    if (got) got.items.push(it);
    else by.set(key, { source: it.source, country, items: [it] });
  }
  return [...by.values()];
}

/** 프롬프트에 넣을 항목 목록: 심각, 부정을 앞세우고, 채널당 최대 12건 */
function pickForPrompt(items: ItemRow[]): ItemRow[] {
  const score = (it: ItemRow): number => {
    let s = 0;
    if (it.sentiment === 'negative') s += 2;
    if (it.severity && SEVERE.has(it.severity)) s += 2;
    if (it.sentiment === 'positive') s += 1;
    return s;
  };
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, 12);
}

function buildPrompt(
  displayName: string,
  channel: string,
  country: string,
  date: string,
  items: ItemRow[],
  stats: { total: number; negative: number; urgent: number },
  outputStyle: 'array' | 'structured' = 'array',
): string {
  const byCategory = new Map<string, number>();
  for (const it of items) {
    if (it.category) byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + 1);
  }
  const catLine = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} ${n}`)
    .join(', ');

  // 국가를 알려 줘야 요약이 맥락을 얻는다. 같은 채널이어도 국가마다 다른 얘기가 나온다.
  const scope = country ? `${channel} 채널(${countryName(country)} 스토어)` : `${channel} 채널`;
  const lines = [
    `'${displayName}' 서비스의 ${date} ${scope} 반응을 요약하라.`,
    '',
    /**
     * 판정 집계를 프롬프트에 넣지 않는다.
     *
     * 넣어 봤더니 요약문 첫 줄이 매번 그 숫자를 되받아 적었다 ("총 200건 부정 147건 심각
     * 60건, 결제/코인 48건..."). 화면 배지에서 판정 수치를 내려도 요약문 본문에 그대로
     * 남으니 소용이 없었고, 오히려 불릿 첫 줄이라 배지보다 눈에 잘 들어왔다.
     *
     * 단어만 부드럽게 바꾸는 것으로는 안 됐다. '심각'을 '우선 확인 대상'으로 넘겼더니
     * 요약문이 그 말을 그대로 실어 관측이 지시문으로 읽혔다. 아예 주지 않는다.
     *
     * 요약 품질은 떨어지지 않는다. 아래 개별 반응 목록에 항목마다 판정이 붙어 있고
     * (negative/high 같은 원래 값), 카테고리 분포는 전체 기준으로 따로 넘긴다.
     */
    `집계: 총 ${stats.total}건`,
    catLine ? `카테고리: ${catLine}` : '',
    '',
    '개별 반응 (이미 분류된 요약):',
  ].filter(Boolean);

  for (const it of pickForPrompt(items)) {
    const meta = [
      it.sentiment ?? '?',
      it.severity ?? '?',
      it.category ?? '?',
      it.rating != null ? `★${it.rating}` : null,
    ]
      .filter(Boolean)
      .join('/');
    lines.push(`- [${meta}] ${(it.summary ?? it.content).replace(/\s+/g, ' ').slice(0, 80)}`);
  }

  lines.push(
    '',
    '규칙:',
    '- 위 목록에 실제로 있는 내용만 쓴다. 없는 사실을 만들지 않는다',
    '- 이 채널의 성격을 반영한다 (앱 리뷰는 별점 불만, 커뮤니티는 화제와 여론)',
    '- 담당 팀이 바로 읽고 판단할 수 있게 구체적으로. "여러 의견이 있었다" 같은 빈 말은 금지',
    '- 건수를 함께 적는다',
    /*
      요약문은 여러 조직이 함께 읽는다. 판정 집계를 문장에 실으면 그게 그대로 과업이 된다.
      집계 줄에서 그 숫자를 빼 두었지만, 개별 반응 메타에 붙은 판정값을 보고 세어서 다시
      쓰는 경우가 있어 출력 규칙으로도 막는다.
    */
    '- 무슨 얘기가 몇 건인지로 적는다. 부정, 심각, 확인 필요 같은 판정 단어는 쓰지 않는다',
    '- 위에 준 집계 숫자를 되풀이하지 않는다. "총 N건 중"으로 문장을 시작하지 않는다',
    // 해외 스토어 리뷰는 일본어, 프랑스어, 태국어로 온다. 지시가 없으면 원문 언어로 요약해
    // 화면에서 읽을 수 없게 된다.
    '- 원문이 한국어가 아니어도 요약은 한국어로 쓴다',
    // 이 요약은 대시보드에 그대로 뿌려진다. 미들닷과 em dash가 섞이면 사람이 쓴 글로 안 읽혀서
    // 금지한다. 지시만으로는 새기 쉬워서 프롬프트 본문에서도 그 두 기호를 쓰지 않는다.
    '- 가운뎃점(·)과 줄표(—)를 쓰지 않는다. 나열은 쉼표로, 부연은 괄호로 적는다',
  );
  lines.push(
    '',
    ...(outputStyle === 'structured'
      ? ['출력은 제공된 구조화 스키마를 따른다. bullets 배열에 한국어 문장 3~5개, 각 60자 이내.']
      : [
          '출력: JSON 배열만. 3~5개 문장, 각 60자 이내 한국어.',
          '형식: ["결제 실패 리포트 3건, 전부 카드 등록 단계", "신작 반응 긍정 9건", ...]',
        ]),
  );
  return lines.join('\n');
}

function parseBullets(raw: string): string[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      .map((b) => b.trim().slice(0, 120))
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * LLM 없이 집계만으로 만드는 문장: 화면이 비는 것보다 낫다.
 *
 * 판정 건수는 넣지 않는다. LLM 요약과 같은 자리에 뿌려지므로, 여기에만 '부정 N건'이 남으면
 * LLM을 못 쓴 채널만 판정 수치를 드러낸다. 카테고리 상위 세 개로 '무슨 얘기가 몇 건'까지만
 * 말한다 (판정 대신 주제를 늘려 정보량을 맞춘다).
 */
function fallbackBullets(items: ItemRow[]): string[] {
  const out: string[] = [];
  const byCategory = new Map<string, number>();
  for (const it of items) {
    if (it.category) byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + 1);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [cat, n] of top) out.push(`${cat} ${n}건`);
  out.push('(집계 기반. LLM 요약을 켜면 내용까지 정리됩니다)');
  return out;
}

/**
 * 하루치 채널 요약을 만든다. 저장은 호출한 쪽에서 한다(파이프라인이 단계별 로그를 남기도록).
 *
 * @param service 여러 서비스를 함께 추적할 때 하나만 요약. 생략하면 전체를 한 묶음으로 본다.
 */
export async function buildChannelSummaries(
  db: RadarDb,
  date: string,
  service?: string,
): Promise<ChannelSummaryResult> {
  const config = loadConfig();
  const all = getItemsByDate(db, date).filter((it) => !service || it.service === service);
  const result: ChannelSummaryResult = {
    summaries: [],
    llmCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    models: [],
  };
  if (all.length === 0) return result;

  const cliCmd = await resolveCliCmd();
  const mode = process.env.TAGGER_MODE;
  const forceApi = mode === 'api' || mode === 'openai' || mode === 'anthropic';
  const useCli =
    mode !== 'heuristic' &&
    ((mode === 'cli' && cliCmd !== null) || (!forceApi && cliCmd !== null));
  const provider =
    mode === 'cli' || mode === 'heuristic'
      ? undefined
      : mode === 'openai' || mode === 'anthropic'
        ? mode
        : selectedApiProvider();
  const useOpenAI = !useCli && mode !== 'heuristic' && provider === 'openai' && providerKeySet('openai');
  const useAnthropic =
    !useCli && mode !== 'heuristic' && provider === 'anthropic' && providerKeySet('anthropic');
  const anthropicClient = useAnthropic ? new Anthropic() : null;
  const openaiClient = useOpenAI ? new OpenAI({ maxRetries: 2, timeout: 120_000 }) : null;
  const anthropicModel = process.env.TAGGER_MODEL || 'claude-haiku-4-5';
  const openaiModel = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  for (const ch of bucket(all)) {
    const items = ch.items;
    const label = ch.country ? `${ch.source}(${ch.country})` : ch.source;
    const stats = {
      total: items.length,
      negative: items.filter((it) => it.sentiment === 'negative').length,
      urgent: items.filter(
        (it) => it.sentiment === 'negative' && it.severity && SEVERE.has(it.severity),
      ).length,
    };
    const prompt = buildPrompt(
      config.displayName,
      ch.source,
      ch.country,
      date,
      items,
      stats,
      useOpenAI ? 'structured' : 'array',
    );

    let bullets: string[] = [];
    let usedModel: string | undefined;
    // 채널 행에는 그 채널이 쓴 만큼만 남긴다. 누적값을 넣으면 뒤 채널일수록 부풀려진다
    const before = {
      input: result.inputTokens,
      output: result.outputTokens,
      cost: result.costUsd,
    };
    try {
      if (useCli && cliCmd) {
        const res = await runClaude(cliCmd, prompt, 120_000);
        bullets = parseBullets(res.text);
        usedModel = res.models.join(', ') || undefined;
        result.inputTokens += res.inputTokens;
        result.outputTokens += res.outputTokens;
        result.costUsd += res.costUsd;
        if (res.models.length) result.models.push(...res.models);
      } else if (openaiClient) {
        const res = await openaiClient.responses.parse({
          model: openaiModel,
          input: prompt,
          store: false,
          max_output_tokens: 1_024,
          ...(openaiModel.startsWith('gpt-5.4-') ? { reasoning: { effort: 'none' as const } } : {}),
          text: { format: zodTextFormat(BriefingSchema, 'channel_briefing') },
        });
        bullets = (res.output_parsed?.bullets ?? [])
          .map((bullet) => bullet.trim().slice(0, 120))
          .filter(Boolean)
          .slice(0, 5);
        usedModel = res.model || openaiModel;
        const usedInput = res.usage?.input_tokens ?? 0;
        const usedOutput = res.usage?.output_tokens ?? 0;
        const usedCache = res.usage?.input_tokens_details?.cached_tokens ?? 0;
        result.inputTokens += usedInput;
        result.outputTokens += usedOutput;
        result.costUsd += estimateOpenAITextCost(usedModel, usedInput, usedOutput, usedCache);
        result.models.push(usedModel);
      } else if (anthropicClient) {
        const res = await anthropicClient.messages.create({
          model: anthropicModel,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        });
        const text = res.content
          .map((c) => (c.type === 'text' ? c.text : ''))
          .join('')
          .trim();
        bullets = parseBullets(text);
        usedModel = res.model;
        result.inputTokens += res.usage.input_tokens;
        result.outputTokens += res.usage.output_tokens;
        result.models.push(res.model);
      }
      if (bullets.length > 0) result.llmCalls += 1;
    } catch (e) {
      console.warn(`  ${label} 요약 실패, 집계로 대체: ${(e as Error).message}`);
    }

    result.summaries.push({
      date,
      source: ch.source,
      country: ch.country,
      service: service ?? '',
      ...stats,
      bullets: bullets.length > 0 ? bullets : fallbackBullets(items),
      model: usedModel,
      inputTokens: result.inputTokens - before.input || undefined,
      outputTokens: result.outputTokens - before.output || undefined,
      costUsd: result.costUsd - before.cost || undefined,
    });
  }

  result.models = [...new Set(result.models)];
  return result;
}
