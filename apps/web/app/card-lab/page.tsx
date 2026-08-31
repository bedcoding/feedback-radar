import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Card Lab | Feedback Radar',
  description: 'Feedback Radar 채널 카드 디자인 샘플',
};

type SignalTone = 'critical' | 'watch' | 'stable';
type SeverityTone = 'critical' | 'high' | 'medium' | 'positive';

interface FeedbackSample {
  severity: SeverityTone;
  severityLabel: string;
  content: string;
  category: string;
  detail?: string;
  time: string;
  dateTime: string;
}

interface ChannelSignal {
  id: string;
  name: string;
  initials: string;
  channelType: string;
  scope: string;
  tone: SignalTone;
  status: string;
  total: number;
  negativeRate: number;
  delta: string;
  deltaDirection: 'up' | 'down' | 'flat';
  summary: string;
  trend: number[];
  categories: { name: string; count: number; share: number }[];
  feedback: FeedbackSample[];
  updated: string;
  href: string;
  featured?: boolean;
}

const channels: ChannelSignal[] = [
  {
    id: 'googleplay',
    name: '구글플레이',
    initials: 'GP',
    channelType: '앱 리뷰',
    scope: 'KR · US',
    tone: 'critical',
    status: '부정 급증',
    total: 326,
    negativeRate: 38,
    delta: '+12%p',
    deltaDirection: 'up',
    summary: '결제 실패가 오전 8시 이후 빠르게 늘고 있어 우선 확인이 필요합니다.',
    trend: [19, 23, 21, 28, 35, 31, 49, 58, 71, 67, 82, 91],
    categories: [
      { name: '결제/코인', count: 43, share: 100 },
      { name: '앱 오류', count: 31, share: 72 },
      { name: '계정/로그인', count: 14, share: 33 },
    ],
    feedback: [
      {
        severity: 'critical',
        severityLabel: '긴급',
        content: '결제했는데 충전이 안 들어와요. 고객센터도 답이 없네요.',
        category: '결제/코인',
        detail: '★ 1.0',
        time: '9분 전',
        dateTime: '2026-08-30T15:11:00+09:00',
      },
      {
        severity: 'high',
        severityLabel: '높음',
        content: '오늘 아침부터 결제 오류가 계속 떠요. 카드 등록도 안 됩니다.',
        category: '결제/코인',
        detail: '★ 1.0',
        time: '23분 전',
        dateTime: '2026-08-30T14:57:00+09:00',
      },
      {
        severity: 'high',
        severityLabel: '높음',
        content: '업데이트 뒤 알림이 전혀 오지 않습니다. 설정을 다시 해도 같아요.',
        category: '앱 오류',
        detail: '★ 2.0',
        time: '41분 전',
        dateTime: '2026-08-30T14:39:00+09:00',
      },
    ],
    updated: 'AI 요약 2분 전',
    href: '/?tab=items&source=googleplay',
    featured: true,
  },
  {
    id: 'appstore',
    name: '앱스토어',
    initials: 'AS',
    channelType: '앱 리뷰',
    scope: 'KR · JP',
    tone: 'watch',
    status: '관찰 필요',
    total: 248,
    negativeRate: 22,
    delta: '-4%p',
    deltaDirection: 'down',
    summary: '부정 비율은 낮아졌지만 해외 카드 등록 문제가 반복되고 있습니다.',
    trend: [38, 35, 40, 33, 31, 37, 34, 29, 27, 32, 28, 25],
    categories: [
      { name: '결제/코인', count: 21, share: 100 },
      { name: 'UI/사용성', count: 18, share: 86 },
      { name: '앱 오류', count: 12, share: 57 },
    ],
    feedback: [
      {
        severity: 'high',
        severityLabel: '높음',
        content: '해외 카드로 결제 수단 등록이 계속 실패합니다.',
        category: '결제/코인',
        detail: '★ 2.0',
        time: '18분 전',
        dateTime: '2026-08-30T15:02:00+09:00',
      },
      {
        severity: 'medium',
        severityLabel: '보통',
        content: '새 화면에서 보관함 위치를 찾기가 전보다 어려워졌어요.',
        category: 'UI/사용성',
        detail: '★ 3.0',
        time: '1시간 전',
        dateTime: '2026-08-30T14:20:00+09:00',
      },
    ],
    updated: 'AI 요약 5분 전',
    href: '/?tab=items&source=appstore',
  },
  {
    id: 'x',
    name: 'X',
    initials: 'X',
    channelType: '소셜',
    scope: '키워드 4개',
    tone: 'watch',
    status: '언급 증가',
    total: 187,
    negativeRate: 31,
    delta: '+7%p',
    deltaDirection: 'up',
    summary: '알림 미수신과 로그인 풀림이 같은 시간대에 함께 언급되고 있습니다.',
    trend: [11, 13, 12, 19, 17, 25, 29, 24, 31, 38, 43, 47],
    categories: [
      { name: '앱 오류', count: 27, share: 100 },
      { name: '계정/로그인', count: 19, share: 70 },
      { name: '콘텐츠/작품', count: 8, share: 30 },
    ],
    feedback: [
      {
        severity: 'high',
        severityLabel: '높음',
        content: '업데이트하고 나서 알림이 아예 안 옵니다. 설정은 다 켜져 있는데요.',
        category: '앱 오류',
        time: '12분 전',
        dateTime: '2026-08-30T15:08:00+09:00',
      },
      {
        severity: 'medium',
        severityLabel: '보통',
        content: '오늘만 로그인이 세 번 풀렸는데 다른 사람도 그런가요?',
        category: '계정/로그인',
        time: '36분 전',
        dateTime: '2026-08-30T14:44:00+09:00',
      },
    ],
    updated: 'AI 요약 3분 전',
    href: '/?tab=items&source=x',
  },
  {
    id: 'theqoo',
    name: '더쿠',
    initials: '더',
    channelType: '커뮤니티',
    scope: '게시판 3개',
    tone: 'stable',
    status: '평소 범위',
    total: 142,
    negativeRate: 18,
    delta: '-2%p',
    deltaDirection: 'down',
    summary: '새 UI에 대한 적응 의견이 많고, 심각한 오류 신호는 뚜렷하지 않습니다.',
    trend: [25, 22, 24, 20, 23, 21, 19, 22, 18, 20, 17, 18],
    categories: [
      { name: 'UI/사용성', count: 24, share: 100 },
      { name: '콘텐츠/작품', count: 17, share: 71 },
      { name: '앱 오류', count: 7, share: 29 },
    ],
    feedback: [
      {
        severity: 'medium',
        severityLabel: '보통',
        content: '새로 바뀐 화면 어때? 나는 익숙해지면 괜찮을 것 같아.',
        category: 'UI/사용성',
        time: '27분 전',
        dateTime: '2026-08-30T14:53:00+09:00',
      },
      {
        severity: 'positive',
        severityLabel: '긍정',
        content: '이번 업데이트 검색 기능은 확실히 전보다 편해졌음.',
        category: 'UI/사용성',
        time: '2시간 전',
        dateTime: '2026-08-30T13:20:00+09:00',
      },
    ],
    updated: 'AI 요약 8분 전',
    href: '/?tab=items&source=theqoo',
  },
  {
    id: 'threads',
    name: 'Threads',
    initials: 'TH',
    channelType: '소셜',
    scope: '키워드 2개',
    tone: 'stable',
    status: '긍정 우세',
    total: 96,
    negativeRate: 8,
    delta: '+1%p',
    deltaDirection: 'flat',
    summary: '이벤트 혜택과 새 검색 기능에 대한 자연스러운 추천이 이어지고 있습니다.',
    trend: [8, 10, 12, 9, 14, 16, 15, 18, 17, 21, 19, 22],
    categories: [
      { name: '이벤트/프로모션', count: 22, share: 100 },
      { name: 'UI/사용성', count: 13, share: 59 },
      { name: '콘텐츠/작품', count: 11, share: 50 },
    ],
    feedback: [
      {
        severity: 'positive',
        severityLabel: '긍정',
        content: '이번 이벤트 혜택은 꽤 괜찮네요. 놓치기 전에 챙겨갑니다.',
        category: '이벤트/프로모션',
        time: '31분 전',
        dateTime: '2026-08-30T14:49:00+09:00',
      },
      {
        severity: 'positive',
        severityLabel: '긍정',
        content: '검색 결과가 빨라져서 요즘은 앱을 더 자주 열게 돼요.',
        category: 'UI/사용성',
        time: '3시간 전',
        dateTime: '2026-08-30T12:20:00+09:00',
      },
    ],
    updated: 'AI 요약 11분 전',
    href: '/?tab=items&source=threads',
  },
];

