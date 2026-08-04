'use server';

import { revalidatePath } from 'next/cache';
import {
  addServiceToConfig,
  asSourceKey,
  COLLECT_LIMIT_FIELDS,
  collectLimitKey,
  diagnoseTagger,
  sourceEnabledKey,
  getSetting,
  loadConfig,
  localIso,
  openClaudeLogin,
  openDb,
  removeServiceFromConfig,
  saveConfig,
  setSetting,
  updateDisplayName,
  updateServiceInConfig,
  waitForLogin,
} from '@feedback-radar/core';

/**
 * 추적 서비스 추가·삭제의 실패 사유를 담아 둘 자리.
 *
 * 서버 액션은 값을 돌려줘도 폼 쪽에서 받기가 번거로워서, 다른 상태들과 같은 방식으로
 * settings에 적어 두고 다음 렌더에서 읽어 보여준다. 성공하면 빈 문자열로 지운다.
 */
const SERVICE_ERROR_KEY = 'serviceEditError';

function setServiceError(message: string): void {
  const db = openDb();
  setSetting(db, SERVICE_ERROR_KEY, message);
  db.close();
}

/**
 * 추적 서비스 추가. 설정 파일(private/feedback-radar.config.json)에 직접 쓴다.
 *
 * 검증은 core의 addServiceToConfig가 한다. 잘못된 앱 ID가 들어가면 수집이 조용히
 * 0건이 되므로 형식만이라도 막아 둔다.
 */
