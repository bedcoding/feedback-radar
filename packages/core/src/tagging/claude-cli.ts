import { spawn } from 'node:child_process';
import { CATEGORIES, SENTIMENTS, SEVERITIES, TEAMS } from '../taxonomy.js';
import { loadConfig } from '../paths.js';
import type { TagResult, Tagger } from '../types.js';
import { heuristicTagger } from './heuristic.js';

/**
 * Claude Code CLI(`claude -p`) 기반 태거 — API 키 없이 개인 Claude 구독 요금으로 동작.
 * 24시간 켜져 있는 로컬 머신(맥북 등)에 Claude Code가 로그인돼 있으면 그대로 쓸 수 있다.
 *
 * 호출 수를 최소화하기 위해 건별 호출 대신 배치(기본 25건)로 묶어 JSON 배열을 받는다.
 * 구독 rate limit(5시간 윈도우)을 고려하면 하루 1~3회 수집 주기에 적합하다.
 */

const CLI_CMD = () => process.env.CLAUDE_CLI_CMD || 'claude';
const BATCH_SIZE = 25;

function runClaude(prompt: string, timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI_CMD(), ['-p'], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude CLI 타임아웃 (${timeoutMs / 1000}s)`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude CLI 종료코드 ${code}: ${err.slice(0, 300)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function isClaudeCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(CLI_CMD(), ['--version'], {
        shell: process.platform === 'win32',
        stdio: 'ignore',
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 10_000);
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    } catch {
      resolve(false);
    }
  });
}

interface BatchItem {
  id: number;
  content: string;
  rating?: number;
  source: string;
}

function buildBatchPrompt(displayName: string, domainPrompt: string | undefined, batch: BatchItem[]): string {
  const lines: string[] = [];
  lines.push(`너는 '${displayName}' 서비스의 고객 피드백 분류 담당자다.`);
  lines.push('아래 사용자 반응 목록을 항목별로 분류하라.');
  if (domainPrompt) {
    lines.push('', '서비스 도메인 지식:', domainPrompt);
  }
  lines.push(
    '',
    '분류 규칙:',
    `- sentiment: ${SENTIMENTS.join(' | ')} (서비스에 대한 감성. 콘텐츠 내용에 대한 슬픔/분노는 서비스 부정이 아님)`,
    `- category: ${CATEGORIES.join(' | ')}`,
    `- severity: ${SEVERITIES.join(' | ')} (결제 실패·환불 불가·계정 접근 불가는 high 이상, 단순 감상평은 low)`,
    `- team: ${TEAMS.join(' | ')}`,
    '- summary: 원문에 실제로 있는 내용만 담은 60자 이내 한국어 요약. 지어내지 말 것',
    '',
    '출력 형식: JSON 배열만 출력한다. 코드블록, 설명, 인사 등 다른 텍스트는 절대 출력하지 않는다.',
    '형식: [{"index": 1, "sentiment": "...", "category": "...", "severity": "...", "team": "...", "summary": "..."}, ...]',
    '',
    '항목:',
  );
  batch.forEach((it, i) => {
    const meta = [`채널: ${it.source}`, it.rating != null ? `별점: ${it.rating}/5` : null]
      .filter(Boolean)
      .join(', ');
    lines.push(`${i + 1}. [${meta}] ${it.content.replace(/\s+/g, ' ').slice(0, 400)}`);
  });
  return lines.join('\n');
}

function parseBatchOutput(raw: string, batchLen: number): Map<number, TagResult> {
  const out = new Map<number, TagResult>();
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const entry of parsed) {
    const e = entry as Record<string, unknown>;
    const idx = Number(e.index);
    if (!Number.isInteger(idx) || idx < 1 || idx > batchLen) continue;
    if (
      !SENTIMENTS.includes(e.sentiment as never) ||
      !CATEGORIES.includes(e.category as never) ||
      !SEVERITIES.includes(e.severity as never) ||
      !TEAMS.includes(e.team as never)
    )
      continue;
    out.set(idx - 1, {
      sentiment: e.sentiment as TagResult['sentiment'],
      category: e.category as TagResult['category'],
      severity: e.severity as TagResult['severity'],
      team: e.team as TagResult['team'],
      summary: String(e.summary ?? '').slice(0, 100),
    });
  }
  return out;
}

export function createClaudeCliTagger(): Tagger {
  const config = loadConfig();
  return {
    name: `claude-cli(${CLI_CMD()}, 구독)`,
    async tag(items) {
      const out = new Map<number, TagResult>();
      for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
        const batch = items.slice(offset, offset + BATCH_SIZE);
        let batchTags = new Map<number, TagResult>();
        try {
          const prompt = buildBatchPrompt(config.displayName, config.domainPrompt, batch);
          const raw = await runClaude(prompt);
          batchTags = parseBatchOutput(raw, batch.length);
          console.log(`  claude-cli 배치 ${offset / BATCH_SIZE + 1}: ${batchTags.size}/${batch.length}건 분류`);
        } catch (e) {
          console.warn(`  claude-cli 배치 실패, 휴리스틱 폴백:`, (e as Error).message);
        }
        // 배치에서 빠진 항목은 휴리스틱으로 채운다
        const missing = batch.filter((_, i) => !batchTags.has(i));
        const fallback = missing.length > 0 ? await heuristicTagger.tag(missing) : new Map();
        batch.forEach((it, i) => {
          const tag = batchTags.get(i) ?? fallback.get(it.id);
          if (tag) out.set(it.id, tag);
        });
      }
      return out;
    },
  };
}
