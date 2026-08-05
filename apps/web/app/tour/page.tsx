import { hasPrivateConfig, loadConfig, localDate } from '@feedback-radar/core';
import { DashboardView, type DashboardViewProps } from '../_dashboard/DashboardView';
import {
  DEMO_BRAND,
  DEMO_CATEGORY_CHIPS,
  DEMO_SENTIMENT_CHIPS,
  DEMO_COLLECT,
  DEMO_COUNTRIES,
  DEMO_METRICS,
  DEMO_NAV,
  DEMO_PERIODS,
  DEMO_REPORT,
  DEMO_TAGGER,
  demoBriefing,
  demoCollectProgress,
  demoDashboard,
  demoPrompt,
  demoServices,
  demoServicesAdmin,
} from './demo-data';
import { TourOverlay } from './TourOverlay';
import { TourPdfButton } from './TourPdfButton';
import { buildTourPdf, tourPdfInfo } from './actions';
import { buildTourSteps } from './steps';

/**
 * /tour — 실제 대시보드 UI 위에서 기능을 짚어 주는 제품 투어.
 *
 * 화면은 `/`와 같은 컴포넌트를 쓰고 데이터만 예시로 바꾼다. DB·수집 이력이 없어도
 * 항상 같은 화면이 나오므로 발표 중 "데이터가 없어서 안 보인다"가 생기지 않는다.
 * 서비스명은 비공개 설정이 있을 때만 실제 이름을 쓴다.
 */

export const dynamic = 'force-dynamic';

/**
 * 둘러보기 화면이 실제 화면보다 뒤처지지 않게 하는 장치.
 *
 * DashboardViewProps는 거의 다 optional이라, 새 prop을 만들어 `/`에만 연결해도 타입 검사가
 * 통과한다. 그러면 그 기능은 이 화면에서 조용히 빠지고 아무도 모른다. 실제로 그렇게
 * 브리핑, 국가, 모델 ID를 포함한 다섯 개가 빠진 채로 커밋 몇 개가 지나갔다.
 *
 * 그래서 아래 세 개만 빼고 **전부 필수로** 받는다. DashboardView에 prop이 새로 생기면
 * 여기서 빌드가 막히므로, 예시 데이터를 채우지 않고는 기능을 추가할 수 없다.
 *
 * - actions, links: 서버 액션과 실화면 전용 링크. 예시 화면은 눌러도 아무 일도 없어야 한다
 * - pager: 예시 목록은 고정 11건이라 넘길 페이지가 없다
 *
 * `show`는 예전에 이 목록에 있었다. 투어가 모든 탭을 한 페이지에 쌓아 두고 스크롤로
 * 순회했기 때문인데(그러지 않으면 오버레이가 다른 탭에 숨은 요소를 못 찾아 멈췄다),
 * **그 결과 발표에서 보여준 구성과 사용자가 실제로 만나는 구성이 달라졌다.** 지금은
 * 오버레이가 단계마다 해당 탭으로 이동하므로(TourStep.tab) 실제와 같은 탭 구조로 돈다.
 */
type TourOmit = 'actions' | 'links' | 'pager';
type TourProps = Required<Omit<DashboardViewProps, TourOmit>>;

/** 예시 화면의 링크는 전부 제자리다 — 눌러도 목록이 바뀌지 않아야 화면이 늘 같다 */
const stay = () => '#';

/** 실제 화면(page.tsx의 TAB_KEYS)과 같은 목록·순서여야 한다 */
const TOUR_TABS = ['brief', 'items', 'collect', 'settings'] as const;

