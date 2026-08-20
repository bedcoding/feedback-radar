'use server';

import { revalidatePath } from 'next/cache';
import { runDaily } from '@feedback-radar/pipeline/daily';
import {
  addServiceToConfig,
  applyTaggerSettings,
  asSourceKey,
  COLLECT_LIMIT_FIELDS,
  collectLimitKey,
  diagnoseTagger,
  hostKey,
  ownHostSetting,
  sourceEnabledKey,
  X_BUDGET_KEY,
  X_BUDGET_MAX,
  X_BUDGET_MIN,
  X_AUTH_COOKIE,
  X_CSRF_COOKIE,
  X_GAP_KEY,
  X_GAP_MAX,
  X_GAP_MIN,
  X_LONG_BREAK_KEY,
  X_LONG_BREAK_MAX,
  X_LONG_BREAK_MIN,
  X_MODE_KEY,
  X_MODES,
  type XMode,
  xBudgetKey,
  xGapKey,
  xLongBreakKey,
  xModeKey,
  xWebBlockedKey,
  writeXSession,
  removeXSession,
  tagBatchSettingKey,
  TAG_BATCH_KEY,
  TAG_BATCH_MAX,
  TAG_BATCH_MIN,
  localIso,
  openClaudeLogin,
  openRadarStore,
  OPENAI_MODEL_CHOICES,
  removeServiceFromConfig,
  RUN_CANCEL_KEY,
  RUN_TAG_CALL_KEY,
  type SourceKey,
  updateDisplayName,
  updatePromptConfig,
  updateTheqooBoards,
  updateServiceInConfig,
  waitForLogin,
} from '@feedback-radar/core';

/**
 * 추적 서비스 추가, 삭제의 실패 사유를 담아 둘 자리.
 *
 * 서버 액션은 값을 돌려줘도 폼 쪽에서 받기가 번거로워서, 다른 상태들과 같은 방식으로
 * settings에 적어 두고 다음 렌더에서 읽어 보여준다. 성공하면 빈 문자열로 지운다.
 */
const SERVICE_ERROR_KEY = 'serviceEditError';

async function setServiceError(message: string): Promise<void> {
  const db = await openRadarStore();
  await db.setSetting(SERVICE_ERROR_KEY, message);
  await db.close();
}

/**
 * 추적 서비스 추가. 설정 파일(private/feedback-radar.config.json)에 직접 쓴다.
 *
 * 검증은 core의 addServiceToConfig가 한다. 잘못된 앱 ID가 들어가면 수집이 조용히
 * 0건이 되므로 형식만이라도 막아 둔다.
 */
