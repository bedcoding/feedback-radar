import { Fragment } from 'react';
import { CLI_MODEL_CHOICES, COLLECT_LIMIT_FIELDS } from '@feedback-radar/core';
import type {
  CategoryCount,
  CollectLimits,
  DashboardStats,
  ItemRow,
  TaggerStatus,
} from '@feedback-radar/core';

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
  tabs?: {
    active: 'relevant' | 'irrelevant';
    relevantCount: number;
    irrelevantCount: number;
    /** 서비스·투어 등 다른 상태를 유지해야 해서 링크는 페이지 쪽에서 만든다 */
    href: (filter: 'relevant' | 'irrelevant') => string;
  };
  /** 서비스 선택 칩. 추적 서비스가 둘 이상일 때만 넘긴다 */
  services?: {
    active?: string;
    options: { name: string; count: number }[];
    total: number;
    href: (service?: string) => string;
  };
  /** 소스별 1회 수집 상한. save가 없으면 읽기 전용으로 보여준다 (둘러보기 화면) */
  collect?: {
    limits: CollectLimits;
    /** 켜져 있는 소스만 입력칸을 보여준다 */
    enabled: Record<string, boolean>;
    /** 이 상한으로 한 번에 최대 몇 건까지 들어오는지 */
    estimate: number;
    /** 소스별로 지금까지 실제 긁어온 범위 (items.source 기준) */
    coverage?: Record<string, { count: number; oldest?: string; newest?: string }>;
    save?: FormAction;
  };
  /** 작성일 기준 기간 칩 */
  periods?: {
    active: string;
    options: { key: string; label: string; count: number }[];
    href: (key: string) => string;
    /** 작성일을 못 가져온 건수 — 기간을 걸면 빠지므로 알려 준다 */
    undated: number;
  };
  /**
   * 목록 페이지 이동. 없으면 페이저를 렌더하지 않는다(둘러보기 화면은 고정 예시라 필요 없다).
   * href는 현재 탭·투어 상태를 유지해야 해서 페이지 쪽에서 만들어 넘긴다.
   */
  pager?: { page: number; pageCount: number; total: number; from: number; to: number; href: (page: number) => string };
  /** 태거 진단 카드. status가 없으면 "아직 확인 안 함" 상태로 렌더한다 */
  tagger?: {
    status?: TaggerStatus;
    cliPath?: string;
    recheck: FormAction;
    login?: FormAction;
    loginLaunch?: { launched: boolean; fallbackCommand: string; error?: string };
  };
}

const MODE_LABEL: Record<string, { text: string; tone: 'good' | 'warn' | 'bad' }> = {
  cli: { text: 'Claude 구독 (추가 비용 0)', tone: 'good' },
  api: { text: 'Claude API (종량제)', tone: 'good' },
  heuristic: { text: '키워드 규칙 (정확도 낮음)', tone: 'bad' },
};

/**
 * 소스별 1회 수집 상한.
 *
 * 이 도구는 전수조사가 아니라 '검색 결과 상위 N개'를 가져온다. 그 N이 수집기 코드에
 * 흩어져 있으면 사용자가 수집량도 LLM 호출량도 조절할 수 없다. 한자리에 모아 노출한다.
 */
