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

/** 카드에서 펼쳐 보여줄 부정 글 한 건 */
export interface BriefNegative {
  id: number;
  /** 분류가 만든 60자 요약이 있으면 그것, 없으면 원문 앞부분 */
  text: string;
  severity?: string;
  rating?: number;
  url?: string;
}

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
   * 채널 카드별 부정 글 표본. 키는 `${source}|${country}|${service}`.
   *
   * 예전에는 '부정 3'을 누르면 목록 탭으로 이동했다. 그러면 브리핑을 읽던 문맥이 사라지고
   * 돌아오려면 탭을 다시 눌러야 해서, 카드 열 개를 확인하려면 화면이 스무 번 바뀐다.
   * 카드 안에서 펼치면 페이지가 그대로다. 요약과 같은 집합에서 뽑으므로 카드에 적힌
   * 숫자와 여기 나오는 글이 어긋나지 않는다.
   */
  negatives?: Record<string, BriefNegative[]>;
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

/** 0.66 → '66%' */
function pct(r: number): string {
  return `${Math.round(r * 100)}%`;
}

/**
 * 확인 필요 건수의 기준.
 *
 * 화면에는 부드러운 말을 쓰지만 무엇을 센 값인지는 정확히 밝힌다. 둘 중 하나를 포기하면
 * 화면이 과장하거나(부정 522건!) 무엇을 세는지 알 수 없게 된다.
 */
const ATTN_HINT =
  'AI가 감성을 부정으로 판정한 글 수입니다. 같은 문제를 여러 사람이 쓴 것도 각각 셉니다.';

/**
 * 심각도 집계를 화면에 띄우지 않는 이유.
 *
 * '심각 522건'처럼 집계로 내면 "고쳐야 할 문제가 522개"로 읽힌다. 사실이 아니다.
 * - 이 값은 **글 건수**다. 같은 문제를 여러 사람이 쓴 것도 각각 센다 (실측 522건이
 *   카테고리 여섯 개에 몰려 있었고 앱 오류 230, 결제 145, 로그인 117 셋이 대부분이었다)
 * - AI가 붙인 판정이라 오탐이 섞인다 (재분류 표본에서 13.8% 교정)
 * - 기준도 서비스 장애가 아니라 '그 사용자에게 중대한 불편'이다
 *
 * 그 숫자가 담당 조직에 그대로 전달되면 없는 사태를 만든다. severity 자체는 남겨 둔다 —
 * 부정 글을 펼칠 때 심각한 것부터 담고, 목록의 정렬과 일일 리포트의 '우선 확인' 섹션이
 * 그 값을 쓴다. 화면의 집계 배지로만 내지 않는다.
 */

/**
 * 서비스별 색 띠.
 *
 * 이름에서 뽑으므로 같은 서비스는 늘 같은 색이다. 정렬 순서로 고르면 부정률이 바뀔 때마다
 * 색이 뒤바뀌어, 어제 본 색으로 서비스를 알아보던 사람이 헷갈린다.
 */
const SERVICE_HUES = ['#6f8ff0', '#e0a33a', '#4bb98a', '#c86fd9', '#e07a5f', '#5bbcd6'];

function serviceColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h + ch.charCodeAt(0) * 31) % 9973;
  return SERVICE_HUES[h % SERVICE_HUES.length];
}

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
  negatives,
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

  /**
   * 카드를 서비스로 묶는다.
   *
   * 예전에는 카드 열몇 개를 격자에 그냥 늘어놓았다. 제목이 전부 '구글플레이'라 어느 서비스
   * 얘기인지 배지를 읽어야 알 수 있었고, 한 서비스를 훑으려면 격자를 눈으로 뒤져야 했다.
   *
   * 채널로 묶지 않은 이유: 이 데이터에서 구글플레이가 카드의 43%를 차지해서, 채널로 묶으면
   * 그 상자 안에 서비스가 다시 섞인다. 무엇보다 **행동으로 이어지는 숫자는 서비스별 부정률**이다
   * (실측에서 서비스에 따라 두 배 이상 벌어졌다). 채널별 총계는 "앱 리뷰가 커뮤니티보다
   * 부정적"이라는 이미 아는 사실만 말해 준다.
   */
  const rate = (x: { total: number; negative: number }) => (x.total > 0 ? x.negative / x.total : 0);
  const groups = (() => {
    const by = new Map<
      string,
      { service: string; total: number; negative: number; urgent: number; cards: ChannelSummary[] }
    >();
    for (const s of summaries) {
      const key = s.service || '';
      const g = by.get(key) ?? { service: key, total: 0, negative: 0, urgent: 0, cards: [] };
      g.total += s.total;
      g.negative += s.negative;
      g.urgent += s.urgent;
      g.cards.push(s);
      by.set(key, g);
    }
    // 부정률 높은 순. 급한 것이 위로 온다 (건수순이면 조용한 대형 채널이 위를 차지한다)
    return [...by.values()]
      .map((g) => ({ ...g, cards: [...g.cards].sort((a, b) => rate(b) - rate(a) || b.total - a.total) }))
      .sort((a, b) => rate(b) - rate(a) || b.total - a.total);
  })();
  /** 서비스를 하나만 추적하면 묶을 것이 없다 (요약의 service가 빈 문자열이다) */
  const grouped = groups.length > 1 || groups[0]?.service;

  // 추이 격자: 날짜 축과 채널 축을 뽑아 (날짜, 채널, 국가) → 건수로 찾는다.
  // 요약 카드가 국가별로 갈라지므로 추이도 같은 단위여야 둘을 나란히 읽을 수 있다.
  const days = [...new Set(trend.map((c) => c.date))].sort();
  const channels = [...new Set(trend.map((c) => `${c.source}|${c.country}`))];
  const cell = new Map(trend.map((c) => [`${c.date}|${c.source}|${c.country}`, c]));
  const max = Math.max(1, ...trend.map((c) => c.count));

  /**
   * 부정 글을 카드 안에서 펼치는 블록.
   *
   * details/summary라서 펼쳐도 페이지가 바뀌지 않는다. 요약은 '무슨 얘기가 몇 건'까지만
   * 말해 주므로, 그 판정을 믿을지 판단하려면 실제 문장을 봐야 한다. 다만 부정이 백 건이
   * 넘는 카드도 있어 전부 실으면 화면이 덮이므로 심각한 것부터 몇 건만 담고, 나머지는
   * 목록 링크로 넘긴다.
   */
  const negativeBlock = (s: ChannelSummary) => {
    const list = negatives?.[`${s.source}|${s.country}|${s.service}`] ?? [];
    if (list.length === 0) return null;
    const rest = s.negative - list.length;
    return (
      <details className="briefing-neg">
        <summary>
          확인 필요 {s.negative}건{list.length < s.negative ? ` 중 ${list.length}건` : ''} 펼쳐 보기
        </summary>
        <ul>
          {list.map((n) => (
            <li key={n.id}>
              {/* 심각도는 높은 것만 배지로. 전부 붙이면 'low'가 줄마다 붙어 눈을 흐린다 */}
              {(n.severity === 'critical' || n.severity === 'high') && (
                <span className="badge urgent">{n.severity === 'critical' ? '치명' : '심각'}</span>
              )}
              {n.rating != null && <span className="briefing-neg-rating">{n.rating}점</span>}
              {n.url ? (
                <a href={n.url} target="_blank" rel="noreferrer">
                  {n.text}
                </a>
              ) : (
                <span>{n.text}</span>
              )}
            </li>
          ))}
        </ul>
        {rest > 0 && itemsHref && (
          <a
            className="briefing-neg-more"
            href={itemsHref({
              source: s.source,
              service: s.service,
              country: s.country,
              sentiment: 'negative',
            })}
          >
            나머지 {rest.toLocaleString()}건은 목록에서 보기
          </a>
        )}
      </details>
    );
  };

  /**
   * 채널 카드 하나. 서비스로 묶든 안 묶든 같은 카드를 쓴다.
   *
   * 서비스 배지는 그룹으로 묶었을 때 빼 준다. 그룹 제목이 이미 그 서비스를 말하고 있어서
   * 카드마다 다시 붙이면 같은 이름이 화면에 네다섯 번 반복된다.
   */
  const channelCard = (s: ChannelSummary) => (
    <article key={`${s.source}|${s.country}|${s.service}`} className="briefing-ch">
      <div className="briefing-ch-head">
        <strong>{label(s.source)}</strong>
        {/* 국가가 있는 채널(앱 리뷰)만 표시한다. 커뮤니티 글에는 국가가 없다 */}
        {s.country && (
          <span className="briefing-country">
            {countryFlag(s.country)} {countryName(s.country)}
          </span>
        )}
        {s.service && !grouped && <span className="badge">{s.service}</span>}
        {/* 숫자를 누르면 그 건들이 목록에서 열린다. 요약만 보고는 판정을 검증할 수 없다 */}
        {linked(`${s.total}건`, 'briefing-count', s)}
        {/*
          '부정'이라는 단어를 쓰지 않는다. 그 값이 담당 조직에 그대로 전달되면 사태를 단정하는
          말이 되고, 실제로는 AI가 감성을 negative로 판정한 글 수일 뿐이다. 행동만 지시하는
          '확인 필요'로 적고, 정확한 기준은 title에 남긴다. 색도 붉은 경고에서 노란 주의로 낮춘다.
          비율을 함께 내는 이유: '143'만으로는 그게 심한 편인지 알 수 없다.
        */}
        {s.negative > 0 &&
          linked(
            `확인 필요 ${s.negative} (${pct(rate(s))})`,
            'briefing-attn',
            s,
            'negative',
            ATTN_HINT,
          )}
      </div>
      <ul className="briefing-bullets">
        {s.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {negativeBlock(s)}
    </article>
  );

  /**
   * 건수를 목록 링크로 감싼다. itemsHref가 없으면(둘러보기 화면) 그냥 텍스트로 둔다.
   * 감성을 넘기면 그 감성만 걸러 열린다 — 그 건들을 눌러 확인하는 용도다.
   * hint는 무엇을 센 값인지 밝히는 title이다 (라벨을 부드럽게 쓰는 대신 기준은 정확히 남긴다).
   */
  const linked = (
    text: string,
    cls: string,
    s: ChannelSummary,
    sentiment?: string,
    hint?: string,
  ) =>
    itemsHref ? (
      <a
        className={cls}
        title={hint}
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
      <span className={cls} title={hint}>
        {text}
      </span>
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
        <div className={grouped ? 'briefing-groups' : 'briefing-channels'}>
          {grouped
            ? groups.map((g) => (
                <details key={g.service} className="briefing-group" open>
                  {/*
                    서비스별 총계와 부정률. 여기가 "어느 서비스를 먼저 볼지"를 정하는 자리다.
                    왼쪽 색 띠는 서비스 이름에서 뽑으므로 데이터가 바뀌어도 같은 서비스는
                    같은 색을 유지한다 (정렬 순서로 색을 고르면 매일 색이 바뀐다).
                  */}
                  <summary style={{ borderLeftColor: serviceColor(g.service) }}>
                    <span className="bg-name">{g.service}</span>
                    <span className="bg-stat">
                      {g.total.toLocaleString()}건
                      {g.negative > 0 && (
                        <>
                          {' '}
                          <span className="briefing-attn" title={ATTN_HINT}>
                            확인 필요 {g.negative.toLocaleString()} ({pct(rate(g))})
                          </span>
                        </>
                      )}
                    </span>
                    <span className="bg-count">채널 {g.cards.length}</span>
                  </summary>
                  <div className="briefing-channels">{g.cards.map(channelCard)}</div>
                </details>
              ))
            : groups[0]?.cards.map(channelCard)}
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
