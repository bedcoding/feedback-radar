import type { ChannelSummary, TrendCell } from '@feedback-radar/core';

/**
 * 채널×날짜 AI 브리핑.
 *
 * 목록만 있으면 "무슨 일이 있었나"를 사람이 50건씩 읽어 판단해야 한다. 그래서 화면 맨 위에
 * 채널별 요약을 놓고, 그 아래에 최근 며칠 추이를 붙인다. 요약은 '어제 무슨 얘기'를,
 * 추이는 '늘고 있나'를 말해 준다 — 둘 중 하나만 있으면 판단이 안 된다.
 *
 * 채널을 갈라 놓는 이유: 앱 리뷰는 별점 딸린 불만이 주로 오고 커뮤니티는 화제·여론이 온다.
 * 하나로 합치면 그 차이가 뭉개져서 "어디를 봐야 하는지"가 사라진다.
 */

export interface BriefingProps {
  /** 지금 보고 있는 날짜 */
  date: string;
  /** 요약이 있는 날짜들 (최신순) — 넘겨 볼 수 있게 */
  dates: string[];
  summaries: ChannelSummary[];
  trend: TrendCell[];
  href: (date: string) => string;
}

/**
 * 채널 표시명. DashboardView에도 같은 표가 있지만 그걸 import하면 순환 참조가 된다
 * (DashboardView가 이 컴포넌트를 렌더하므로). 표가 짧아 복제가 더 안전하다.
 */
const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  'naver-blog': 'N블로그',
  'naver-cafe': 'N카페',
  dcinside: '디시',
  threads: 'Threads',
};

const label = (source: string): string => SOURCE_LABEL[source] ?? source;

/** 'YYYY-MM-DD' → 'M/D' */
function shortDate(d: string): string {
  const [, m, day] = d.split('-');
  return m && day ? `${Number(m)}/${Number(day)}` : d;
}

export function BriefingCard({ date, dates, summaries, trend, href }: BriefingProps) {
  // 요약 생성에 쓴 토큰·비용 — 이 도구의 LLM 사용량을 화면에서 바로 확인할 수 있게
  const usage = summaries.reduce(
    (a, s) => ({
      input: a.input + (s.inputTokens ?? 0),
      output: a.output + (s.outputTokens ?? 0),
      cost: a.cost + (s.costUsd ?? 0),
    }),
    { input: 0, output: 0, cost: 0 },
  );
  const models = [...new Set(summaries.map((s) => s.model).filter(Boolean))];

  // 추이 격자: 날짜 축과 채널 축을 뽑아 (날짜,채널) → 건수로 찾는다
  const days = [...new Set(trend.map((c) => c.date))].sort();
  const channels = [...new Set(trend.map((c) => c.source))];
  const cell = new Map(trend.map((c) => [`${c.date}|${c.source}`, c]));
  const max = Math.max(1, ...trend.map((c) => c.count));

  return (
    <section className="briefing">
      <div className="briefing-head">
        <h2>🧠 AI 브리핑</h2>
        {dates.length > 1 && (
          <div className="briefing-dates">
            {dates.map((d) => (
              <a key={d} className={d === date ? 'on' : undefined} href={href(d)}>
                {shortDate(d)}
              </a>
            ))}
          </div>
        )}
        {usage.input > 0 && (
          <span className="briefing-usage" title={models.join(', ')}>
            입력 {usage.input.toLocaleString()} / 출력 {usage.output.toLocaleString()} 토큰
            {usage.cost > 0 && `, 환산 $${usage.cost.toFixed(4)}`}
          </span>
        )}
      </div>

      {summaries.length === 0 ? (
        <p className="briefing-empty">
          {date} 요약이 아직 없습니다. 수집이 한 번 돌면 채널별로 생성됩니다.
        </p>
      ) : (
        <div className="briefing-channels">
          {summaries.map((s) => (
            <article key={`${s.source}|${s.service}`} className="briefing-ch">
              <div className="briefing-ch-head">
                <strong>{label(s.source)}</strong>
                {s.service && <span className="badge">{s.service}</span>}
                <span className="briefing-count">{s.total}건</span>
                {s.negative > 0 && (
                  <span className="sentiment-negative">부정 {s.negative}</span>
                )}
                {s.urgent > 0 && <span className="badge urgent">심각 {s.urgent}</span>}
              </div>
              <ul className="briefing-bullets">
                {s.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {days.length > 1 && (
        <div className="briefing-trend">
          <div className="briefing-trend-title">
            작성일 기준 최근 {days.length}일 채널별 언급량
          </div>
          {channels.map((src) => (
            <div key={src} className="trend-row">
              <span className="trend-label">{label(src)}</span>
              <div className="trend-bars">
                {days.map((d) => {
                  const c = cell.get(`${d}|${src}`);
                  const n = c?.count ?? 0;
                  return (
                    <span
                      key={d}
                      className="trend-bar"
                      // 0건도 자리를 차지해야 날짜 축이 채널마다 어긋나지 않는다
                      style={{ height: `${Math.round((n / max) * 100)}%` }}
                      title={`${d} ${n}건${c?.negative ? ` (부정 ${c.negative})` : ''}`}
                    />
                  );
                })}
              </div>
              <span className="trend-total">
                {days.reduce((a, d) => a + (cell.get(`${d}|${src}`)?.count ?? 0), 0)}
              </span>
            </div>
          ))}
          <div className="trend-axis">
            <span />
            <div>
              {days.map((d) => (
                <span key={d}>{shortDate(d)}</span>
              ))}
            </div>
            <span />
          </div>
        </div>
      )}
    </section>
  );
}
