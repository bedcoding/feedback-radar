import {
  categoryCountsForDate,
  countByRelevance,
  getDashboardStats,
  getRecentItems,
  getSettings,
  loadConfig,
  localDate,
  openDb,
  resolveServices,
} from '@feedback-radar/core';
import { DashboardView } from './_dashboard/DashboardView';
import { requestRunNow, saveInterval } from './actions';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  // 기본은 관련 글만. 무관 판정 글은 지우지 않고 별도 탭에서 확인한다.
  const filter = (await searchParams).filter === 'irrelevant' ? 'irrelevant' : 'relevant';

  const config = loadConfig();
  // 여러 서비스를 추적하면 키워드를 다 나열하기보다 서비스명을 보여주는 편이 읽힌다
  const services = resolveServices(config);
  const subtitle =
    services.length > 1 ? services.map((s) => s.name) : (services[0]?.keywords ?? config.keywords);

  const db = openDb();
  const today = localDate();
  const stats = getDashboardStats(db, today);
  const categories = categoryCountsForDate(db, today);
  const items = getRecentItems(db, 50, filter);
  const counts = countByRelevance(db);
  const settings = getSettings(db);
  db.close();

  return (
    <DashboardView
      data={{
        displayName: config.displayName,
        keywords: subtitle,
        keywordsLabel: services.length > 1 ? '추적 서비스' : '키워드',
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
      itemsHeading={filter === 'irrelevant' ? '걸러진 글 (최근 50건)' : '최근 수집 결과 (관련 글 50건)'}
      tabs={{ active: filter, relevantCount: counts.relevant, irrelevantCount: counts.irrelevant }}
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
