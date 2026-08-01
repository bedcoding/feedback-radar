import type { TourStep } from './TourOverlay';

/**
 * 투어 단계 정의 — 예시 데이터 화면(/tour)과 실제 대시보드(/?tour=1)가 같은 설명을 쓴다.
 * 강조 지점은 data-tour 속성으로 찾으므로 두 화면 모두에서 동일하게 동작한다.
 */
export function buildTourSteps(brand: string, live = false): TourStep[] {
  const steps: TourStep[] = [
    {
      title: `📡 ${brand} 피드백 레이더`,
      body: (
        <>
          <p>
            앱스토어·구글플레이·블로그·카페·커뮤니티에 흩어진 사용자 반응을{' '}
            <span className="hi">자동으로 모아</span>, AI가 글마다 분류하고,{' '}
            <span className="hi">이상 징후가 보이면 먼저 알려주는</span> 도구입니다.
          </p>
          <p style={{ marginTop: 10 }}>실제 화면을 보면서 8단계로 짚어 드리겠습니다.</p>
        </>
      ),
    },
    {
      target: 'scheduler',
      title: '① 얼마나 자주 모을지만 정하면 됩니다',
      body: (
        <>
          <p>
            <span className="hi">몇 시간마다</span> 수집할지 입력하고 저장하면 30초 안에 반영됩니다. 프로그램을
            껐다 켤 필요가 없습니다.
          </p>
          <ul>
            <li>
              <strong>지금 실행</strong> — 장애 대응 중 최신 반응을 바로 확인할 때
            </li>
            <li>마지막·다음 실행 시각이 항상 표시되고, 실패하면 사유가 그대로 뜹니다</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            <span className="hi">사람이 하는 일은 여기까지입니다.</span> 나머지는 전부 자동입니다.
          </p>
        </>
      ),
    },
    {
      target: 'stats',
      title: '② 현황은 한눈에',
      body: (
        <>
          <p>
            누적·오늘 수집 건수와 <strong>긍정·부정·중립 분포</strong>가 상단에 바로 보입니다.
          </p>
          <p style={{ marginTop: 8 }}>
            부정 건수가 평소보다 튀면 그 자체가 신호입니다 — 뒤에서 볼 <span className="hi">급증 감지</span>가
            이 숫자를 매일 비교합니다.
          </p>
        </>
      ),
    },
    {
      target: 'categories',
      title: '③ 무슨 얘기가 오가는지 주제별로',
      body: (
        <>
          <p>
            AI가 붙인 카테고리로 묶어 <strong>오늘 어떤 주제가 몇 건</strong>인지, 그중{' '}
            <span className="hi">부정이 몇 건</span>인지 보여줍니다.
          </p>
          <p style={{ marginTop: 8 }}>
            지금 예시에서는 <strong>결제/코인</strong>이 가장 많고 전부 부정입니다 — 바로 확인해야 할
            신호입니다.
          </p>
        </>
      ),
    },
    {
      target: 'items',
      title: '④ 글마다 6가지 라벨이 붙습니다',
      body: (
        <>
          <p>수집한 글 하나하나에 AI가 다음을 판단해 붙입니다.</p>
          <ul>
            <li>
              <strong>감성</strong> 긍정 / 부정 / 중립
            </li>
            <li>
              <strong>카테고리</strong> 결제·오류·콘텐츠·정책·이벤트·계정
            </li>
            <li>
              <strong>심각도</strong> low → critical
            </li>
            <li>
              <strong>담당팀</strong> 어느 팀이 볼 일인지까지
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            요약과 <span className="hi">원문 링크</span>도 함께 저장돼, 한 번의 클릭으로 원문을 확인할 수
            있습니다.
          </p>
        </>
      ),
    },
    {
      target: 'irrelevant-row',
      title: '⑤ 엉뚱한 글은 알아서 걸러냅니다',
      body: (
        <>
          <p>
            브랜드명이 짧으면 <strong>철자만 같은 전혀 다른 글</strong>이 검색에 딸려 옵니다. 그대로 세면
            "언급량이 늘었다"는 신호를 믿을 수 없게 됩니다.
          </p>
          <p style={{ marginTop: 8 }}>
            AI가 <span className="hi">"우리 서비스 얘기인가"</span>를 먼저 판단해 집계에서 빼고, 지우지는 않고
            흐리게 표시만 해 둡니다 — 판단이 맞았는지 나중에 검증할 수 있게.
          </p>
        </>
      ),
    },
    {
      target: 'brief',
      title: '⑥ 매일 이런 브리핑 한 장이 나갑니다',
      body: (
        <>
          <p>
            수집·분류가 끝나면 브리핑을 만들어 <strong>사내 메신저로 전송</strong>하고 파일로도 남깁니다.
          </p>
          <ul>
            <li>
              <strong>급증 감지</strong> — 평소(직전 7일 평균)의 3배를 넘고 5건 이상일 때만
            </li>
            <li>
              <strong>우선 확인</strong> — 심각한 부정 반응을 담당팀과 함께 상단에
            </li>
            <li>모든 인용에 원문 링크</li>
          </ul>
        </>
      ),
    },
    {
      title: '여기까지가 전부입니다',
      body: (
        <>
          <p>
            키워드를 한 번 정하고 나면 <strong>수집 → 분류 → 급증 감지 → 알림</strong>이 매일 자동으로
            돕니다. 사람은 브리핑만 읽으면 됩니다.
          </p>
          <p style={{ marginTop: 12 }}>
            <span className="hi">설정 파일의 키워드만 바꾸면</span> 다른 서비스·다른 팀에도 코드 수정 없이
            그대로 쓸 수 있습니다.
          </p>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            더 자세한 내용: <a href="/pitch">소개 슬라이드</a> · <a href="/deck">동작 원리</a> ·{' '}
            <a href="/">실제 대시보드</a>
          </p>
        </>
      ),
    },
  ];

  // 실제 대시보드에는 예시 화면에만 있는 요소가 없다. 있는 것으로 바꿔 준다.
  const LIVE_TARGET: Record<string, string | undefined> = {
    'irrelevant-row': 'tabs', // 관련 글 탭에서는 무관 행이 안 보인다 → 탭 자체를 가리킨다
    brief: undefined, // 브리핑 미리보기는 예시 화면에만 있다 → 화면 중앙 카드로
  };

  return live
    ? steps.map((s, i) => ({
        ...s,
        target: s.target && s.target in LIVE_TARGET ? LIVE_TARGET[s.target] : s.target,
        ...(i === 0
          ? {
              body: (
                <>
                  {s.body}
                  <p style={{ marginTop: 10, fontSize: 13 }} className="hi">
                    지금 보시는 화면은 예시가 아니라 실제 수집·분류된 데이터입니다.
                  </p>
                </>
              ),
            }
          : {}),
      }))
    : steps;
}
