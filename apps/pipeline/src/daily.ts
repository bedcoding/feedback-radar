import fs from 'node:fs';
import path from 'node:path';
import {
  buildDailyReport,
  findRepoRoot,
  getUntagged,
  insertItems,
  loadConfig,
  openDb,
  reportsDir,
  resolveTagger,
  saveTags,
  sendWebhook,
  type RawItem,
} from '@feedback-radar/core';
import { launchBrowser } from './browser.js';
import { collectAppStore } from './collectors/appstore.js';
import { collectDcinside } from './collectors/dcinside.js';
import { collectGooglePlay } from './collectors/googleplay.js';
import { collectNaver } from './collectors/naver.js';
import { collectThreads } from './collectors/threads.js';

// .env 로드: private/.env 우선, 없으면 레포 루트
for (const envPath of [
  path.join(findRepoRoot(), 'private', '.env'),
  path.join(findRepoRoot(), '.env'),
]) {
  try {
    process.loadEnvFile(envPath);
    break;
  } catch {
    // 다음 후보 시도
  }
}

export async function runDaily(forceHeuristic = false): Promise<void> {
  const config = loadConfig();
  const db = openDb();
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n=== ${config.displayName} 피드백 파이프라인 (${today}) ===\n`);

  // 1. 수집 — 소스별 독립 실행, 하나가 죽어도 나머지는 계속
  console.log('[1/4] 수집');
  const tasks: { name: string; run: () => Promise<RawItem[]> }[] = [];

  if (config.sources.appstore && config.appstore?.appId) {
    const { appId, country } = config.appstore;
    tasks.push({
      name: 'appstore',
      run: () => collectAppStore(appId, country, config.collect?.appstorePages ?? 3),
    });
  }
  if (config.sources.googleplay && config.googlePlay?.appId) {
    const { appId, lang, country } = config.googlePlay;
    tasks.push({
      name: 'googleplay',
      run: () => collectGooglePlay(appId, lang, country, config.collect?.googlePlayReviewCount ?? 200),
    });
  }
  if (config.sources.naver) {
    tasks.push({ name: 'naver', run: () => collectNaver(config.keywords, config.collect?.naverDisplay ?? 50) });
  }

  const needBrowser = config.sources.dcinside || config.sources.threads;
  const browser = needBrowser ? await launchBrowser() : null;
  if (browser && config.sources.dcinside) {
    tasks.push({ name: 'dcinside', run: () => collectDcinside(browser, config.keywords) });
  }
  if (browser && config.sources.threads) {
    tasks.push({ name: 'threads', run: () => collectThreads(browser, config.keywords) });
  }

  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  await browser?.close();

  let totalNew = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const inserted = insertItems(db, r.value);
      totalNew += inserted;
      console.log(`  ✓ ${tasks[i].name}: ${r.value.length}건 수집, 신규 ${inserted}건`);
    } else {
      console.warn(`  ✗ ${tasks[i].name}: 실패 — ${r.reason?.message ?? r.reason}`);
    }
  });

  // 2. 태깅 — 미태깅 건만
  console.log('\n[2/4] 태깅');
  const untagged = getUntagged(db);
  const tagger = await resolveTagger(forceHeuristic);
  console.log(`  태거: ${tagger.name}, 대상: ${untagged.length}건`);
  if (untagged.length > 0) {
    const tags = await tagger.tag(untagged);
    saveTags(db, tags);
    console.log(`  ✓ ${tags.size}건 태깅 완료`);
  }

  // 3. 리포트 생성
  console.log('\n[3/4] 리포트 생성');
  const report = buildDailyReport(db, today, config.displayName);
  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, `${today}.md`);
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`  ✓ ${reportPath}`);

  // 4. 알림
  console.log('\n[4/4] 알림');
  const sent = await sendWebhook(report);
  console.log(sent ? '  ✓ 웹훅 전송 완료' : '  - WEBHOOK_URL 미설정, 스킵');

  console.log(`\n=== 완료: 신규 ${totalNew}건 ===\n`);
  console.log(report);
}
