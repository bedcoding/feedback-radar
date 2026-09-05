import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Newsroom Lab | Feedback Radar',
  description: '불규칙한 수집 주기를 고려한 뉴스룸형 피드백 편집판',
};

type CollectionState = 'fresh' | 'manual' | 'older' | 'paused';

interface SourceEdition {
  id: string;
  name: string;
  initials: string;
  kind: string;
  method: string;
  state: CollectionState;
  stateLabel: string;
  lastCollected: string;
  lastCollectedShort: string;
  lastCollectedIso: string;
  batchLabel: string;
  count: number;
  items: string[];
}

const sources: SourceEdition[] = [
  {
    id: 'googleplay',
    name: '구글플레이',
    initials: 'GP',
    kind: '앱 리뷰 · KR/JP/US',
    method: '자동 수집',
    state: 'fresh',
    stateLabel: '오늘 수집',
    lastCollected: '8월 30일 14:52',
    lastCollectedShort: '오늘 14:52',
    lastCollectedIso: '2026-08-30T14:52:00+09:00',
    batchLabel: '이번 수집 48건',
    count: 48,
    items: [
      '결제 뒤 잔액 반영이 늦다는 리뷰가 여러 국가에서 반복됐습니다',
      '업데이트 뒤 알림 설정이 초기화됐다는 의견이 이어졌습니다',
      '검색 결과가 빨라졌다는 긍정 후기가 확인됐습니다',
      '해외 카드 등록 실패가 일본 스토어에서 반복됐습니다',
    ],
  },
  {
    id: 'appstore',
    name: '앱스토어',
    initials: 'AS',
    kind: '앱 리뷰 · KR/JP',
    method: '자동 수집',
    state: 'fresh',
    stateLabel: '오늘 수집',
    lastCollected: '8월 30일 11:10',
    lastCollectedShort: '오늘 11:10',
    lastCollectedIso: '2026-08-30T11:10:00+09:00',
    batchLabel: '이번 수집 26건',
    count: 26,
    items: [
      '보관함 메뉴 위치를 찾기 어렵다는 리뷰가 반복됐습니다',
      '해외 카드 등록 단계에서 다음으로 넘어가지 않는다는 의견입니다',
      '다크 모드의 가독성이 좋아졌다는 후기가 있었습니다',
      '업데이트 뒤 첫 실행이 느리다는 리뷰가 확인됐습니다',
    ],
  },
  {
    id: 'threads',
    name: 'Threads',
    initials: 'TH',
    kind: '소셜 · 키워드 2개',
    method: '자동 수집',
    state: 'fresh',
    stateLabel: '오늘 수집',
    lastCollected: '8월 30일 09:35',
    lastCollectedShort: '오늘 09:35',
    lastCollectedIso: '2026-08-30T09:35:00+09:00',
    batchLabel: '이번 수집 12건',
    count: 12,
    items: [
      '이벤트 혜택을 공유하는 게시물이 여러 건 확인됐습니다',
      '검색 결과가 빨라져 앱을 자주 연다는 반응이 있었습니다',
      '폰트가 바뀐 것 같다는 가벼운 질문이 이어졌습니다',
      '새 화면의 탐색 방식이 더 편하다는 후기가 있었습니다',
    ],
  },
  {
    id: 'theqoo',
    name: '더쿠',
    initials: '더',
    kind: '커뮤니티 · 게시판 3개',
    method: '수동 수집',
    state: 'manual',
    stateLabel: '수동 수집',
    lastCollected: '8월 28일 20:40',
    lastCollectedShort: '2일 전',
    lastCollectedIso: '2026-08-28T20:40:00+09:00',
    batchLabel: '마지막 수집 34건',
    count: 34,
    items: [
      '새 UI는 익숙해지면 괜찮을 것 같다는 반응이 많았습니다',
      '로딩 화면에서 넘어가지 않는다는 질문이 확인됐습니다',
      '이벤트 보상 수령 위치를 묻는 글이 반복됐습니다',
      '검색 필터가 전보다 편해졌다는 의견이 있었습니다',
    ],
  },
  {
    id: 'naver-cafe',
    name: 'N카페',
    initials: 'NC',
    kind: '커뮤니티 · 카페 2개',
    method: '수동 수집',
    state: 'older',
    stateLabel: '3일 전 수집',
    lastCollected: '8월 27일 18:20',
    lastCollectedShort: '3일 전',
    lastCollectedIso: '2026-08-27T18:20:00+09:00',
    batchLabel: '마지막 수집 19건',
    count: 19,
    items: [
      '로그인이 반복해서 풀린다는 이용 경험이 공유됐습니다',
      '본인 인증 문자가 늦게 온다는 문의가 있었습니다',
      '이벤트 쿠폰 적용 조건을 묻는 글이 확인됐습니다',
      '보관함 정렬 기준을 바꿔 달라는 요청이 있었습니다',
    ],
  },
  {
    id: 'dcinside',
    name: '디시',
    initials: 'DC',
    kind: '커뮤니티 · 갤러리 1개',
    method: '수동 수집',
    state: 'manual',
    stateLabel: '어제 수집',
    lastCollected: '8월 29일 22:05',
    lastCollectedShort: '어제 22:05',
    lastCollectedIso: '2026-08-29T22:05:00+09:00',
    batchLabel: '마지막 수집 21건',
    count: 21,
    items: [
      '결제 실패가 본인만의 문제인지 묻는 글이 올라왔습니다',
      '앱 실행 직후 종료된다는 경험이 공유됐습니다',
      '새 검색 필터가 유용하다는 반응이 있었습니다',
      '로그인 세션 유지 시간을 늘려 달라는 의견입니다',
    ],
  },
  {
    id: 'x',
    name: 'X',
    initials: 'X',
    kind: '소셜 · 키워드 4개',
    method: '수집 중지',
    state: 'paused',
    stateLabel: '수집 멈춤',
    lastCollected: '8월 24일 16:18',
    lastCollectedShort: '마지막 8월 24일',
    lastCollectedIso: '2026-08-24T16:18:00+09:00',
    batchLabel: '마지막 수집 17건',
    count: 17,
    items: [
      '알림이 오지 않는다는 글이 마지막 수집분에 포함됐습니다',
      '업데이트 뒤 로그인이 풀렸다는 언급이 있었습니다',
      '새 기능이 편하다는 짧은 후기가 확인됐습니다',
      '이 아래 내용은 8월 24일 이후 갱신되지 않았습니다',
    ],
  },
];

