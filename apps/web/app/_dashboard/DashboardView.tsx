import type { CategoryCount, DashboardStats, ItemRow } from '@feedback-radar/core';

/**
 * 대시보드 본문 — 실제 화면(/)과 둘러보기(/tour)가 같은 마크업을 쓴다.
 *
 * 투어가 진짜 UI 위에 설명을 얹으려면 화면이 한 벌이어야 한다.
 * 그래서 데이터는 전부 props로 받고, 스케줄러 폼은 서버 액션이 있을 때만 동작시킨다
 * (투어에서는 액션을 넘기지 않아 눌러도 아무 일도 일어나지 않는다).
 *
 * data-tour 속성은 투어 오버레이가 강조할 지점을 가리킨다.
 */

export interface DashboardData {
  displayName: string;
  keywords: string[];
  /** 부제의 앞 라벨 (기본 '키워드') */
  keywordsLabel?: string;
  today: string;
  stats: DashboardStats;
  categories: CategoryCount[];
  items: ItemRow[];
  intervalHours: number;
  lastRunAt?: string;
  isRunning: boolean;
  runQueued: boolean;
  lastRunStatus?: string;
}

type FormAction = (formData: FormData) => Promise<void>;

interface Props {
  data: DashboardData;
  actions?: { saveInterval: FormAction; requestRunNow: FormAction };
  /** 상단 부제 옆에 붙일 링크 */
  links?: React.ReactNode;
  itemsHeading?: string;
  /** 투어 오버레이가 강조할 지점(data-tour)을 표시할지 — 실제 대시보드에는 붙이지 않는다 */
  tourMode?: boolean;
  /** 관련/무관 탭. 없으면 탭을 렌더하지 않는다 */
  tabs?: { active: 'relevant' | 'irrelevant'; relevantCount: number; irrelevantCount: number };
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  'naver-blog': 'N블로그',
  'naver-cafe': 'N카페',
  dcinside: '디시',
  threads: 'Threads',
};

export const SENTIMENT_LABEL: Record<string, string> = {
  negative: '부정',
  positive: '긍정',
  neutral: '중립',
};