export async function addTrackedService(formData: FormData): Promise<void> {
  const keywordsRaw = String(formData.get('keywords') ?? '');
  const { config, error } = addServiceToConfig(loadConfig(), {
    name: String(formData.get('name') ?? ''),
    // 쉼표로 나눈다. 줄바꿈이나 중점을 섞어 넣어도 받아 준다
    keywords: keywordsRaw.split(/[,\n·]/).map((k) => k.trim()),
    appstoreId: String(formData.get('appstoreId') ?? '').trim() || undefined,
    googlePlayId: String(formData.get('googlePlayId') ?? '').trim() || undefined,
    // 쉼표로 나눈다 — 국가를 여러 개 넣으면 국가마다 스토어를 따로 조회한다
    countries: String(formData.get('countries') ?? '').split(/[,\n]/),
  });
  if (!error) saveConfig(config);
  setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 화면 제목 변경. 이 값은 LLM 분류 프롬프트에도 들어가므로 서비스 범위를 담은 이름이 좋다.
 */
export async function saveDisplayName(formData: FormData): Promise<void> {
  const { config, error } = updateDisplayName(
    loadConfig(),
    String(formData.get('displayName') ?? ''),
  );
  if (!error) saveConfig(config);
  setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 추적 서비스의 키워드와 앱 ID 수정.
 *
 * 이름은 bind로 넘긴다. 폼 필드로 넘기면 이름을 고쳐 보낼 수 있게 되는데, items.service에
 * 이름이 저장돼 있어 바뀌면 기존 글이 어느 서비스 것인지 끊긴다.
 */
export async function updateTrackedService(name: string, formData: FormData): Promise<void> {
  const { config, error } = updateServiceInConfig(loadConfig(), name, {
    keywords: String(formData.get('keywords') ?? '').split(/[,\n·]/),
    appstoreId: String(formData.get('appstoreId') ?? '').trim() || undefined,
    googlePlayId: String(formData.get('googlePlayId') ?? '').trim() || undefined,
    // 비워서 저장하면 기존 국가를 유지한다 (updateServiceInConfig 참고)
    countries: String(formData.get('countries') ?? '').split(/[,\n]/),
  });
  if (!error) saveConfig(config);
  setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 추적 서비스 삭제. 이미 수집된 글은 지우지 않는다.
 *
 * 이름은 폼 필드가 아니라 bind로 넘긴다 (formAction 버튼의 name은 React가 덮어쓴다).
 */
export async function removeTrackedService(name: string): Promise<void> {
  const { config, error } = removeServiceFromConfig(loadConfig(), name);
  if (!error) saveConfig(config);
  setServiceError(error ?? '');
  revalidatePath('/');
}

/**
 * 수집 주기(시간) 저장 — 스케줄러가 다음 틱(30초 이내)부터 반영.
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
  const db = openDb();
  setSetting(db, 'intervalHours', auto ? String(hours) : '0');
  db.close();
  revalidatePath('/');
}

/**
 * 소스별 1회 수집 상한 저장.
 *
 * 범위를 벗어난 값은 저장하지 않고 건너뛴다 — 잘못된 값 하나 때문에 나머지 저장까지
 * 막으면 폼이 통째로 안 먹는 것처럼 보인다. 빈 칸은 '설정 파일/기본값 사용'으로 되돌린다.
 */
export async function saveCollectLimits(formData: FormData): Promise<void> {
  const db = openDb();
  for (const f of COLLECT_LIMIT_FIELDS) {
    // 소스 on/off — 체크가 풀리면 폼에 아예 안 실려 오므로 없는 것 = 꺼짐
    setSetting(db, sourceEnabledKey(f.configKey), formData.get(`on.${f.configKey}`) ? '1' : '0');

    const raw = formData.get(f.key);
    if (typeof raw !== 'string') continue;
    if (raw.trim() === '') {
      setSetting(db, collectLimitKey(f.key), '');
      continue;
    }
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= f.min && n <= f.max) {
      setSetting(db, collectLimitKey(f.key), String(n));
    }
  }
  db.close();
  revalidatePath('/');
}

/** "지금 실행" — 스케줄러가 다음 틱(30초 이내)에 즉시 수집 시작 */
export async function requestRunNow(): Promise<void> {
  const db = openDb();
  setSetting(db, 'runRequestedAt', localIso());
  setSetting(db, 'runOnlySource', '');
  db.close();
  revalidatePath('/');
}

/**
 * "이 소스만 실행" — 소스 하나만 즉시 수집한다.
 * 소스를 끄지 않고도 한 곳만 다시 훑어볼 수 있어야 한다
 * (예: 네이버 키를 방금 넣었거나 스크레이퍼를 고친 뒤 그것만 확인).
 *
 * 소스 키는 폼 필드가 아니라 bind로 넘긴다 — formAction을 쓰는 버튼의 name은
 * React가 액션 식별자로 덮어써서 값이 서버에 도달하지 않는다.
 */
export async function requestRunSource(source: string): Promise<void> {
  const only = asSourceKey(source);
  if (!only) return;
  const db = openDb();
  setSetting(db, 'runOnlySource', only);
  setSetting(db, 'runRequestedAt', localIso());
  db.close();
  revalidatePath('/');
}

/**
 * 태거 진단을 다시 실행해 결과를 저장한다.
 * CLI 탐색과 `claude auth status` 호출에 수 초가 걸려서, 대시보드를 열 때마다 하지 않고
 * 저장된 결과를 보여주다가 이 버튼을 눌렀을 때만 갱신한다.
 */
export async function recheckTagger(formData?: FormData): Promise<void> {
  const db = openDb();

  // 경로 입력이 함께 왔으면 먼저 저장한다 (빈 문자열이면 자동 탐색으로 되돌림)
  const raw = formData?.get('cliPath');
  if (typeof raw === 'string') setSetting(db, 'claudeCliCmd', raw.trim());
  const rawModel = formData?.get('model');
  if (typeof rawModel === 'string') setSetting(db, 'claudeCliModel', rawModel.trim());

  const cliPath = getSetting(db, 'claudeCliCmd');
  const model = getSetting(db, 'claudeCliModel');
  try {
    const status = await diagnoseTagger(cliPath, model);
    setSetting(db, 'taggerStatus', JSON.stringify(status));
  } catch (e) {
    setSetting(db, 'taggerStatus', JSON.stringify({ error: (e as Error).message }));
  }
  db.close();
  revalidatePath('/');
}

/**
 * 로그인 터미널을 대신 띄우고, 로그인이 끝날 때까지 기다렸다 상태를 갱신한다.
 *
 * 인증은 공식 CLI가 처리한다 — 이 앱은 인증 코드를 받지도 저장하지도 않는다.
 * 브라우저 승인은 사용자가 직접 해야 하므로 완전 무인 로그인은 불가능하다.
 */
export async function startClaudeLogin(): Promise<void> {
  const db = openDb();
  const cliPath = getSetting(db, 'claudeCliCmd');
  const model = getSetting(db, 'claudeCliModel');

  const launch = await openClaudeLogin(cliPath);
  setSetting(db, 'loginLaunch', JSON.stringify(launch));

  if (launch.launched) {
    // 터미널에서 로그인을 마치면 자동으로 화면이 바뀌도록 잠시 기다린다
    await waitForLogin(cliPath, 90_000, model);
  }

  try {
    setSetting(db, 'taggerStatus', JSON.stringify(await diagnoseTagger(cliPath, model)));
  } catch {
    // 진단 실패는 카드에 이전 상태가 남는 것으로 충분하다
  }
  db.close();
  revalidatePath('/');
}
