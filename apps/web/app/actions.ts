'use server';

import { revalidatePath } from 'next/cache';
import { diagnoseTagger, getSetting, localIso, openDb, setSetting } from '@feedback-radar/core';

/** 수집 주기(시간) 저장 — 스케줄러가 다음 틱(30초 이내)부터 반영 */
export async function saveInterval(formData: FormData): Promise<void> {
  const hours = Number(formData.get('hours'));
  if (Number.isFinite(hours) && hours >= 0.5 && hours <= 168) {
    const db = openDb();
    setSetting(db, 'intervalHours', String(hours));
    db.close();
  }
  revalidatePath('/');
}

/** "지금 실행" — 스케줄러가 다음 틱(30초 이내)에 즉시 수집 시작 */
export async function requestRunNow(): Promise<void> {
  const db = openDb();
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
  if (typeof raw === 'string') {
    const cliPath = raw.trim();
    setSetting(db, 'claudeCliCmd', cliPath);
  }

  const cliPath = getSetting(db, 'claudeCliCmd');
  try {
    const status = await diagnoseTagger(cliPath);
    setSetting(db, 'taggerStatus', JSON.stringify(status));
  } catch (e) {
    setSetting(db, 'taggerStatus', JSON.stringify({ error: (e as Error).message }));
  }
  db.close();
  revalidatePath('/');
}
