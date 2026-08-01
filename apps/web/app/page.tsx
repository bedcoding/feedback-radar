import {
  categoryCountsForDate,
  countByRelevance,
  getPitchStats,
  getDashboardStats,
  getRecentItems,
  getSetting,
  getSettings,
  loadConfig,
  localDate,
  openDb,
  resolveServices,
} from '@feedback-radar/core';
import { DashboardView } from './_dashboard/DashboardView';
import { recheckTagger, requestRunNow, saveInterval } from './actions';
import { TourOverlay } from './tour/TourOverlay';
import { buildTourSteps } from './tour/steps';
import type { TaggerStatus } from '@feedback-radar/core';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; tour?: string }>;
}) {
  // 기본은 관련 글만. 무관 판정 글은 지우지 않고 별도 탭에서 확인한다.
  const params = await searchParams;
  const filter = params.filter === 'irrelevant' ? 'irrelevant' : 'relevant';
  // ?tour=1 이면 진짜 데이터 위에 투어 오버레이를 얹는다 (발표용)
  const liveTour = params.tour === '1';

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
  const pitch = liveTour ? getPitchStats(db) : undefined;
  const settings = getSettings(db);
  // 진단은 프로세스를 띄우느라 수 초 걸린다. 매 요청마다 하지 않고 저장된 결과를 읽는다.
  const cliPath = getSetting(db, 'claudeCliCmd');
  const rawStatus = getSetting(db, 'taggerStatus');
  db.close();

  let taggerStatus: TaggerStatus | undefined;
  try {
    const parsed = rawStatus ? JSON.parse(rawStatus) : undefined;
    if (parsed && typeof parsed.mode === 'string') taggerStatus = parsed as TaggerStatus;
  } catch {
    // 저장된 값이 깨졌으면 '아직 확인하지 않음'으로 둔다
  }

  return (
    <>
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
      tagger={{ status: taggerStatus, cliPath, recheck: recheckTagger }}
      itemsHeading={filter === 'irrelevant' ? '걸러진 글 (최근 50건)' : '최근 수집 결과 (관련 글 50건)'}
      tabs={{ active: filter, relevantCount: counts.relevant, irrelevantCount: counts.irrelevant }}
      links={
        <>
          {' · '}
          <a href="/tour">둘러보기(예시) →</a> · <a href="/?tour=1">실데이터 투어 →</a> ·{' '}
          <a href="/pitch">소개 슬라이드 →</a> ·{' '}
          <a href="/deck">동작 원리 슬라이드 →</a>
        </>
      }
      tourMode={liveTour}
    />
    {liveTour && (
      <TourOverlay
        steps={buildTourSteps(config.displayName, {
          live: true,
          metrics: pitch && {
            total: pitch.total,
            irrelevant: pitch.irrelevant,
            services: services.length,
            secondsPerItem: config.pitch?.secondsPerItem ?? 30,
            briefingMinutes: config.pitch?.briefingMinutes ?? 10,
            days: pitch.collectDays,
          },
        })}
      />
    )}
    </>
  );
}
