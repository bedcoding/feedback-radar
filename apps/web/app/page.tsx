import {
  categoryCountsForDate,
  getDashboardStats,
  getRecentItems,
  getSettings,
  loadConfig,
  localDate,
  openDb,
} from '@feedback-radar/core';
import { DashboardView } from './_dashboard/DashboardView';
import { requestRunNow, saveInterval } from './actions';

export const dynamic = 'force-dynamic';

export default function Home() {
  const config = loadConfig();
  const db = openDb();
  const today = localDate();
  const stats = getDashboardStats(db, today);
  const categories = categoryCountsForDate(db, today);
  const items = getRecentItems(db, 50);
  const settings = getSettings(db);
  db.close();

  return (
    <DashboardView
      data={{
        displayName: config.displayName,
        keywords: config.keywords,
        today,
        stats,
        categories,
        items,
        intervalHours: Number(settings.intervalHours) || 24,
        lastRunAt: settings.lastRunAt,
        isRunning: Boolean(settings.runningSince),
        runQueued: Boolean(settings.runRequestedAt),
        lastRunStatus: settings.lastRunStatus,
      }}
      actions={{ saveInterval, requestRunNow }}
      links={
        <>
          {' · '}
          <a href="/tour">둘러보기 →</a> · <a href="/pitch">소개 슬라이드 →</a> ·{' '}
          <a href="/deck">동작 원리 슬라이드 →</a>
        </>
      }
    />
  );
}
