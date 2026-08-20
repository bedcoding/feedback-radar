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
 * 제목에 손으로 적지 않는다. 단계를 넣거나 빼면 그때부터 어긋난다. 표지에 총 단계 수를
 * 문장으로 적어뒀다가 본문 개수와 틀어진 적이 있어서, 그 문장은 아예 없앴다.
 * 번호는 본문 단계에만 붙는다. 표지, 탭 개요, 맺음말은 무번호다.
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

  /*
    본문 단계는 탭별로 나눠 담고 아래에서 화면 탭 순서(브리핑, 목록, 수집, 설정)대로 잇는다.

    예전에는 수집 탭부터 시작해서 브리핑, 목록, 설정으로 갔다. 파이프라인 순서(모으고,
    분류하고, 본다)로는 맞는데, 처음 보는 사람은 그 파이프라인이 있다는 것부터 모른다.
    첫 단계에서 대뜸 스케줄 입력칸을 확대해 놓고 나머지 화면을 어둡게 덮으니, 이게 무슨
    프로그램인지가 끝까지 안 잡혔다. 그래서 탭 개요를 한 장 앞에 세워 전체를 먼저 보이고,
    세부는 화면에 보이는 탭 순서를 그대로 따라간다. 탭 줄이 곧 목차 역할을 한다.

    탭 안에서의 순서는 DOM 순서(위에서 아래)를 지킨다. 거스르면 스포트라이트가 위아래로
    되짚느라 화면이 튄다.
  */

  /** 브리핑 탭 */
  const briefTab: TourStep[] = [
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
              아래 <strong>추이 격자</strong>는 채널마다 최근 7일 언급량입니다
            </li>
            <li>날짜를 눌러 지난 날 요약을 다시 봅니다</li>
          </ul>
          {/* 토큰이 카드에 찍힌다는 설명은 비용 장에 있다. 여기서는 원문 미전송만 말한다 */}
          <p style={{ marginTop: 8 }}>
            요약에 <strong>원문을 다시 보내지 않습니다.</strong> 글마다 붙여 둔 한 줄 요약과 집계만
            넘깁니다.
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
            수집량이나 특정 주제가 평소보다 튀면 그 자체가 신호입니다. 다음 단계의{' '}
            <span className="hi">급증 감지</span>가 카테고리별로 직전 7일과 비교합니다.
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
          {/*
            산출물이 둘이고 내용이 다르다. 예전에는 "같은 내용을 마크다운으로도 남긴다"고 적었는데
            사실이 아니었다.

            [3/4] 채널 요약은 db.saveChannelSummary()로 DB에 들어가고 서비스별로 나뉜다.
            화면 브리핑 카드가 읽는 값이 이것이다.
            [4/4] 일일 리포트는 buildDailyReport()가 만들어 파일로만 쓴다(DB 저장 없음).
            전 서비스 합산이고, **급증 감지와 먼저 읽어 볼 글은 이쪽에만 있다**
            (BriefingCard에는 급증 코드가 없다. report/daily.ts에만 있다).
            그래서 불릿 세 개는 리포트 쪽 내용이라고 밝혀 둔다.
          */}
          <p>
            수집, 분류가 끝나면 <strong>일일 리포트</strong>가 만들어집니다. 로컬 실행에서는 파일로도
            남습니다(<code>private/reports/날짜.md</code>).
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
          <p style={{ marginTop: 8 }}>
            화면 카드의 채널별 요약은 <strong>DB에 날짜별로</strong> 따로 저장됩니다.
          </p>
        </>
      ),
    },
  ];

  /** 목록 탭 */
  const itemsTab: TourStep[] = [
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
          {/*
            이 장은 서비스 확장 한 가지만 말한다. 예전에는 "서버, DB, 클라우드 계약 불필요"와
            "업종 용어 사전 프리셋"도 여기 있었는데, 앞의 것은 비용 장, 뒤의 것은 도메인 지식
            장에 이미 있는 내용이라 이 장에서는 주제 이탈이었다.
          */}
          <ul>
            <li>
              추가로 필요한 건 <strong>키워드와 앱 ID뿐</strong>: 코드 수정 없음
            </li>
            <li>설정 탭에서 추가, 수정, 삭제까지 되므로 파일을 열 일이 없습니다</li>
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
            같은 앱이라도 <strong>스토어 국가를 바꾸면 리뷰가 통째로 달라집니다.</strong>
          </p>
          <ul>
            <li>한 국가에서 잘 도는 기능이 다른 국가에서는 불만 1순위이기도 합니다</li>
            <li>칩을 눌러 나눠 봅니다. 섞으면 차이가 평균에 묻힙니다</li>
            <li>국가는 앱 리뷰에만 붙습니다</li>
          </ul>
          {/*
            이 자리에는 원래 "없는 국가 코드는 저장 단계에서 막는다"가 있었다. 개발 쪽 디테일이라
            심사에서 값이 낮고, 이 장 전체에 숫자가 하나도 없다는 문제가 더 컸다. 국가 확장은
            순증이었다는 실측이 있어서 그것으로 바꿨다. 국가별 조회 결과는 서로 배타적이다
            (교집합 0건). "해외가 더 심각하다"고는 쓰지 않는다. 부정률이 가장 높은 것은 국내
            앱 리뷰이고, 채널 차이가 국가 차이보다 크다.
          */}
          <p style={{ marginTop: 8 }}>
            국가를 늘린 날 <span className="hi">신규 554건이 전부 해외 리뷰</span>였고 국내 신규는
            0건이었습니다.
          </p>
        </>
      ),
    },
    {
      target: 'items',
      tab: 'items',
      /*
        제목에 라벨 개수를 적지 않는다. "6가지"라고 적어 뒀더니 카드 불릿은 네 개고
        표의 열도 네 개라, 세어 보는 사람에게는 숫자가 맞지 않았다. 실제 응답 필드는
        일곱 개(감성, 카테고리, 심각도, 담당팀, 요약, 관련 여부, 판정 근거)이고
        뒤의 두 개는 이 장이 아니라 무관 필터 장에서 설명한다.
      */
      title: '글 하나하나에 라벨이 붙습니다',
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
  ];

  /** 수집 탭 */
  const collectTab: TourStep[] = [
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
          {/*
            "사람이 하는 일은 여기까지"를 여기서 뺐다. 같은 말이 탭 개요("매일 읽는 곳은
            브리핑 탭 하나")와 맺음말("사람은 브리핑만 읽으면 됩니다")에도 있어 세 장에
            반복됐다. 이 장은 화면에 실제로 있는 조작(지금 실행, 실패 사유 표시)만 말한다.
          */}
          <ul>
            <li>
              <strong>지금 실행</strong>: 장애 대응 중 최신 반응을 바로 확인할 때
            </li>
            <li>마지막, 다음 실행 시각이 항상 표시되고, 실패하면 사유가 그대로 뜹니다</li>
          </ul>
        </>
      ),
    },
    {
      target: 'progress',
      tab: 'collect',
      /*
        이 카드는 두 상태 어느 쪽에서도 참이어야 한다.

        `progress` 앵커는 분류가 도는 중에는 분류 카드에 붙고, 대기 중에는 지난 수집 카드로
        넘어간다(CollectProgress.tsx). 그런데 예전 본문은 호출 번호, 토큰, 중단 버튼을
        약속했다. 그 세 가지는 분류 카드에만 있어서, 대기 상태에서 PDF를 구우면 지면의
        "5분 14초 소요"와 본문의 "분류는 수십 분"이 같은 장에서 서로를 반박했다.
        그래서 대기 화면에 실재하는 것(소스별 수집과 신규 건수, 건너뛴 사유)을 앞세우고,
        분류 중에만 보이는 것은 조건을 밝혀 한 줄로 접었다.
      */
      title: '지금 무엇을 판정에 넣고 있는지 보입니다',
      body: (
        <>
          <p>
            수집은 1분, <strong>분류는 수십 분</strong> 걸립니다. 그동안 어디까지 됐는지 이 카드에
            뜹니다.
          </p>
          <ul>
            <li>
              소스마다 <strong>몇 건 모았고 몇 건이 새 글인지.</strong> 건너뛴 소스는 사유까지
            </li>
            <li>
              분류 중에는 지금 보내는 호출과 <span className="hi">여기까지 쓴 비용</span>이 같은 자리에
            </li>
          </ul>
          <p style={{ marginTop: 8 }}>
            호출은 5건, 10건, 20건으로 <strong>키워 나갑니다.</strong> 중단해도 분류한 건은 남습니다.
          </p>
        </>
      ),
    },
  ];

  /** 설정 탭 */
  const settingsTab: TourStep[] = [
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
            {/*
              "이미 있는 구독을 그대로 사용"은 무엇을 어떻게 쓰는지가 빠져서, 심사에서
              "그래서 결제는 어디로 가나"를 다시 묻게 되는 문장이었다. 실제 동작은
              `claude -p` 호출이고 그 CLI가 그 머신에 로그인된 구독 세션을 쓴다
              (tagging/claude-cli.ts). 인증 토큰이 아니라 구독 사용 한도를 쓰는 것이므로
              "토큰을 쓴다"고 적지 않는다.
            */}
            <li>
              <strong>추가 비용 0원</strong>: 이 PC에 로그인된 Claude 구독 계정으로 CLI를 호출합니다.
              API 키 종량 청구가 아닙니다
            </li>
            <li>
              <strong>여러 건을 한 번에 묶어</strong> 호출. 건별로 보내면 지시문이 건수만큼 다시
              나갑니다
            </li>
            <li>
              <strong>분류한 글은 다시 안 보냅니다</strong>: 매일 돌려도 새 글에만 비용
            </li>
            {/*
              불릿을 다섯에서 넷으로 줄였다. 이 카드가 세로로 길어 강조 대상(모델 설정 카드)의
              3분의 1을 덮고 있었다. 계산 분담과 모델 선택은 같은 논지라 한 줄로 합쳤다.
            */}
            <li>
              집계와 급증 감지는 <strong>코드가 계산</strong>. AI는 글 한 건의 라벨만 붙입니다
            </li>
          </ul>
          {/*
            배포 여부로 문구를 갈라 쓰지 않는다. 이 한 줄이 양쪽에서 참이라 로컬과 배포판이
            같은 카드를 쓸 수 있다. 배포판에는 실행할 CLI가 없어 OpenAI API로 돈다
            (page.tsx가 deploymentMode에서 taggerStatus를 openai로 고정한다).
            갈라 쓰면 PDF는 로컬에서 굽고 데모 링크는 배포판이라, 같은 장이 두 문구를
            갖게 되고 어느 쪽이 맞는지 확인할 방법이 지면에 남지 않는다.
          */}
          <p style={{ marginTop: 8 }}>
            CLI를 띄울 수 없는 <strong>배포판에서는 OpenAI API</strong>로 분류합니다.
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
  ];

  /** 성과 수치. 어느 탭에도 붙지 않는다 */
  const numbers: TourStep = {
    /*
      화면 요소를 가리키지 않는다 (중앙 카드로 뜬다).
      성과 수치는 특정 카드에 붙은 이야기가 아니고, 앞 탭의 요소를 가리키면 설정 탭에서
      되돌아가는 왕복이 생겨 탭 순회가 어긋난다.
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
            {/*
              가정치를 보수적으로 잡았다는 것을 밝힌다. 사람이 글 1건을 판단하는 시간은 이
              프로젝트에서 실측한 적이 없어서, 값이 크면 배수가 커지는 대신 "정말 그만큼
              걸리나"라는 반박 한 번에 같은 장의 실측 숫자(총 건수, 무관 비율)까지 함께
              의심받는다. 낮게 잡아 배수가 줄어드는 편이 방어에 유리하다.
            */}
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              건당 {m.secondsPerItem}초, 브리핑 {m.briefingMinutes}분은 보수적으로 잡은 가정치입니다.
              수집 건수와 일수는 실제 집계값입니다.
            </p>
          </>
        ) : (
          <p>수집이 쌓이면 이 자리에 실제 절감 시간이 계산되어 표시됩니다.</p>
        )}
      </>
    ),
  };

  const middle: TourStep[] = [...briefTab, ...itemsTab, ...collectTab, ...settingsTab, numbers];

  /*
    표지에 숫자를 놓는다.

    성과 수치는 원래 마지막 단계에만 있었다. 끝까지 넘겨 본 사람에게만 보이는 셈인데,
    앞부분만 훑고 덮는 경우가 더 많다. 그래서 결론에 해당하는 세 값을 첫 장에 올리고,
    계산 근거는 마지막 단계에 그대로 둔다. 같은 값을 두 번 쓰는 게 아니라 결론과 근거로
    나눠 놓는 것이다.
  */
  const intro: TourStep = {
    /*
      표지도 탭을 지정한다. 표지 뒤에 이미 브리핑 탭이 깔려 있는데 다음 단계만 'brief'로
      적어 두면 카드가 "다음은 브리핑 탭입니다"라고 예고한다. 화면은 그대로인데 바뀐다고
      말하는 셈이라, 표지에서 시작 탭을 못 박아 예고가 뜨지 않게 한다.
    */
    tab: 'brief',
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
      </>
    ),
  };

  /**
   * 탭에 처음 들어가는 장. 그 탭의 화면 전체를 보여주고 한 줄로만 소개한다.
   *
   * 예전에는 탭 4개를 한 장에 몰아 목차처럼 적었다. 구조는 전달되는데 정작 각 탭에
   * 들어가는 순간에는 요소 하나가 확대되고 나머지가 어두워져서, 방금 들어온 화면이
   * 통째로 어떤 모습인지 볼 기회가 없었다. 그래서 목차 한 장을 네 장으로 흩어 각 탭
   * 문턱에 놓는다. 강조를 걸지 않는 것(tabIntro)이 이 장의 핵심이다.
   *
   * 한 줄을 넘기지 마라. 세부는 바로 다음 장부터 짚으므로, 여기서 늘리면 같은 말을 두 번
   * 하게 되고 카드가 커져 정작 보여주려던 화면을 덮는다.
   */
  const TAB_INTRO: Record<'brief' | 'items' | 'collect' | 'settings', TourStep> = {
    brief: {
      tabIntro: true,
      tab: 'brief',
      title: '브리핑: 오늘 무슨 일이 있었나',
      body: (
        <p>
          사람이 매일 읽는 곳은 <span className="hi">여기 하나</span>입니다. 건수, 주제, 채널별 요약이
          한 화면에 있습니다.
        </p>
      ),
    },
    items: {
      tabIntro: true,
      tab: 'items',
      title: '목록: 브리핑의 근거',
      body: (
        <p>
          모은 글 <span className="hi">전부</span>가 판정과 함께 있습니다. 위쪽 칩으로 걸러 원문까지
          내려갑니다.
        </p>
      ),
    },
    collect: {
      tabIntro: true,
      tab: 'collect',
      title: '수집: 언제 얼마나 모을까',
      body: (
        <p>
          주기를 정해 두면 알아서 돕니다. 지금 <span className="hi">무엇을 처리하는 중인지</span>도 이
          화면에 뜹니다.
        </p>
      ),
    },
    settings: {
      tabIntro: true,
      tab: 'settings',
      title: '설정: 무엇을 추적하고 어떻게 판정할까',
      body: (
        <p>
          추적할 서비스와 키워드, <span className="hi">AI에게 보내는 지시문</span>까지 화면에서 고칩니다.
        </p>
      ),
    },
  };

  const outro: TourStep = {
    title: '여기까지가 전부입니다',
    body: (
      <>
        <p>
          {/*
            네 단계는 daily.ts의 [1/4]~[4/4]와 같아야 한다. 예전에는 마지막을 "알림"이라고 적었는데
            웹훅 전송은 코드째로 제거된 기능이라, 화면에 없는 것을 산출 경로로 약속하는 문장이었다.
          */}
          키워드를 한 번 정하고 나면 <strong>수집 → 분류 → 채널별 요약 → 브리핑</strong>이 매일
          자동으로 돕니다. 사람은 브리핑만 읽으면 됩니다.
        </p>
        <p style={{ marginTop: 12 }}>
          <span className="hi">추적할 서비스만 바꾸면</span> 다른 서비스, 다른 팀에도 코드 수정 없이
          그대로 쓸 수 있습니다.
        </p>
        {/*
          대시보드로 나가는 링크는 이 장에 두지 않는다. 여기가 끝인 것처럼 읽혀도 실제
          마지막 장은 사용한 도구와 기술이고, 그 장이 제출 요건이다. 링크를 여기 두면
          누른 사람은 그 장을 못 보고 나간다. 링크는 마지막 장으로 옮겼다.
        */}
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
        {/* 아래 줄과 층이 다르다. 이건 만드는 데 쓴 AI, 아래는 돌면서 쓰는 AI다 */}
        <p>
          <strong>개발 AI</strong>: Claude Code (Opus 5), OpenAI Codex (ChatGPT 5.6 Sol)
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>분류 LLM</strong>: Claude 구독 CLI(기본), OpenAI API(배포판), Anthropic API(폴백)
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>기술 스택</strong>: TypeScript, Next.js, React, PostgreSQL, Playwright, zod
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>수집</strong>: 앱스토어 iTunes RSS, google-play-scraper, 공개 페이지 브라우저 수집
        </p>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          로그인이 필요한 채널은 수집하지 않습니다. 공식 API와 비로그인 공개 페이지만 씁니다.
        </p>
        {/* 나가는 경로는 마지막 장에만 둔다. 앞 장에 두면 이 장을 못 보고 나간다 */}
        <p style={{ marginTop: 12, fontSize: 13 }}>
          <a href="/">실제 대시보드로 이동</a>
        </p>
      </>
    ),
  };

  /*
    탭이 바뀌는 자리마다 그 탭 개요를 끼운다. 손으로 배열에 박지 않는 이유는 단계를
    재배열하거나 넣고 빼면 그때부터 어긋나기 때문이다. 번호는 본문 단계의 순서를 따르므로
    개요가 중간에 끼어도 ①②③이 밀리지 않는다.
  */
  const numbered: TourStep[] = [];
  let lastTab: TourStep['tab'];
  middle.forEach((s, i) => {
    if (s.tab && s.tab !== lastTab) {
      numbered.push(TAB_INTRO[s.tab]);
      lastTab = s.tab;
    }
    numbered.push({ ...s, title: `${CIRCLED[i] ?? ''} ${s.title}` });
  });

  const steps: TourStep[] = [intro, ...numbered, outro, credits];

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

  return steps.map((s) => ({
    ...s,
    target: s.target && s.target in LIVE_TARGET ? LIVE_TARGET[s.target] : s.target,
  }));
}
