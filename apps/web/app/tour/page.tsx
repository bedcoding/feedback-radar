import { hasPrivateConfig, loadConfig, localDate } from '@feedback-radar/core';
import { DashboardView, type DashboardViewProps } from '../_dashboard/DashboardView';
import {
  DEMO_BRAND,
  DEMO_BRIEFING,
  DEMO_CATEGORY_CHIPS,
  DEMO_COLLECT,
  DEMO_COUNTRIES,
  DEMO_METRICS,
  DEMO_NAV,
  DEMO_PERIODS,
  DEMO_REPORT,
  DEMO_TAGGER,
  demoCollectProgress,
  demoDashboard,
  demoPrompt,
  demoServices,
  demoServicesAdmin,
} from './demo-data';
import { TourOverlay } from './TourOverlay';
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
 * 그래서 아래 네 개만 빼고 **전부 필수로** 받는다. DashboardView에 prop이 새로 생기면
 * 여기서 빌드가 막히므로, 예시 데이터를 채우지 않고는 기능을 추가할 수 없다.
 *
 * - actions, links: 서버 액션과 실화면 전용 링크. 예시 화면은 눌러도 아무 일도 없어야 한다
 * - pager: 예시 목록은 고정 11건이라 넘길 페이지가 없다
 * - show: /?tour=1 과 같다. 투어 중에는 탭으로 화면을 나누지 않는다. 나누면 오버레이가
 *   다른 탭에 숨은 요소를 찾지 못해 투어가 중간에 멈춘다 (page.tsx의 showBrief 참고)
 */
type TourOmit = 'actions' | 'links' | 'pager' | 'show';
type TourProps = Required<Omit<DashboardViewProps, TourOmit>>;

/** 예시 화면의 링크는 전부 제자리다 — 눌러도 목록이 바뀌지 않아야 화면이 늘 같다 */
const stay = () => '#';

export default function TourPage() {
  const configured = hasPrivateConfig();
  // 설정이 없으면 example을 읽지 않는다 — 배포본에는 private/ 이 없고, 자리표시자로 충분하다
  const config = configured ? loadConfig() : undefined;
  const brand = config?.displayName ?? DEMO_BRAND;
  const today = localDate();

  const view: TourProps = {
    data: demoDashboard(brand, today),
    itemsHeading: '수집 결과 (관련 글)',
    tourMode: true,
    nav: { active: 'brief', items: DEMO_NAV, href: stay },
    briefing: { ...DEMO_BRIEFING, href: stay },
    tagger: DEMO_TAGGER,
    collect: DEMO_COLLECT,
    servicesAdmin: demoServicesAdmin(brand),
    services: { ...demoServices(brand), href: stay },
    categoryChips: { ...DEMO_CATEGORY_CHIPS, href: stay },
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
    collectProgress: demoCollectProgress(brand),
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

  return (
    <>
      <div className="tour-notice">
        <strong>둘러보기 모드</strong>: 화면과 데이터는 기능 설명을 위한 예시입니다. 실제 수집 결과는{' '}
        <a href="/">대시보드</a>에서 볼 수 있습니다.
      </div>

      {/*
        실제 화면과 같은 컴포넌트를 쓰되, 서버 액션은 넘기지 않는다 —
        눌러도 아무 일도 일어나지 않아야 예시 화면이 항상 같은 모습을 유지한다.
        링크도 '#'이라 목록이 바뀌지 않는다.
      */}
      <DashboardView {...view} />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 120px' }}>
        <h2 style={{ fontSize: 15, margin: '24px 0 10px' }}>오늘의 브리핑 (메신저로 전송되는 내용)</h2>
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

          <div className="brief-sec">⚠️ 우선 확인 필요 ({DEMO_REPORT.urgent.length}건)</div>
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

      <TourOverlay steps={steps} />
    </>
  );
}
