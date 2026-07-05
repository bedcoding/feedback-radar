import {
  categoryCountsForDate,
  getDashboardStats,
  getRecentItems,
  getSettings,
  loadConfig,
  openDb,
} from '@feedback-radar/core';
import { requestRunNow, saveInterval } from './actions';

export const dynamic = 'force-dynamic';

function fmt(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  'naver-blog': 'N블로그',
  'naver-cafe': 'N카페',
  dcinside: '디시',
  threads: 'Threads',
};

const SENTIMENT_LABEL: Record<string, string> = {
  negative: '부정',
  positive: '긍정',
  neutral: '중립',
};

export default function Home() {
  const config = loadConfig();
  const db = openDb();
  const today = new Date().toISOString().slice(0, 10);
  const stats = getDashboardStats(db, today);
  const categories = categoryCountsForDate(db, today);
  const items = getRecentItems(db, 50);
  const settings = getSettings(db);
  db.close();

  const intervalHours = Number(settings.intervalHours) || 24;
  const lastRunAt = settings.lastRunAt;
  const isRunning = Boolean(settings.runningSince);
  const runQueued = Boolean(settings.runRequestedAt);
  const nextRunAt = lastRunAt
    ? new Date(Date.parse(lastRunAt) + intervalHours * 3_600_000).toISOString()
    : undefined;

  return (
    <main>
      <h1>📡 {config.displayName} 피드백 레이더</h1>
      <p className="subtitle">
        키워드: {config.keywords.join(', ')} · 오늘 {today}
      </p>

      <section className="scheduler">
        <div className="scheduler-status">
          <span className={`dot ${isRunning ? 'on' : ''}`} />
          {isRunning
            ? '수집 실행 중…'
            : runQueued
              ? '실행 대기 중 (30초 이내 시작)'
              : `대기 중 · 마지막 실행 ${fmt(lastRunAt)} · 다음 실행 ${fmt(nextRunAt)}`}
        </div>
        <div className="scheduler-controls">
          <form action={saveInterval}>
            <input
              name="hours"
              type="number"
              min={0.5}
              max={168}
              step={0.5}
              defaultValue={intervalHours}
            />
            <span>시간마다 수집</span>
            <button type="submit">저장</button>
          </form>
          <form action={requestRunNow}>
            <button type="submit" className="primary" disabled={isRunning || runQueued}>
              지금 실행
            </button>
          </form>
        </div>
        {settings.lastRunStatus && settings.lastRunStatus !== 'ok' && (
          <div className="scheduler-error">{settings.lastRunStatus}</div>
        )}
      </section>

      <div className="stats">
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
        <>
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
        </>
      )}

      <h2>최근 수집 50건</h2>
      {items.length === 0 ? (
        <div className="empty">
          아직 데이터가 없습니다. <code>npm run collect</code>를 먼저 실행하세요.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
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
              <tr key={it.id}>
                <td>
                  <span className="badge">{SOURCE_LABEL[it.source] ?? it.source}</span>
                  {it.rating != null && <div>★{it.rating}</div>}
                </td>
                <td className="content-cell">
                  {it.url ? <a href={it.url} target="_blank" rel="noreferrer">{it.content}</a> : it.content}
                </td>
                <td className={`sentiment-${it.sentiment ?? 'neutral'}`}>
                  {it.sentiment ? SENTIMENT_LABEL[it.sentiment] : '—'}
                </td>
                <td>{it.category ?? '—'}</td>
                <td>
                  {it.severity ? (
                    <span className={`badge ${it.severity}`}>{it.severity}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{it.team ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
