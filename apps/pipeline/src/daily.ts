import fs from 'node:fs';
import path from 'node:path';
import {
  applyTaggerSettings,
  buildChannelSummaries,
  buildDailyReport,
  COLLECT_LIMIT_FIELDS,
  resolveCollectLimits,
  resolveSources,
  type SourceKey,
  langFor,
  loadConfig,
  loadPrivateEnv,
  localDate,
  localIso,
  openRadarStore,
  OPENAI_MODEL_CHOICES,
  reportsDir,
  resolveServices,
  storeCountries,
  resolveTagBatchSize,
  resolveTagger,
  RUN_CANCEL_KEY,
  RUN_TAG_CALL_KEY,
  type RawItem,
} from '@feedback-radar/core';
import { collectAppStore } from './collectors/appstore.js';
import { collectGooglePlay } from './collectors/googleplay.js';
import { collectNaver } from './collectors/naver.js';

loadPrivateEnv();

/** 프리셋의 자리표시자({서비스명} 등)가 그대로 남아 있는지 */
function isPlaceholder(value?: string): boolean {
  return !value || /[{}]/.test(value);
}

export interface RunDailyOptions {
  /** Vercel 수동 실행: OpenAI와 낮은 기본값, 비브라우저 수집기만 사용한다. */
  deployment?: boolean;
}

