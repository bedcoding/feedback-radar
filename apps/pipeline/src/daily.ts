import fs from 'node:fs';
import path from 'node:path';
import {
  buildDailyReport,
  getUntagged,
  insertItems,
  loadConfig,
  loadPrivateEnv,
  localDate,
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

loadPrivateEnv();

/** 프리셋의 자리표시자({서비스명} 등)가 그대로 남아 있는지 */
function isPlaceholder(value?: string): boolean {
  return !value || /[{}]/.test(value);
}

export async function runDaily(forceHeuristic = false): Promise<void> {
  const config = loadConfig();
  const db = openDb();
  console.log(`\n=== ${config.displayName} 피드백 파이프라인 (${localDate()}) ===\n`);

  // 프리셋을 복사만 하고 값을 안 채우면 자리표시자를 그대로 검색하게 된다.
  // 외부 요청과 LLM 쿼터를 헛되이 쓰기 전에 멈추는 편이 낫다.
  const unfilled = config.keywords.filter(isPlaceholder);
  if (unfilled.length > 0) {
    db.close();
    throw new Error(
      `설정을 아직 채우지 않았습니다 (키워드: ${unfilled.join(', ')}).\n` +
        '  private/feedback-radar.config.json 에서 displayName · keywords · appId 를 본인 서비스 값으로 바꾼 뒤 다시 실행하세요.',
    );
  }

  // 1. 수집 — 소스별 독립 실행, 하나가 죽어도 나머지는 계속
  console.log('[1/4] 수집');
  const tasks: { name: string; run: () => Promise<RawItem[]> }[] = [];

  // 소스는 켜져 있는데 앱 ID가 비었을 때 조용히 빠지면
  // "안정성 ★★★인 두 소스가 왜 0건이지"를 알아낼 방법이 없다. 이유를 남긴다.
  const skipReason = (id?: string) =>
    !id ? 'appId 미설정' : /[{}]/.test(id) ? 'appId가 아직 자리표시자' : null;

  if (config.sources.appstore) {
    const reason = skipReason(config.appstore?.appId);
    if (reason) console.warn(`  - appstore: ${reason}, 건너뜀`);
    else {
      const { appId, country } = config.appstore!;
      tasks.push({
        name: 'appstore',
        run: () => collectAppStore(appId, country, config.collect?.appstorePages ?? 3),
      });
    }
  }
  if (config.sources.googleplay) {
    const reason = skipReason(config.googlePlay?.appId);
    if (reason) console.warn(`  - googleplay: ${reason}, 건너뜀`);
    else {
      const { appId, lang, country } = config.googlePlay!;
      tasks.push({
        name: 'googleplay',
        run: () => collectGooglePlay(appId, lang, country, config.collect?.googlePlayReviewCount ?? 200),
      });
    }
  }
  if (config.sources.naver) {
    tasks.push({ name: 'naver', run: () => collectNaver(config.keywords, config.collect?.naverDisplay ?? 50) });
  }

  // 브라우저 기동 실패가 앱스토어·구글플레이·네이버 수집까지 막으면 안 된다.
  // 여기서 흡수하고 브라우저형 소스만 건너뛴다.
  const needBrowser = config.sources.dcinside || config.sources.threads;
  let browser = null;
  if (needBrowser) {
    try {
      browser = await launchBrowser();
    } catch (e) {
      console.warn(`  ✗ 브라우저 기동 실패, 브라우저 기반 소스 건너뜀 — ${(e as Error).message}`);
    }
  }
  if (browser && config.sources.dcinside) {
    tasks.push({ name: 'dcinside', run: () => collectDcinside(browser, config.keywords) });
  }
  if (browser && config.sources.threads) {
    tasks.push({ name: 'threads', run: () => collectThreads(browser, config.keywords) });
  }

  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  // close() 실패로 이미 수집한 데이터를 통째로 잃지 않게 한다
  await browser?.close().catch((e) => console.warn(`  브라우저 종료 실패(무시): ${(e as Error).message}`));

  let totalNew = 0;
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') {
      console.warn(`  ✗ ${tasks[i].name}: 실패 — ${r.reason?.message ?? r.reason}`);
      return;
    }
    // 한 소스의 삽입 오류가 다른 소스 데이터까지 날리지 않도록 소스 단위로 격리한다
    try {
      const inserted = insertItems(db, r.value);
      totalNew += inserted;
      console.log(`  ✓ ${tasks[i].name}: ${r.value.length}건 수집, 신규 ${inserted}건`);
    } catch (e) {
      console.warn(`  ✗ ${tasks[i].name}: 저장 실패 — ${(e as Error).message}`);
    }
  });

  // 리포트 기준일은 저장 직후에 확정한다. 태깅(배치당 최대 5분)이 자정을 넘기면
  // 방금 저장한 건들이 전날로 남고 리포트만 새 날짜로 만들어져 빈 브리핑이 나간다.
  const today = localDate();

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
  if (!process.env.WEBHOOK_URL) {
    console.log('  - WEBHOOK_URL 미설정, 스킵');
  } else {
    console.log((await sendWebhook(report)) ? '  ✓ 웹훅 전송 완료' : '  ✗ 웹훅 전송 실패 (위 경고 참고)');
  }

  console.log(`\n=== 완료: 신규 ${totalNew}건 ===\n`);
  console.log(report);
}