function CollectCard({ limits, enabled, estimate, coverage, save }: NonNullable<Props['collect']>) {
  const fields = COLLECT_LIMIT_FIELDS.filter((f) => enabled[SOURCE_OF[f.key]] !== false);

  /** 한 상한이 여러 source를 채우기도 한다 (네이버 = 블로그 + 카페) */
  const rangeOf = (srcs: readonly string[]) => {
    const rows = srcs.map((s) => coverage?.[s]).filter(Boolean) as {
      count: number;
      oldest?: string;
      newest?: string;
    }[];
    if (!rows.length) return null;
    const count = rows.reduce((n, r) => n + r.count, 0);
    if (count === 0) return null;
    const oldest = rows.map((r) => r.oldest).filter(Boolean).sort()[0];
    const newest = rows
      .map((r) => r.newest)
      .filter(Boolean)
      .sort()
      .pop();
    return { count, oldest, newest };
  };

  const body = (
    <>
      {fields.map((f) => {
        const got = rangeOf(f.sources);
        return (
          // 라벨/입력/설명을 grid 셀로 흘려보낸다. 라벨 열 너비를 grid가 가장 긴 라벨에
          // 맞추므로, 소스 이름 길이가 달라도 입력칸이 저절로 세로로 맞는다.
          <Fragment key={f.key}>
            <label className="limit-name" htmlFor={`lim-${f.key}`}>
              {f.label}
            </label>
            <span className="limit-row">
              <input
                // 저장 후 새 값이 반영되도록 remount한다 (defaultValue는 마운트 때만 적용)
                key={`${f.key}-${limits[f.key]}`}
                id={`lim-${f.key}`}
                name={f.key}
                type="number"
                min={f.min}
                max={f.max}
                defaultValue={limits[f.key]}
                disabled={!save}
              />
              <span className="limit-unit">{f.unit}</span>
            </span>
            {/* 값을 키운 결과를 오해하지 않게, 지금까지 실제로 긁어온 범위를 같이 보여준다 */}
            <span className="limit-got">
              {got
                ? `현재 ${got.count.toLocaleString()}건${got.oldest ? ` · 작성일 ${got.oldest} ~ ${got.newest}` : ''}`
                : '아직 수집된 글 없음'}
              {' · '}
              {f.effect}
            </span>
          </Fragment>
        );
      })}
    </>
  );

  return (
    <section className="tagger-card" data-tour="collect">
      <div className="tagger-head">
        <span className="tagger-title">1회 수집량</span>
        <span className="tagger-facts">
          이 설정이면 한 번에 최대 약 {estimate.toLocaleString()}건 · 중복은 저장 단계에서 걸러집니다
        </span>
      </div>
      {save ? (
        <form action={save} className="limits">
          {body}
          <button type="submit" className="limits-save">
            저장
          </button>
        </form>
      ) : (
        <div className="limits">{body}</div>
      )}
      <p className="tagger-note">
        전수조사가 아니라 최신순 상위 N개를 가져옵니다. 어느 소스도 &ldquo;특정 날짜의 글&rdquo;은
        지정할 수 없습니다 — 날짜로 보려면 아래 목록의 기간 필터를 쓰세요. 값을 키우면 AI 호출량도
        같이 늘어납니다. 비우고 저장하면 설정 파일 값으로 돌아갑니다.
      </p>
    </section>
  );
}

/** 상한 필드 ↔ config.sources 키 (꺼 둔 소스는 입력칸을 보여줄 필요가 없다) */
const SOURCE_OF: Record<string, string> = {
  appstorePages: 'appstore',
  googlePlayReviewCount: 'googleplay',
  naverDisplay: 'naver',
  dcinsidePosts: 'dcinside',
  threadsPosts: 'threads',
};

