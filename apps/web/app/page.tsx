import {
  CATEGORIES,
  SENTIMENTS,
  countryName,
  estimateTagCalls,
  storeCountries,
  estimateMaxPerRun,
  resolveCollectLimits,
  resolveSources,
  resolveTagBatchSize,
  SOURCE_KEYS,
  tagInstructions,
  isReadOnlyMode,
  loadConfig,
  localDate,
  openRadarStore,
  rawServices,
  resolveServices,
} from '@feedback-radar/core';
import { DashboardView } from './_dashboard/DashboardView';
import { redirect } from 'next/navigation';
import type { BriefNegative } from './_dashboard/BriefingCard';
// 채널 표시명. 목록 제목에 '디시', '구글플레이'처럼 사람이 읽는 이름을 쓴다
import { sourceLabel } from './_dashboard/labels';
import {
  addTrackedService,
  recheckTagger,
  removeTrackedService,
  saveDisplayName,
  updateTrackedService,
  requestCancelRun,
  requestRunNow,
  requestRunSource,
  savePromptConfig,
  saveCollectLimits,
  saveDeploymentOpenAIModel,
  saveInterval,
  startClaudeLogin,
} from './actions';
import { TourOverlay } from './tour/TourOverlay';
import { buildTourSteps } from './tour/steps';
import type { ItemQuery, TagCall, TaggerStatus, TaggerUsage } from '@feedback-radar/core';