const quickHeadlines = [
  {
    title: '업데이트 뒤 알림 설정이 초기화됐다는 리뷰가 9건 확인됐습니다',
    meta: '앱 오류 · 근거 9건 · 마지막 작성 13:48',
  },
  {
    title: '일본 스토어에서 해외 카드 등록이 되지 않는다는 의견이 반복됐습니다',
    meta: '결제/코인 · JP · 근거 6건 · 마지막 작성 12:31',
  },
  {
    title: '검색 결과가 전보다 빨라졌다는 긍정 후기가 이어졌습니다',
    meta: 'UI/사용성 · 근거 7건 · 마지막 작성 11:42',
  },
  {
    title: '로그인 재인증을 자주 요구한다는 리뷰가 한국 스토어에 모였습니다',
    meta: '계정/로그인 · KR · 근거 5건 · 마지막 작성 10:16',
  },
  {
    title: '보관함 정렬 기준을 기억해 달라는 개선 요청이 확인됐습니다',
    meta: 'UI/사용성 · 근거 4건 · 마지막 작성 09:08',
  },
];

const topicCluster = [
  '결제 직후 잔액이 반영되지 않아 앱을 다시 실행했다는 리뷰',
  '카드 승인은 됐지만 충전 내역이 보이지 않는다는 문의',
  '해외 발급 카드가 등록 단계에서 멈춘다는 일본 스토어 리뷰',
];

const repeatedTopics = [
  { name: '결제/코인', count: 17 },
  { name: 'UI/사용성', count: 12 },
  { name: '앱 오류', count: 9 },
  { name: '계정/로그인', count: 6 },
];