function TaggerCard({ status, cliPath, recheck, login, loginLaunch }: NonNullable<Props['tagger']>) {
  const mode = status ? (MODE_LABEL[status.mode] ?? { text: status.mode, tone: 'warn' as const }) : null;

  return (
    <section className="tagger-card" data-tour="tagger">
      <div className="tagger-head">
        <span className="tagger-title">AI 분류 상태</span>
        {mode ? (
          <span className={`tagger-mode ${mode.tone}`}>{mode.text}</span>
        ) : (
          <span className="tagger-mode warn">아직 확인하지 않음</span>
        )}
        {status && (
          <span className="tagger-facts">
            CLI {status.cliFound ? `발견 (${status.cliPath})` : '못 찾음'}
            {status.cliFound && ` · 로그인 ${status.loggedIn ? '됨' : '안 됨'}`}
            {status.loggedIn && ` · 지정 ${status.model || '계정 기본값'}`}
            {/* haiku 같은 별칭은 버전을 감춘다. 실제로 무엇이 돌았는지는 이 값이 근거다 */}
            {status.resolvedModel && ` · 실제 호출 ${status.resolvedModel}`}
            {status.apiKeySet && ' · API 키 있음'}
          </span>
        )}
      </div>

      {status?.hint && <p className="tagger-hint">{status.hint}</p>}

      {status?.cliFound && status.loggedIn === false && (
        <div className="tagger-login">
          <div className="tagger-login-row">
            {login && (
              <form action={login}>
                <button type="submit" className="primary">
                  🔑 로그인 창 열기
                </button>
              </form>
            )}
            <div className="tagger-login-cmd">
              <span className="label">직접 실행하려면 (클릭하면 전체 선택)</span>
              <code>{status.loginCommand}</code>
            </div>
          </div>
          <ol className="tagger-login-steps">
            <li>터미널 창이 열리고 브라우저에 Claude 승인 화면이 뜹니다</li>
            <li>브라우저에서 승인하면 인증 코드가 나옵니다 — 그 코드를 터미널에 붙여넣고 Enter</li>
            <li>
              완료되면 이 카드가 자동으로 바뀝니다 (최대 90초 대기). 안 바뀌면 [다시 확인]을 누르세요
            </li>
          </ol>
          <p className="tagger-login-note">
            인증은 Claude CLI가 직접 처리합니다 — 이 앱은 계정 정보나 인증 코드를 받지도 저장하지도 않습니다.
          </p>
        </div>
      )}

      {loginLaunch && !loginLaunch.launched && (
        <p className="tagger-cmd">
          터미널을 자동으로 열지 못했습니다{loginLaunch.error ? ` (${loginLaunch.error})` : ''}. 위 명령을
          직접 실행해 주세요.
        </p>
      )}

      <form action={recheck} className="tagger-form">
        <label>
          <span>모델</span>
          {/* defaultValue는 마운트 때만 적용된다. 저장 후 새 값이 반영되도록 key로 remount한다 */}
          <select key={status?.model ?? 'haiku'} name="model" defaultValue={status?.model ?? 'haiku'}>
            {CLI_MODEL_CHOICES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <input
          name="cliPath"
          type="text"
          defaultValue={cliPath ?? ''}
          placeholder="claude 실행 파일 경로 (비우면 자동 탐색)"
        />
        <button type="submit">저장하고 다시 확인</button>
      </form>
      <p className="tagger-note">
        (최신)은 별칭이라 버전이 바뀝니다. 저장하면 실제 호출한 모델 ID가 위에 뜹니다.
      </p>
    </section>
  );
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

/**
 * 작성일 표시. 소스마다 형식이 달라('2026-06-03' · ISO+오프셋 · '…Z')
 * 앞 10자만 잘라 쓴다 — Date로 파싱하면 오프셋 때문에 하루씩 밀리는 값이 생긴다.
 */
function day(posted?: string): string {
  if (!posted) return '—';
  const d = posted.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '—';
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
  tagger,
  pager,
  services,
  periods,
  collect,
}: Props) {
  const { stats, categories, items } = data;
  const nextRunAt =
    data.lastRunAt && data.intervalHours > 0
      ? new Date(Date.parse(data.lastRunAt) + data.intervalHours * 3_600_000).toISOString()
      : undefined;

  const tt = (name: string) => (tourMode ? name : undefined);
  // 서비스가 하나뿐이면 열을 늘려 봐야 같은 값만 반복된다
  const showService = new Set(items.map((it) => it.service).filter(Boolean)).size > 1;
  // 무관 판정 행은 첫 번째만 강조 지점으로 삼는다 (전부 붙이면 중복 속성만 늘어난다)
  const firstIrrelevantId = items.find((it) => it.relevant === false)?.id;

  // intervalHours = 0 은 '자동 수집 끔'. 체크를 풀면 스케줄러가 [지금 실행]만 받는다
  const auto = data.intervalHours > 0;
  const intervalField = (
    // defaultChecked/defaultValue는 마운트 때만 반영된다. 저장 후 값이 따라오도록 key로 remount한다
    <>
      <label className="auto-toggle" key={`auto-${auto}`}>
        <input type="checkbox" name="auto" defaultChecked={auto} />
        <span>자동 수집</span>
      </label>
      <input
        key={`hours-${data.intervalHours}`}
        name="hours"
        type="number"
        min={0.5}
        max={168}
        step={0.5}
        defaultValue={auto ? data.intervalHours : 24}
      />
      <span>시간마다</span>
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
              : auto
                ? `대기 중 · 마지막 실행 ${fmt(data.lastRunAt)} · 다음 실행 ${fmt(nextRunAt)}`
                : `자동 수집 꺼짐 · 마지막 실행 ${fmt(data.lastRunAt)} · [지금 실행]으로만 수집합니다`}
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

      {collect && <CollectCard {...collect} />}

      {tagger && <TaggerCard {...tagger} />}

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

      {/*
        라벨과 버튼을 한 그리드에 넣어 두 줄의 시작점을 맞춘다.
        라벨을 각 줄 안에 두면 글자 수만큼 버튼이 밀려 위아래가 어긋난다.
      */}
      {(tabs || periods || (services && services.options.length > 1)) && (
        <div className="filters">
          {services && services.options.length > 1 && (
            <>
              <span className="filter-label">서비스</span>
              <div className="chips" data-tour={tt('services')}>
                <a className={!services.active ? 'on' : ''} href={services.href()}>
                  전체 <span className="n">{services.total.toLocaleString()}</span>
                </a>
                {services.options.map((s) => (
                  <a
                    key={s.name}
                    className={services.active === s.name ? 'on' : ''}
                    href={services.href(s.name)}
                  >
                    {s.name} <span className="n">{s.count.toLocaleString()}</span>
                  </a>
                ))}
              </div>
            </>
          )}

          {periods && (
            <>
              <span className="filter-label">기간</span>
              <div className="chips" data-tour={tt('periods')}>
                {periods.options.map((p) => (
                  <a
                    key={p.key}
                    className={periods.active === p.key ? 'on' : ''}
                    href={periods.href(p.key)}
                  >
                    {p.label} <span className="n">{p.count.toLocaleString()}</span>
                  </a>
                ))}
                <span className="tabs-note">
                  글이 쓰인 날짜 기준입니다
                  {periods.undated > 0 && ` · 날짜를 못 가져온 ${periods.undated.toLocaleString()}건은 '전체'에서만 보입니다`}
                </span>
              </div>
            </>
          )}

          {tabs && (
            <>
              <span className="filter-label">보기</span>
              <div className="tabs" data-tour={tt('tabs')}>
                <a className={tabs.active === 'relevant' ? 'on' : ''} href={tabs.href('relevant')}>
                  관련 글 <span className="n">{tabs.relevantCount.toLocaleString()}</span>
                </a>
                <a className={tabs.active === 'irrelevant' ? 'on' : ''} href={tabs.href('irrelevant')}>
                  걸러진 글 <span className="n">{tabs.irrelevantCount.toLocaleString()}</span>
                </a>
                <span className="tabs-note">
                  {tabs.active === 'relevant'
                    ? '동음이의어 등 무관 판정 글은 여기서 제외됩니다'
                    : 'AI가 우리 서비스와 무관하다고 판단한 글입니다 — 판정이 맞는지 확인용'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="empty">
          {/* 서비스를 걸러 놓고 "데이터가 없다"고만 하면 수집이 안 된 줄 알게 된다 */}
          {services?.active
            ? `${services.active}에는 ${tabs?.active === 'irrelevant' ? '걸러진' : '해당하는'} 글이 없습니다.`
            : tabs?.active === 'irrelevant'
              ? '걸러진 글이 없습니다.'
              : '아직 데이터가 없습니다. npm run collect 를 먼저 실행하세요.'}
        </div>
      ) : (
        <table data-tour={tt('items')}>
          <thead>
            <tr>
              {showService && <th>서비스</th>}
              <th>채널</th>
              <th>작성일</th>
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
                  {/* 검색으로 걸린 글은 '어떤 검색어에 걸렸는지'가 곧 수집된 이유다 */}
                  {it.keyword && <div className="kw">🔍 {it.keyword}</div>}
                </td>
                <td className="date-cell">{day(it.postedAt)}</td>
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
                  {/* AI가 관련/무관을 그렇게 판단한 근거 — 오탐을 찾아 키워드를 고치는 단서 */}
                  {it.reason && (
                    <div className={`reason${it.relevant === false ? ' off' : ''}`}>
                      {it.relevant === false ? '제외' : '판정'}: {it.reason}
                    </div>
                  )}
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

      {pager && pager.pageCount > 1 && (
        <nav className="pager">
          {/* 첫/끝 페이지에서는 링크 대신 비활성 span — 눌러도 같은 화면인 링크를 두지 않는다 */}
          {pager.page > 1 ? (
            <a href={pager.href(pager.page - 1)}>‹ 이전</a>
          ) : (
            <span className="off">‹ 이전</span>
          )}
          <span className="pager-count">
            {pager.from.toLocaleString()}–{pager.to.toLocaleString()} / {pager.total.toLocaleString()}건
            <span className="pager-page">
              {pager.page} / {pager.pageCount} 쪽
            </span>
          </span>
          {pager.page < pager.pageCount ? (
            <a href={pager.href(pager.page + 1)}>다음 ›</a>
          ) : (
            <span className="off">다음 ›</span>
          )}
        </nav>
      )}
    </main>
  );
}