export function DashboardView({
  data,
  actions,
  links,
  itemsHeading = '최근 수집 50건',
  tourMode = false,
  tabs,
}: Props) {
  const { stats, categories, items } = data;
  const nextRunAt = data.lastRunAt
    ? new Date(Date.parse(data.lastRunAt) + data.intervalHours * 3_600_000).toISOString()
    : undefined;

  const tt = (name: string) => (tourMode ? name : undefined);
  // 서비스가 하나뿐이면 열을 늘려 봐야 같은 값만 반복된다
  const showService = new Set(items.map((it) => it.service).filter(Boolean)).size > 1;
  // 무관 판정 행은 첫 번째만 강조 지점으로 삼는다 (전부 붙이면 중복 속성만 늘어난다)
  const firstIrrelevantId = items.find((it) => it.relevant === false)?.id;

  const intervalField = (
    <>
      <input name="hours" type="number" min={0.5} max={168} step={0.5} defaultValue={data.intervalHours} />
      <span>시간마다 수집</span>
    </>
  );

  return (
    <main>
      <h1>
        📡 {data.displayName} 피드백 레이더
      </h1>
      <p className="subtitle">
        {data.keywordsLabel ?? '키워드'}: {data.keywords.join(', ')} · 오늘 {data.today}
        {links}
      </p>

      <section className="scheduler" data-tour={tt('scheduler')}>
        <div className="scheduler-status">
          <span className={`dot ${data.isRunning ? 'on' : ''}`} />
          {data.isRunning
            ? '수집 실행 중…'
            : data.runQueued
              ? '실행 대기 중 (30초 이내 시작)'
              : `대기 중 · 마지막 실행 ${fmt(data.lastRunAt)} · 다음 실행 ${fmt(nextRunAt)}`}
        </div>
        <div className="scheduler-controls">
          {actions ? (
            <>
              <form action={actions.saveInterval}>
                {intervalField}
                <button type="submit">저장</button>
              </form>
              <form action={actions.requestRunNow}>
                <button type="submit" className="primary" disabled={data.isRunning || data.runQueued}>
                  지금 실행
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="scheduler-form-static">
                {intervalField}
                <button type="button">저장</button>
              </div>
              <button type="button" className="primary">
                지금 실행
              </button>
            </>
          )}
        </div>
        {data.lastRunStatus && data.lastRunStatus !== 'ok' && (
          <div className="scheduler-error">{data.lastRunStatus}</div>
        )}
      </section>

      <div className="stats" data-tour={tt('stats')}>
        <div className="stat">
          <div className="label">누적 수집</div>
          <div className="value">{stats.total.toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="label">오늘 수집</div>
          <div className="value">{stats.today.toLocaleString()}</div>
        </div>
        {stats.bySentiment.map((s) => (
          <div className="stat" key={s.sentiment}>
            <div className="label">{SENTIMENT_LABEL[s.sentiment] ?? s.sentiment}</div>
            <div className={`value sentiment-${s.sentiment}`}>{s.count.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {categories.length > 0 && (
        <div data-tour={tt('categories')}>
          <h2>오늘 카테고리별 언급</h2>
          <table>
            <thead>
              <tr>
                <th>카테고리</th>
                <th>건수</th>
                <th>부정</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>{c.count}</td>
                  <td className={c.negative > 0 ? 'sentiment-negative' : ''}>{c.negative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{itemsHeading}</h2>

      {tabs && (
        <div className="tabs">
          <a className={tabs.active === 'relevant' ? 'on' : ''} href="/">
            관련 글 <span className="n">{tabs.relevantCount.toLocaleString()}</span>
          </a>
          <a className={tabs.active === 'irrelevant' ? 'on' : ''} href="/?filter=irrelevant">
            걸러진 글 <span className="n">{tabs.irrelevantCount.toLocaleString()}</span>
          </a>
          <span className="tabs-note">
            {tabs.active === 'relevant'
              ? '동음이의어 등 무관 판정 글은 여기서 제외됩니다'
              : 'AI가 우리 서비스와 무관하다고 판단한 글입니다 — 판정이 맞는지 확인용'}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          {tabs?.active === 'irrelevant'
            ? '걸러진 글이 없습니다.'
            : '아직 데이터가 없습니다. npm run collect 를 먼저 실행하세요.'}
        </div>
      ) : (
        <table data-tour={tt('items')}>
          <thead>
            <tr>
              {showService && <th>서비스</th>}
              <th>채널</th>
              <th>내용</th>
              <th>감성</th>
              <th>카테고리</th>
              <th>심각도</th>
              <th>담당</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className={it.relevant === false ? 'irrelevant' : undefined}
                data-tour={it.id === firstIrrelevantId ? tt('irrelevant-row') : undefined}
              >
                {showService && (
                  <td>
                    <span className="badge svc">{it.service ?? '—'}</span>
                  </td>
                )}
                <td>
                  <span className="badge">{SOURCE_LABEL[it.source] ?? it.source}</span>
                  {it.rating != null && <div>★{it.rating}</div>}
                </td>
                <td className="content-cell">
                  <div className="clamp">
                    {it.relevant === false && <span className="badge">무관</span>}{' '}
                    {it.url ? (
                      <a href={it.url} target="_blank" rel="noreferrer">
                        {it.content}
                      </a>
                    ) : (
                      it.content
                    )}
                  </div>
                </td>
                <td className={`sentiment-${it.sentiment ?? 'neutral'}`}>
                  {it.sentiment ? SENTIMENT_LABEL[it.sentiment] : '—'}
                </td>
                <td>{it.category ?? '—'}</td>
                <td>{it.severity ? <span className={`badge ${it.severity}`}>{it.severity}</span> : '—'}</td>
                <td>{it.team ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