export const dynamic = 'force-dynamic';
// 수집 소스 요청과 OpenAI 배치 한 번이 같은 서버 액션 안에서 끝날 시간을 확보한다.
export const maxDuration = 300;

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
    /** 화면 탭: brief(기본) | items | settings */
    tab?: string;
    /** 카테고리 필터 (집계 표에서 넘어올 때) */
    cat?: string;
    /** 스토어 국가 필터 (앱 리뷰만 해당) */
    country?: string;
    /** 채널 필터 (브리핑 카드나 수집 진행에서 넘어올 때) */
    source?: string;
    /** 감성 필터 (브리핑의 '부정 3'을 눌러 그 3건을 열 때) */
    sentiment?: string;
    /** /tour가 이 화면을 재사용할 때만 서버 내부에서 주입하는 표식 (URL에는 노출하지 않음) */
    _view?: 'tour';
    /** 투어의 DB 장애 폴백 및 PDF 캡처용 파라미터 */
    fallback?: string;
    pdf?: string;
    tstep?: string;
  }>;
}) {
  // 기본은 관련 글만. 무관 판정 글은 지우지 않고 별도 탭에서 확인한다.
  const params = await searchParams;
  const filter = params.filter === 'irrelevant' ? 'irrelevant' : 'relevant';
  // ?tour=1 이면 진짜 데이터 위에 투어 오버레이를 얹는다 (발표용)
  const liveTour = params.tour === '1' || params._view === 'tour';
  const routeBase = params._view === 'tour' ? '/tour' : '/';
  const PAGE_SIZE = 50;
  /** 감성 코드를 목록 제목에 쓸 한국어로 (분류 값은 영어로 저장된다) */
  const SENTIMENT_KO: Record<string, string> = {
    positive: '긍정',
    neutral: '중립',
    negative: '부정',
  };
  // 잘못된 값(0, 음수, 문자)은 1쪽으로. 범위 초과는 아래에서 총 건수를 안 뒤에 자른다.
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  /**
   * 화면을 성격별로 갈라 놓는다. 한 화면에 브리핑, 통계, 목록 50건, 설정이 다 있으면
   * 정작 매일 봐야 하는 요약이 스크롤에 묻힌다.
   *
   * 'collect'가 따로 있는 이유: 수집, 분류 진행은 실행 중에만 뜨는 화면이라 끝난 뒤에는
   * 볼 자리가 없었다. 예전에는 설정 탭에 얹어 뒀는데, 설정을 보러 간 사람에게 지난 수집
   * 기록이 딸려 나오고 정작 브리핑, 목록에서는 무엇을 얼마나 가져왔는지 확인할 수 없었다.
   *
   * **투어(?tour=1)도 탭을 그대로 따른다.** 예전에는 투어일 때 전 탭을 한 페이지에 쌓았다.
   * 오버레이가 data-tour로 요소를 찾는데 다른 탭에 숨어 있으면 못 찾아 멈췄기 때문이다.
   * 그 대가로 **발표에서 보여주는 구성이 실제 사용 구성과 달라졌다.** 지금은 오버레이가
   * 단계마다 해당 탭으로 이동하므로(TourStep.tab) 쌓아 둘 이유가 없다.
   */
  const TAB_KEYS = ['brief', 'items', 'collect', 'settings'] as const;
  const tab = TAB_KEYS.includes(params.tab as (typeof TAB_KEYS)[number])
    ? (params.tab as (typeof TAB_KEYS)[number])
    : 'brief';
  const showBrief = tab === 'brief';
  const showItems = tab === 'items';
  const showCollect = tab === 'collect';
  const showSettings = tab === 'settings';

  /*
    조회 전용 배포인가 (심사용 데모). DB를 읽기 전용으로 열고, 쓰기를 부르는 액션은
    화면에 내지 않는다. 판정을 여기 한 번만 두고 아래로 내려보낸다.
  */
  const readOnly = isReadOnlyMode();
  const deploymentMode = process.env.VERCEL === '1';

  const config = loadConfig();
  // 여러 서비스를 추적하면 키워드를 다 나열하기보다 서비스명을 보여주는 편이 읽힌다
  const services = resolveServices(config);
  const subtitle =
    services.length > 1 ? services.map((s) => s.name) : (services[0]?.keywords ?? config.keywords);

  const db = await openRadarStore().catch((error) => {
    console.error('[DB] PostgreSQL 연결 실패, 내장 데모로 전환합니다.', error);
    const fallback = new URLSearchParams({ fallback: 'db' });
    if (tab !== 'brief') fallback.set('tab', tab);
    if (params.tstep) fallback.set('tstep', params.tstep);
    redirect(`/tour?${fallback.toString()}`);
  });
  const today = localDate();

  // 기간은 '작성일(posted_at)' 기준: 우리가 언제 긁어왔는지보다 글이 언제 쓰였는지가 중요하다
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
  /**
   * 채널과 감성. **목록 탭에서만 인정한다.**
   *
   * 이 둘은 목록을 좁히는 필터일 뿐이고 브리핑과 설정 화면에는 쓰이지 않는다. 그런데 탭을
   * 옮겨도 URL에 남아 있으면, 브리핑으로 돌아왔을 때 화면이 목록 필터에 좌우되어
   * '데이터가 사라진' 것처럼 보인다. 형식 검사는 그다음이다.
   */
  const source =
    showItems && /^[a-z][a-z-]{1,19}$/.test(params.source ?? '') ? params.source : undefined;
  const sentiment =
    showItems && SENTIMENTS.includes(params.sentiment as (typeof SENTIMENTS)[number])
      ? params.sentiment
      : undefined;
  // 서비스 칩은 목록 탭의 필터다. 브리핑은 서비스별 카드로 이미 갈라져 있어 칩이 없어도 읽힌다
  // (목록에서 서비스를 고른 뒤 브리핑으로 넘어가면 URL의 service가 그대로 적용된다).
  /**
   * 서비스별 건수. 브리핑 탭에서도 센다.
   *
   * 채널 요약도 서비스별로 갈리므로 브리핑에서 한 서비스만 보고 싶은 일이 생기는데, 이 값이
   * 목록 탭에서만 계산되면 브리핑에서는 칩이 통째로 사라져 좁힐 방법이 없다. 표 하나를
   * 세는 집계라 비용도 작다.
   */
  const serviceCounts =
    showItems || showBrief ? await db.countByService(filter, postedFrom, country) : [];
  // 칩 건수는 자기 조건을 뺀 상태로 센다 (어느 카테고리를 골랐든 칩의 숫자는 같아야 한다)
  const categoryCounts = showItems
    ? await db.countByCategory(filter, service, postedFrom, country)
    : [];
  // 국가 칩도 자기 조건(country)은 빼고 센다. 어느 국가를 골랐든 칩의 숫자는 같아야 한다
  const countryCounts = showItems ? await db.countByCountry(filter, service, postedFrom) : [];
  /**
   * 감성 칩.
   *
   * 브리핑에서 '확인 필요'를 누르면 sentiment=negative가 걸려 오는데, 목록에는 그걸 고르거나
   * 풀 수단이 없었다. 필터가 URL에만 있고 화면에 없으면 왜 목록이 좁아졌는지 알 수 없다.
   * 자기 조건(sentiment)은 빼고 센다. 무엇을 골랐든 칩의 숫자는 같아야 한다.
   */
  const sentimentCounts = showItems
    ? await db.countBySentiment(filter, service, postedFrom, country)
    : [];

  // ── 브리핑 탭 데이터 ───────────────────────────────────────
  const stats = showBrief
    ? await db.getDashboardStats(today, service)
    : { total: 0, today: 0, bySource: [], bySentiment: [] };
  // 심사 배포 배지는 어느 탭에서 보더라도 전체 누적량을 말해야 한다. 브리핑 외 탭에서는
  // stats를 일부러 읽지 않으므로, 배지용 COUNT를 별도로 가져온다.
  const allTimeTotal = showBrief && !service ? stats.total : await db.countItems();
  const categories = showBrief ? await db.categoryCountsForDate(today, service) : [];
  // 요약이 있는 날짜만 넘겨 볼 수 있게 한다 (없는 날을 고르면 빈 카드가 된다)
  const summaryDates = showBrief ? await db.getSummaryDates(14) : [];
  const summaryDate =
    params.sdate && summaryDates.includes(params.sdate) ? params.sdate : (summaryDates[0] ?? today);
  const channelSummaries = showBrief ? await db.getChannelSummaries(summaryDate, service) : [];
  const channelTrend = showBrief ? await db.getChannelTrend(7, service) : [];

  /**
   * 브리핑 카드에서 펼쳐 볼 부정 글.
   *
   * 예전에는 '부정 3'이 목록 탭으로 보내는 링크였다. 카드 열 개를 확인하려면 화면이
   * 스무 번 바뀌고, 그때마다 브리핑을 읽던 자리를 잃는다. 카드 안에서 펼치도록 바꾸면서
   * 그 글들을 미리 실어 보낸다.
   *
   * 요약을 만들 때와 **같은 함수**(getItemsByDate)를 쓴다. 다른 조건으로 세면 카드에 적힌
   * '부정 84'와 펼친 목록의 건수가 어긋나고, 그러면 어느 쪽이 맞는지 알 수 없게 된다.
   * 심각한 것부터 담는다. 백 건이 넘는 카드도 있어 전부는 실을 수 없다.
   */
  const NEG_PER_CARD = 8;
  const briefNegatives: Record<string, BriefNegative[]> = {};
  if (showBrief) {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    for (const it of await db.getItemsByDate(summaryDate)) {
      if (it.sentiment !== 'negative') continue;
      if (service && it.service !== service) continue;
      const key = `${it.source}|${it.country ?? ''}|${it.service ?? ''}`;
      (briefNegatives[key] ??= []).push({
        id: it.id,
        // 분류가 만든 요약이 있으면 그것을 쓴다. 원문보다 짧고 판정 근거가 담겨 있다
        text: it.summary?.trim() || it.content.replace(/\s+/g, ' ').slice(0, 120),
        severity: it.severity,
        rating: it.rating,
        url: it.url,
      });
    }
    for (const key of Object.keys(briefNegatives)) {
      briefNegatives[key] = briefNegatives[key]
        .sort((a, b) => (rank[a.severity ?? 'low'] ?? 9) - (rank[b.severity ?? 'low'] ?? 9))
        .slice(0, NEG_PER_CARD);
    }
  }

  // ── 목록 탭 데이터 ─────────────────────────────────────────
  // 카테고리 필터가 걸리면 탭, 기간 건수도 그 안에서 세야 화면이 앞뒤가 맞는다
  const counts = showItems
    ? {
        relevant: await db.countItems({
          filter: 'relevant',
          service,
          postedFrom,
          category,
          country,
          source,
          sentiment,
        }),
        irrelevant: await db.countItems({
          filter: 'irrelevant',
          service,
          postedFrom,
          category,
          country,
          source,
          sentiment,
        }),
      }
    : { relevant: 0, irrelevant: 0 };
  const total = filter === 'irrelevant' ? counts.irrelevant : counts.relevant;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 마지막 쪽을 넘겨 요청하면 빈 표 대신 마지막 쪽을 보여준다
  const page = Math.min(requestedPage, pageCount);
  // 타입을 붙여야 filter가 string으로 넓어지지 않고 RelevanceFilter로 검사된다
  const q: ItemQuery = { filter, service, postedFrom, category, country, source, sentiment };
  const items = showItems ? await db.getRecentItems(PAGE_SIZE, q, (page - 1) * PAGE_SIZE) : [];
  // 기간 칩 건수는 현재 서비스, 탭, 카테고리, 국가, 채널, 감성 선택을 반영한다 (기간만 바꿔 본 결과)
  const periodCounts = showItems
    ? await Promise.all(PERIODS.map(async (p) => ({
        key: p.key,
        label: p.label,
        count: await db.countItems({
          filter,
          service,
          postedFrom: p.from,
          category,
          country,
          source,
          sentiment,
        }),
      })))
    : [];
  // 작성일을 못 가져온 건: 기간을 걸면 빠지므로 화면에 알려 준다
  const undated = showItems
    ? (await db.countItems({ filter, service, category, country, source, sentiment })) -
      (await db.countItems({
        filter,
        service,
        category,
        country,
        source,
        sentiment,
        postedFrom: '0000',
      }))
    : 0;
  /**
   * 국가 칩의 '전체'에 쓸 건수: 국가 필터를 해제한 상태의 건수다.
   *
   * 국가별 건수의 합을 쓰면 안 된다. 국가가 있는 건 앱 리뷰뿐이고, 국가를 해제하면
   * 국가가 없는 커뮤니티 글이 전부 다시 들어와서 합계와 실제 결과가 크게 어긋난다.
   */
  const totalAllCountries = showItems
    ? await db.countItems({ filter, service, postedFrom, category })
    : 0;

  const pitch = liveTour ? await db.getPitchStats() : undefined;
  // 스케줄러 상태는 어느 탭에서든 상단에 보여준다
  const settings = await db.getSettings();
  /**
   * 수집 작업별 진행 상태. 탭과 무관하게 읽는다. 수집은 몇 분씩 걸리므로 어느 화면에
   * 있든 진행 상황이 보여야 한다. 작업 수십 개짜리 단일 표 조회라 비용도 작다.
   */
  const collectTasks = await db.getCollectProgress();
  /**
   * 지금 보내고 있는 LLM 프롬프트. 파이프라인이 호출을 보내기 직전에 적어 둔다.
   *
   * 파싱 실패는 조용히 넘긴다. 화면 보조 정보라서, 이 값 하나 때문에 대시보드가
   * 500이 되면 손해가 더 크다.
   */
  const tagCall = ((): (TagCall & { at?: string }) | undefined => {
    const raw = settings.runTagCall;
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as TagCall & { at?: string };
    } catch {
      return undefined;
    }
  })();
  // 진단은 프로세스를 띄우느라 수 초 걸린다. 매 요청마다 하지 않고 저장된 결과를 읽는다.
  const cliPath = await db.getSetting('claudeCliCmd');
  const rawStatus = await db.getSetting('taggerStatus');
  const rawLaunch = await db.getSetting('loginLaunch');
  // 마지막 분류가 실제로 어떤 모델로 돌았는지 (별칭이 해석된 정식 ID)
  const rawTagUsage = await db.getSetting('lastTagUsage');
  // 소스별로 지금까지 실제 긁어온 범위 (수집량 카드에서 상한과 짝지어 보여준다)
  const coverage = showSettings
    ? Object.fromEntries(
        (await db.sourceCoverage()).map((c) => [
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
  const pendingUntagged = await db.countUntagged();
  await db.close();

  /**
   * 화면 상태를 담은 URL을 만든다. 칩, 탭, 페이저가 서로의 상태를 지우지 않으려면
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
    /** null을 넘기면 채널 필터를 해제한다 */
    source?: string | null;
    /** null을 넘기면 감성 필터를 해제한다 */
    sentiment?: string | null;
  }): string => {
    const p = new URLSearchParams();
    const f = o.filter ?? filter;
    const sv = 'service' in o ? o.service : service;
    const pd = o.period ?? period;
    const sd = o.sdate ?? summaryDate;
    const tb = o.tab ?? tab;
    const ct = 'cat' in o ? o.cat : category;
    const cty = 'country' in o ? o.country : country;
    /**
     * 채널과 감성은 목록 탭으로 가는 링크에만 싣는다. 다른 탭으로 옮길 때 들고 가면
     * 브리핑이 목록 필터에 좁혀져 보이고, 되돌릴 방법도 화면에 없다.
     */
    const src = tb === 'items' ? ('source' in o ? o.source : source) : undefined;
    const snt = tb === 'items' ? ('sentiment' in o ? o.sentiment : sentiment) : undefined;
    // 기본값은 URL에 남기지 않는다. 주소가 짧으면 공유, 디버깅이 쉽다
    if (tb !== 'brief') p.set('tab', tb);
    if (f === 'irrelevant') p.set('filter', 'irrelevant');
    if (ct) p.set('cat', ct);
    if (cty) p.set('country', cty);
    if (src) p.set('source', src);
    if (snt) p.set('sentiment', snt);
    if (sv) p.set('service', sv);
    if (pd !== 'all') p.set('period', pd);
    if (sd && summaryDates.length > 0 && sd !== summaryDates[0]) p.set('sdate', sd);
    if (liveTour && routeBase === '/') p.set('tour', '1');
    if (o.page && o.page > 1) p.set('page', String(o.page));
    const s = p.toString();
    return s ? `${routeBase}?${s}` : routeBase;
  };

  // 0은 '자동 수집 끔'이라는 뜻이 있는 값이라 falsy 폴백을 쓰면 안 된다.
  // 값이 아예 없거나 숫자가 아닐 때만 기본 24로 본다.
  const rawInterval = settings.intervalHours;
  const parsedInterval = Number(rawInterval);
  const intervalHours = deploymentMode
    ? 0
    : rawInterval !== undefined && rawInterval !== '' && Number.isFinite(parsedInterval)
      ? parsedInterval
      : 24;

  // 1회 수집 상한: 앱 개수, 키워드 개수를 알아야 최대 유입량을 추산할 수 있다
  const collectLimits = resolveCollectLimits(config, settings, {
    apiDefaults: deploymentMode,
    settingScope: deploymentMode ? 'vercel' : undefined,
  });
  // 한 호출에 담을 글 수. 호출 횟수 추산과 설정 칸이 같은 값을 봐야 한다
  const tagBatchSize = resolveTagBatchSize(settings, deploymentMode ? 'vercel' : undefined);
  // 소스 on/off: 설정 파일 값을 대시보드 저장값이 덮어쓴다
  const sourcesOn = resolveSources(config, settings, undefined, {
    settingScope: deploymentMode ? 'vercel' : undefined,
  });
  if (deploymentMode) {
    sourcesOn.dcinside = false;
    sourcesOn.threads = false;
  }
  // 소스 키를 미리 묶어 둔다. formAction 버튼의 name은 React가 덮어써서 못 쓴다
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
   * (여러 건을 한 프롬프트에 묶고, 호출마다 CLI 자체 시스템 프롬프트를 싣는다).
   * 이미 쌓인 미분류 건도 같은 실행에서 처리되므로 함께 센다.
   * pendingUntagged는 DB를 닫기 전에 위에서 세 둔 값이다.
   * 배치 크기를 설정으로 바꿀 수 있으므로 그 값을 함께 넘긴다 (앞 호출들은 더 작게 나간다).
   */
  const estimatedTagCalls = estimateTagCalls(collectEstimate, pendingUntagged, tagBatchSize);

  let taggerStatus: TaggerStatus | undefined;
  try {
    const parsed = rawStatus ? JSON.parse(rawStatus) : undefined;
    if (parsed && typeof parsed.mode === 'string') taggerStatus = parsed as TaggerStatus;
  } catch {
    // 저장된 값이 깨졌으면 '아직 확인하지 않음'으로 둔다
  }
  if (deploymentMode) {
    const model = settings['vercel.openaiModel'] || process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-nano';
    const keySet = Boolean(process.env.OPENAI_API_KEY?.trim());
    taggerStatus = {
      mode: keySet ? 'openai' : 'heuristic',
      forced: 'openai',
      cliFound: false,
      model,
      openaiModel: model,
      apiProvider: 'openai',
      apiKeySet: keySet,
      openaiApiKeySet: keySet,
      hint: keySet
        ? 'Vercel 수동 실행은 OpenAI API로 분류합니다.'
        : 'Vercel에 OPENAI_API_KEY를 설정해야 수동 실행할 수 있습니다.',
      loginCommand: '',
      checkedAt: new Date().toISOString(),
    };
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
        allTimeTotal,
        stats,
        categories,
        items,
        // `|| 24` 로 쓰면 안 된다. 0('자동 수집 끔')이 기본값으로 되돌아간다
        intervalHours: intervalHours,
        lastRunAt: settings.lastRunAt,
        isRunning: Boolean(settings.runningSince),
        runQueued: Boolean(settings.runRequestedAt),
        lastRunStatus: settings.lastRunStatus,
        // 중단을 눌렀는지. 눌러도 배치 경계까지는 계속 도므로 그 사이 상태를 보여줘야 한다
        cancelRequested: Boolean(settings.runCancelAt),
      }}
      readOnly={readOnly}
      deploymentMode={deploymentMode}
      actions={
        deploymentMode
          ? { requestRunNow }
          : readOnly
            ? undefined
            : { saveInterval, requestRunNow, requestCancelRun }
      }
      collect={{
        limits: collectLimits,
        estimate: collectEstimate,
        tagCalls: estimatedTagCalls,
        tagBatchSize,
        pending: pendingUntagged,
        coverage,
        on: sourcesOn,
        save: readOnly && !deploymentMode ? undefined : saveCollectLimits,
        runOne: deploymentMode || readOnly ? undefined : runOneBySource,
        busy: Boolean(settings.runningSince) || Boolean(settings.runRequestedAt),
        apiDefaults: deploymentMode,
        unavailable: deploymentMode
          ? {
              dcinside: '디시인사이드는 시스템 Chromium이 필요해 Vercel 수동 실행에서 제외됩니다.',
              threads: 'Threads는 시스템 Chromium이 필요해 Vercel 수동 실행에서 제외됩니다.',
            }
          : undefined,
      }}
      prompt={{
        domainPrompt: config.domainPrompt ?? '',
        excludeHints: config.excludeHints ?? [],
        // 지금 설정으로 실제로 만들어지는 지시문. 저장 전에 결과를 확인할 수 있게 한다
        instructions: tagInstructions(config),
        save: readOnly ? undefined : savePromptConfig,
      }}
      nav={{
        active: tab,
        items: [
          { key: 'brief', label: '브리핑' },
          { key: 'items', label: '목록' },
          { key: 'collect', label: '수집' },
          { key: 'settings', label: '설정' },
        ],
        href: (t) => hrefFor({ tab: t as (typeof TAB_KEYS)[number] }),
      }}
      show={{
        brief: showBrief,
        items: showItems,
        collect: showCollect,
        settings: showSettings,
      }}
      servicesAdmin={
        readOnly
          ? // 추가, 수정, 삭제 폼이 통째로 빠진다. 목록은 아래 collect 카드가 보여준다
            { list: editableServices, displayName: config.displayName }
          : {
              list: editableServices,
              displayName: config.displayName,
              saveName: saveDisplayName,
              add: addTrackedService,
              update: updateServiceByName,
              remove: removeServiceByName,
              error: settings.serviceEditError || undefined,
            }
      }
      briefing={{
        date: summaryDate,
        dates: summaryDates,
        summaries: channelSummaries,
        trend: channelTrend,
        href: (d) => hrefFor({ sdate: d }),
        /**
         * 카드의 건수를 눌러 그 글들을 목록에서 확인한다.
         * 기간은 전체로 열어야 한다. 요약은 특정 날짜 기준인데 목록에 오늘 필터가 남아 있으면
         * 요약이 말한 건수와 목록 건수가 어긋나 보인다.
         */
        // 분류가 안 끝난 건은 요약에 없다. 추이 그래프에는 보이는데 요약에는 없는
        // 상황을 화면에서 설명해 주지 않으면 데이터가 사라진 것처럼 읽힌다.
        pendingCount: pendingUntagged,
        // 카드 안에서 펼쳐 보는 부정 글. 페이지를 옮기지 않고 판정을 확인할 수 있다
        negatives: briefNegatives,
        itemsHref: ({ source: src, service: svc, country: cty, sentiment: snt }) =>
          hrefFor({
            tab: 'items',
            period: 'all',
            page: 1,
            source: src,
            // service는 키를 넘기기만 하면 그 값으로 덮인다. 빈 문자열이면 undefined로 해제.
            service: svc || undefined,
            country: cty || null,
            sentiment: snt ?? null,
            cat: null,
          }),
      }}
      tagger={{
        status: taggerStatus,
        cliPath,
        recheck: readOnly ? undefined : recheckTagger,
        login: readOnly ? undefined : startClaudeLogin,
        loginLaunch,
        lastUsage,
        deploymentMode,
        deploymentSave: deploymentMode ? saveDeploymentOpenAIModel : undefined,
      }}
      itemsHeading={(() => {
        // 무엇을 보고 있는지 제목에 담는다. 브리핑에서 '부정 3'을 눌러 들어오면 채널과 감성이
        // 동시에 걸리는데, 제목이 그대로면 건수가 왜 줄었는지 알 수 없다.
        const base = filter === 'irrelevant' ? '걸러진 글' : '관련 글';
        const parts = [
          source ? sourceLabel(source) : null,
          country ? countryName(country) : null,
          sentiment ? SENTIMENT_KO[sentiment] : null,
          category,
        ].filter(Boolean);
        return parts.length > 0
          ? `${parts.join(' ')} (${base})`
          : filter === 'irrelevant'
            ? '걸러진 글'
            : '수집 결과 (관련 글)';
      })()}
      categoryHref={(c) => hrefFor({ tab: 'items', period: 'all', cat: c, page: 1 })}
      itemsFilterReset={
        source || sentiment || category || country
          ? hrefFor({
              tab: 'items',
              source: null,
              sentiment: null,
              cat: null,
              country: null,
              page: 1,
            })
          : undefined
      }
      categoryChips={{
        active: category,
        options: categoryCounts.map((c) => ({ name: c.category, count: c.count })),
        total: categoryCounts.reduce((n, c) => n + c.count, 0),
        href: (c) => hrefFor({ cat: c ?? null, page: 1 }),
      }}
      sentimentChips={{
        active: sentiment,
        options: sentimentCounts.map((s) => ({
          key: s.sentiment,
          label: SENTIMENT_KO[s.sentiment] ?? s.sentiment,
          count: s.count,
        })),
        total: sentimentCounts.reduce((n, s) => n + s.count, 0),
        href: (snt) => hrefFor({ sentiment: snt ?? null, page: 1 }),
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
        /**
         * 지금 보내고 있는 프롬프트. 응답 하나에 1분 넘게 걸려서, 이게 없으면 그 구간에
         * 무엇을 하는지 화면에 아무 단서가 없다.
         */
        call: tagCall,
        /**
         * 도는 중이면 시작부터 지금까지, 끝났으면 마지막 실행의 총 소요 시간.
         *
         * 진행률만 있으면 3분 걸린 실행과 40분 걸린 실행이 화면에서 똑같이 보인다.
         * 다음에 얼마나 기다려야 하는지 판단할 근거가 이 값이다.
         */
        elapsedMs: (() => {
          const started = settings.runningSince ? Date.parse(settings.runningSince) : NaN;
          if (Number.isFinite(started)) return Math.max(0, Date.now() - started);
          return Number(settings.lastRunMs) || 0;
        })(),
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
        routeBase === '/tour' ? (
          <a href="/">대시보드</a>
        ) : (
          <>
            <a href="/tour">실데이터 투어</a>
            <a href="/tour?fallback=db">장애 폴백 미리보기</a>
          </>
        )
      }
      tourMode={liveTour}
      tourLive={liveTour}
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
