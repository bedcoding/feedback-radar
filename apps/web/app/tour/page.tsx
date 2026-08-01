import { hasPrivateConfig, loadConfig, localDate } from '@feedback-radar/core';
import { DashboardView } from '../_dashboard/DashboardView';
import { DEMO_METRICS, DEMO_REPORT, demoDashboard } from './demo-data';
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

export default function TourPage() {
  const configured = hasPrivateConfig();
  const config = loadConfig();
  const brand = configured ? config.displayName : '{서비스명}';
  const keywords = configured ? config.keywords : ['{키워드1}', '{키워드2}'];
  const today = localDate();
  const data = demoDashboard(brand, keywords, today);

  const steps = buildTourSteps(brand, { metrics: DEMO_METRICS });

  return (
    <>
      <div className="tour-notice">
        <strong>둘러보기 모드</strong> — 화면과 데이터는 기능 설명을 위한 예시입니다. 실제 수집 결과는{' '}
        <a href="/">대시보드</a>에서 볼 수 있습니다.
      </div>

      <DashboardView data={data} itemsHeading="최근 수집 결과" tourMode />

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 120px' }}>
        <h2 style={{ fontSize: 15, margin: '24px 0 10px' }}>오늘의 브리핑 (메신저로 전송되는 내용)</h2>
        <div className="brief" data-tour="brief">
          <h3>📊 {brand} 피드백 데일리 — {today}</h3>
          <div className="brief-line brief-meta">
            수집 {DEMO_REPORT.collected}건 ({DEMO_REPORT.sourceLine}) · 동음이의어 등 무관 글{' '}
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
