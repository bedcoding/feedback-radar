import type { TourStep } from './TourOverlay';

/** 투어에서 인용할 실제 수치 — 지어낸 숫자를 쓰지 않기 위해 화면과 같은 값을 받는다 */
export interface TourMetrics {
  total: number;
  irrelevant: number;
  services: number;
  /** 사람이 글 1건을 확인하는 데 걸리는 시간(초) — 가정치 */
  secondsPerItem: number;
  /** 브리핑 1회 확인 시간(분) — 가정치 */
  briefingMinutes: number;
  /** 수집이 이뤄진 일수 */
  days: number;
}

/**
 * 본문 단계에 붙일 번호.
 *
 * 제목에 손으로 적지 않는다. 단계를 넣거나 빼면 그때부터 어긋나는데, 실제로 표지에
 * "8단계로 짚어 드리겠습니다"라고 적혀 있는 동안 본문은 9단계였다.
 */
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';

/**
 * 투어 단계 정의 — 예시 데이터 화면(/tour)과 실제 대시보드(/?tour=1)가 같은 설명을 쓴다.
 * 강조 지점은 data-tour 속성으로 찾으므로 두 화면 모두에서 동일하게 동작한다.
 */
export function buildTourSteps(
  brand: string,
  opts: { live?: boolean; metrics?: TourMetrics } = {},
): TourStep[] {
  const { live = false, metrics: m } = opts;
  const manualHours = m ? (m.total * m.secondsPerItem) / 3600 : 0;
  const autoHours = m ? (Math.max(1, m.days) * m.briefingMinutes) / 60 : 0;
  const ratio = autoHours > 0 ? manualHours / autoHours : 0;
  const irrelevantPct = m && m.total > 0 ? Math.round((m.irrelevant / m.total) * 100) : 0;
  const multiService = Boolean(m && m.services > 1);

  /** 본문 단계. 제목에 번호를 적지 않는다 — 아래에서 순서대로 붙인다 */
  const middle: TourStep[] = [
    {
      target: 'scheduler',
      title: '얼마나 자주 모을지만 정하면 됩니다',
      body: (
        <>
          <p>
            <span className="hi">몇 시간마다</span> 수집할지 입력하고 저장하면 30초 안에 반영됩니다. 프로그램을
            껐다 켤 필요가 없습니다.
          </p>
          <ul>
            <li>
              <strong>지금 실행</strong>: 장애 대응 중 최신 반응을 바로 확인할 때
            </li>
            <li>마지막, 다음 실행 시각이 항상 표시되고, 실패하면 사유가 그대로 뜹니다</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            <span className="hi">사람이 하는 일은 여기까지입니다.</span> 나머지는 전부 자동입니다.
          </p>
        </>
      ),
    },
    {
      target: 'stats',
      title: '현황은 한눈에',
      body: (
        <>
          <p>
            누적, 오늘 수집 건수와 <strong>긍정, 부정, 중립 분포</strong>가 상단에 바로 보입니다.
          </p>
          <p style={{ marginTop: 8 }}>
            부정 건수가 평소보다 튀면 그 자체가 신호입니다. 뒤에서 볼 <span className="hi">급증 감지</span>가
            이 숫자를 매일 비교합니다.
          </p>
        </>
      ),
    },
    {
      target: 'categories',
      title: '무슨 얘기가 오가는지 주제별로',
      body: (
        <>
          <p>
            AI가 붙인 카테고리로 묶어 <strong>오늘 어떤 주제가 몇 건</strong>인지, 그중{' '}
            <span className="hi">부정이 몇 건</span>인지 보여줍니다.
          </p>
          <p style={{ marginTop: 8 }}>
            지금 예시에서는 <strong>결제/코인</strong>이 가장 많고 전부 부정입니다. 바로 확인해야 할
            신호입니다.
          </p>
        </>
      ),
    },
    {
      target: 'briefing',
      title: '채널마다 무슨 얘기였는지 AI가 정리합니다',
      body: (
        <>
          <p>
            숫자는 &ldquo;몇 건&rdquo;만 말해 줍니다. 그래서 <strong>채널별로</strong> 요점을 따로 묶어
            문장으로 정리합니다.
          </p>
          <ul>
            <li>
              채널을 섞으면 <span className="hi">어디서 터진 얘기인지</span> 알 수 없습니다. 앱 리뷰의 불만과
              커뮤니티의 잡음은 무게가 다릅니다
            </li>
            <li>
              아래 <strong>추이 격자</strong>는 채널마다 최근 7일 언급량입니다. 요약이 &ldquo;무슨
              일&rdquo;이라면 격자는 <span className="hi">&ldquo;늘고 있나&rdquo;</span>입니다
            </li>
            <li>날짜를 눌러 지난 날 요약을 그대로 다시 볼 수 있습니다</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            요약을 만들 때 <strong>원문을 다시 보내지 않습니다.</strong> 이미 글마다 붙여 둔 한 줄 요약과
            집계만 넘깁니다. 카드 오른쪽에 이때 쓴 토큰이 그대로 찍혀 있습니다.
          </p>
        </>
      ),
    },
    {
      target: 'items',
      title: '글마다 6가지 라벨이 붙습니다',
      body: (
        <>
          <p>수집한 글 하나하나에 AI가 다음을 판단해 붙입니다.</p>
          <ul>
            <li>
              <strong>감성</strong> 긍정 / 부정 / 중립
            </li>
            <li>
              <strong>카테고리</strong> 결제, 오류, 콘텐츠, 정책, 이벤트, 계정
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
      target: 'countries',
      title: '같은 앱도 나라마다 반응이 다릅니다',
      body: (
        <>
          <p>
            같은 앱이라도 <strong>스토어 국가를 바꾸면 리뷰가 통째로 달라집니다.</strong> 국내 스토어만
            조회하면 해외 이용자 반응은 <span className="hi">한 건도 들어오지 않습니다.</span>
          </p>
          <ul>
            <li>
              한 국가에서 잘 도는 기능이 다른 국가에서는 불만 1순위이기도 합니다. 국가를 섞어 놓으면 그 차이가
              평균에 묻힙니다
            </li>
            <li>칩에 국가별 건수가 뜨고, 올려 보면 그중 부정이 몇 건인지 나옵니다</li>
            <li>
              국가가 붙는 건 앱 리뷰뿐입니다. 커뮤니티 글에는 국가가 없어서 국가를 고르면 목록에서 빠집니다
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            없는 국가 코드는 저장 단계에서 막습니다. <code>jp</code>를 <code>ip</code>로 잘못 적으면 형식은
            맞고 국기까지 그려져서, <span className="hi">화면은 멀쩡한데 수집만 조용히 0건</span>이 됩니다.
          </p>
        </>
      ),
    },
    {
      target: 'irrelevant-row',
      title: '엉뚱한 글은 알아서 걸러냅니다',
      body: (
        <>
          <p>
            브랜드명이 짧으면 <strong>철자만 같은 전혀 다른 글</strong>이 검색에 딸려 옵니다. 그대로 세면
            &ldquo;언급량이 늘었다&rdquo;는 신호를 믿을 수 없게 됩니다.
          </p>
          <p style={{ marginTop: 8 }}>
            AI가 <span className="hi">&ldquo;우리 서비스 얘기인가&rdquo;</span>를 먼저 판단해 집계에서 빼고,
            지우지는 않고 흐리게 표시만 해 둡니다. 판단이 맞았는지 나중에 검증할 수 있게{' '}
            <strong>판정 근거도 한 줄 남깁니다.</strong>
          </p>
        </>
      ),
    },
    {
      target: 'prompt',
      title: '무엇을 근거로 판정하는지 열어 두었습니다',
      body: (
        <>
          <p>
            AI가 붙인 라벨을 믿을지 판단하려면 <strong>무슨 지시를 받았는지</strong>를 볼 수 있어야
            합니다. 이 카드가 실제로 전송되는 지시문 전문을 보여주고, 그중 판정 기준에 해당하는
            두 값은 <span className="hi">화면에서 바로 고칠 수 있습니다.</span>
          </p>
          <ul>
            <li>
              <strong>도메인 지식</strong>: 이 업종에서 그 단어가 무슨 뜻인지. 자체 재화 이름,
              업계 용어, 어떤 글을 어느 카테고리로 볼지
            </li>
            <li>
              <strong>제외 단어</strong>: 서비스명이 다른 분야 용어와 겹칠 때 오탐을 걷어냅니다
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            분류 규칙과 출력 형식, 프롬프트 인젝션 방어 규칙은 <strong>코드에 고정</strong>했습니다.
            그쪽이 흔들리면 응답 형식이 깨져 분류가 통째로 실패합니다. 고칠 수 있는 것과 고정할 것을
            갈라 둔 셈입니다.
          </p>
          <p style={{ marginTop: 8 }}>
            수집이 도는 동안에는 <span className="hi">지금 어느 글을 판정에 넣고 있는지</span>도
            실시간으로 보이고, 언제든 중단할 수 있습니다. 중단하면 이미 분류한 건은 남고 남은
            것만 다음 실행으로 넘어갑니다.
          </p>
        </>
      ),
    },
    {
      target: 'brief',
      title: '매일 이런 브리핑 한 장이 나갑니다',
      body: (
        <>
          <p>
            수집, 분류가 끝나면 브리핑을 만들어 <strong>사내 메신저로 전송</strong>하고 파일로도 남깁니다.
          </p>
          <ul>
            <li>
              <strong>급증 감지</strong>: 평소(직전 7일 평균)의 3배를 넘고 5건 이상일 때만
            </li>
            <li>
              <strong>우선 확인</strong>: 심각한 부정 반응을 담당팀과 함께 상단에
            </li>
            <li>모든 인용에 원문 링크</li>
          </ul>
        </>
      ),
    },
    {
      target: 'stats',
      title: '숫자로 보면',
      body: (
        <>
          {m ? (
            <>
              <p>
                지금까지 <span className="hi">{m.total.toLocaleString()}건</span>을 모아 분류했습니다. 이걸
                사람이 전부 눈으로 확인한다면
              </p>
              <ul>
                <li>
                  수동 확인 <strong>{manualHours.toFixed(1)}시간</strong> ({m.total.toLocaleString()}건 ×{' '}
                  {m.secondsPerItem}초)
                </li>
                <li>
                  브리핑만 확인 <strong>{autoHours.toFixed(1)}시간</strong> ({m.briefingMinutes}분 ×{' '}
                  {Math.max(1, m.days)}일)
                </li>
                <li>
                  <span className="hi">약 {ratio.toFixed(0)}배 단축</span>
                </li>
              </ul>
              <p style={{ marginTop: 8 }}>
                게다가 무관 판정된 <strong>{m.irrelevant.toLocaleString()}건({irrelevantPct}%)</strong>은 아예
                볼 필요도 없습니다.
              </p>
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                건당 {m.secondsPerItem}초, 브리핑 {m.briefingMinutes}분은 가정치이고 설정에서 조정합니다. 수집
                건수와 일수는 실제 집계값입니다.
              </p>
            </>
          ) : (
            <p>수집이 쌓이면 이 자리에 실제 절감 시간이 계산되어 표시됩니다.</p>
          )}
        </>
      ),
    },
    {
      target: 'tagger',
      title: 'AI를 아껴 쓴 방법',
      body: (
        <>
          <p>AI를 많이 쓰는 것보다 &ldquo;언제 안 쓰는가&rdquo;를 설계했습니다.</p>
          <ul>
            <li>
              <strong>추가 비용 0원</strong>: 이미 있는 구독을 그대로 사용
            </li>
            <li>
              <strong>여러 건을 한 프롬프트에 묶어</strong> 호출. 건별로 보내면 지시문이 건수만큼
              반복 전송되는데, 25건씩 묶으면 그게 1/25로 줄어듭니다
            </li>
            <li>
              <strong>이미 분류한 글은 다시 안 보냅니다</strong>: 매일 돌려도 새 글에만 비용
            </li>
            <li>
              집계, 급증 감지는 <strong>코드가 계산</strong>: AI는 글 한 건의 라벨만
            </li>
            <li>
              라벨 6개에는 <strong>가장 가벼운 모델</strong>로 충분. 위 카드의{' '}
              <span className="hi">실제 호출</span>에 정식 모델 ID가 찍힙니다
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            haiku 같은 이름은 별칭이라 버전을 감춥니다. 그래서 <strong>응답이 알려 준 정식 ID</strong>를 그대로
            보여줍니다. 어느 모델이 돌았는지 확인할 수 있는 근거는 그 값뿐입니다.
          </p>
          <p style={{ marginTop: 8 }}>
            구독이 없으면 API로, 그마저 없으면 규칙 기반으로 <span className="hi">자동 전환</span>됩니다.
            어느 경우에도 브리핑은 나갑니다.
          </p>
        </>
      ),
    },
    {
      // 서비스가 하나뿐이면 칩이 렌더되지 않는다. 그때는 목록을 가리킨다.
      target: multiService ? 'services' : 'items',
      title: '다른 서비스, 다른 팀에도',
      body: (
        <>
          <p>
            {multiService ? (
              <>
                지금 이 화면도 <span className="hi">{m?.services}개 서비스</span>를 동시에 추적하고 있습니다.
                칩을 누르면 그 서비스만 따로 볼 수 있습니다. 통계와 카테고리까지 같이 바뀝니다.
              </>
            ) : (
              <>서비스를 추가하면 여러 서비스를 한 화면에서 추적합니다.</>
            )}
          </p>
          <ul>
            <li>
              추가로 필요한 건 <strong>키워드와 앱 ID뿐</strong>: 코드 수정 없음
            </li>
            <li>설정 탭에서 추가, 수정, 삭제까지 되므로 파일을 열 일이 없습니다</li>
            <li>서버, DB, 클라우드 계약 불필요 (PC 한 대 + 파일 하나)</li>
            <li>업종 용어 사전은 프리셋으로 제공되어 다시 적을 필요가 없습니다</li>
          </ul>
        </>
      ),
    },
  ];

  const intro: TourStep = {
    title: `📡 ${brand} 피드백 레이더`,
    body: (
      <>
        <p>
          앱스토어, 구글플레이, 블로그, 카페, 커뮤니티에 흩어진 사용자 반응을{' '}
          <span className="hi">자동으로 모아</span>, AI가 글마다 분류하고,{' '}
          <span className="hi">이상 징후가 보이면 먼저 알려주는</span> 도구입니다.
        </p>
        <p style={{ marginTop: 10 }}>실제 화면을 보면서 {middle.length}단계로 짚어 드리겠습니다.</p>
      </>
    ),
  };

  const outro: TourStep = {
    title: '여기까지가 전부입니다',
    body: (
      <>
        <p>
          키워드를 한 번 정하고 나면 <strong>수집 → 분류 → 급증 감지 → 알림</strong>이 매일 자동으로
          돕니다. 사람은 브리핑만 읽으면 됩니다.
        </p>
        <p style={{ marginTop: 12 }}>
          <span className="hi">추적할 서비스만 바꾸면</span> 다른 서비스, 다른 팀에도 코드 수정 없이
          그대로 쓸 수 있습니다.
        </p>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          더 자세한 내용: <a href="/pitch">소개 슬라이드</a>, <a href="/deck">동작 원리</a>, {' '}
          <a href="/">실제 대시보드</a>
        </p>
      </>
    ),
  };

  const steps: TourStep[] = [
    intro,
    ...middle.map((s, i) => ({ ...s, title: `${CIRCLED[i] ?? ''} ${s.title}` })),
    outro,
  ];

  /**
   * 실제 대시보드에는 예시 화면에만 있는 요소가 없다. 있는 것으로 바꿔 준다.
   *
   * 반대 방향(예시 화면에 없는 요소)의 대체표는 더 이상 없다. 예시 화면이 실제 화면의
   * 모든 카드를 렌더하기 때문이다 — /tour의 TourProps가 그걸 타입으로 강제한다.
   */
  const LIVE_TARGET: Record<string, string | undefined> = {
    'irrelevant-row': 'tabs', // 관련 글 탭에서는 무관 행이 안 보인다 → 탭 자체를 가리킨다
    brief: undefined, // 브리핑 미리보기는 예시 화면에만 있다 → 화면 중앙 카드로
  };

  if (!live) return steps;

  return steps.map((s, i) => ({
    ...s,
    target: s.target && s.target in LIVE_TARGET ? LIVE_TARGET[s.target] : s.target,
    ...(i === 0
      ? {
          body: (
            <>
              {s.body}
              <p style={{ marginTop: 10, fontSize: 13 }} className="hi">
                지금 보시는 화면은 예시가 아니라 실제 수집, 분류된 데이터입니다.
              </p>
            </>
          ),
        }
      : {}),
  }));
}
