import { countryFlag, countryName } from '@feedback-radar/core';
import type { ChannelSummary } from '@feedback-radar/core';
import { Briefing2ExpandButton } from './Briefing2Controls';
import { briefing2Href } from './navigation';
import { groupBriefing2Cards, safeBriefing2OriginalUrl } from './presentation';
import type { Briefing2CardEntry } from './presentation';
import type { Briefing2Data, Briefing2ItemScope, Briefing2Location } from './types';

export interface Briefing2CardProps extends Briefing2Data {
  location: Briefing2Location;
  selectedService?: string;
  itemsHref?: (scope: Briefing2ItemScope) => string | undefined;
}

const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  'naver-blog': 'N블로그',
  'naver-cafe': 'N카페',
  dcinside: '디시',
  threads: 'Threads',
  x: 'X',
  theqoo: '더쿠',
  'daum-cafe': '다음카페',
};

const sourceLabel = (source: string): string => SOURCE_LABEL[source] ?? source;

function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return month && day ? `${Number(month)}/${Number(day)}` : date;
}

/** Explicit server markup for the finalized 07 layout. The data model and
 * native links also work when mounted later under the brief2 dashboard tab. */
export function Briefing2Card({
  date,
  dates,
  summaries,
  rawItems,
  trend,
  negatives,
  pendingCount = 0,
  location,
  selectedService,
  itemsHref,
}: Briefing2CardProps) {
  const usage = summaries.reduce((total, summary) => ({
    input: total.input + (summary.inputTokens ?? 0),
    output: total.output + (summary.outputTokens ?? 0),
    cost: total.cost + (summary.costUsd ?? 0),
  }), { input: 0, output: 0, cost: 0 });
  const models = [...new Set(summaries.map(summary => summary.model).filter(Boolean))];
  const generatedAt = summaries.map(summary => summary.createdAt).sort().pop();
  const generationLabel = generatedAt ? `요약 생성 시각 ${generatedAt}` : undefined;
  const generationTime = generatedAt ? (
    <time className="briefing-generated-at" dateTime={generatedAt} title={generationLabel} aria-label={generationLabel}>
      ({generatedAt.slice(11, 16) || generatedAt})
    </time>
  ) : null;
  const groups = groupBriefing2Cards({ summaries, rawItems });
  const grouped = groups.length > 1 || Boolean(groups[0]?.service);

  const days = [...new Set(trend.map(cell => cell.date))].sort();
  const channels = [...new Set(trend.map(cell => `${cell.source}|${cell.country}`))];
  const cells = new Map(trend.map(cell => [`${cell.date}|${cell.source}|${cell.country}`, cell]));
  const max = Math.max(1, ...trend.map(cell => cell.count));

  const recentDates = dates.slice(0, 7);
  if (!recentDates.includes(date) && dates.includes(date)) recentDates.push(date);

  const count = (total: number, scope: Briefing2ItemScope) => {
    const href = itemsHref?.(scope);
    return href ? (
      <a className="briefing-count" href={href} title="전체 기간의 해당 채널 글 보기">전체 {total.toLocaleString()}건</a>
    ) : <span className="briefing-count">전체 {total.toLocaleString()}건</span>;
  };

  const channelCard = (summary: ChannelSummary) => {
    const list = negatives?.[`${summary.source}|${summary.country}|${summary.service}`] ?? [];
    const rest = summary.negative - list.length;
    const moreHref = rest > 0 ? itemsHref?.({
      source: summary.source, service: summary.service, country: summary.country, sentiment: 'negative',
    }) : undefined;
    return (
      <article className="briefing-ch">
        <div className="briefing-ch-head">
          <strong>{sourceLabel(summary.source)}</strong>
          {summary.service && !grouped && <span className="badge">{summary.service}</span>}
          {summary.country && (
            <span className="briefing-country" title={countryName(summary.country)}>{countryFlag(summary.country)}</span>
          )}
          {count(summary.total, { source: summary.source, service: summary.service, country: summary.country })}
        </div>
        <ul className="briefing-bullets">
          {summary.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
        </ul>
        {list.length > 0 && (
          <details className="briefing-feedback">
            <summary className="briefing-feedback-toggle">사용자 피드백 {list.length}건</summary>
            <div className="briefing-neg">
              <ul>
                {list.map(item => {
                  const url = safeBriefing2OriginalUrl(item.url);
                  return (
                    <li key={item.id}>
                      {item.rating != null && <span className="briefing-neg-rating">{item.rating}점</span>}
                      {url ? <a href={url} target="_blank" rel="noreferrer">{item.text}</a> : <span>{item.text}</span>}
                    </li>
                  );
                })}
              </ul>
              {moreHref && (
                <a className="briefing-neg-more" href={moreHref} title="전체 기간의 해당 채널 사용자 피드백 보기">
                  채널별에서 더 보기 · 전체 기간
                </a>
              )}
            </div>
          </details>
        )}
      </article>
    );
  };

  const rawCard = (card: Extract<Briefing2CardEntry, { kind: 'raw' }>) => (
    <article className="briefing-ch briefing-ch-raw">
      <div className="briefing-ch-head">
        <strong>{sourceLabel(card.source)}</strong>
        {card.service && !grouped && <span className="badge">{card.service}</span>}
        {card.country && <span className="briefing-country" title={countryName(card.country)}>{countryFlag(card.country)}</span>}
        {count(card.total, { source: card.source, service: card.service, country: card.country })}
      </div>
      <ul className="briefing-raw-list">
        {card.items.map(item => {
          const url = safeBriefing2OriginalUrl(item.url);
          return (
            <li key={item.id} className={item.sentiment === 'negative' ? 'neg' : undefined}>
              <span className="briefing-raw-meta">
                {item.time && <span className="t">{item.time}</span>}
                {item.rating != null && <span className="c">{item.rating}점</span>}
                {item.category && <span className="c">{item.category}</span>}
              </span>{' '}
              {url ? <a href={url} target="_blank" rel="noreferrer">{item.text}</a> : item.text}
            </li>
          );
        })}
      </ul>
    </article>
  );

  const renderCard = (card: Briefing2CardEntry, index: number) => (
    <div key={`${card.key}|${index}`} className="briefing-platform-card">
      {card.kind === 'sum' ? channelCard(card.summary) : rawCard(card)}
    </div>
  );

  return (
    <section className="briefing" data-tour="briefing">
      <div className="briefing-head">
          <div className="briefing-date-tools" role="group" aria-label="글 작성일 선택">
            <div className="briefing-dates">
              {recentDates.map(item => (
                <a key={item} className={item === date ? 'on' : undefined} href={briefing2Href(location, { date: item, service: selectedService })}>
                  {shortDate(item)}
                </a>
              ))}
                <form className="briefing-datepick" method="get" action={location.pathname}>
                  {location.tab && <input type="hidden" name="tab" value={location.tab} />}
                  {selectedService && <input type="hidden" name="service" value={selectedService} />}
                  <input type="date" name="sdate" defaultValue={date} list="briefing2-available-dates" aria-label="브리핑 날짜 고르기" required />
                  <datalist id="briefing2-available-dates">
                    {dates.map(item => <option key={item} value={item} />)}
                  </datalist>
                  <button type="submit">이동</button>
                </form>
            </div>
          </div>
        {usage.input > 0 ? (
          <span className="briefing-usage" title={models.join(', ')}>
            입력 {usage.input.toLocaleString()} / 출력 {usage.output.toLocaleString()} 토큰
            {usage.cost > 0 && `, 환산 $${usage.cost.toFixed(4)}`}
            {generationTime && <>{' '}{generationTime}</>}
          </span>
        ) : generationTime ? <span className="briefing-usage">{generationTime}</span> : null}
        <Briefing2ExpandButton />
      </div>

      {groups.length === 0 ? (
        <p className="briefing-empty">{date}에 작성된 글이 없습니다.</p>
      ) : (
        <div className={grouped ? 'briefing-groups' : 'briefing-channels'}>
          {grouped ? groups.map(group => (
            <section key={group.service} className="briefing-group" aria-label={group.service}>
              <header className="briefing-service-head">
                <h3 className="bg-name">{group.service}</h3>
                <span className="bg-stat">전체 {group.total.toLocaleString()}건</span>
                <span className="bg-count">채널 {group.cards.length}</span>
              </header>
              <div className="briefing-channels">{group.cards.map(renderCard)}</div>
            </section>
          )) : groups[0]?.cards.map(renderCard)}
        </div>
      )}

      {days.length > 1 && (
        <div className="briefing-trend">
          <div className="briefing-trend-title">작성일 기준 최근 {days.length}일 채널별 언급량</div>
          {channels.map(key => {
            const [source, country] = key.split('|');
            return (
              <div key={key} className="trend-row">
                <span className="trend-label" title={country ? countryName(country) : undefined}>
                  {sourceLabel(source)}{country && ` ${countryFlag(country)}`}
                </span>
                <div className="trend-bars">
                  {days.map(day => {
                    const cell = cells.get(`${day}|${source}|${country}`);
                    const count = cell?.count ?? 0;
                    return <span key={day} className="trend-bar" style={{ height: `${Math.round((count / max) * 100)}%` }} title={`${day} ${count}건${cell?.negative ? ` (부정 ${cell.negative})` : ''}`} />;
                  })}
                </div>
                <span className="trend-total">{days.reduce((total, day) => total + (cells.get(`${day}|${source}|${country}`)?.count ?? 0), 0)}</span>
              </div>
            );
          })}
          <div className="trend-axis">
            <span />
            <div>{days.map(day => <span key={day}>{shortDate(day)}</span>)}</div>
            <span />
          </div>
        </div>
      )}
      {pendingCount > 0 && (
        <footer className="briefing-data-status" title="선택한 날짜·서비스와 관계없는 전체 자료 기준입니다.">
          전체 자료 중 미분류 {pendingCount.toLocaleString()}건
        </footer>
      )}
    </section>
  );
}
