import { asSourceKey, getSettings, localIso, openDb, setSetting } from '@feedback-radar/core';
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

/** intervalHours = 0 은 '자동 수집 끔' — 대시보드의 [지금 실행]으로만 돈다 */
function nextRunAt(): { hours: number; auto: boolean; dueAt: number; last: number } {
  const s = getSettings(db);
  const raw = Number(s.intervalHours);
  const auto = Number.isFinite(raw) ? raw > 0 : true;
  const hours = auto ? Math.max(0.5, raw || DEFAULT_HOURS) : 0;
  const last = s.lastRunAt ? Date.parse(s.lastRunAt) : 0;
  return { hours, auto, last, dueAt: auto ? last + hours * 3_600_000 : Infinity };
}

async function tick(): Promise<void> {
  if (running) return;

  // 조건 판단 구간의 DB 접근도 실패할 수 있다(웹 서버 액션과 경합 시 SQLITE_BUSY 등).
  // 여기서 새는 예외는 unhandled rejection이 되어 상주 프로세스를 죽이므로 전부 흡수한다.
  let runRequested = false;
  // UI에서 '이 소스만 실행'을 누르면 소스 키가 함께 온다 (주기 실행은 전체를 돈다)
  let only: ReturnType<typeof asSourceKey>;
  try {
    const s = getSettings(db);
    const { auto, dueAt } = nextRunAt();
    runRequested = Boolean(s.runRequestedAt);
    // 자동이 꺼져 있으면 UI의 [지금 실행]만 받는다
    if (!runRequested && (!auto || Date.now() < dueAt)) return;
    only = runRequested ? asSourceKey(s.runOnlySource) : undefined;

    running = true;
    setSetting(db, 'runRequestedAt', '');
    // 다음 주기 실행이 이 값을 물려받지 않게 즉시 비운다
    setSetting(db, 'runOnlySource', '');
    setSetting(db, 'runningSince', localIso());
  } catch (e) {
    running = false;
    console.error('[scheduler] 틱 준비 실패, 다음 틱에 재시도:', (e as Error).message);
    return;
  }

  console.log(
    `[scheduler] 실행 시작 (${runRequested ? 'UI 요청' : '주기 도래'}${only ? `, ${only} 단일` : ''})`,
  );
  try {
    await runDaily(false, only);
    setSetting(db, 'lastRunStatus', 'ok');
  } catch (e) {
    console.error('[scheduler] 실행 실패:', e);
    // 실행 실패는 DB 경합과 겹치기 쉽다. 이 기록마저 던지면 finally를 지나
    // tick() 밖으로 새어 unhandledRejection으로 프로세스가 죽는다.
    try {
      setSetting(db, 'lastRunStatus', `error: ${(e as Error).message?.slice(0, 200)}`);
    } catch (e2) {
      console.error('[scheduler] 실패 상태 기록 실패:', (e2 as Error).message);
    }
  } finally {
    running = false;
    try {
      setSetting(db, 'lastRunAt', localIso());
      setSetting(db, 'runningSince', '');
      const { hours, auto, dueAt: next } = nextRunAt();
      console.log(
        auto
          ? `[scheduler] 다음 실행: ${new Date(next).toLocaleString('ko-KR')} (${hours}시간 주기)`
          : `[scheduler] 자동 수집 꺼짐 — 대시보드의 [지금 실행]으로만 돕니다`,
      );
    } catch (e) {
      console.error('[scheduler] 상태 기록 실패:', (e as Error).message);
    }
  }
}

// 비정상 종료로 남은 상태 정리
setSetting(db, 'runningSince', '');

const { hours, auto, last, dueAt } = nextRunAt();
console.log(
  auto
    ? `[scheduler] 시작 — 주기 ${hours}시간 (대시보드에서 변경 가능), ` +
        (last
          ? `마지막 실행 ${new Date(last).toLocaleString('ko-KR')}, 다음 실행 ${new Date(dueAt).toLocaleString('ko-KR')}`
          : '첫 실행을 곧 시작합니다')
    : '[scheduler] 시작 — 자동 수집 꺼짐. 대시보드의 [지금 실행]으로만 돕니다',
);

// 상주 프로세스라 예기치 못한 비동기 예외 하나로 수집이 영구히 멈추면 안 된다.
// 다음 틱에 다시 시도할 수 있도록 로그만 남기고 살려 둔다.
process.on('unhandledRejection', (e) => {
  console.error('[scheduler] 처리되지 않은 rejection (계속 실행):', e);
});
process.on('uncaughtException', (e) => {
  console.error('[scheduler] 처리되지 않은 예외 (계속 실행):', e);
});

setInterval(() => void tick(), TICK_MS);
void tick();
