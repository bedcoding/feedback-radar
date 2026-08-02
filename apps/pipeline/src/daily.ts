import fs from 'node:fs';
import path from 'node:path';
import {
  buildDailyReport,
  COLLECT_LIMIT_FIELDS,
  getSetting,
  getSettings,
  getUntagged,
  resolveCollectLimits,
  resolveSources,
  type SourceKey,
  insertItems,
  loadConfig,
  loadPrivateEnv,
  localDate,
  openDb,
  reportsDir,
  resolveServices,
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

export async function runDaily(forceHeuristic = false, only?: SourceKey): Promise<void> {
  const config = loadConfig();
  const db = openDb();
  console.log(`\n=== ${config.displayName} 피드백 파이프라인 (${localDate()}) ===\n`);

  // 여러 서비스를 함께 추적할 수 있다. 설정에 services가 없으면 최상위 값이 서비스 하나가 된다.
  const services = resolveServices(config);
  const multi = services.length > 1;
  if (multi) console.log(`추적 대상 ${services.length}개: ${services.map((s) => s.name).join(', ')}\n`);

  // 프리셋을 복사만 하고 값을 안 채우면 자리표시자를 그대로 검색하게 된다.
  // 외부 요청과 LLM 쿼터를 헛되이 쓰기 전에 멈추는 편이 낫다.
  const unfilled = services.flatMap((s) => s.keywords.filter(isPlaceholder));
  if (unfilled.length > 0) {
    db.close();
    throw new Error(
      `설정을 아직 채우지 않았습니다 (키워드: ${unfilled.join(', ')}).\n` +
        '  private/feedback-radar.config.json 에서 displayName · keywords · appId 를 본인 서비스 값으로 바꾼 뒤 다시 실행하세요.',
    );
  }

  // 1. 수집 — 소스별 독립 실행, 하나가 죽어도 나머지는 계속
  console.log('[1/4] 수집');
  // 대시보드에서 저장한 상한이 있으면 그쪽이, 없으면 설정 파일, 그것도 없으면 기본값
  const settings = getSettings(db);
  const limits = resolveCollectLimits(config, settings);
  // 대시보드에서 끈 소스는 건너뛴다. only가 있으면 그 하나만 돈다.
  const sources = resolveSources(config, settings, only);
  const off = COLLECT_LIMIT_FIELDS.filter((f) => !sources[f.configKey]).map((f) => f.label);
  if (only) console.log(`  ${only} 소스만 실행합니다 (단일 수집)`);
  else if (off.length) console.log(`  꺼진 소스: ${off.join(', ')}`);
  console.log(
    `  상한: ${COLLECT_LIMIT_FIELDS.map((f) => `${f.label} ${limits[f.key]}`).join(' · ')}`,
  );
  const tasks: { name: string; run: () => Promise<RawItem[]> }[] = [];

  // 소스는 켜져 있는데 앱 ID가 비었을 때 조용히 빠지면
  // "안정성 ★★★인 두 소스가 왜 0건이지"를 알아낼 방법이 없다. 이유를 남긴다.
  const skipReason = (id?: string) =>
    !id ? 'appId 미설정' : /[{}]/.test(id) ? 'appId가 아직 자리표시자' : null;

  const label = (svc: string, src: string) => (multi ? `${svc}/${src}` : src);

  for (const svc of services) {
    if (sources.appstore) {
      const reason = skipReason(svc.appstore?.appId);
      if (reason) console.warn(`  - ${label(svc.name, 'appstore')}: ${reason}, 건너뜀`);
      else {
        const { appId, country } = svc.appstore!;
        tasks.push({
          name: label(svc.name, 'appstore'),
          run: () => collectAppStore(appId, country ?? 'kr', limits.appstorePages, svc.name),
        });
      }
    }
    if (sources.googleplay) {
      const reason = skipReason(svc.googlePlay?.appId);
      if (reason) console.warn(`  - ${label(svc.name, 'googleplay')}: ${reason}, 건너뜀`);
      else {
        const { appId, lang, country } = svc.googlePlay!;
        tasks.push({
          name: label(svc.name, 'googleplay'),
          run: () =>
            collectGooglePlay(appId, lang ?? 'ko', country ?? 'kr', limits.googlePlayReviewCount, svc.name),
        });
      }
    }
    if (sources.naver) {
      tasks.push({
        name: label(svc.name, 'naver'),
        run: () => collectNaver(svc.keywords, limits.naverDisplay, svc.name),
      });
    }
  }

  // 브라우저 기동 실패가 앱스토어·구글플레이·네이버 수집까지 막으면 안 된다.
  // 여기서 흡수하고 브라우저형 소스만 건너뛴다.
  const needBrowser = sources.dcinside || sources.threads;
  let browser = null;
  if (needBrowser) {
    try {
      browser = await launchBrowser();
    } catch (e) {
      console.warn(`  ✗ 브라우저 기동 실패, 브라우저 기반 소스 건너뜀 — ${(e as Error).message}`);
    }
  }
  if (browser) {
    for (const svc of services) {
      if (sources.dcinside) {
        tasks.push({
          name: label(svc.name, 'dcinside'),
          run: () => collectDcinside(browser, svc.keywords, svc.name, limits.dcinsidePosts),
        });
      }
      if (sources.threads) {
        tasks.push({
          name: label(svc.name, 'threads'),
          run: () => collectThreads(browser, svc.keywords, svc.name, limits.threadsPosts),
        });
      }
    }
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
  // 대시보드에서 지정한 claude CLI 경로를 반영한다 (설정 화면 ↔ 파이프라인 연결)
  const cliOverride = getSetting(db, 'claudeCliCmd');
  if (cliOverride) process.env.CLAUDE_CLI_CMD = cliOverride;
  const modelOverride = getSetting(db, 'claudeCliModel');
  if (modelOverride !== undefined) process.env.CLAUDE_CLI_MODEL = modelOverride;
  const untagged = getUntagged(db);
  const tagger = await resolveTagger(forceHeuristic);
  console.log(`  태거: ${tagger.name}, 대상: ${untagged.length}건`);
  if (untagged.length > 0) {
    // 배치마다 즉시 저장한다. 전체 재분류는 수십 분이 걸려서, 끝에 한 번만 저장하면
    // 중간에 끊겼을 때 그동안의 호출이 통째로 날아간다. 저장된 건은 tagged_at이 채워져
    // 다음 실행 대상에서 빠지므로, 다시 돌리면 남은 것부터 이어서 한다.
    let savedCount = 0;
    const tags = await tagger.tag(untagged, (batchResults) => {
      saveTags(db, batchResults);
      savedCount += batchResults.size;
      console.log(`  … ${savedCount}/${untagged.length}건 저장`);
    });
    // 중간 저장을 지원하지 않는 태거(휴리스틱)와 중간 저장이 실패한 건을 위한 마무리.
    // UPDATE라 이미 저장된 건에 다시 써도 결과는 같다.
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
