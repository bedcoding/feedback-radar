import { getSettings, openDb, setSetting } from '@feedback-radar/core';
import { runDaily } from './daily.js';

/**
 * 상주 스케줄러 — `npm run dev`(또는 start)로 대시보드와 함께 떠서,
 * UI에서 설정한 주기(N시간)마다 수집 파이프라인을 돌린다.
 *
 * 대시보드와는 SQLite settings 테이블로 통신한다:
 * - intervalHours: 수집 주기 (UI에서 변경, 다음 틱부터 반영)
 * - runRequestedAt: UI의 "지금 실행" 버튼 (다음 틱에 즉시 실행)
 * - lastRunAt / runningSince / lastRunStatus: 상태 표시용
 *
 * 프로세스 시작 시 마지막 실행이 주기보다 오래됐으면 바로 1회 실행한다.
 */

const TICK_MS = 30_000;
const DEFAULT_HOURS = Number(process.env.DEFAULT_INTERVAL_HOURS || 24);

const db = openDb();
if (!getSettings(db).intervalHours) {
  setSetting(db, 'intervalHours', String(DEFAULT_HOURS));
}

let running = false;

function nextRunAt(): { hours: number; dueAt: number; last: number } {
  const s = getSettings(db);
  const hours = Math.max(0.5, Number(s.intervalHours) || DEFAULT_HOURS);
  const last = s.lastRunAt ? Date.parse(s.lastRunAt) : 0;
  return { hours, last, dueAt: last + hours * 3_600_000 };
}

async function tick(): Promise<void> {
  if (running) return;
  const s = getSettings(db);
  const { dueAt } = nextRunAt();
  const runRequested = Boolean(s.runRequestedAt);
  if (!runRequested && Date.now() < dueAt) return;

  running = true;
  setSetting(db, 'runRequestedAt', '');
  setSetting(db, 'runningSince', new Date().toISOString());
  console.log(`[scheduler] 실행 시작 (${runRequested ? 'UI 요청' : '주기 도래'})`);
  try {
    await runDaily(false);
    setSetting(db, 'lastRunStatus', 'ok');
  } catch (e) {
    console.error('[scheduler] 실행 실패:', e);
    setSetting(db, 'lastRunStatus', `error: ${(e as Error).message?.slice(0, 200)}`);
  } finally {
    setSetting(db, 'lastRunAt', new Date().toISOString());
    setSetting(db, 'runningSince', '');
    running = false;
    const { hours, dueAt: next } = nextRunAt();
    console.log(`[scheduler] 다음 실행: ${new Date(next).toLocaleString('ko-KR')} (${hours}시간 주기)`);
  }
}

// 비정상 종료로 남은 상태 정리
setSetting(db, 'runningSince', '');

const { hours, last, dueAt } = nextRunAt();
console.log(
  `[scheduler] 시작 — 주기 ${hours}시간 (대시보드에서 변경 가능), ` +
    (last
      ? `마지막 실행 ${new Date(last).toLocaleString('ko-KR')}, 다음 실행 ${new Date(dueAt).toLocaleString('ko-KR')}`
      : '첫 실행을 곧 시작합니다'),
);

setInterval(() => void tick(), TICK_MS);
void tick();
