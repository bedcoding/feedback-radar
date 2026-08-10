import type { TourStep } from './TourOverlay';

/** 투어에서 인용할 실제 수치: 지어낸 숫자를 쓰지 않기 위해 화면과 같은 값을 받는다 */
export interface TourMetrics {
  total: number;
  irrelevant: number;
  services: number;
  /** 사람이 글 1건을 확인하는 데 걸리는 시간(초): 가정치 */
  secondsPerItem: number;
  /** 브리핑 1회 확인 시간(분): 가정치 */
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
 * 투어 단계 정의: 예시 데이터 화면(/tour)과 실제 대시보드(/?tour=1)가 같은 설명을 쓴다.
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

  /** 본문 단계. 제목에 번호를 적지 않는다. 아래에서 순서대로 붙인다 */
  const middle: TourStep[] = [
    {
      target: 'scheduler',
      tab: 'collect',
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
      target: 'progress',
      tab: 'collect',
      title: '지금 무엇을 판정에 넣고 있는지 보입니다',
      body: (
        <>
          <p>
            수집은 1분이면 끝나지만 <strong>분류는 수십 분</strong> 걸립니다. 그동안 지금 어떤
            호출을 보내는지 그대로 띄웁니다.
          </p>
          <ul>
            <li>
              <strong>몇 번째 호출에 글 몇 건</strong>을 담았는지, 그 호출에 들어간 글 목록
            </li>
            <li>
              여기까지 쓴 <span className="hi">토큰과 캐시 재사용량</span>. 끝나기 전에도 비용을
              봅니다
            </li>
            <li>언제든 <strong>중단</strong>. 분류한 건은 남고 나머지만 다음으로 넘어갑니다</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            첫 호출은 5건, 다음은 10건, 20건으로 <strong>키워 나갑니다.</strong> 크게 시작하면 첫
            결과가 2분 뒤인데, 작게 시작하면 <span className="hi">87초에 진행률이 움직입니다.</span>
          </p>
        </>
      ),
    },
    {
      target: 'briefing',
      tab: 'brief',
      title: '채널마다 무슨 얘기였는지 AI가 정리합니다',
      body: (
        <>
          <p>
            숫자는 &ldquo;몇 건&rdquo;만 말해 줍니다. 그래서 <strong>채널별로</strong> 요점을 따로 묶어
            문장으로 정리합니다.
          </p>
          <ul>
            <li>
              앱 리뷰의 불만과 커뮤니티의 잡음은 무게가 다릅니다. 섞으면{' '}
              <span className="hi">어디서 터진 얘기인지</span> 알 수 없습니다
            </li>
            <li>
              아래 <strong>추이 격자</strong>는 채널마다 최근 7일 언급량. 요약이 &ldquo;무슨
              일&rdquo;이라면 격자는 <span className="hi">&ldquo;늘고 있나&rdquo;</span>입니다
            </li>
            <li>날짜를 눌러 지난 날 요약을 다시 봅니다</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            요약에 <strong>원문을 다시 보내지 않습니다.</strong> 글마다 붙여 둔 한 줄 요약과 집계만
            넘기고, 그때 쓴 토큰이 카드에 찍힙니다.
          </p>
        </>
      ),
    },
    {
      target: 'stats',
      tab: 'brief',
      title: '현황은 한눈에',
      body: (
        <>
          <p>
            <strong>누적 수집과 오늘 수집</strong> 건수가 상단에 바로 보입니다.
          </p>
          <p style={{ marginTop: 8 }}>
            수집량이 평소보다 튀면 그 자체가 신호입니다. 뒤에서 볼{' '}
            <span className="hi">급증 감지</span>가 카테고리별로 직전 7일과 비교합니다.
          </p>
        </>
      ),
    },
    {
      target: 'categories',
      tab: 'brief',
      title: '무슨 얘기가 오가는지 주제별로',
      body: (
        <>
          <p>
            AI가 붙인 카테고리로 묶어 <strong>오늘 어떤 주제가 몇 건</strong>인지 보여줍니다.
          </p>
          <p style={{ marginTop: 8 }}>
            카테고리를 누르면 그 주제의 글이 <span className="hi">목록 탭</span>에서 열립니다.
            거기서 감성별로 걸러 실제 문장을 확인할 수 있습니다.
          </p>
        </>
      ),
    },
    {
      target: 'brief',
      tab: 'brief',
      title: '매일 이런 브리핑 한 장이 나갑니다',
      body: (
        <>
          <p>
            수집, 분류가 끝나면 채널별 브리핑을 만들어 <strong>DB에 날짜별로 저장</strong>합니다.
            지금 보고 계신 카드가 그 값이고, 어느 기기에서 열어도 같은 브리핑이 뜹니다.
            로컬 실행에서는 같은 내용을 마크다운(<code>private/reports/날짜.md</code>)으로도 남깁니다.
          </p>
          <ul>
            <li>
              <strong>급증 감지</strong>: 평소(직전 7일 평균)의 3배를 넘고 5건 이상일 때만
            </li>
            <li>
              <strong>먼저 읽어 볼 글</strong>: 반응이 센 것부터 담당팀 표시와 함께 상단에
            </li>
            <li>모든 인용에 원문 링크</li>
          </ul>
        </>
      ),
    },
    {
      // 서비스가 하나뿐이면 칩이 렌더되지 않는다. 그때는 목록을 가리킨다.
      target: multiService ? 'services' : 'items',
      tab: 'items',
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
    {
      target: 'countries',
      tab: 'items',
      title: '같은 앱도 나라마다 반응이 다릅니다',
      body: (
        <>
          <p>
            같은 앱이라도 <strong>스토어 국가를 바꾸면 리뷰가 통째로 달라집니다.</strong> 국내
            스토어만 조회하면 해외 반응은 <span className="hi">한 건도 들어오지 않습니다.</span>
          </p>
          <ul>
            <li>한 국가에서 잘 도는 기능이 다른 국가에서는 불만 1순위이기도 합니다</li>
            <li>칩을 눌러 국가별로 나눠 봅니다. 섞어 두면 그 차이가 평균에 묻힙니다</li>
            <li>국가가 붙는 건 앱 리뷰뿐입니다. 커뮤니티 글에는 국가가 없습니다</li>
          </ul>
          <p style={{ marginTop: 8 }}>
            없는 국가 코드는 저장 단계에서 막습니다. <code>jp</code>를 <code>ip</code>로 잘못 적으면
            국기까지 그려져서 <span className="hi">화면은 멀쩡한데 수집만 0건</span>이 됩니다.
          </p>
        </>
      ),
    },
    {
      target: 'items',
      tab: 'items',
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
      target: 'irrelevant-row',
      tab: 'items',
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
      tab: 'settings',
      title: '무엇을 근거로 판정하는지 열어 두었습니다',
      body: (
        <>
          <p>
            AI가 붙인 라벨을 믿을지 판단하려면 <strong>무슨 지시를 받았는지</strong>를 볼 수 있어야
            합니다. 실제로 전송되는 지시문 전문이 이 카드에 그대로 뜨고, 판정 기준에 해당하는 두
            값은 <span className="hi">화면에서 바로 고칩니다.</span>
          </p>
          <ul>
            <li>
              <strong>도메인 지식</strong>: 이 업종에서 그 단어가 무슨 뜻인지
            </li>
            <li>
              <strong>제외 단어</strong>: 서비스명이 다른 분야 용어와 겹칠 때 오탐을 걷어냅니다
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            분류 규칙과 출력 형식, 인젝션 방어 규칙은 <strong>코드에 고정</strong>했습니다. 고칠
            것과 고정할 것을 갈라 둔 셈입니다.
          </p>
        </>
      ),
    },
    {
      target: 'tagger',
      tab: 'settings',
      title: 'AI를 아껴 쓴 방법',
      body: (
        <>
          <p>많이 쓰는 것보다 <span className="hi">언제 안 쓰는가</span>를 설계했습니다.</p>
          <ul>
            <li>
              <strong>추가 비용 0원</strong>: 이미 있는 구독을 그대로 사용
            </li>
            <li>
              <strong>여러 건을 한 번에 묶어</strong> 호출. 건별로 보내면 지시문이 건수만큼 다시
              나갑니다
            </li>
            <li>
              <strong>분류한 글은 다시 안 보냅니다</strong>: 매일 돌려도 새 글에만 비용
            </li>
            <li>
              집계와 급증 감지는 <strong>코드가 계산</strong>. AI는 글 한 건의 라벨만
            </li>
            <li>
              라벨 6개에는 <strong>가장 가벼운 모델</strong>로 충분
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            구독이 없으면 API로, 그마저 없으면 규칙 기반으로 <span className="hi">자동 전환</span>됩니다.
            어느 경우에도 브리핑은 나갑니다.
          </p>
        </>
      ),
    },
    {
      target: 'collect',
      tab: 'settings',
      title: '얼마나 모을지 정하면 비용이 먼저 보입니다',
      body: (
        <>
          <p>
            소스마다 한 번에 몇 건까지 가져올지 정합니다. 값을 바꾸면{' '}
            <span className="hi">최대 몇 건이 들어오고 분류 호출이 몇 번 나가는지</span>를 그
            자리에서 다시 계산해 보여줍니다.
          </p>
          <ul>
            <li>비용은 건수가 아니라 <strong>호출 횟수</strong>로 정해지기 때문입니다</li>
            <li>
              소스를 하나씩 끄고 켜거나, <strong>이것만 실행</strong>으로 한 곳만 다시 훑습니다
            </li>
            <li>지금까지 그 소스에서 실제로 모은 건수와 기간도 함께 뜹니다</li>
          </ul>
        </>
      ),
    },
    {
      /*
        화면 요소를 가리키지 않는다 (중앙 카드로 뜬다).
        성과 수치는 특정 카드에 붙은 이야기가 아니고, stats를 가리키면 설정 탭에서 브리핑
        탭으로 되돌아가는 왕복이 생겨 탭 순회가 어긋난다.
      */
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
  ];

  /*
    표지에 숫자를 놓는다.

    성과 수치는 원래 마지막 단계에만 있었다. 끝까지 넘겨 본 사람에게만 보이는 셈인데,
    앞부분만 훑고 덮는 경우가 더 많다. 그래서 결론에 해당하는 세 값을 첫 장에 올리고,
    계산 근거는 마지막 단계에 그대로 둔다. 같은 값을 두 번 쓰는 게 아니라 결론과 근거로
    나눠 놓는 것이다.
  */
  const intro: TourStep = {
    title: `📡 ${brand} 피드백 레이더`,
    body: (
      <>
        <p>
          앱스토어, 구글플레이, 블로그, 카페, 커뮤니티에 흩어진 사용자 반응을{' '}
          <span className="hi">자동으로 모아</span>, AI가 글마다 분류하고,{' '}
          <span className="hi">이상 징후가 보이면 먼저 알려주는</span> 도구입니다.
        </p>
        {m && (
          <div className="tour-nums">
            <div className="tour-num">
              <b>
                {m.total.toLocaleString()}
                <i>건</i>
              </b>
              <span>모아서 분류함</span>
            </div>
            <div className="tour-num">
              <b>
                {irrelevantPct}
                <i>%</i>
              </b>
              <span>볼 필요 없어 제외</span>
            </div>
            {/*
              시간 단축 배수를 여기 놓지 않는다. 그 값은 수집 밀도에 따라 크게 흔들려서
              (예시 데이터처럼 하루 수십 건이면 2배까지 내려간다) 첫 장에 크게 박을 만큼
              안정적이지 않다. 배수는 계산 근거와 함께 마지막 단계에 둔다.
              대신 여기에는 데이터가 무엇이든 항상 참인 값을 놓는다.
            */}
            <div className="tour-num">
              <b>
                0<i>분</i>
              </b>
              <span>사람이 채널 도는 시간</span>
            </div>
          </div>
        )}
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
          <a href="/">실제 대시보드로 이동</a>
        </p>
      </>
    ),
  };

  /**
   * 마지막 장: 사용한 도구와 기술.
   *
   * 제출 요건이다. "생성형 AI, 오픈소스, 외부 API를 활용한 경우 사용한 도구와 기술을
   * 제출자료에 명시해야 합니다."
   *
   * PDF에만 넣지 않고 화면 단계로 둔다. 이 도구는 화면을 원본으로 삼아 발표 자료를 매번
   * 새로 굽는데, PDF에만 있는 장은 화면과 자료가 어긋나는 첫 지점이 된다.
   * 카드에는 무엇을 썼는지만 적고 버전까지는 적지 않는다. 판단에 필요한 것은 목록이고,
   * 버전을 늘어놓으면 카드가 읽히지 않는 표가 된다.
   */
  const credits: TourStep = {
    title: '사용한 도구와 기술',
    body: (
      <>
        <p>
          <strong>개발</strong>: Claude Code, OpenAI Codex
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>분류 LLM</strong>: Claude 구독 CLI(기본), OpenAI API(배포판), Anthropic API(폴백)
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>스택</strong>: TypeScript, Next.js, React, PostgreSQL, Playwright, zod
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>수집</strong>: 앱스토어 iTunes RSS, google-play-scraper, 공개 페이지 브라우저 수집
        </p>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          로그인이 필요한 채널은 수집하지 않습니다. 공식 API와 비로그인 공개 페이지만 씁니다.
        </p>
      </>
    ),
  };

  const steps: TourStep[] = [
    intro,
    ...middle.map((s, i) => ({ ...s, title: `${CIRCLED[i] ?? ''} ${s.title}` })),
    outro,
    credits,
  ];

  /**
   * 실제 대시보드에는 예시 화면에만 있는 요소가 없다. 있는 것으로 바꿔 준다.
   *
   * 반대 방향(예시 화면에 없는 요소)의 대체표는 더 이상 없다. 예시 화면이 실제 화면의
   * 모든 카드를 렌더하기 때문이다. /tour의 TourProps가 그걸 타입으로 강제한다.
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
