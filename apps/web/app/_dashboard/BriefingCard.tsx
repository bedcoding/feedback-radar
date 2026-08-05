import { countryFlag, countryName } from '@feedback-radar/core';
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
  /**
   * 카드에서 목록으로 넘어가는 링크.
   *
   * 요약은 '무슨 얘기가 몇 건'까지만 말해 준다. 그 건들이 실제로 어떤 글인지 확인할 방법이
   * 없으면 판정을 검증할 수 없다. 건수와 부정 건수를 눌러 그 목록을 바로 열 수 있게 한다.
   */
  itemsHref?: (opts: {
    source: string;
    service: string;
    country: string;
    sentiment?: string;
  }) => string;
  /**
   * 아직 분류되지 않은 건수.
   *
   * 요약은 분류가 끝난 글만 대상으로 만든다. 분류가 중간에 끊기면 요약은 그 이전 상태로
   * 남는데, 아래 추이 그래프는 items를 직접 집계해서 새로 들어온 채널까지 보여준다.
   * 그러면 같은 화면에서 두 숫자가 어긋나 보이고, 이유가 화면에 없으면 데이터가 사라진
   * 것처럼 읽힌다.
   */
  pendingCount?: number;
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

/**
 * 로컬 ISO 시각에서 'HH:MM'만 뽑는다. 날짜는 위 날짜 탭이 이미 말해 주므로 시각만 있으면 된다.
 * 저장 형식이 로컬 ISO('2026-08-04T14:26:22+09:00')라 문자열을 잘라 쓴다.
 */
function shortTime(iso: string): string {
  return iso.slice(11, 16) || iso;
}

export function BriefingCard({
  date,
  dates,
  summaries,
  trend,
  href,
  itemsHref,
  pendingCount = 0,
}: BriefingProps) {
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
  // 요약 중 가장 최근에 만든 시각. 요약이 얼마나 오래됐는지 판단하는 근거다.
  const generatedAt = [...summaries.map((s) => s.createdAt)].sort().pop();

  // 추이 격자: 날짜 축과 채널 축을 뽑아 (날짜, 채널, 국가) → 건수로 찾는다.
  // 요약 카드가 국가별로 갈라지므로 추이도 같은 단위여야 둘을 나란히 읽을 수 있다.
  const days = [...new Set(trend.map((c) => c.date))].sort();
  const channels = [...new Set(trend.map((c) => `${c.source}|${c.country}`))];
  const cell = new Map(trend.map((c) => [`${c.date}|${c.source}|${c.country}`, c]));
  const max = Math.max(1, ...trend.map((c) => c.count));

  /**
   * 건수를 목록 링크로 감싼다. itemsHref가 없으면(둘러보기 화면) 그냥 텍스트로 둔다.
   * 감성을 넘기면 그 감성만 걸러 열린다 — '부정 3'을 눌러 그 3건을 확인하는 용도다.
   */
  const linked = (text: string, cls: string, s: ChannelSummary, sentiment?: string) =>
    itemsHref ? (
      <a
        className={cls}
        href={itemsHref({
          source: s.source,
          service: s.service,
          country: s.country,
          sentiment,
        })}
      >
        {text}
      </a>
    ) : (
      <span className={cls}>{text}</span>
    );

  return (
    // 수집량 카드, 태거 카드와 같이 투어 강조 지점을 양쪽 화면에 늘 붙여 둔다
    <section className="briefing" data-tour="briefing">
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

      {/*
        요약을 언제 만들었는지, 그리고 아직 요약에 안 들어간 건이 얼마인지 밝힌다.
        이 두 줄이 없으면 아래 추이 그래프에는 보이는 채널이 요약에는 없는 상황을
        설명할 방법이 없다.
      */}
      {(generatedAt || pendingCount > 0) && (
        <p className="briefing-meta">
          {generatedAt && `${shortTime(generatedAt)} 기준 요약`}
          {pendingCount > 0 && (
            <span className="briefing-stale">
              {generatedAt ? '. ' : ''}
              미분류 {pendingCount.toLocaleString()}건은 아직 이 요약에 없습니다 (분류가 끝나면
              반영됩니다)
            </span>
          )}
        </p>
      )}

      {summaries.length === 0 ? (
        <p className="briefing-empty">
          {date} 요약이 아직 없습니다. 수집이 한 번 돌면 채널별로 생성됩니다.
        </p>
      ) : (
        <div className="briefing-channels">
          {summaries.map((s) => (
            <article key={`${s.source}|${s.country}|${s.service}`} className="briefing-ch">
              <div className="briefing-ch-head">
                <strong>{label(s.source)}</strong>
                {/* 국가가 있는 채널(앱 리뷰)만 표시한다. 커뮤니티 글에는 국가가 없다 */}
                {s.country && (
                  <span className="briefing-country">
                    {countryFlag(s.country)} {countryName(s.country)}
                  </span>
                )}
                {s.service && <span className="badge">{s.service}</span>}
                {/* 숫자를 누르면 그 건들이 목록에서 열린다. 요약만 보고는 판정을 검증할 수 없다 */}
                {linked(`${s.total}건`, 'briefing-count', s)}
                {s.negative > 0 && linked(`부정 ${s.negative}`, 'sentiment-negative', s, 'negative')}
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
          {channels.map((key) => {
            const [src, cty] = key.split('|');
            return (
              <div key={key} className="trend-row">
                {/* 라벨 칸이 좁아 국가는 국기만 붙이고 이름은 title로 넘긴다 */}
                <span className="trend-label" title={cty ? countryName(cty) : undefined}>
                  {label(src)}
                  {cty && ` ${countryFlag(cty)}`}
                </span>
                <div className="trend-bars">
                  {days.map((d) => {
                    const c = cell.get(`${d}|${src}|${cty}`);
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
                  {days.reduce((a, d) => a + (cell.get(`${d}|${src}|${cty}`)?.count ?? 0), 0)}
                </span>
              </div>
            );
          })}
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
