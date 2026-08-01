import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, privateDir, reportsDir } from '@feedback-radar/core';
import { launchBrowser, newPage } from './browser.js';

/**
 * 발표 자료(/pitch)에 넣을 실제 동작 화면을 캡처한다.
 *
 * 결과물은 서비스 실데이터가 찍힌 이미지라 gitignore되는 private/deck-assets/에만 저장하고,
 * 웹에서는 /pitch/shot/<이름> 라우트가 이 폴더를 읽어 내보낸다.
 * 클론 직후처럼 캡처가 없는 머신에서는 /pitch가 자리표시자를 대신 보여준다.
 *
 * 사용법: 대시보드를 띄운 상태에서 (npm run dev 또는 dev:web) `npm run shots`
 */

const BASE_URL = process.env.SHOTS_BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.join(privateDir(), 'deck-assets');

/** /pitch/shot 라우트의 허용 목록과 이름이 일치해야 한다 */
type ShotName = 'dashboard-full' | 'dashboard-scheduler' | 'dashboard-table' | 'report';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 리포트 마크다운을 대시보드와 같은 테마의 HTML로 렌더한다.
 * 발표에서 "실제 산출물"을 보여주기 위한 용도라 표·링크·굵게 정도만 처리한다.
 */
function reportToHtml(md: string): string {
  const inline = (s: string): string =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/_(.+?)_/g, '<em>$1</em>');

  const out: string[] = [];
  let table: string[][] | null = null;

  const flushTable = () => {
    if (!table || table.length === 0) return;
    const [head, ...body] = table;
    out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
    for (const row of body) out.push('<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
    out.push('</tbody></table>');
    table = null;
  };

  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c))) continue; // 구분선
      (table ??= []).push(cells);
      continue;
    }
    flushTable();
    if (!line.trim()) continue;
    if (line.startsWith('# ')) out.push(`<h1>${inline(line.slice(2))}</h1>`);
    else if (line.startsWith('## ')) out.push(`<h2>${inline(line.slice(3))}</h2>`);
    else if (line.startsWith('---')) out.push('<hr>');
    else if (/^\s*-\s/.test(line)) {
      const depth = (line.match(/^\s*/)?.[0].length ?? 0) >= 2 ? ' class="sub"' : '';
      out.push(`<p${depth}>${inline(line.replace(/^\s*-\s/, '• '))}</p>`);
    } else out.push(`<p>${inline(line)}</p>`);
  }
  flushTable();

  // 슬라이드에 축소해 넣어도 읽히도록 좁은 폭 + 큰 글씨로 렌더한다
  return `<style>
    body { background:#0f1420; color:#e6ebf5; font-family:'Malgun Gothic','Pretendard',sans-serif;
           padding:26px 30px; line-height:1.65; font-size:19px; }
    h1 { font-size:28px; margin-bottom:14px; }
    h2 { font-size:21px; margin:18px 0 8px; color:#74a9ff; }
    p { margin:3px 0; }
    p.sub { margin-left:18px; color:#b9c4da; }
    a { color:#74a9ff; }
    hr { border:none; border-top:1px solid #2a3550; margin:16px 0; }
    table { border-collapse:collapse; background:#1a2233; border:1px solid #2a3550;
            border-radius:8px; overflow:hidden; margin:8px 0; font-size:17px; }
    th,td { padding:7px 16px; text-align:left; border-bottom:1px solid #2a3550; }
    th { color:#8a94ad; font-size:16px; }
    strong { color:#fff; }
    em { color:#8a94ad; font-style:normal; font-size:16px; }
  </style>${out.join('\n')}`;
}

function latestReport(): string | null {
  const dir = reportsDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const last = files.at(-1);
  return last ? fs.readFileSync(path.join(dir, last), 'utf8') : null;
}

async function main(): Promise<void> {
  const config = loadConfig();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const saved: ShotName[] = [];

  const browser = await launchBrowser();
  const page = await newPage(browser);
  await page.setViewportSize({ width: 1180, height: 900 });

  const shoot = async (name: ShotName, target: 'page' | string, opts: { full?: boolean } = {}) => {
    const file = path.join(OUT_DIR, `${name}.png`);
    if (target === 'page') {
      await page.screenshot({ path: file, fullPage: opts.full ?? false });
    } else {
      const el = page.locator(target).first();
      if ((await el.count()) === 0) {
        console.warn(`  - ${name}: 요소(${target})를 찾지 못해 건너뜀`);
        return;
      }
      await el.screenshot({ path: file });
    }
    saved.push(name);
    console.log(`  ✓ ${name}.png`);
  };

  try {
    console.log(`대시보드 캡처: ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForSelector('main', { timeout: 15_000 });
    await page.waitForTimeout(500);

    await shoot('dashboard-full', 'page', { full: true });
    await shoot('dashboard-scheduler', 'section.scheduler');
    await shoot('dashboard-table', 'main table:last-of-type');

    const md = latestReport();
    if (md) {
      console.log('리포트 캡처');
      await page.setViewportSize({ width: 900, height: 900 });
      await page.setContent(reportToHtml(md), { waitUntil: 'load' });
      await page.waitForTimeout(300);
      await shoot('report', 'page', { full: true });
    } else {
      console.warn('  - report: private/reports/에 리포트가 없어 건너뜀 (npm run collect 먼저 실행)');
    }
  } finally {
    await page.context().close();
    await browser.close();
  }

  console.log(`\n${saved.length}장 저장 → ${OUT_DIR}`);
  console.log(`${config.displayName} 발표 자료: ${BASE_URL}/pitch`);
}

main().catch((e) => {
  console.error('캡처 실패:', (e as Error).message);
  console.error('대시보드가 떠 있는지 확인하세요 (npm run dev 또는 npm run dev:web).');
  process.exit(1);
});
