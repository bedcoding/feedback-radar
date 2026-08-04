import {
  CATEGORIES,
  categoryCountsForDate,
  countByCategory,
  countByCountry,
  countByService,
  countUntagged,
  estimateTagCalls,
  getCollectProgress,
  storeCountries,
  countItems,
  estimateMaxPerRun,
  getChannelSummaries,
  getChannelTrend,
  getSummaryDates,
  resolveCollectLimits,
  resolveSources,
  SOURCE_KEYS,
  sourceCoverage,
  getPitchStats,
  getDashboardStats,
  getRecentItems,
  getSetting,
  getSettings,
  loadConfig,
  localDate,
  openDb,
  rawServices,
  resolveServices,
} from '@feedback-radar/core';
import { DashboardView } from './_dashboard/DashboardView';
import {
  addTrackedService,
  recheckTagger,
  removeTrackedService,
  saveDisplayName,
  updateTrackedService,
  requestRunNow,
  requestRunSource,
  saveCollectLimits,
  saveInterval,
  startClaudeLogin,
} from './actions';
import { TourOverlay } from './tour/TourOverlay';
import { buildTourSteps } from './tour/steps';
import type { ItemQuery, TaggerStatus, TaggerUsage } from '@feedback-radar/core';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    tour?: string;
    page?: string;
    service?: string;
    period?: string;
    /** AI 브리핑에서 보고 있는 날짜 (없으면 요약이 있는 가장 최근 날짜) */
    sdate?: string;
    /** 화면 탭 — brief(기본) | items | settings */
    tab?: string;
    /** 카테고리 필터 (집계 표에서 넘어올 때) */
    cat?: string;
    /** 스토어 국가 필터 (앱 리뷰만 해당) */
    country?: string;
  }>;
}) {
  // 기본은 관련 글만. 무관 판정 글은 지우지 않고 별도 탭에서 확인한다.
  const params = await searchParams;
  const filter = params.filter === 'irrelevant' ? 'irrelevant' : 'relevant';
  // ?tour=1 이면 진짜 데이터 위에 투어 오버레이를 얹는다 (발표용)
  const liveTour = params.tour === '1';
  const PAGE_SIZE = 50;
  // 잘못된 값(0, 음수, 문자)은 1쪽으로. 범위 초과는 아래에서 총 건수를 안 뒤에 자른다.
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  /**
   * 화면을 성격별로 갈라 놓는다. 한 화면에 브리핑·통계·목록 50건·설정이 다 있으면
   * 정작 매일 봐야 하는 요약이 스크롤에 묻힌다.
   *
   * **투어(?tour=1)에서는 탭을 무시하고 전부 렌더한다.** 투어 오버레이는 data-tour 속성으로
   * 요소를 찾아 scheduler→stats→categories→items→tagger 순서로 순회하는데, 탭으로 갈라
   * 놓으면 다른 탭에 있는 요소를 못 찾아 투어가 중간에 멈춘다.
   */
  const TAB_KEYS = ['brief', 'items', 'settings'] as const;
  const tab = TAB_KEYS.includes(params.tab as (typeof TAB_KEYS)[number])
    ? (params.tab as (typeof TAB_KEYS)[number])
    : 'brief';
  const showBrief = liveTour || tab === 'brief';
  const showItems = liveTour || tab === 'items';
  const showSettings = liveTour || tab === 'settings';

  const config = loadConfig();
  // 여러 서비스를 추적하면 키워드를 다 나열하기보다 서비스명을 보여주는 편이 읽힌다
  const services = resolveServices(config);
  const subtitle =
    services.length > 1 ? services.map((s) => s.name) : (services[0]?.keywords ?? config.keywords);

  const db = openDb();
  const today = localDate();

  // 기간은 '작성일(posted_at)' 기준 — 우리가 언제 긁어왔는지보다 글이 언제 쓰였는지가 중요하다
  const daysAgo = (n: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDate(d);
  };
  const PERIODS = [
    { key: 'all', label: '전체', from: undefined as string | undefined },
    { key: 'today', label: '오늘', from: today },
    { key: '7d', label: '최근 7일', from: daysAgo(6) },
    { key: '30d', label: '최근 30일', from: daysAgo(29) },
  ];
  const period = PERIODS.some((p) => p.key === params.period) ? params.period! : 'all';
  const postedFrom = PERIODS.find((p) => p.key === period)!.from;

  // 선택한 서비스는 설정에 있는 이름만 인정한다. 건수 집계(칩 표시용)와 분리해 두면
  // 목록 탭이 아닐 때 불필요한 GROUP BY를 돌지 않는다.
  const service = services.some((s) => s.name === params.service) ? params.service : undefined;
  // 분류 체계에 있는 값만 인정한다 (URL로 아무 값이나 들어와 빈 목록이 되지 않게)
  const category = CATEGORIES.includes(params.cat as (typeof CATEGORIES)[number])
    ? params.cat
    : undefined;
  /**
   * 국가는 형식만 본다. 카테고리처럼 고정 목록이 없고 설정에서 국가를 늘리는 즉시
   * 새 값이 들어오기 때문이다. DB에 없는 국가가 들어오면 목록이 0건으로 보이는데,
   * 이 값은 칩으로만 고르므로 실제로 그렇게 될 일이 없다.
   */
  const country = /^[a-z]{2}$/.test(params.country ?? '') ? params.country : undefined;
  // 서비스 칩은 목록 탭의 필터다. 브리핑은 서비스별 카드로 이미 갈라져 있어 칩이 없어도 읽힌다
  // (목록에서 서비스를 고른 뒤 브리핑으로 넘어가면 URL의 service가 그대로 적용된다).
  const serviceCounts = showItems ? countByService(db, filter, postedFrom, country) : [];
  // 칩 건수는 자기 조건을 뺀 상태로 센다 (어느 카테고리를 골랐든 칩의 숫자는 같아야 한다)
  const categoryCounts = showItems
    ? countByCategory(db, filter, service, postedFrom, country)
    : [];
  // 국가 칩도 자기 조건(country)은 빼고 센다 — 어느 국가를 골랐든 칩의 숫자는 같아야 한다
  const countryCounts = showItems ? countByCountry(db, filter, service, postedFrom) : [];

  // ── 브리핑 탭 데이터 ───────────────────────────────────────
  const stats = showBrief
    ? getDashboardStats(db, today, service)
    : { total: 0, today: 0, bySource: [], bySentiment: [] };
  const categories = showBrief ? categoryCountsForDate(db, today, service) : [];
  // 요약이 있는 날짜만 넘겨 볼 수 있게 한다 (없는 날을 고르면 빈 카드가 된다)
  const summaryDates = showBrief ? getSummaryDates(db, 14) : [];
  const summaryDate =
    params.sdate && summaryDates.includes(params.sdate) ? params.sdate : (summaryDates[0] ?? today);
  const channelSummaries = showBrief ? getChannelSummaries(db, summaryDate, service) : [];
  const channelTrend = showBrief ? getChannelTrend(db, 7, service) : [];

  // ── 목록 탭 데이터 ─────────────────────────────────────────
  // 카테고리 필터가 걸리면 탭·기간 건수도 그 안에서 세야 화면이 앞뒤가 맞는다
  const counts = showItems
    ? {
        relevant: countItems(db, { filter: 'relevant', service, postedFrom, category, country }),
        irrelevant: countItems(db, {
          filter: 'irrelevant',
          service,
          postedFrom,
          category,
          country,
        }),
      }
    : { relevant: 0, irrelevant: 0 };
  const total = filter === 'irrelevant' ? counts.irrelevant : counts.relevant;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 마지막 쪽을 넘겨 요청하면 빈 표 대신 마지막 쪽을 보여준다
  const page = Math.min(requestedPage, pageCount);
  // 타입을 붙여야 filter가 string으로 넓어지지 않고 RelevanceFilter로 검사된다
  const q: ItemQuery = { filter, service, postedFrom, category, country };
  const items = showItems ? getRecentItems(db, PAGE_SIZE, q, (page - 1) * PAGE_SIZE) : [];
  // 기간 칩 건수는 현재 서비스·탭·카테고리·국가 선택을 반영한다 (기간만 바꿔 본 결과)
  const periodCounts = showItems
    ? PERIODS.map((p) => ({
        key: p.key,
        label: p.label,
        count: countItems(db, { filter, service, postedFrom: p.from, category, country }),
      }))
    : [];
  // 작성일을 못 가져온 건 — 기간을 걸면 빠지므로 화면에 알려 준다
  const undated = showItems
    ? countItems(db, { filter, service, category, country }) -
      countItems(db, { filter, service, category, country, postedFrom: '0000' })
    : 0;
  /**
   * 국가 칩의 '전체'에 쓸 건수 — 국가 필터를 해제한 상태의 건수다.
   *
   * 국가별 건수의 합을 쓰면 안 된다. 국가가 있는 건 앱 리뷰뿐이고, 국가를 해제하면
   * 국가가 없는 커뮤니티 글이 전부 다시 들어와서 합계와 실제 결과가 크게 어긋난다.
   */
  const totalAllCountries = showItems
    ? countItems(db, { filter, service, postedFrom, category })
    : 0;

  const pitch = liveTour ? getPitchStats(db) : undefined;
  // 스케줄러 상태는 어느 탭에서든 상단에 보여준다
  const settings = getSettings(db);
  /**
   * 수집 작업별 진행 상태. 탭과 무관하게 읽는다 — 수집은 몇 분씩 걸리므로 어느 화면에
   * 있든 진행 상황이 보여야 한다. 작업 수십 개짜리 단일 표 조회라 비용도 작다.
   */
  const collectTasks = getCollectProgress(db);
  // 진단은 프로세스를 띄우느라 수 초 걸린다. 매 요청마다 하지 않고 저장된 결과를 읽는다.
  const cliPath = getSetting(db, 'claudeCliCmd');
  const rawStatus = getSetting(db, 'taggerStatus');
  const rawLaunch = getSetting(db, 'loginLaunch');
  // 마지막 분류가 실제로 어떤 모델로 돌았는지 (별칭이 해석된 정식 ID)
  const rawTagUsage = getSetting(db, 'lastTagUsage');
  // 소스별로 지금까지 실제 긁어온 범위 (수집량 카드에서 상한과 짝지어 보여준다)
  const coverage = showSettings
    ? Object.fromEntries(
        sourceCoverage(db).map((c) => [
          c.source,
          { count: c.count, oldest: c.oldest ?? undefined, newest: c.newest ?? undefined },
        ]),
      )
    : {};
  /**
   * 미분류 건수. **DB를 닫기 전에 세야 한다.**
   *
   * 이 값은 아래 예상 분류 호출 계산에 쓰이는데, 그 계산이 db.close() 뒤에 있어서
   * 조회를 거기에 두면 "The database connection is not open"으로 페이지가 500이 된다.
   */
  const pendingUntagged = countUntagged(db);
  db.close();

  /**
   * 화면 상태를 담은 URL을 만든다. 칩·탭·페이저가 서로의 상태를 지우지 않으려면
   * 링크를 한 곳에서 만들어야 한다 (탭이 서비스 선택을 날리는 식의 버그 방지).
   * 서비스나 기간을 바꾸면 목록 내용이 달라지므로 쪽은 1쪽으로 되돌린다.
   */
  const hrefFor = (o: {
    filter?: typeof filter;
    service?: string;
    period?: string;
    page?: number;
    sdate?: string;
    tab?: (typeof TAB_KEYS)[number];
    /** null을 넘기면 카테고리 필터를 해제한다 */
    cat?: string | null;
    /** null을 넘기면 국가 필터를 해제한다 */
    country?: string | null;
  }): string => {
    const p = new URLSearchParams();
    const f = o.filter ?? filter;
    const sv = 'service' in o ? o.service : service;
    const pd = o.period ?? period;
    const sd = o.sdate ?? summaryDate;
    const tb = o.tab ?? tab;
    const ct = 'cat' in o ? o.cat : category;
    const cty = 'country' in o ? o.country : country;
    // 기본값은 URL에 남기지 않는다 — 주소가 짧으면 공유·디버깅이 쉽다
    if (tb !== 'brief') p.set('tab', tb);
    if (f === 'irrelevant') p.set('filter', 'irrelevant');
    if (ct) p.set('cat', ct);
    if (cty) p.set('country', cty);
    if (sv) p.set('service', sv);
    if (pd !== 'all') p.set('period', pd);
    if (sd && summaryDates.length > 0 && sd !== summaryDates[0]) p.set('sdate', sd);
    if (liveTour) p.set('tour', '1');
    if (o.page && o.page > 1) p.set('page', String(o.page));
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };

  // 0은 '자동 수집 끔'이라는 뜻이 있는 값이라 falsy 폴백을 쓰면 안 된다.
  // 값이 아예 없거나 숫자가 아닐 때만 기본 24로 본다.
  const rawInterval = settings.intervalHours;
  const parsedInterval = Number(rawInterval);
  const intervalHours =
    rawInterval !== undefined && rawInterval !== '' && Number.isFinite(parsedInterval)
      ? parsedInterval
      : 24;

  // 1회 수집 상한 — 앱 개수·키워드 개수를 알아야 최대 유입량을 추산할 수 있다
  const collectLimits = resolveCollectLimits(config, settings);
  // 소스 on/off — 설정 파일 값을 대시보드 저장값이 덮어쓴다
  const sourcesOn = resolveSources(config, settings);
  // 소스 키를 미리 묶어 둔다 — formAction 버튼의 name은 React가 덮어써서 못 쓴다
  const runOneBySource = Object.fromEntries(
    SOURCE_KEYS.map((k) => [k, requestRunSource.bind(null, k)]),
  );
  // 관리 화면에는 병합 전 원본을 보여준다 (resolveServices는 전역 힌트를 섞어 돌려준다)
  const editableServices = rawServices(config);
  const removeServiceByName = Object.fromEntries(
    editableServices.map((s) => [s.name, removeTrackedService.bind(null, s.name)]),
  );
  const updateServiceByName = Object.fromEntries(
    editableServices.map((s) => [s.name, updateTrackedService.bind(null, s.name)]),
  );
  /**
   * 앱 소스는 국가별로 따로 조회하므로 '앱 개수'가 아니라 '조회 횟수'로 센다.
   * 앱 3개를 세 국가에서 보면 조회가 9번이고, 앱 개수로 세면 추산이 국가 수만큼 적게 나온다.
   * daily.ts가 만드는 작업 수와 같은 기준이어야 화면의 숫자를 믿고 상한을 정할 수 있다.
   */
  const appstoreQueries = services.reduce(
    (n, s) => n + (s.appstore?.appId ? storeCountries(s.appstore).length : 0),
    0,
  );
  const googlePlayQueries = services.reduce(
    (n, s) => n + (s.googlePlay?.appId ? storeCountries(s.googlePlay).length : 0),
    0,
  );
  const keywordCount = services.reduce((n, s) => n + s.keywords.length, 0);
  const collectEstimate = estimateMaxPerRun(
    collectLimits,
    { appstoreQueries, googlePlayQueries, keywords: keywordCount },
    sourcesOn,
  );
  /**
   * 예상 분류 호출 횟수. 비용은 건수가 아니라 호출 횟수로 결정된다
   * (25건을 한 프롬프트에 묶고, 호출마다 CLI 자체 시스템 프롬프트를 싣는다).
   * 이미 쌓인 미분류 건도 같은 실행에서 처리되므로 함께 센다.
   * pendingUntagged는 DB를 닫기 전에 위에서 세 둔 값이다.
   */
  const estimatedTagCalls = estimateTagCalls(collectEstimate, pendingUntagged);

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

  let lastUsage: (TaggerUsage & { at: string; tagger: string }) | undefined;
  try {
    const parsed = rawTagUsage ? JSON.parse(rawTagUsage) : undefined;
    // 휴리스틱으로 돌면 빈 문자열로 지워지므로 models 배열이 있는지로 판단한다
    if (parsed && Array.isArray(parsed.models)) lastUsage = parsed;
  } catch {
    // 저장된 값이 깨졌으면 표시하지 않는다
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
        // `|| 24` 로 쓰면 안 된다 — 0('자동 수집 끔')이 기본값으로 되돌아간다
        intervalHours: intervalHours,
        lastRunAt: settings.lastRunAt,
        isRunning: Boolean(settings.runningSince),
        runQueued: Boolean(settings.runRequestedAt),
        lastRunStatus: settings.lastRunStatus,
      }}
      actions={{ saveInterval, requestRunNow }}
      collect={{
        limits: collectLimits,
        estimate: collectEstimate,
        tagCalls: estimatedTagCalls,
        pending: pendingUntagged,
        coverage,
        on: sourcesOn,
        save: saveCollectLimits,
        runOne: runOneBySource,
        busy: Boolean(settings.runningSince) || Boolean(settings.runRequestedAt),
      }}
      nav={{
        active: tab,
        items: [
          { key: 'brief', label: '브리핑' },
          { key: 'items', label: '목록' },
          { key: 'settings', label: '설정' },
        ],
        href: (t) => hrefFor({ tab: t as (typeof TAB_KEYS)[number] }),
      }}
      show={{ brief: showBrief, items: showItems, settings: showSettings }}
      servicesAdmin={{
        list: editableServices,
        displayName: config.displayName,
        saveName: saveDisplayName,
        add: addTrackedService,
        update: updateServiceByName,
        remove: removeServiceByName,
        error: settings.serviceEditError || undefined,
      }}
      briefing={{
        date: summaryDate,
        dates: summaryDates,
        summaries: channelSummaries,
        trend: channelTrend,
        href: (d) => hrefFor({ sdate: d }),
      }}
      tagger={{
        status: taggerStatus,
        cliPath,
        recheck: recheckTagger,
        login: startClaudeLogin,
        loginLaunch,
        lastUsage,
      }}
      itemsHeading={
        category
          ? `${category} (${filter === 'irrelevant' ? '걸러진 글' : '관련 글'})`
          : filter === 'irrelevant'
            ? '걸러진 글'
            : '수집 결과 (관련 글)'
      }
      categoryHref={(c) => hrefFor({ tab: 'items', period: 'all', cat: c, page: 1 })}
      categoryChips={{
        active: category,
        options: categoryCounts.map((c) => ({ name: c.category, count: c.count })),
        total: categoryCounts.reduce((n, c) => n + c.count, 0),
        href: (c) => hrefFor({ cat: c ?? null, page: 1 }),
      }}
      countryChips={{
        active: country,
        options: countryCounts,
        total: totalAllCountries,
        href: (c) => hrefFor({ country: c ?? null, page: 1 }),
      }}
      collectProgress={{
        tasks: collectTasks,
        /**
         * 대기 중(runRequestedAt)도 '도는 중'으로 본다.
         *
         * 스케줄러는 30초 틱에 요청을 집어 가므로 버튼을 누른 직후에는 runningSince가 아직
         * 비어 있다. 그 구간을 제외하면 카드가 렌더되지 않고, 카드가 없으면 폴링도 돌지 않아
         * 사용자가 직접 새로고침해야 시작을 본다.
         */
        running: Boolean(settings.runningSince) || Boolean(settings.runRequestedAt),
        /**
         * 지금 돌고 있는 단계. 수집은 1분이면 끝나지만 분류는 수십 분 이어진다.
         * 그 구간에 표시가 없으면 화면이 멈춘 것처럼 보인다.
         */
        phase: settings.runPhase
          ? {
              key: settings.runPhase,
              label: settings.runPhaseLabel || settings.runPhase,
              done: Number(settings.runPhaseDone) || 0,
              total: Number(settings.runPhaseTotal) || 0,
            }
          : undefined,
      }}
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
      periods={{
        active: period,
        options: periodCounts,
        undated,
        href: (k) => hrefFor({ period: k }),
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
          <a href="/tour">둘러보기(예시)</a>
          <a href="/?tour=1">실데이터 투어</a>
          <a href="/pitch">소개 슬라이드</a>
          <a href="/deck">동작 원리 슬라이드</a>
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
