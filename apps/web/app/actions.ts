'use server';

import { revalidatePath } from 'next/cache';
import { openDb, setSetting } from '@feedback-radar/core';

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
  setSetting(db, 'runRequestedAt', new Date().toISOString());
  db.close();
  revalidatePath('/');
}