export async function addTrackedService(formData: FormData): Promise<void> {
  const keywordsRaw = String(formData.get('keywords') ?? '');
  const db = await openRadarStore();
  const { config, error } = addServiceToConfig(await db.getConfig(), {
    name: String(formData.get('name') ?? ''),
    // 쉼표로 나눈다. 줄바꿈이나 중점을 섞어 넣어도 받아 준다
    keywords: keywordsRaw.split(/[,\n·]/).map((k) => k.trim()),
    appstoreId: String(formData.get('appstoreId') ?? '').trim() || undefined,
    googlePlayId: String(formData.get('googlePlayId') ?? '').trim() || undefined,
    // 쉼표로 나눈다. 국가를 여러 개 넣으면 국가마다 스토어를 따로 조회한다
    countries: String(formData.get('countries') ?? '').split(/[,\n]/),
  });
  if (!error) await db.setConfig(config);
  await db.close();
  await setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 화면 제목 변경. 이 값은 LLM 분류 프롬프트에도 들어가므로 서비스 범위를 담은 이름이 좋다.
 */
export async function saveDisplayName(formData: FormData): Promise<void> {
  const db = await openRadarStore();
  const { config, error } = updateDisplayName(
    await db.getConfig(),
    String(formData.get('displayName') ?? ''),
  );
  if (!error) await db.setConfig(config);
  await db.close();
  await setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 분류 프롬프트 저장 (도메인 지식, 제외 단어).
 *
 * 이 두 값은 LLM 호출마다 프롬프트 앞부분에 실려 판정 기준이 된다. 오탐을 발견했을 때
 * 설정 파일을 손으로 고치는 대신 화면에서 바로 고칠 수 있어야 개선이 돌아간다.
 */
export async function savePromptConfig(formData: FormData): Promise<void> {
  const db = await openRadarStore();
  const { config, error } = updatePromptConfig(await db.getConfig(), {
    domainPrompt: String(formData.get('domainPrompt') ?? ''),
    // 쉼표와 줄바꿈으로 나눈다. 목록을 어느 쪽으로 적어도 받아 준다
    excludeHints: String(formData.get('excludeHints') ?? '').split(/[,\n]/),
  });
  if (!error) await db.setConfig(config);
  await db.close();
  await setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 추적 서비스의 키워드와 앱 ID 수정.
 *
 * 이름은 bind로 넘긴다. 폼 필드로 넘기면 이름을 고쳐 보낼 수 있게 되는데, items.service에
 * 이름이 저장돼 있어 바뀌면 기존 글이 어느 서비스 것인지 끊긴다.
 */
export async function updateTrackedService(name: string, formData: FormData): Promise<void> {
  const db = await openRadarStore();
  const { config, error } = updateServiceInConfig(await db.getConfig(), name, {
    keywords: String(formData.get('keywords') ?? '').split(/[,\n·]/),
    appstoreId: String(formData.get('appstoreId') ?? '').trim() || undefined,
    googlePlayId: String(formData.get('googlePlayId') ?? '').trim() || undefined,
    // 비워서 저장하면 기존 국가를 유지한다 (updateServiceInConfig 참고)
    countries: String(formData.get('countries') ?? '').split(/[,\n]/),
  });
  if (!error) await db.setConfig(config);
  await db.close();
  await setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 추적 서비스 삭제. 이미 수집된 글은 지우지 않는다.
 *
 * 이름은 폼 필드가 아니라 bind로 넘긴다 (formAction 버튼의 name은 React가 덮어쓴다).
 */
export async function removeTrackedService(name: string): Promise<void> {
  const db = await openRadarStore();
  const { config, error } = removeServiceFromConfig(await db.getConfig(), name);
  if (!error) await db.setConfig(config);
  await db.close();
  await setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * X 세션 삭제. 계정을 바꿀 때 먼저 지우고 새로 넣는다.
 *
 * 저장 폼의 빈 칸이 아니라 별도 버튼인 이유는, 이 칸이 저장된 값을 화면에 되돌려 주지 않기
 * 때문이다. 빈 칸을 '지우기'로 보면 다른 설정을 저장할 때마다 세션이 사라진다.
 */
export async function clearXSession(): Promise<void> {
  if (process.env.VERCEL === '1') return;
  removeXSession();
  const db = await openRadarStore();
  // 세션이 없다는 사실 자체가 다음 실행에서 사유로 다시 기록된다
  await db.setSetting(xWebBlockedKey(), '');
  await db.close();
  revalidatePath('/');
}

/**
 * 수집 주기(시간) 저장: 스케줄러가 다음 틱(30초 이내)부터 반영.
 * '자동 수집' 체크를 풀면 0으로 저장하고, 스케줄러는 [지금 실행]만 받는다.
 */
export async function saveInterval(formData: FormData): Promise<void> {
  const auto = formData.get('auto') === 'on';
  const hours = Number(formData.get('hours'));
  const valid = Number.isFinite(hours) && hours >= 0.5 && hours <= 168;
  if (auto && !valid) {
    revalidatePath('/');
    return;
  }
  const db = await openRadarStore();
  await db.setSetting('intervalHours', auto ? String(hours) : '0');
  await db.close();
  revalidatePath('/');
}

/**
 * 소스별 1회 수집 상한 저장.
 *
 * 범위를 벗어난 값은 저장하지 않고 건너뛴다. 잘못된 값 하나 때문에 나머지 저장까지
 * 막으면 폼이 통째로 안 먹는 것처럼 보인다. 빈 칸은 '설정 파일/기본값 사용'으로 되돌린다.
 */
export async function saveCollectLimits(formData: FormData): Promise<void> {
  const deployment = process.env.VERCEL === '1';
  const settingScope = deployment ? 'vercel' : undefined;
  const db = await openRadarStore({ allowVercelWrite: deployment });
  for (const f of COLLECT_LIMIT_FIELDS) {
    // Chromium이 필요한 소스는 Vercel 함수에서 실행하지 않는다. 조작된 폼으로 값을 보내도
    // 켜지지 않게 서버에서도 고정한다.
    if (deployment && (f.configKey === 'dcinside' || f.configKey === 'threads')) {
      await db.setSetting(sourceEnabledKey(f.configKey, settingScope), '0');
      continue;
    }
    // 소스 on/off: 체크가 풀리면 폼에 아예 안 실려 오므로 없는 것 = 꺼짐
    await db.setSetting(
      sourceEnabledKey(f.configKey, settingScope),
      formData.get(`on.${f.configKey}`) ? '1' : '0',
    );

    const raw = formData.get(f.key);
    if (typeof raw !== 'string') continue;
    if (raw.trim() === '') {
      await db.setSetting(collectLimitKey(f.key, settingScope), '');
      continue;
    }
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= f.min && n <= f.max) {
      await db.setSetting(collectLimitKey(f.key, settingScope), String(n));
    }
  }
  /**
   * X 경로(web/api). 배포판은 Chromium이 없어 web을 쓸 수 없으므로 저장을 받지 않는다.
   * 조작된 폼으로 보내도 파이프라인이 api로 고정하지만, 화면 표시가 어긋나지 않게 여기서도 막는다.
   */
  const rawXMode = formData.get(X_MODE_KEY);
  if (!deployment && typeof rawXMode === 'string' && X_MODES.includes(rawXMode as XMode)) {
    await db.setSetting(xModeKey(settingScope), rawXMode);
  }

  /**
   * X 요청 속도. 범위를 벗어난 값은 건너뛴다(빈 칸은 기본값으로 되돌린다).
   * 긴 휴식은 0도 유효한 값이라 빈 칸과 구별해야 한다.
   */
  for (const [key, keyFn, min, max] of [
    [X_GAP_KEY, xGapKey, X_GAP_MIN, X_GAP_MAX],
    [X_LONG_BREAK_KEY, xLongBreakKey, X_LONG_BREAK_MIN, X_LONG_BREAK_MAX],
  ] as const) {
    const raw = formData.get(key);
    if (typeof raw !== 'string') continue;
    if (raw.trim() === '') {
      await db.setSetting(keyFn(settingScope), '');
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= min && n <= max) {
      await db.setSetting(keyFn(settingScope), String(n));
    }
  }

  /**
   * X 세션 쿠키. 값이 들어왔을 때만 덮어쓴다.
   *
   * 빈 칸은 '그대로 두기'다. 이 칸은 저장된 값을 화면에 되돌려 주지 않으므로(계정 접근권이다),
   * 빈 칸을 '지우기'로 해석하면 다른 설정을 저장할 때마다 세션이 날아간다. 지우는 것은
   * 별도 버튼(clearXSession)이 담당한다.
   *
   * 배포판은 파일시스템이 읽기 전용이고 Chromium도 없어서 이 경로 자체를 쓸 수 없다.
   */
  const rawXAuth = formData.get(X_AUTH_COOKIE);
  if (!deployment && typeof rawXAuth === 'string' && rawXAuth.trim()) {
    const rawXCsrf = formData.get(X_CSRF_COOKIE);
    writeXSession(rawXAuth, typeof rawXCsrf === 'string' ? rawXCsrf : undefined);
    // 새 세션을 넣었으면 예전 막힘 경고는 사실이 아니게 된다
    await db.setSetting(xWebBlockedKey(settingScope), '');
  }

  /**
   * X 월 예산. 회당 상한과 같은 폼에서 저장한다.
   *
   * 범위를 벗어난 값은 건너뛴다(나머지 저장을 막지 않는다). 빈 칸은 기본값으로 되돌리는
   * 다른 칸들과 달리 여기서는 저장하지 않는다. 예산 칸이 비면 무제한으로 읽힐 여지가 생기고,
   * 그건 이 값을 둔 이유와 반대다.
   */
  const rawXBudget = formData.get(X_BUDGET_KEY);
  if (typeof rawXBudget === 'string' && rawXBudget.trim() !== '') {
    const n = Number(rawXBudget);
    if (Number.isFinite(n) && n >= X_BUDGET_MIN && n <= X_BUDGET_MAX) {
      await db.setSetting(xBudgetKey(settingScope), String(n));
    }
  }

  /**
   * 더쿠 게시판 목록. 다른 상한과 달리 settings가 아니라 config에 들어간다.
   *
   * 어느 게시판을 보는지는 테넌트 설정이고, 설정의 원본은 DB의 config다. 검증에 걸리면
   * 저장하지 않고 사유를 남긴다(잘못된 이름을 넣으면 조용히 0건이 된다).
   */
  const rawBoards = formData.get('theqooBoards');
  if (typeof rawBoards === 'string') {
    const { config, error } = updateTheqooBoards(
      await db.getConfig(),
      rawBoards.split(/[,\n]/),
    );
    if (error) await db.setSetting(SERVICE_ERROR_KEY, error);
    else {
      await db.setConfig(config);
      await db.setSetting(SERVICE_ERROR_KEY, '');
    }
  }

  const rawBatchSize = formData.get(TAG_BATCH_KEY);
  if (typeof rawBatchSize === 'string') {
    const n = Math.round(Number(rawBatchSize));
    if (Number.isFinite(n) && n >= TAG_BATCH_MIN && n <= TAG_BATCH_MAX) {
      await db.setSetting(tagBatchSettingKey(settingScope), String(n));
    }
  }
  await db.close();
  revalidatePath('/');
}

/**
 * 배포 함수에서 실행할 수 없는 소스. 시스템 Chromium이 필요하다.
 *
 * 화면에서도 입력칸과 [이것만 실행]을 내리지만, 조작된 폼이 들어와도 돌지 않게
 * 서버에서 한 번 더 막는다.
 */
const DEPLOYMENT_BLOCKED_SOURCES: readonly SourceKey[] = ['dcinside', 'threads'];

/**
 * Vercel 수동 실행: 상주 스케줄러가 없으므로 이 요청 안에서 파이프라인을 직접 돌린다.
 *
 * [한 번 실행]과 [이것만 실행]이 같은 경로를 쓴다. 예전에는 이 로직이 requestRunNow 안에만
 * 있어서, 배포판의 [이것만 실행]은 로컬용 경로(설정에 요청만 적어 두고 스케줄러가 집어 가는
 * 방식)로 빠졌다. 배포판에는 집어 갈 스케줄러가 없으니 눌러도 아무 일도 일어나지 않았다.
 *
 * @param only 이 소스 하나만 수집한다. 생략하면 켜져 있는 소스 전부.
 */
async function runOnVercel(only?: SourceKey): Promise<void> {
  const stateDb = await openRadarStore({ allowVercelWrite: true });
  const previous = await stateDb.getSetting('runningSince');
  // 함수가 강제 종료되면 runningSince가 남을 수 있다. 10분이 지난 값은 이전 실행의
  // 잔해로 보고 새 실행을 허용하고, 그 전에는 중복 클릭을 막는다.
  if (previous && Date.now() - Date.parse(previous) < 10 * 60_000) {
    await stateDb.close();
    return;
  }
  const startedAt = localIso();
  const startedMs = Date.now();
  await stateDb.setSetting('runningSince', startedAt);
  await stateDb.setSetting('runRequestedAt', '');
  // 진행 카드가 '한 소스만 도는 중'인지 보여줄 수 있게 남긴다
  await stateDb.setSetting('runOnlySource', only ?? '');
  await stateDb.close();

  try {
    await runDaily(false, only, { deployment: true });
    const done = await openRadarStore({ allowVercelWrite: true });
    await done.setSetting('lastRunStatus', 'ok');
    await done.close();
  } catch (error) {
    console.error('[vercel] 수동 수집 실패:', error);
    const failed = await openRadarStore({ allowVercelWrite: true });
    await failed.setSetting('lastRunStatus', `error: ${(error as Error).message.slice(0, 200)}`);
    await failed.close();
  } finally {
    const finished = await openRadarStore({ allowVercelWrite: true });
    await finished.setSetting('lastRunAt', localIso());
    await finished.setSetting('lastRunMs', String(Date.now() - startedMs));
    await finished.setSetting('runningSince', '');
    await finished.setSetting('runPhase', '');
    await finished.setSetting('runOnlySource', '');
    await finished.setSetting(RUN_TAG_CALL_KEY, '');
    await finished.close();
    revalidatePath('/');
  }
}

/** 로컬은 스케줄러에 요청하고, Vercel은 이 요청 안에서 제한형 파이프라인을 직접 실행한다. */
export async function requestRunNow(): Promise<void> {
  if (process.env.VERCEL === '1') {
    await runOnVercel();
    return;
  }

  const db = await openRadarStore();
  await db.setSetting('runRequestedAt', localIso());
  await db.setSetting('runOnlySource', '');
  await db.close();
  revalidatePath('/');
}

/**
 * "중단": 돌고 있는 실행을 다음 안전 지점에서 멈춘다.
 *
 * 프로세스를 죽이지 않는다. 파이프라인이 분류 배치 경계마다 이 신호를 확인하고, 이미
 * 분류한 건을 저장한 뒤에 멈춘다. 그래서 눌러도 그동안 쓴 LLM 호출이 버려지지 않고
 * 남은 건만 다음 실행으로 넘어간다. 배치 중간에 끊으면 방금 보낸 호출 하나가 결과만
 * 버린 채 사용 한도를 먹으므로, 즉시 멈추지 않는 편이 오히려 이득이다.
 */
export async function requestCancelRun(): Promise<void> {
  const db = await openRadarStore();
  await db.setSetting(RUN_CANCEL_KEY, localIso());
  // 대기 중인 실행 요청도 함께 지운다. 남겨 두면 방금 멈춘 실행이 30초 뒤에 다시 시작한다
  await db.setSetting('runRequestedAt', '');
  await db.close();
  revalidatePath('/');
}

/**
 * "이 소스만 실행": 소스 하나만 즉시 수집한다.
 * 소스를 끄지 않고도 한 곳만 다시 훑어볼 수 있어야 한다
 * (예: 네이버 키를 방금 넣었거나 스크레이퍼를 고친 뒤 그것만 확인).
 *
 * 소스 키는 폼 필드가 아니라 bind로 넘긴다. formAction을 쓰는 버튼의 name은
 * React가 액션 식별자로 덮어써서 값이 서버에 도달하지 않는다.
 */
export async function requestRunSource(source: string): Promise<void> {
  const only = asSourceKey(source);
  if (!only) return;
  if (process.env.VERCEL === '1') {
    if (DEPLOYMENT_BLOCKED_SOURCES.includes(only)) return;
    await runOnVercel(only);
    return;
  }
  const db = await openRadarStore();
  await db.setSetting('runOnlySource', only);
  await db.setSetting('runRequestedAt', localIso());
  await db.close();
  revalidatePath('/');
}

/** Vercel에서는 공급자는 OpenAI로 고정하고, 비용/품질 선택용 모델만 바꿀 수 있다. */
export async function saveDeploymentOpenAIModel(formData: FormData): Promise<void> {
  if (process.env.VERCEL !== '1') return;
  const model = formData.get('openaiModel');
  if (
    typeof model !== 'string' ||
    !OPENAI_MODEL_CHOICES.some((choice) => choice.value === model)
  ) {
    return;
  }
  const db = await openRadarStore({ allowVercelWrite: true });
  await db.setSetting('vercel.openaiModel', model);
  await db.close();
  revalidatePath('/');
}

/**
 * 태거 진단을 다시 실행해 결과를 저장한다.
 * CLI 탐색과 `claude auth status` 호출에 수 초가 걸려서, 대시보드를 열 때마다 하지 않고
 * 저장된 결과를 보여주다가 이 버튼을 눌렀을 때만 갱신한다.
 */
export async function recheckTagger(formData?: FormData): Promise<void> {
  const db = await openRadarStore();

  // 경로 입력이 함께 왔으면 먼저 저장한다 (빈 문자열이면 자동 탐색으로 되돌림)
  // 실행 파일 경로는 OS마다 다르므로 이 머신 것만 건드린다
  const raw = formData?.get('cliPath');
  if (typeof raw === 'string') await db.setSetting(hostKey('claudeCliCmd'), raw.trim());
  const rawModel = formData?.get('claudeModel') ?? formData?.get('model');
  if (typeof rawModel === 'string') await db.setSetting('claudeCliModel', rawModel.trim());
  const rawMode = formData?.get('taggerMode');
  if (typeof rawMode === 'string') await db.setSetting('taggerMode', rawMode.trim());
  const rawOpenAIModel = formData?.get('openaiModel');
  if (
    typeof rawOpenAIModel === 'string' &&
    OPENAI_MODEL_CHOICES.some((choice) => choice.value === rawOpenAIModel)
  ) {
    await db.setSetting('openaiModel', rawOpenAIModel);
  }

  const settings = await db.getSettings();
  const cliPath = ownHostSetting(settings, 'claudeCliCmd');
  const model = settings.claudeCliModel;
  applyTaggerSettings(settings);
  /*
    진단 결과는 이 머신 것으로만 저장한다. 예전에는 키 하나에 덮어써서, 집 PC에서
    한 번 누르면 회사 PC에서 확인해 둔 결과가 사라졌다(그리고 되돌릴 방법이 없었다).
  */
  try {
    const status = await diagnoseTagger(cliPath, model);
    await db.setSetting(hostKey('taggerStatus'), JSON.stringify(status));
  } catch (e) {
    await db.setSetting(
      hostKey('taggerStatus'),
      JSON.stringify({ error: (e as Error).message, checkedAt: new Date().toISOString() }),
    );
  }
  await db.close();
  revalidatePath('/');
}

/**
 * 로그인 터미널을 대신 띄우고, 로그인이 끝날 때까지 기다렸다 상태를 갱신한다.
 *
 * 인증은 공식 CLI가 처리한다. 이 앱은 인증 코드를 받지도 저장하지도 않는다.
 * 브라우저 승인은 사용자가 직접 해야 하므로 완전 무인 로그인은 불가능하다.
 */
export async function startClaudeLogin(): Promise<void> {
  const db = await openRadarStore();
  const settings = await db.getSettings();
  applyTaggerSettings(settings);
  const cliPath = ownHostSetting(settings, 'claudeCliCmd');
  const model = settings.claudeCliModel;

  // 터미널을 띄운 결과도 이 머신 이야기다 (실패 사유에 이 PC의 경로가 들어간다)
  const launch = await openClaudeLogin(cliPath);
  await db.setSetting(hostKey('loginLaunch'), JSON.stringify(launch));

  if (launch.launched) {
    // 터미널에서 로그인을 마치면 자동으로 화면이 바뀌도록 잠시 기다린다
    await waitForLogin(cliPath, 90_000, model);
  }

  try {
    await db.setSetting(
      hostKey('taggerStatus'),
      JSON.stringify(await diagnoseTagger(cliPath, model)),
    );
  } catch {
    // 진단 실패는 카드에 이전 상태가 남는 것으로 충분하다
  }
  await db.close();
  revalidatePath('/');
}