export default async function TourPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; pdf?: string }>;
}) {
  const params = await searchParams;
  /**
   * PDF를 굽는 중인지. 그때는 PDF 버튼 자신을 숨긴다.
   *
   * 안 숨기면 캡처 스크립트가 /tour를 찍을 때 버튼이 열네 장 전부에 박힌다. 발표 자료에
   * "PDF 만들기" 버튼이 찍혀 있으면 그게 화면의 일부인 것처럼 보인다.
   */
  const capturing = params.pdf === '1';
  /**
   * 지금 보고 있는 탭. 오버레이가 단계마다 이 값을 바꿔 준다.
   * 잘못된 값이 URL로 오면 무시하고 기본 탭을 보여준다 (실제 화면과 같은 규칙).
   */
  const tab = TOUR_TABS.includes(params.tab as (typeof TOUR_TABS)[number])
    ? (params.tab as (typeof TOUR_TABS)[number])
    : 'brief';

  const configured = hasPrivateConfig();
  // 설정이 없으면 example을 읽지 않는다 — 배포본에는 private/ 이 없고, 자리표시자로 충분하다
  const config = configured ? loadConfig() : undefined;
  const brand = config?.displayName ?? DEMO_BRAND;
  const today = localDate();
  const progress = demoCollectProgress(brand);

  const view: TourProps = {
    data: demoDashboard(brand, today),
    itemsHeading: '수집 결과 (관련 글)',
    tourMode: true,
    // 탭을 실제로 옮길 수 있어야 한다. 이 화면에서 유일하게 제자리가 아닌 링크다
    nav: { active: tab, items: DEMO_NAV, href: (t) => `/tour?tab=${t}` },
    show: {
      brief: tab === 'brief',
      items: tab === 'items',
      collect: tab === 'collect',
      settings: tab === 'settings',
    },
    briefing: { ...demoBriefing(brand), href: stay },
    tagger: DEMO_TAGGER,
    collect: DEMO_COLLECT,
    servicesAdmin: demoServicesAdmin(brand),
    services: { ...demoServices(brand), href: stay },
    categoryChips: { ...DEMO_CATEGORY_CHIPS, href: stay },
    sentimentChips: { ...DEMO_SENTIMENT_CHIPS, href: stay },
    categoryHref: stay,
    countryChips: {
      options: DEMO_COUNTRIES,
      // '전체'는 국가 합이 아니라 필터를 푼 상태다 (국가가 없는 커뮤니티 글까지 포함)
      total: DEMO_PERIODS[0].count,
      href: stay,
    },
    periods: { active: 'all', options: DEMO_PERIODS, undated: 12, href: stay },
    prompt: demoPrompt(brand),
    /*
      실행 중에만 뜨는 카드라 둘러보기에서 놓치기 쉽다. 그런데 이 도구가 실제로 무엇을
      하는지(국가별로 스토어를 훑고, 지금 어떤 글을 판정에 넣고 있는지)가 가장 잘 드러난다.
    */
    /**
     * 수집 탭에서는 '분류가 도는 중' 상태를, 다른 탭에서는 '지난 수집' 상태를 보여준다.
     *
     * 실제 화면도 그렇게 동작한다 — 도는 중이면 어느 탭에서든 뜨고, 끝나면 수집 탭에만
     * 기록으로 남는다. 투어에서 항상 '실행 중'으로 두면 브리핑 탭에 실제로는 없을 카드가
     * 얹혀 보인다.
     */
    collectProgress:
      tab === 'collect'
        ? progress
        : { tasks: progress.tasks, running: false, elapsedMs: progress.elapsedMs },
    // 목록에 필터가 걸렸을 때만 뜨는 링크. 예시에서는 자리를 보여주기 위해 항상 둔다
    itemsFilterReset: stay(),
    tabs: {
      active: 'relevant',
      relevantCount: DEMO_PERIODS[0].count,
      irrelevantCount: DEMO_METRICS.irrelevant,
      href: stay,
    },
  };

  const steps = buildTourSteps(brand, { metrics: DEMO_METRICS });

  /**
   * 어느 판을 굽는 버튼을 낼지.
   *
   * 비공개 설정이 있는 머신(실제로 운영하는 쪽)에서 발표에 쓸 것은 실데이터판이다. 숫자가
   * 진짜라 설득력이 다르다. 설정이 없는 배포본에서는 예시판만 만들 수 있다.
   */
  const livePdf = configured;
  const pdf = await tourPdfInfo(livePdf);

  return (
    <>
      {/*
        무엇이 예시이고 무엇이 실물인지 명시한다. 화면 구성과 탭은 실제와 같고 데이터만
        예시인데, 그 구분을 적어 두지 않으면 보는 사람이 어디까지 믿어야 할지 알 수 없다.
      */}
      <div className="tour-notice">
        <strong>둘러보기 모드</strong>: 화면 구성과 탭은 실제 대시보드와 같고,{' '}
        <strong>데이터만 예시</strong>입니다. 수집 탭은 분류가 도는 중인 상태를 보여줍니다. 실제
        수집 결과는 <a href="/">대시보드</a>에서 볼 수 있습니다.
      </div>

      {/*
        실제 화면과 같은 컴포넌트를 쓰되, 서버 액션은 넘기지 않는다 —
        눌러도 아무 일도 일어나지 않아야 예시 화면이 항상 같은 모습을 유지한다.
        탭 이동만 진짜 링크다 (실제 화면과 같은 탭 구조로 돌기 위해).
      */}
      <DashboardView {...view} />

      {/*
        브리핑 원문 (파일로 저장되는 산출물).

        이건 대시보드 화면이 아니라 슬랙·팀즈로 나가는 텍스트다. 그런데 DashboardView 밖에
        있어서 예전에는 어느 탭에서든 따라붙었고, 그 결과 목록 탭에서는 표 아래에 실제
        화면에 없는 블록이 얹혀 "구성이 다르다"로 읽혔다. 브리핑 탭에서만 내고, 화면이
        아니라는 점을 제목에 못박는다.
      */}
      {tab === 'brief' && (
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 120px' }}>
        <h2 style={{ fontSize: 15, margin: '24px 0 6px' }}>브리핑 원문 (파일로 저장되는 산출물)</h2>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 10px', lineHeight: 1.6 }}>
          아래는 대시보드 화면이 아닙니다. 수집과 분류가 끝나면 이 텍스트가
          <code>private/reports/날짜.md</code> 로 저장됩니다. 아침에 이것만 읽어도 되도록 만든
          산출물입니다.
        </p>
        <div className="brief" data-tour="brief">
          <h3>📊 {brand} 피드백 데일리: {today}</h3>
          <div className="brief-line brief-meta">
            수집 {DEMO_REPORT.collected}건 ({DEMO_REPORT.sourceLine}), 동음이의어 등 무관 글{' '}
            {DEMO_REPORT.irrelevant}건 제외됨
          </div>

          <div className="brief-sec">🔴 급증 감지</div>
          <div className="brief-item">
            <strong>{DEMO_REPORT.spike.category}</strong> {DEMO_REPORT.spike.count}건 (직전 7일 평균{' '}
            {DEMO_REPORT.spike.avg}건,{' '}
            {(DEMO_REPORT.spike.count / DEMO_REPORT.spike.avg).toFixed(1)}배↑)
          </div>

          {/* 문구는 daily.ts의 실제 섹션 제목과 같아야 한다 (여기만 바꾸면 발표와 파일이 어긋난다) */}
          <div className="brief-sec">⚠️ 먼저 읽어 볼 글 ({DEMO_REPORT.urgent.length}건)</div>
          {DEMO_REPORT.urgent.map((u) => (
            <div className="brief-item" key={u.text}>
              <strong>
                [{u.category} → {u.team}팀]
              </strong>{' '}
              {u.severity === 'critical' && '🚨 '}
              &quot;{u.text}&quot; <span className="brief-meta">[원문]</span>
            </div>
          ))}

          <div className="brief-sec">🟢 긍정 반응</div>
          <div className="brief-item">
            &quot;{DEMO_REPORT.positive}&quot; <span className="brief-meta">[원문]</span>
          </div>
        </div>
      </div>
      )}

      <TourOverlay steps={steps} />

      {/* 캡처 중에는 내지 않는다 — 버튼이 열네 장 전부에 박힌다 */}
      {!capturing && (
        <TourPdfButton live={livePdf} hasPdf={pdf.exists} build={buildTourPdf} />
      )}
    </>
  );
}