export async function runDaily(
  forceHeuristic = false,
  only?: SourceKey,
  options: RunDailyOptions = {},
): Promise<void> {
  const deployment = options.deployment === true;
  if (deployment) {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error('Vercel에 OPENAI_API_KEY가 설정되지 않았습니다.');
    }
    process.env.TAGGER_MODE = 'openai';
    process.env.TAGGER_API_PROVIDER = 'openai';
    process.env.OPENAI_STRICT = '1';
  }
  const config = loadConfig();
  const db = await openRadarStore({ allowVercelWrite: deployment });
  console.log(`\n=== ${config.displayName} 피드백 파이프라인 (${localDate()}) ===\n`);

  /**
   * 지난 실행에서 남은 중단 요청을 지우고 시작한다. 안 지우면 한 번 누른 중단이
   * 이후 모든 실행을 즉시 끝내 버린다.
   */
  await db.setSetting(RUN_CANCEL_KEY, '');
  await db.setSetting(RUN_TAG_CALL_KEY, '');

  /**
   * 화면의 [중단] 버튼이 눌렸는지. 값이 있으면 중단이다.
   *
   * 읽기 실패로 실행을 끊지는 않는다. 웹 서버 액션과 겹쳐 SQLITE_BUSY가 날 수 있고,
   * 그때 true를 돌려주면 누르지도 않은 중단이 일어난다. 다음 배치에서 다시 읽으면 된다.
   */
  let cancelRequested = false;
  const refreshCancel = async (): Promise<void> => {
    try {
      cancelRequested = Boolean(await db.getSetting(RUN_CANCEL_KEY));
    } catch (e) {
      console.warn(`  중단 신호 확인 실패(계속 진행): ${(e as Error).message}`);
    }
  };
  const stopRequested = (): boolean => cancelRequested;
  await refreshCancel();
  const cancelPoll = setInterval(() => void refreshCancel(), 1_000);
  cancelPoll.unref();

  // 여러 서비스를 함께 추적할 수 있다. 설정에 services가 없으면 최상위 값이 서비스 하나가 된다.
  const services = resolveServices(config);
  const multi = services.length > 1;
  if (multi) console.log(`추적 대상 ${services.length}개: ${services.map((s) => s.name).join(', ')}\n`);

  // 프리셋을 복사만 하고 값을 안 채우면 자리표시자를 그대로 검색하게 된다.
  // 외부 요청과 LLM 쿼터를 헛되이 쓰기 전에 멈추는 편이 낫다.
  const unfilled = services.flatMap((s) => s.keywords.filter(isPlaceholder));
  if (unfilled.length > 0) {
    clearInterval(cancelPoll);
    await db.close();
    throw new Error(
      `설정을 아직 채우지 않았습니다 (키워드: ${unfilled.join(', ')}).\n` +
        '  private/feedback-radar.config.json에서 displayName, keywords, appId를 본인 서비스 값으로 바꾼 뒤 다시 실행하세요.',
    );
  }

  // 1. 수집: 소스별 독립 실행, 하나가 죽어도 나머지는 계속
  console.log('[1/4] 수집');
  // 대시보드에서 저장한 상한이 있으면 그쪽이, 없으면 설정 파일, 그것도 없으면 기본값
  const settings = await db.getSettings();
  // 대시보드에서 고른 provider/OpenAI 모델을 웹과 별도 프로세스인 스케줄러에도 적용한다.
  // 키 자체는 settings에 없고 private/.env에서만 읽는다.
  applyTaggerSettings(settings);
  if (deployment) {
    // DB에 로컬 CLI 선택값이 저장돼 있어도 배포 함수에서는 OpenAI가 이긴다.
    process.env.TAGGER_MODE = 'openai';
    process.env.TAGGER_API_PROVIDER = 'openai';
    const selectedModel = settings['vercel.openaiModel'];
    if (OPENAI_MODEL_CHOICES.some((choice) => choice.value === selectedModel)) {
      process.env.OPENAI_MODEL = selectedModel;
    }
  }
  const limits = resolveCollectLimits(config, settings, {
    apiDefaults: deployment,
    settingScope: deployment ? 'vercel' : undefined,
  });
  // 대시보드에서 끈 소스는 건너뛴다. only가 있으면 그 하나만 돈다.
  const sources = resolveSources(config, settings, only, {
    settingScope: deployment ? 'vercel' : undefined,
  });
  if (deployment) {
    // 두 소스는 시스템 Chromium을 띄운다. 브라우저 바이너리가 없는 Vercel 함수에서는
    // 실패와 번들 비대화만 만들므로 로컬 실행에만 남긴다.
    sources.dcinside = false;
    sources.threads = false;
  }
  const off = COLLECT_LIMIT_FIELDS.filter((f) => !sources[f.configKey]).map((f) => f.label);
  if (only) console.log(`  ${only} 소스만 실행합니다 (단일 수집)`);
  else if (off.length) console.log(`  꺼진 소스: ${off.join(', ')}`);
  console.log(
    `  상한: ${COLLECT_LIMIT_FIELDS.map((f) => `${f.label} ${limits[f.key]}`).join(', ')}`,
  );
  const tasks: {
    name: string;
    /** 진행 화면이 '<서비스명> 구글플레이 미국'처럼 읽어 주기 위한 메타 */
    service: string;
    source: string;
    country: string;
    run: () => Promise<RawItem[]>;
  }[] = [];
  /**
   * 앱 ID가 없어 건너뛴 작업도 화면에 남긴다.
   * 목록에서 조용히 빠지면 "왜 이 소스는 0건이지"를 화면만 보고는 알 수 없다.
   */
  const skippedTasks: { service: string; source: string; country: string; note: string }[] = [];

  // 소스는 켜져 있는데 앱 ID가 비었을 때 조용히 빠지면
  // "안정성 ★★★인 두 소스가 왜 0건이지"를 알아낼 방법이 없다. 이유를 남긴다.
  const skipReason = (id?: string) =>
    !id ? 'appId 미설정' : /[{}]/.test(id) ? 'appId가 아직 자리표시자' : null;

  const label = (svc: string, src: string) => (multi ? `${svc}/${src}` : src);

  /**
   * 지금 어느 단계를 돌고 있는지 settings에 남긴다.
   *
   * 파이프라인은 수집, 분류, 브리핑을 순서대로 지나는데 화면에는 '실행 중' 한 줄만 떴다.
   * 분류가 수십 분 걸리는 동안 멈춘 것과 구별되지 않아서, 단계와 진행 건수를 남긴다.
   * 값은 문자열 네 개다 (단계 키, 사람이 읽을 라벨, 처리한 수, 전체 수).
   */
  const setRunPhase = async (
    phase: string,
    phaseLabel: string,
    done: number,
    total: number,
  ): Promise<void> => {
    await Promise.all([
      db.setSetting('runPhase', phase),
      db.setSetting('runPhaseLabel', phaseLabel),
      db.setSetting('runPhaseDone', String(done)),
      db.setSetting('runPhaseTotal', String(total)),
    ]);
  };

  for (const svc of services) {
    if (sources.appstore) {
      const reason = skipReason(svc.appstore?.appId);
      if (reason) {
        console.warn(`  - ${label(svc.name, 'appstore')}: ${reason}, 건너뜀`);
        skippedTasks.push({ service: svc.name, source: 'appstore', country: '', note: reason });
      } else {
        const { appId } = svc.appstore!;
        // 국가마다 스토어를 따로 조회한다. 같은 앱이라도 국가를 바꾸면 리뷰 풀이 통째로
        // 달라지므로, 한 국가만 조회하면 나머지 국가 이용자 반응은 한 건도 들어오지 않는다.
        for (const country of storeCountries(svc.appstore)) {
          tasks.push({
            name: `${label(svc.name, 'appstore')}(${country})`,
            service: svc.name,
            source: 'appstore',
            country,
            run: () => collectAppStore(appId, country, limits.appstorePages, svc.name),
          });
        }
      }
    }
    if (sources.googleplay) {
      const reason = skipReason(svc.googlePlay?.appId);
      if (reason) {
        console.warn(`  - ${label(svc.name, 'googleplay')}: ${reason}, 건너뜀`);
        skippedTasks.push({ service: svc.name, source: 'googleplay', country: '', note: reason });
      } else {
        const { appId } = svc.googlePlay!;
        for (const country of storeCountries(svc.googlePlay)) {
          // 저장된 lang은 첫 국가 기준이라 그대로 쓰면 나머지 국가와 어긋난다. 국가에서 다시 만든다.
          const lang = langFor(country);
          tasks.push({
            name: `${label(svc.name, 'googleplay')}(${country})`,
            service: svc.name,
            source: 'googleplay',
            country,
            run: () =>
              collectGooglePlay(appId, lang, country, limits.googlePlayReviewCount, svc.name),
          });
        }
      }
    }
    if (sources.naver) {
      tasks.push({
        name: label(svc.name, 'naver'),
        service: svc.name,
        source: 'naver',
        country: '',
        run: () => collectNaver(svc.keywords, limits.naverDisplay, svc.name),
      });
    }
  }

  // 브라우저 기동 실패가 앱스토어, 구글플레이, 네이버 수집까지 막으면 안 된다.
  // 여기서 흡수하고 브라우저형 소스만 건너뛴다.
  const needBrowser = !deployment && (sources.dcinside || sources.threads);
  let browser: import('playwright').Browser | null = null;
  if (needBrowser) {
    try {
      const { launchBrowser } = await import('./browser.js');
      browser = await launchBrowser();
    } catch (e) {
      console.warn(`  ✗ 브라우저 기동 실패, 브라우저 기반 소스 건너뜀. ${(e as Error).message}`);
    }
  }
  if (browser) {
    const [{ collectDcinside }, { collectThreads }] = await Promise.all([
      import('./collectors/dcinside.js'),
      import('./collectors/threads.js'),
    ]);
    for (const svc of services) {
      if (sources.dcinside) {
        tasks.push({
          name: label(svc.name, 'dcinside'),
          service: svc.name,
          source: 'dcinside',
          country: '',
          run: () => collectDcinside(browser, svc.keywords, svc.name, limits.dcinsidePosts),
        });
      }
      if (sources.threads) {
        tasks.push({
          name: label(svc.name, 'threads'),
          service: svc.name,
          source: 'threads',
          country: '',
          run: () => collectThreads(browser, svc.keywords, svc.name, limits.threadsPosts),
        });
      }
    }
  }

  /**
   * 작업 목록을 화면이 읽을 수 있게 남긴다. 브라우저 스크래핑이 섞여 몇 분씩 걸리는데
   * 그동안 화면에 '실행 중' 한 줄만 뜨면 멈춘 것과 구별되지 않는다.
   * 건너뛴 작업은 시작하자마자 사유와 함께 확정한다.
   */
  await setRunPhase('collect', '수집', 0, tasks.length);
  const runId = await db.startCollectRun([...tasks, ...skippedTasks]);
  await Promise.all(
    skippedTasks.map((s, i) =>
      db.markCollectTask(runId, tasks.length + i, { state: 'skipped', note: s.note }),
    ),
  );

  /**
   * 각 작업은 **끝나는 즉시** 저장하고 상태를 확정한다.
   *
   * 예전에는 allSettled로 전부 기다린 뒤 결과를 한 바퀴 돌며 done을 찍었다. 그러면 모든
   * 작업의 종료 시각이 같아져서, 진행 화면이 '전부 대기 → 전부 진행 → 전부 완료'로만 보인다.
   * 실제로는 앱 스토어 조회가 몇 초, 브라우저 스크래핑이 40초 넘게 걸려 시차가 큰데
   * 그 차이가 기록에 남지 않았다.
   *
   * better-sqlite3는 동기라서 병렬 작업이 동시에 쓰기를 시도해도 서로 겹치지 않는다.
   */
  let totalNew = 0;
  const results = await Promise.allSettled(
    tasks.map(async (t, i) => {
      /**
       * 중단을 눌렀으면 시작하지 않는다.
       *
       * 작업은 전부 동시에 떠 있어서 대부분은 이 확인을 이미 지나쳤을 것이다. 다만
       * 브라우저 스크래핑처럼 다른 작업이 끝나기를 기다리며 늦게 도는 것들은 여기서 걸린다.
       * 이미 시작된 요청은 끝까지 가게 둔다 (중간에 끊으면 받아 둔 데이터만 버린다).
       */
      if (stopRequested()) {
        await db.markCollectTask(runId, i, { state: 'skipped', note: '중단됨' });
        return [];
      }
      await db.markCollectTask(runId, i, { state: 'running' });
      let items: RawItem[];
      try {
        items = await t.run();
      } catch (e) {
        await db.markCollectTask(runId, i, {
          state: 'failed',
          note: ((e as Error).message ?? String(e)).slice(0, 200),
        });
        console.warn(`  ✗ ${t.name}: 실패. ${(e as Error).message}`);
        throw e;
      }
      // 한 소스의 삽입 오류가 다른 소스 데이터까지 날리지 않도록 소스 단위로 격리한다
      try {
        const inserted = await db.insertItems(items);
        totalNew += inserted;
        await db.markCollectTask(runId, i, { state: 'done', collected: items.length, inserted });
        console.log(`  ✓ ${t.name}: ${items.length}건 수집, 신규 ${inserted}건`);
      } catch (e) {
        await db.markCollectTask(runId, i, {
          state: 'failed',
          note: `저장 실패: ${(e as Error).message}`.slice(0, 200),
        });
        console.warn(`  ✗ ${t.name}: 저장 실패. ${(e as Error).message}`);
      }
      return items;
    }),
  );
  // close() 실패로 이미 수집한 데이터를 통째로 잃지 않게 한다
  await browser?.close().catch((e) => console.warn(`  브라우저 종료 실패(무시): ${(e as Error).message}`));
  const failedCount = results.filter((r) => r.status !== 'fulfilled').length;
  if (failedCount > 0) console.warn(`  실패한 작업 ${failedCount}건 (위 로그 참고)`);

  // 리포트 기준일은 저장 직후에 확정한다. 태깅(배치당 최대 5분)이 자정을 넘기면
  // 방금 저장한 건들이 전날로 남고 리포트만 새 날짜로 만들어져 빈 브리핑이 나간다.
  const today = localDate();

  // 2. 태깅: 미태깅 건만
  console.log('\n[2/4] 태깅');
  // 대시보드에서 지정한 claude CLI 경로를 반영한다 (설정 화면 ↔ 파이프라인 연결)
  const cliOverride = await db.getSetting('claudeCliCmd');
  if (cliOverride) process.env.CLAUDE_CLI_CMD = cliOverride;
  const modelOverride = await db.getSetting('claudeCliModel');
  if (modelOverride !== undefined) process.env.CLAUDE_CLI_MODEL = modelOverride;
  const untagged = await db.getUntagged();
  const tagger = await resolveTagger(forceHeuristic);
  console.log(`  태거: ${tagger.name}, 대상: ${untagged.length}건`);
  /**
   * 분류 단계 진행을 화면에 남긴다.
   *
   * 이 단계가 실행 시간의 대부분을 먹는다(수집은 1분, 분류는 수십 분). 그런데 화면에는
   * '수집 실행 중' 한 줄만 떠서, 사람이 보기에는 수집이 끝난 뒤로 아무 일도 일어나지 않는
   * 것처럼 보인다. 몇 건까지 분류했는지 알 수 있어야 한다.
   */
  await setRunPhase('tag', `분류: ${tagger.name}`, 0, untagged.length);
  if (untagged.length > 0) {
    // 배치마다 즉시 저장한다. 전체 재분류는 수십 분이 걸려서, 끝에 한 번만 저장하면
    // 중간에 끊겼을 때 그동안의 호출이 통째로 날아간다. 저장된 건은 tagged_at이 채워져
    // 다음 실행 대상에서 빠지므로, 다시 돌리면 남은 것부터 이어서 한다.
    let savedCount = 0;
    let writeQueue = Promise.resolve();
    const tags = await tagger.tag(untagged, {
      onBatch: (batchResults) => {
        savedCount += batchResults.size;
        const progress = savedCount;
        writeQueue = writeQueue.then(async () => {
          await db.saveTags(batchResults);
          // 배치마다 진행을 갱신한다. 화면은 이 값을 2초마다 읽어 진행 바를 그린다.
          await setRunPhase('tag', `분류: ${tagger.name}`, progress, untagged.length);
        });
        console.log(`  … ${savedCount}/${untagged.length}건 저장`);
      },
      shouldStop: stopRequested,
      // 한 호출에 담을 글 수. 설정에서 바꿀 수 있고, 앞의 몇 호출은 이보다 작게 나간다
      batchSize: resolveTagBatchSize(settings, deployment ? 'vercel' : undefined),
      /**
       * 지금 보내는 프롬프트를 화면에 넘긴다.
       *
       * 응답 하나가 몇 분씩 걸리는데 그동안 화면에는 진행 바만 남아서, 무엇을 근거로
       * 분류하는지도 어디까지 갔는지도 알 수 없었다. 지시부는 호출마다 같으니 그대로
       * 띄우면 판정을 믿을지 판단할 근거가 생기고, 프롬프트를 고칠 단서도 남는다.
       */
      onCall: (call) => {
        writeQueue = writeQueue.then(async () => {
          try {
            await db.setSetting(RUN_TAG_CALL_KEY, JSON.stringify({ ...call, at: localIso() }));
          } catch (e) {
            console.warn(`  호출 정보 기록 실패(무시): ${(e as Error).message}`);
          }
        });
      },
    });
    await writeQueue;
    // 중간 저장을 지원하지 않는 태거(휴리스틱)와 중간 저장이 실패한 건을 위한 마무리.
    // UPDATE라 이미 저장된 건에 다시 써도 결과는 같다.
    await db.saveTags(tags);
    console.log(`  ✓ ${tags.size}건 태깅 완료`);
    // 어떤 모델이 실제로 분류했는지 화면에서 확인할 수 있게 남긴다.
    // haiku, sonnet, opus는 별칭이라 지정값만으로는 어떤 버전이 돌았는지 알 수 없고,
    // 예전에는 이 값이 콘솔 로그로만 나가서 지나가면 사라졌다.
    // 휴리스틱 태거는 usage를 주지 않으므로 빈 값으로 지운다 (옛 기록이 남아 오해를 부른다).
    const tagUsage = tagger.usage?.();
    await db.setSetting(
      'lastTagUsage',
      tagUsage ? JSON.stringify({ ...tagUsage, at: localIso(), tagger: tagger.name }) : '',
    );
  }

  /**
   * 중단을 눌렀으면 여기서 끝낸다.
   *
   * 남은 단계 중 브리핑은 LLM을 다시 부르고 알림은 웹훅을 쏜다. 중단을 눌렀는데 그 둘이
   * 나가면 "멈추라"는 지시를 어기는 셈이다. 분류된 건은 이미 저장돼 있어 다음 실행이
   * 남은 것부터 이어서 하고, 그때 브리핑도 온전한 상태로 만들어진다.
   */
  if (stopRequested()) {
    await setRunPhase('cancelled', '중단됨', 0, 0);
    await db.setSetting(RUN_TAG_CALL_KEY, '');
    const left = (await db.getUntagged()).length;
    console.log(
      `\n중단 요청으로 남은 단계(브리핑, 리포트, 알림)를 건너뜁니다.` +
        `${left > 0 ? ` 미분류 ${left.toLocaleString()}건은 다음 실행에서 이어서 합니다.` : ''}`,
    );
    clearInterval(cancelPoll);
    await db.close();
    return;
  }

  if (deployment) {
    // 채널 브리핑은 현재 Claude CLI 기반이고, Markdown 리포트는 서버리스 파일에 남지 않는다.
    // 심사 화면의 수동 버튼은 수집 + OpenAI 분류까지만 확실히 끝내고 기존 브리핑을 유지한다.
    await setRunPhase('done', '수집·OpenAI 분류 완료', 1, 1);
    console.log(`\n=== 배포판 수동 실행 완료: 신규 ${totalNew}건 ===\n`);
    clearInterval(cancelPoll);
    await db.close();
    return;
  }

  // 3. 채널별 AI 브리핑: 채널마다 성격이 달라(앱 리뷰 vs 커뮤니티) 하나로 합치면 뭉개진다.
  //    원문을 다시 보내지 않고 방금 만든 분류 요약만 쓰므로 채널당 입력이 수백 토큰이다.
  console.log('\n[3/4] 채널 요약');
  // 여러 서비스를 추적하면 서비스별로 따로 요약한다. 합치면 어느 서비스 얘기인지 사라진다
  const summaryTargets = multi ? services.map((s) => s.name) : [undefined];
  await setRunPhase('brief', '채널 브리핑', 0, summaryTargets.length);
  let summaryChannels = 0;
  // 진행은 성공과 실패를 가리지 않고 센다. 실패한 서비스에서 멈춰 보이면 안 된다.
  let summaryDone = 0;
  const summaryUsage = { calls: 0, input: 0, output: 0, cost: 0, models: [] as string[] };
  for (const target of summaryTargets) {
    try {
      const res = await buildChannelSummaries(db, today, target);
      for (const s of res.summaries) await db.saveChannelSummary(s);
      summaryChannels += res.summaries.length;
      summaryUsage.calls += res.llmCalls;
      summaryUsage.input += res.inputTokens;
      summaryUsage.output += res.outputTokens;
      summaryUsage.cost += res.costUsd;
      summaryUsage.models.push(...res.models);
    } catch (e) {
      // 요약은 부가 산출물이다. 실패해도 수집, 분류, 리포트를 되돌리지 않는다
      console.warn(`  요약 실패${target ? ` (${target})` : ''}: ${(e as Error).message}`);
    }
    summaryDone += 1;
    await setRunPhase('brief', '채널 브리핑', summaryDone, summaryTargets.length);
  }
  if (summaryChannels === 0) {
    console.log('  - 오늘 수집분이 없어 건너뜁니다');
  } else {
    const models = [...new Set(summaryUsage.models)].join(', ');
    console.log(
      `  ✓ ${summaryChannels}개 채널 요약 (LLM 호출 ${summaryUsage.calls}회` +
        `${models ? `, ${models}` : ''}` +
        `, 입력 ${summaryUsage.input.toLocaleString()} / 출력 ${summaryUsage.output.toLocaleString()} 토큰` +
        `${summaryUsage.cost > 0 ? `, 환산 $${summaryUsage.cost.toFixed(4)} (구독이면 실청구 0)` : ''})`,
    );
  }

  // 4. 리포트 생성
  console.log('\n[4/4] 리포트 생성');
  const report = await buildDailyReport(db, today, config.displayName);
  const dir = reportsDir();
  fs.mkdirSync(dir, { recursive: true });
  const reportPath = path.join(dir, `${today}.md`);
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`  ✓ ${reportPath}`);

  console.log(`\n=== 완료: 신규 ${totalNew}건 ===\n`);
  console.log(report);
  clearInterval(cancelPoll);
  await db.close();
}
