import {
  categoryCountsForDate,
  countByRelevance,
  countByService,
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
import { recheckTagger, requestRunNow, saveInterval, startClaudeLogin } from './actions';
import { TourOverlay } from './tour/TourOverlay';
import { buildTourSteps } from './tour/steps';
import type { TaggerStatus } from '@feedback-radar/core';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; tour?: string; page?: string; service?: string }>;
}) {
  // 기본은 관련 글만. 무관 판정 글은 지우지 않고 별도 탭에서 확인한다.
  const params = await searchParams;
  const filter = params.filter === 'irrelevant' ? 'irrelevant' : 'relevant';
  // ?tour=1 이면 진짜 데이터 위에 투어 오버레이를 얹는다 (발표용)
  const liveTour = params.tour === '1';
  const PAGE_SIZE = 50;
  // 잘못된 값(0, 음수, 문자)은 1쪽으로. 범위 초과는 아래에서 총 건수를 안 뒤에 자른다.
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  const config = loadConfig();
  // 여러 서비스를 추적하면 키워드를 다 나열하기보다 서비스명을 보여주는 편이 읽힌다
  const services = resolveServices(config);
  const subtitle =
    services.length > 1 ? services.map((s) => s.name) : (services[0]?.keywords ?? config.keywords);

  const db = openDb();
  const today = localDate();
  // 서비스 칩 건수는 어느 서비스를 골랐든 같아야 하므로 필터 적용 전에 센다
  const serviceCounts = countByService(db, filter);
  // 설정에 없는 값이 URL로 들어오면 무시한다 (빈 화면 대신 전체를 보여준다)
  const service = serviceCounts.some((s) => s.service === params.service)
    ? params.service
    : undefined;

  const stats = getDashboardStats(db, today, service);
  const categories = categoryCountsForDate(db, today, service);
  const counts = countByRelevance(db, service);
  const total = filter === 'irrelevant' ? counts.irrelevant : counts.relevant;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 마지막 쪽을 넘겨 요청하면 빈 표 대신 마지막 쪽을 보여준다
  const page = Math.min(requestedPage, pageCount);
  const items = getRecentItems(db, PAGE_SIZE, filter, (page - 1) * PAGE_SIZE, service);

  /**
   * 화면 상태를 담은 URL을 만든다. 칩·탭·페이저가 서로의 상태를 지우지 않으려면
   * 링크를 한 곳에서 만들어야 한다 (탭이 서비스 선택을 날리는 식의 버그 방지).
   * 탭이나 서비스를 바꾸면 목록 내용이 달라지므로 쪽은 1쪽으로 되돌린다.
   */
  const hrefFor = (o: { filter?: typeof filter; service?: string; page?: number }): string => {
    const q = new URLSearchParams();
    const f = o.filter ?? filter;
    const sv = 'service' in o ? o.service : service;
    if (f === 'irrelevant') q.set('filter', 'irrelevant');
    if (sv) q.set('service', sv);
    if (liveTour) q.set('tour', '1');
    if (o.page && o.page > 1) q.set('page', String(o.page));
    const s = q.toString();
    return s ? `/?${s}` : '/';
  };
  const pitch = liveTour ? getPitchStats(db) : undefined;
  const settings = getSettings(db);
  // 진단은 프로세스를 띄우느라 수 초 걸린다. 매 요청마다 하지 않고 저장된 결과를 읽는다.
  const cliPath = getSetting(db, 'claudeCliCmd');
  const rawStatus = getSetting(db, 'taggerStatus');
  const rawLaunch = getSetting(db, 'loginLaunch');
  db.close();

  let taggerStatus: TaggerStatus | undefined;
  try {
    const parsed = rawStatus ? JSON.parse(rawStatus) : undefined;
    if (parsed && typeof parsed.mode === 'string') taggerStatus = parsed as TaggerStatus;
  } catch {
    // 저장된 값이 깨졌으면 '아직 확인하지 않음'으로 둔다
  }

  let loginLaunch: { launched: boolean; fallbackCommand: string; error?: string } | undefined;
  try {
    loginLaunch = rawLaunch ? JSON.parse(rawLaunch) : undefined;
  } catch {
    // 무시
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
      tagger={{
        status: taggerStatus,
        cliPath,
        recheck: recheckTagger,
        login: startClaudeLogin,
        loginLaunch,
      }}
      itemsHeading={filter === 'irrelevant' ? '걸러진 글' : '수집 결과 (관련 글)'}
      tabs={{
        active: filter,
        relevantCount: counts.relevant,
        irrelevantCount: counts.irrelevant,
        href: (f) => hrefFor({ filter: f }),
      }}
      services={{
        active: service,
        options: serviceCounts.map((s) => ({ name: s.service, count: s.count })),
        total: serviceCounts.reduce((n, s) => n + s.count, 0),
        href: (sv) => hrefFor({ service: sv }),
      }}
      pager={{
        page,
        pageCount,
        total,
        from: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
        to: Math.min(page * PAGE_SIZE, total),
        href: (p) => hrefFor({ page: p }),
      }}
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