function SourceMark({ source }: { source: SourceEdition }) {
  return (
    <span className={styles.sourceMark} data-source={source.id} aria-hidden="true">
      {source.initials}
    </span>
  );
}

function getCollectionMode(source: SourceEdition) {
  if (source.state === 'paused') return '중지';
  return source.method === '자동 수집' ? '자동' : '수동';
}

function EditionCard({
  source,
  isSelected = false,
}: {
  source: SourceEdition;
  isSelected?: boolean;
}) {
  return (
    <article
      className={styles.editionCard}
      data-state={source.state}
      data-selected={isSelected ? 'true' : undefined}
      id={`edition-${source.id}`}
      aria-labelledby={`edition-title-${source.id}`}
    >
      <header className={styles.editionHeader}>
        <div className={styles.sourceIdentity}>
          <SourceMark source={source} />
          <div>
            <h3 id={`edition-title-${source.id}`}>{source.name}</h3>
            <p>{source.kind}</p>
          </div>
        </div>
        <span className={styles.stateLabel} data-state={source.state}>
          <span aria-hidden="true" />
          {getCollectionMode(source)}
        </span>
      </header>

      <div className={styles.editionDateline}>
        <time dateTime={source.lastCollectedIso}>마지막 성공 {source.lastCollected}</time>
        <span>{source.count}건</span>
      </div>

      {source.state === 'paused' && (
        <p className={styles.pausedNotice}>
          새 글이 아니라 마지막으로 성공한 수집분을 표시합니다.
        </p>
      )}

      <ol className={styles.editionHeadlines}>
        {source.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      {isSelected && (
        <footer className={styles.editionFooter}>
          <a className={styles.editionPreview} href="#channel-detail-googleplay">
            구글플레이 상세 보기
          </a>
        </footer>
      )}
    </article>
  );
}

export default function NewsroomLabPage() {
  const selected = sources[0];

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.mastheadInner}>
          <a className={styles.brand} href="/card-lab/news" aria-label="뉴스룸 시안 처음으로 이동">
            <span className={styles.brandMark} aria-hidden="true">
              FR
            </span>
            <strong>Feedback Radar</strong>
            <span>편집판</span>
          </a>
          <nav className={styles.productNav} aria-label="Feedback Radar 화면">
            <a className={styles.currentNav} href="/card-lab/news" aria-current="page">
              뉴스룸 시안
            </a>
            <span aria-disabled="true" title="디자인 시안에서는 이동하지 않습니다">
              브리핑
            </span>
            <span aria-disabled="true" title="디자인 시안에서는 이동하지 않습니다">
              목록
            </span>
            <span aria-disabled="true" title="디자인 시안에서는 이동하지 않습니다">
              수집
            </span>
          </nav>
          <div className={styles.previewLinks}>
            <span>시안 02</span>
            <a href="/card-lab">시안 01 보기</a>
          </div>
        </div>
      </header>

      <div className={styles.pageInner}>
        <section className={styles.editionSection} aria-labelledby="edition-section-title">
          <header className={styles.sectionHeader}>
            <div>
              <h2 id="edition-section-title">채널별</h2>
              <p className={styles.sectionSummary}>
                채널마다 마지막으로 성공한 수집 내용을 보여줍니다.
              </p>
            </div>
          </header>
          <div className={styles.editionGrid}>
            {sources.map((source) => (
              <EditionCard
                source={source}
                key={source.id}
                isSelected={source.id === selected.id}
              />
            ))}
          </div>
        </section>

        <section
          className={styles.selectedChannel}
          id="channel-detail-googleplay"
          aria-labelledby="desk-title"
        >
          <div className={styles.workspace}>
            <section className={styles.editorialDesk} aria-labelledby="desk-title">
              <header className={styles.deskHeader}>
                <div className={styles.sourceIdentity}>
                  <SourceMark source={selected} />
                  <div>
                    <p>채널 상세</p>
                    <h2 id="desk-title">{selected.name}</h2>
                  </div>
                </div>
                <div className={styles.deskDateline}>
                  <span>{selected.method}</span>
                  <time dateTime={selected.lastCollectedIso}>
                    마지막 완료 {selected.lastCollected}
                  </time>
                  <small>{selected.batchLabel}</small>
                </div>
              </header>

              <article className={styles.leadStory}>
                <div className={styles.leadCopy}>
                  <p className={styles.storyKicker}>이번 수집의 대표 주제</p>
                  <h1>결제 뒤 잔액이 늦게 반영된다는 리뷰가 여러 국가에서 반복됐습니다.</h1>
                  <p className={styles.storySummary}>
                    이번 구글플레이 수집분에서 같은 맥락의 리뷰 17건을 확인했습니다. 한국 11건,
                    일본 4건, 미국 2건이며 글이 작성된 범위는 8월 28일부터 30일까지입니다.
                  </p>
                  <div className={styles.storyMeta}>
                    <span>결제/코인</span>
                    <span>근거 17건</span>
                    <span>KR · JP · US</span>
                    <span>작성일 8/28–8/30</span>
                  </div>
                </div>
                <aside className={styles.quoteCard} aria-label="대표 원문">
                  <span>대표 원문</span>
                  <blockquote>
                    “결제는 됐는데 충전 내역이 바로 안 보여요. 앱을 다시 켜니 들어왔습니다.”
                  </blockquote>
                  <p>★ 1.0 · 한국 스토어</p>
                  <div>
                    <time dateTime="2026-08-30T14:29:00+09:00">14:29 작성</time>
                    <time dateTime="2026-08-30T14:52:00+09:00">14:52 수집</time>
                  </div>
                </aside>
              </article>

              <section className={styles.headlineDesk} aria-labelledby="quick-title">
                <header className={styles.moduleHeader}>
                  <h2 id="quick-title">빠르게 보기</h2>
                  <span>이번 수집 48건에서 선별</span>
                </header>
                <ol>
                  {quickHeadlines.map((headline) => (
                    <li key={headline.title}>
                      <span className={styles.headlineText}>{headline.title}</span>
                      <span>{headline.meta}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className={styles.topicCluster} aria-labelledby="cluster-title">
                <header>
                  <span>묶음</span>
                  <h2 id="cluster-title">결제/코인 관련 원문</h2>
                  <strong>17건</strong>
                </header>
                <ol>
                  {topicCluster.map((item) => (
                    <li key={item}>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
                <span className={styles.clusterMore}>실데이터 연결 시 원문 17건 보기</span>
              </section>
            </section>

            <aside className={styles.contextRail} aria-label="수집 맥락">
              <section className={styles.topicPanel} aria-labelledby="topic-title">
                <header className={styles.moduleHeader}>
                  <h2 id="topic-title">반복 언급 주제</h2>
                  <span>구글플레이</span>
                </header>
                <p className={styles.moduleNote}>
                  선택한 수집분 48건 안에서의 건수입니다. 전체 여론이나 채널 간 순위가 아닙니다.
                </p>
                <ol>
                  {repeatedTopics.map((topic, index) => (
                    <li key={topic.name}>
                      <span>{index + 1}</span>
                      <strong>{topic.name}</strong>
                      <em>{topic.count}건</em>
                    </li>
                  ))}
                </ol>
              </section>

              <section className={styles.methodPanel} aria-labelledby="method-title">
                <h2 id="method-title">표시 원칙</h2>
                <ul>
                  <li>
                    <span data-state="fresh" aria-hidden="true" /> 자동 수집은 마지막 성공 시각 표시
                  </li>
                  <li>
                    <span data-state="manual" aria-hidden="true" /> 수동 수집은 실행할 때만 갱신
                  </li>
                  <li>
                    <span data-state="paused" aria-hidden="true" /> 멈춘 채널은 과거 수집분임을 명시
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        </section>

        <footer className={styles.pageFooter}>
          <p>
            이 시안은 `작성 시각`, `수집 시각`, `AI 요약 시각`을 서로 다른 정보로 다루는
            뉴스룸형 배치입니다.
          </p>
          <a href="/card-lab">Signal Cards 시안 보기</a>
        </footer>
      </div>
    </main>
  );
}