function sparklineGeometry(points: number[]) {
  const width = 164;
  const height = 54;
  const padding = 4;
  const minimum = Math.min(...points);
  const maximum = Math.max(...points);
  const range = maximum - minimum || 1;
  const coordinates = points.map((point, index) => ({
    x: padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((point - minimum) / range) * (height - padding * 2),
  }));

  return {
    path: coordinates.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' '),
    last: coordinates.at(-1) ?? { x: width - padding, y: height / 2 },
  };
}

function SignalCard({ channel, rank }: { channel: ChannelSignal; rank: number }) {
  const chart = sparklineGeometry(channel.trend);
  const headingId = `channel-${channel.id}`;

  return (
    <article
      className={`${styles.signalCard} ${channel.featured ? styles.featured : ''}`}
      data-tone={channel.tone}
      data-source={channel.id}
      aria-labelledby={headingId}
    >
      <header className={styles.cardHeader}>
        <div className={styles.sourceIdentity}>
          <span className={styles.sourceMark} aria-hidden="true">
            {channel.initials}
          </span>
          <div>
            <h3 id={headingId}>{channel.name}</h3>
            <p>
              {channel.channelType} <span aria-hidden="true">·</span> {channel.scope}
            </p>
          </div>
        </div>
        <div className={styles.cardStatus}>
          <span className={styles.rank}>#{rank}</span>
          <span className={styles.statusPill}>
            <span className={styles.statusDot} aria-hidden="true" />
            {channel.status}
          </span>
        </div>
      </header>

      <div className={styles.cardBody}>
        <div className={styles.signalPanel}>
          <div className={styles.metricRow}>
            <div className={styles.metric}>
              <span>최근 24시간</span>
              <div>
                <strong>{channel.total.toLocaleString()}</strong>
                <small>건</small>
              </div>
            </div>
            <div className={`${styles.metric} ${styles.negativeMetric}`}>
              <span>부정 비율</span>
              <div>
                <strong>{channel.negativeRate}%</strong>
                <small className={styles[channel.deltaDirection]}>{channel.delta}</small>
              </div>
            </div>
          </div>

          <div className={styles.negativeMeter} aria-label={`부정 비율 ${channel.negativeRate}%`}>
            <span
              style={{ '--meter-value': `${channel.negativeRate}%` } as CSSProperties}
              aria-hidden="true"
            />
          </div>

          <div className={styles.trendBlock}>
            <div className={styles.trendLabel}>
              <span>시간대별 언급량</span>
              <small>6시간 단위</small>
            </div>
            <svg
              className={styles.sparkline}
              viewBox="0 0 164 54"
              role="img"
              aria-label={`${channel.name} 언급량 추이`}
            >
              <path className={styles.sparkGuide} d="M 4 50 L 160 50" />
              <path className={styles.sparkPath} d={chart.path} />
              <circle className={styles.sparkEnd} cx={chart.last.x} cy={chart.last.y} r="3.5" />
            </svg>
          </div>

          <p className={styles.signalSummary}>{channel.summary}</p>

          <div className={styles.issueBlock}>
            <div className={styles.sectionLabel}>
              <span>주요 이슈</span>
              <span>건수</span>
            </div>
            <ol className={styles.issueList}>
              {channel.categories.map((category) => (
                <li key={category.name}>
                  <div className={styles.issueName}>
                    <span>{category.name}</span>
                    <strong>{category.count}</strong>
                  </div>
                  <span className={styles.issueTrack} aria-hidden="true">
                    <span
                      style={{ '--issue-share': `${category.share}%` } as CSSProperties}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className={styles.feedbackPanel}>
          <div className={styles.sectionLabel}>
            <span>대표 피드백</span>
            <span>최신순</span>
          </div>
          <div className={styles.feedbackList}>
            {channel.feedback.map((item, index) => (
              <article className={styles.feedbackItem} key={`${item.dateTime}-${index}`}>
                <div className={styles.feedbackHead}>
                  <span className={styles.severity} data-severity={item.severity}>
                    {item.severityLabel}
                  </span>
                  <time dateTime={item.dateTime}>{item.time}</time>
                </div>
                <p>{item.content}</p>
                <div className={styles.feedbackMeta}>
                  <span>{item.category}</span>
                  {item.detail && <span>{item.detail}</span>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.cardFooter}>
        <span>{channel.updated}</span>
        <a href={channel.href}>
          전체 {channel.total.toLocaleString()}건 보기 <span aria-hidden="true">→</span>
        </a>
      </footer>
    </article>
  );
}

export default function CardLabPage() {
  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <header className={styles.topbar}>
          <a className={styles.brand} href="/" aria-label="Feedback Radar 대시보드로 이동">
            <span className={styles.brandMark} aria-hidden="true">
              FR
            </span>
            <span>
              Feedback Radar
              <small>Card lab</small>
            </span>
          </a>
          <nav className={styles.topLinks} aria-label="샘플 페이지 이동">
            <span>운영 데이터와 분리된 시안</span>
            <a href="/?tab=cards">현재 카드 탭 보기</a>
          </nav>
        </header>

        <section className={styles.intro} aria-labelledby="lab-title">
          <div>
            <p className={styles.eyebrow}>
              <span aria-hidden="true" /> 신호 중심 카드 · 실험안 01
            </p>
            <h1 id="lab-title">
              채널 목록을 <em>조치 가능한 신호</em>로
            </h1>
            <p className={styles.lede}>
              글을 많이 보여주는 대신, 어디가 위험한지와 왜 그런지를 먼저 읽게 만든 카드형
              레이더입니다.
            </p>
          </div>
          <div className={styles.dateScope}>
            <span>조회 기준</span>
            <strong>최근 24시간</strong>
            <small>2026년 8월 30일 · 15:20</small>
          </div>
        </section>

        <section className={styles.summaryGrid} aria-label="오늘의 피드백 요약">
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon} data-icon="volume" aria-hidden="true">
              24h
            </div>
            <div>
              <span>오늘 피드백</span>
              <strong>1,284건</strong>
              <small>어제보다 14% 많음</small>
            </div>
          </article>
          <article className={styles.summaryCard} data-emphasis="critical">
            <div className={styles.summaryIcon} data-icon="alert" aria-hidden="true">
              !
            </div>
            <div>
              <span>우선 확인</span>
              <strong>63건</strong>
              <small>긴급 8 · 높음 55</small>
            </div>
          </article>
          <article className={styles.summaryCard}>
            <div className={styles.summaryIcon} data-icon="channel" aria-hidden="true">
              8
            </div>
            <div>
              <span>활성 채널</span>
              <strong>8개</strong>
              <small>마지막 수집 4분 전</small>
            </div>
          </article>
          <article className={styles.summaryCard} data-emphasis="signal">
            <div className={styles.summaryIcon} data-icon="signal" aria-hidden="true">
              ↑
            </div>
            <div>
              <span>가장 큰 변화</span>
              <strong>결제/코인</strong>
              <small>구글플레이 · +12%p</small>
            </div>
          </article>
        </section>

        <section className={styles.radarSection} aria-labelledby="radar-title">
          <div className={styles.sectionHeading}>
            <div>
              <p>우선순위순</p>
              <h2 id="radar-title">채널 레이더</h2>
            </div>
            <div className={styles.contextPills} aria-label="현재 보기 조건">
              <span>관련 글</span>
              <span>전체 서비스</span>
              <span>AI 분류 완료</span>
            </div>
          </div>

          <div className={styles.signalGrid}>
            {channels.map((channel, index) => (
              <SignalCard channel={channel} rank={index + 1} key={channel.id} />
            ))}
          </div>
        </section>

        <section className={styles.designNotes} aria-labelledby="notes-title">
          <div className={styles.notesIntro}>
            <p>Design notes</p>
            <h2 id="notes-title">카드의 역할을 “목록”에서 “판단”으로 바꿨습니다.</h2>
          </div>
          <ol>
            <li>
              <span>01</span>
              <strong>위험도가 곧 크기</strong>
              <p>가장 급한 채널만 확장형으로 보여 주고 나머지는 같은 밀도로 정렬합니다.</p>
            </li>
            <li>
              <span>02</span>
              <strong>숫자 다음에 이유</strong>
              <p>부정 비율, 추이, 주요 이슈, 실제 문장을 한 방향으로 읽게 배치했습니다.</p>
            </li>
            <li>
              <span>03</span>
              <strong>상태는 색과 문장으로</strong>
              <p>색만으로 구분하지 않고 “부정 급증”, “평소 범위”를 함께 표시합니다.</p>
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
