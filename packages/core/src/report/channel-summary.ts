import Anthropic from '@anthropic-ai/sdk';
import { getItemsByDate, type ChannelSummary, type RadarDb } from '../db.js';
import { loadConfig } from '../paths.js';
import { resolveCliCmd, runClaude } from '../tagging/claude-cli.js';
import type { ItemRow } from '../types.js';

/**
 * 채널별 하루치 AI 브리핑.
 *
 * **원문을 다시 보내지 않는다.** 분류 단계에서 항목마다 이미 60자 요약(`items.summary`)을
 * 만들어 뒀으므로, 여기서는 그 요약과 집계만 프롬프트에 넣는다. 원문을 다시 넣으면 같은
 * 텍스트를 두 번 결제하는 셈인데 얻는 게 없다 — 요약에 필요한 건 '무슨 얘기가 몇 건'이고,
 * 그건 이미 분류 결과에 다 있다. 덕분에 채널당 입력이 수백 토큰 수준으로 끝난다.
 *
 * 호출 수도 채널 수만큼(하루 최대 5회)이다. 항목별로 부르면 수백 회가 되고, 하나로 합치면
 * 채널별 성격 차이(앱 리뷰 vs 커뮤니티)가 뭉개진다. 채널 단위가 그 사이의 지점이다.
 *
 * LLM을 못 쓰는 환경에서도 화면이 비지 않도록, 집계만으로 만든 문장을 대신 쓴다.
 */

/** 요약 대상에서 뺄 채널 — 없음(전부 대상) */
const SEVERE = new Set(['high', 'critical']);

export interface ChannelSummaryResult {
  summaries: Omit<ChannelSummary, 'createdAt'>[];
  /** LLM을 실제로 몇 채널에 썼는지 (0이면 전부 집계 기반) */
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  models: string[];
}

function bucket(items: ItemRow[]): Map<string, ItemRow[]> {
  const by = new Map<string, ItemRow[]>();
  for (const it of items) {
    const list = by.get(it.source);
    if (list) list.push(it);
    else by.set(it.source, [it]);
  }
  return by;
}

/** 프롬프트에 넣을 항목 목록 — 심각·부정을 앞세우고, 채널당 최대 12건 */
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
  date: string,
  items: ItemRow[],
  stats: { total: number; negative: number; urgent: number },
): string {
  const byCategory = new Map<string, number>();
  for (const it of items) {
    if (it.category) byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + 1);
  }
  const catLine = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${c} ${n}`)
    .join(', ');

  const lines = [
    `'${displayName}' 서비스의 ${date} ${channel} 채널 반응을 요약하라.`,
    '',
    `집계: 총 ${stats.total}건, 부정 ${stats.negative}건, 심각(high 이상) ${stats.urgent}건`,
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
    // 이 요약은 대시보드에 그대로 뿌려진다. 미들닷과 em dash가 섞이면 사람이 쓴 글로 안 읽혀서
    // 금지한다. 지시만으로는 새기 쉬워서 프롬프트 본문에서도 그 두 기호를 쓰지 않는다.
    '- 가운뎃점(·)과 줄표(—)를 쓰지 않는다. 나열은 쉼표로, 부연은 괄호로 적는다',
    '',
    '출력: JSON 배열만. 3~5개 문장, 각 60자 이내 한국어.',
    '형식: ["결제 실패 리포트 3건, 전부 카드 등록 단계", "신작 반응 긍정 9건", ...]',
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

/** LLM 없이 집계만으로 만드는 문장 — 화면이 비는 것보다 낫다 */
function fallbackBullets(items: ItemRow[], stats: { negative: number; urgent: number }): string[] {
  const out: string[] = [];
  const byCategory = new Map<string, number>();
  for (const it of items) {
    if (it.category) byCategory.set(it.category, (byCategory.get(it.category) ?? 0) + 1);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  for (const [cat, n] of top) out.push(`${cat} ${n}건`);
  if (stats.urgent > 0) out.push(`심각(high 이상) ${stats.urgent}건, 확인 필요`);
  else if (stats.negative > 0) out.push(`부정 ${stats.negative}건`);
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const mode = process.env.TAGGER_MODE;
  const useCli = mode !== 'heuristic' && mode !== 'api' && cliCmd !== null;
  const useApi = mode !== 'heuristic' && !useCli && Boolean(apiKey);
  const client = useApi ? new Anthropic() : null;
  const model = process.env.TAGGER_MODEL || 'claude-haiku-4-5';

  for (const [channel, items] of bucket(all)) {
    const stats = {
      total: items.length,
      negative: items.filter((it) => it.sentiment === 'negative').length,
      urgent: items.filter(
        (it) => it.sentiment === 'negative' && it.severity && SEVERE.has(it.severity),
      ).length,
    };
    const prompt = buildPrompt(config.displayName, channel, date, items, stats);

    let bullets: string[] = [];
    let usedModel: string | undefined;
    // 채널 행에는 그 채널이 쓴 만큼만 남긴다 — 누적값을 넣으면 뒤 채널일수록 부풀려진다
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
      } else if (client) {
        const res = await client.messages.create({
          model,
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
      console.warn(`  ${channel} 요약 실패, 집계로 대체: ${(e as Error).message}`);
    }

    result.summaries.push({
      date,
      source: channel,
      service: service ?? '',
      ...stats,
      bullets: bullets.length > 0 ? bullets : fallbackBullets(items, stats),
      model: usedModel,
      inputTokens: result.inputTokens - before.input || undefined,
      outputTokens: result.outputTokens - before.output || undefined,
      costUsd: result.costUsd - before.cost || undefined,
    });
  }

  result.models = [...new Set(result.models)];
  return result;
}
