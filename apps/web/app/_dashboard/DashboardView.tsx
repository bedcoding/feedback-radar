import { Fragment } from 'react';
import {
  CLI_MODEL_CHOICES,
  COLLECT_LIMIT_FIELDS,
  countryFlag,
  countryName,
  storeCountries,
  TAG_BATCH_KEY,
  TAG_BATCH_MAX,
  TAG_BATCH_MIN,
  TAG_RAMP,
} from '@feedback-radar/core';
import { BriefingCard, type BriefingProps } from './BriefingCard';
import {
  CollectProgress,
  type CollectTaskView,
  type RunPhase,
  type TagCallView,
} from './CollectProgress';
import { CountryField } from './CountryField';
import { KeywordField } from './KeywordField';
import type {
  CategoryCount,
  CollectLimits,
  DashboardStats,
  ItemRow,
  ServiceConfig,
  TaggerStatus,
  TaggerUsage,
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
  /**
   * 중단을 눌렀는지. 눌러도 즉시 멈추지 않는다 — 파이프라인이 배치 경계까지 진행한 뒤
   * 멈추므로, 그 사이 버튼이 눌렸다는 사실을 화면이 말해 줘야 또 누르지 않는다.
   */
  cancelRequested?: boolean;
}

type FormAction = (formData: FormData) => Promise<void>;

/**
 * 이 타입은 `/`와 `/tour`의 계약이다.
 *
 * 여기 있는 값은 거의 다 optional인데, 그건 실제 화면과 둘러보기 화면이 같은 컴포넌트를
 * 쓰면서 서버 액션 유무만 다르기 때문이다. 다만 그래서 **새 prop을 추가하고 `/`에만
 * 연결해도 타입 검사가 통과한다.** 그러면 그 기능은 둘러보기 화면에서 조용히 사라지고,
 * 발표용 데모가 실제 화면보다 뒤처진 것을 아무도 모른다(실제로 그렇게 신기능 다섯 개가 빠졌다).
 *
 * 그래서 /tour 쪽에서 이 타입을 `Required<Omit<...>>`로 받는다. 여기에 prop을 추가하면
 * 예시 데이터를 넣기 전까지 투어 페이지가 빌드에서 막힌다. 일부러 그렇게 뒀다.
 */
export interface DashboardViewProps {
  data: DashboardData;
  actions?: {
    saveInterval: FormAction;
    requestRunNow: FormAction;
    /** 없으면 중단 버튼을 숨긴다 (둘러보기 화면은 실행을 걸 수 없다) */
    requestCancelRun?: FormAction;
  };
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
    /** 이 상한으로 한 번에 최대 몇 건까지 들어오는지 */
    estimate: number;
    /**
     * 예상 분류 호출 횟수. 수집분과 이미 쌓인 미분류분을 함께 센다.
     * 비용은 건수가 아니라 호출 횟수로 결정되므로 상한을 정할 때 봐야 하는 값이다.
     */
    tagCalls: number;
    /** 한 호출에 담을 글 수 (지금 설정값) */
    tagBatchSize: number;
    /** 지금 쌓여 있는 미분류 건수. 수집량과 무관하게 다음 실행에서 함께 처리된다 */
    pending: number;
    /** 소스별로 지금까지 실제 긁어온 범위 (items.source 기준) */
    coverage?: Record<string, { count: number; oldest?: string; newest?: string }>;
    /** 소스별 on/off 현재 상태 (config + 대시보드 저장값을 합친 결과) */
    on: Record<string, boolean>;
    save?: FormAction;
    /**
     * '이 소스만 실행' — 소스 키별로 미리 bind된 액션. 없으면 버튼을 숨긴다.
     * 버튼의 name으로 넘길 수 없어(React가 덮어씀) 소스마다 액션을 따로 받는다.
     */
    runOne?: Record<string, () => Promise<void>>;
    /** 이미 수집이 돌고 있으면 버튼을 잠근다 */
    busy?: boolean;
  };
  /**
   * 분류 프롬프트 편집. save가 없으면 읽기 전용으로 보여준다 (둘러보기 화면).
   *
   * 판정이 틀렸을 때 고칠 곳이 프롬프트인데, 그게 설정 파일 안에만 있으면 오탐을 발견한
   * 사람이 손댈 수 없다. 화면에서 고치고 그 결과 지시문까지 확인할 수 있게 한다.
   */
  prompt?: {
    domainPrompt: string;
    excludeHints: string[];
    /** 지금 설정으로 만들어지는 지시문 전문 (호출마다 동일한 구간) */
    instructions: string;
    save?: FormAction;
  };
  /**
   * 카테고리 집계 표에서 목록으로 넘어가는 링크. 없으면 카테고리를 텍스트로만 보여준다.
   * 숫자만 보이면 '앱 오류 9건'이 실제로 어떤 글인지 확인할 방법이 없다.
   */
  categoryHref?: (category: string) => string;
  /**
   * 목록 필터를 전부 해제하는 링크. 걸린 필터가 있을 때만 넘긴다.
   * 채널과 감성은 칩이 없어서 이 링크가 없으면 되돌릴 방법이 화면에 없다.
   */
  itemsFilterReset?: string;
  /**
   * 목록 탭의 카테고리 칩. 서비스와 기간처럼 다른 카테고리로 바로 옮길 수 있어야 한다
   * (해제 버튼만 있으면 브리핑 탭으로 돌아가 다시 눌러야 한다).
   */
  categoryChips?: {
    active?: string;
    options: { name: string; count: number }[];
    total: number;
    href: (category?: string) => string;
  };
  /**
   * 목록 탭의 국가 칩.
   *
   * 같은 앱이라도 스토어 국가마다 반응이 갈린다 (한 국가에서 잘 도는 기능이 다른 국가에서는
   * 불만의 1순위이기도 하다). 국가를 섞어 놓으면 그 차이가 평균에 묻힌다.
   * 국가가 없는 커뮤니티 글은 국가를 고르면 목록에서 빠진다.
   */
  countryChips?: {
    active?: string;
    options: { country: string; count: number; negative: number }[];
    total: number;
    href: (country?: string) => string;
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
  /** 채널×날짜 AI 브리핑. 없으면 렌더하지 않는다 (둘러보기 화면 등) */
  briefing?: BriefingProps;
  /**
   * 수집 작업별 진행 상태. 수집이 도는 동안 어디까지 갔는지 보여준다.
   * 없으면 카드를 그리지 않는다.
   */
  collectProgress?: {
    tasks: CollectTaskView[];
    running: boolean;
    phase?: RunPhase;
    call?: TagCallView;
    elapsedMs?: number;
  };
  /** 상단 화면 탭. 없으면 탭 줄을 그리지 않는다 */
  nav?: {
    active: string;
    items: { key: string; label: string }[];
    href: (key: string) => string;
  };
  /**
   * 탭별로 무엇을 보여줄지. **넘기지 않으면 전부 보여준다** —
   * 둘러보기(/tour)와 투어 모드는 화면 전체를 한 벌로 순회해야 하기 때문이다.
   */
  show?: { brief: boolean; items: boolean; collect: boolean; settings: boolean };
  /**
   * 추적 서비스 관리. 지금까지는 설정 파일을 손으로 고쳐야 서비스를 늘릴 수 있었다.
   * add가 없으면 읽기 전용으로 보여준다(둘러보기 화면).
   */
  servicesAdmin?: {
    list: ServiceConfig[];
    /** 화면 제목. LLM 분류 프롬프트에도 들어가는 값이다 */
    displayName: string;
    saveName?: FormAction;
    add?: FormAction;
    /** 이름별로 미리 bind한 수정 액션 */
    update?: Record<string, FormAction>;
    /** 이름별로 미리 bind한 삭제 액션. 버튼 name으로는 값을 넘길 수 없다 */
    remove?: Record<string, () => Promise<void>>;
    error?: string;
  };
  /** 태거 진단 카드. status가 없으면 "아직 확인 안 함" 상태로 렌더한다 */
  tagger?: {
    status?: TaggerStatus;
    cliPath?: string;
    /** 없으면 읽기 전용으로 보여준다 (둘러보기 화면). collect.save와 같은 규칙 */
    recheck?: FormAction;
    login?: FormAction;
    loginLaunch?: { launched: boolean; fallbackCommand: string; error?: string };
    /**
     * 마지막 분류 실행에서 **실제로** 쓴 모델·토큰.
     * 진단(status.resolvedModel)은 '진단 버튼을 누른 시점'의 값이라 그 뒤 모델을 바꿨으면
     * 실제 분류와 어긋난다. 이 값이 있으면 이쪽이 사실이다.
     */
    lastUsage?: TaggerUsage & { at: string; tagger: string };
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
/**
 * 분류 프롬프트 편집 카드.
 *
 * 고정 지시부(분류 규칙, 출력 형식, 보안 규칙)는 코드에 있고 바꾸지 않는다. 그 부분이
 * 흔들리면 응답 형식이 깨져 분류가 통째로 실패한다. 화면에서 여는 것은 판정 기준에
 * 해당하는 두 값뿐이고, 결과 지시문 전문을 함께 보여줘 무엇이 바뀌는지 확인하게 한다.
 */
function PromptCard({
  domainPrompt,
  excludeHints,
  instructions,
  save,
}: NonNullable<DashboardViewProps['prompt']>) {
  const body = (
    <>
      <label className="prompt-label" htmlFor="domainPrompt">
        서비스 도메인 지식
        <span className="prompt-hint">
          이 업종에서 그 단어가 무슨 뜻인지 알려 줍니다. 자체 재화 이름, 업계 용어, 어떤 글을
          어느 카테고리로 볼지 등을 적습니다
        </span>
      </label>
      <textarea
        id="domainPrompt"
        name="domainPrompt"
        rows={8}
        defaultValue={domainPrompt}
        disabled={!save}
        placeholder={'- 코인: 결제 재화. "코인이 안 들어옴"은 결제 카테고리, 심각도 high 이상'}
      />

      <label className="prompt-label" htmlFor="excludeHints">
        제외 단어 (동음이의어 차단)
        <span className="prompt-hint">
          이 단어가 같이 나오면 우리 서비스 글이 아니라고 봅니다. 서비스명이 다른 분야 용어와
          겹칠 때 오탐을 크게 줄입니다. 쉼표로 구분
        </span>
      </label>
      <textarea
        id="excludeHints"
        name="excludeHints"
        rows={3}
        defaultValue={excludeHints.join(', ')}
        disabled={!save}
      />
    </>
  );

  return (
    <section className="tagger-card" data-tour="prompt">
      <div className="tagger-head">
        <span className="tagger-title">분류 프롬프트</span>
        <span className="tagger-facts">
          호출마다 함께 전송됩니다. 지금 지시문 {instructions.length.toLocaleString()}자
        </span>
      </div>
      {save ? (
        <form action={save} className="prompt-form">
          {body}
          <button type="submit" className="limits-save">
            저장
          </button>
        </form>
      ) : (
        <div className="prompt-form">{body}</div>
      )}
      {/* 저장 전에 결과를 확인할 수 있어야 한다. 안 보여주면 무엇을 바꿨는지 모르고 저장한다 */}
      <details className="cp-call-prompt">
        <summary>지금 보내는 지시문 전문 보기</summary>
        <pre>{instructions}</pre>
      </details>
      <p className="tagger-note">
        분류 규칙과 출력 형식, 보안 규칙은 코드에 고정돼 있습니다. 그 부분이 흔들리면 응답
        형식이 깨져 분류가 통째로 실패하므로 화면에서는 열지 않습니다.
      </p>
    </section>
  );
}

function CollectCard({
  limits,
  estimate,
  tagCalls,
  tagBatchSize,
  pending,
  coverage,
  on,
  save,
  runOne,
  busy,
}: NonNullable<DashboardViewProps['collect']>) {
  // 꺼진 소스도 칸을 남긴다 — 안 보이면 다시 켤 방법이 없다
  const fields = COLLECT_LIMIT_FIELDS;

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
            <label className="limit-name" key={`on-${f.configKey}-${on[f.configKey]}`}>
              <input
                type="checkbox"
                name={`on.${f.configKey}`}
                defaultChecked={on[f.configKey]}
                disabled={!save}
              />
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
              {runOne?.[f.configKey] && (
                // 같은 폼 안에서 formAction으로 다른 서버 액션을 부른다 (폼 중첩은 불가).
                // 상한 칸 값이 범위를 벗어나 있어도 실행은 막히지 않게 formNoValidate.
                <button
                  type="submit"
                  formAction={runOne[f.configKey]}
                  className="limit-run"
                  disabled={busy}
                  formNoValidate
                >
                  이것만 실행
                </button>
              )}
            </span>
            {/* 값을 키운 결과를 오해하지 않게, 지금까지 실제로 긁어온 범위를 같이 보여준다 */}
            <span className={`limit-got${on[f.configKey] ? '' : ' off'}`}>
              {on[f.configKey] ? '' : '꺼짐, '}
              {got
                ? `현재 ${got.count.toLocaleString()}건${got.oldest ? ` (작성일 ${got.oldest} ~ ${got.newest})` : ''}`
                : '아직 수집된 글 없음'}
              {', '}
              {f.effect}
            </span>
          </Fragment>
        );
      })}

      {/*
        분류 배치 크기. 수집량은 아니지만 위에 적힌 '분류 호출 N회'를 직접 정하는 값이라
        같은 자리에 둔다. 작게 잡으면 결과가 빨리 뜨고 크게 잡으면 호출 수가 줄어드는데,
        어느 쪽이 나은지는 쓰는 사람의 상황(기다릴 수 있는지, 한도가 빡빡한지)에 달렸다.
      */}
      <label className="limit-name" htmlFor={`lim-${TAG_BATCH_KEY}`}>
        한 번에 분류
      </label>
      <span className="limit-row">
        <input
          key={`${TAG_BATCH_KEY}-${tagBatchSize}`}
          id={`lim-${TAG_BATCH_KEY}`}
          name={TAG_BATCH_KEY}
          type="number"
          min={TAG_BATCH_MIN}
          max={TAG_BATCH_MAX}
          defaultValue={tagBatchSize}
          disabled={!save}
        />
        <span className="limit-unit">건 (한 호출에 담는 글 수)</span>
      </span>
      <span className="limit-got">
        작게 잡으면 결과가 화면에 빨리 뜨고, 크게 잡으면 호출 수가 줄어 한도를 덜 씁니다.
        앞의 {TAG_RAMP.length}개 호출은 이 값과 무관하게 {TAG_RAMP.join(', ')}건으로 나갑니다
        (첫 진행률이 빨리 움직이도록)
      </span>
    </>
  );

  return (
    <section className="tagger-card" data-tour="collect">
      <div className="tagger-head">
        <span className="tagger-title">1회 수집량</span>
        {/*
          건수만 보여주면 비용을 가늠할 수 없다. 분류 비용은 건수가 아니라 호출 횟수로
          결정된다 (25건을 한 프롬프트에 묶고, 호출마다 CLI 자체 시스템 프롬프트를 싣는다).
          그래서 상한을 정할 때 실제로 봐야 하는 숫자는 호출 횟수다.
        */}
        <span className="tagger-facts">
          이 설정이면 한 번에 최대 약 {estimate.toLocaleString()}건 (중복은 저장 단계에서
          걸러짐), 분류 호출 최대 {tagCalls.toLocaleString()}회
          {pending > 0 && ` (지금 미분류 ${pending.toLocaleString()}건 포함)`}
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
        최신순 상위 N개를 가져옵니다. 값을 키우면 AI 호출량도 늡니다.
      </p>
    </section>
  );
}

/**
 * 추적 서비스 관리.
 *
 * 서비스를 늘리려면 private/feedback-radar.config.json을 열어 JSON을 고쳐야 했다.
 * 키워드 하나 추가하려고 파일을 편집하는 건 이 도구를 쓰는 사람 대부분에게 문턱이 높다.
 */
function ServicesCard({
  list,
  displayName,
  saveName,
  add,
  update,
  remove,
  error,
}: NonNullable<DashboardViewProps['servicesAdmin']>) {
  const keywordCount = list.reduce((n, s) => n + s.keywords.length, 0);
  // 앱 ID가 있는 서비스의 국가만 센다. 앱 ID가 없으면 국가는 아무 데도 쓰이지 않는다.
  const trackedCountries = [
    ...new Set(
      list.flatMap((s) =>
        s.appstore?.appId || s.googlePlay?.appId
          ? storeCountries(s.googlePlay ?? s.appstore)
          : [],
      ),
    ),
  ];
  return (
    <section className="tagger-card">
      <div className="tagger-head">
        <span className="tagger-title">추적 서비스</span>
        <span className="tagger-facts">
          {list.length}개, 검색 키워드 {keywordCount}개
          {trackedCountries.length > 0 && (
            <>
              , 스토어 국가 {trackedCountries.length}곳{' '}
              <span className="svc-flags" title={trackedCountries.map(countryName).join(', ')}>
                {trackedCountries.map(countryFlag).join('')}
              </span>
            </>
          )}
        </span>
      </div>

      {saveName && (
        <form action={saveName} className="svc-title" key={`title-${displayName}`}>
          <span className="svc-title-label">화면 제목</span>
          <input name="displayName" defaultValue={displayName} maxLength={40} required />
          <button type="submit" className="svc-save">
            저장
          </button>
          <span className="svc-title-note">
            제목은 물론이고 LLM 분류 프롬프트에도 들어갑니다. 추적 범위를 담은 이름이 낫습니다
          </span>
        </form>
      )}

      <div className="svc-list">
        {list.map((s) => {
          // 앱 ID가 없으면 국가를 비워 둔다. 쓰이지 않는 값에 kr이 채워져 있으면
          // 국내 스토어를 조회하고 있다는 오해를 준다.
          const countries =
            s.appstore?.appId || s.googlePlay?.appId
              ? storeCountries(s.googlePlay ?? s.appstore)
              : [];
          return (
            // defaultValue는 마운트 때만 반영된다. 저장 후 새 값이 따라오도록 key로 remount한다
            <form
              key={`${s.name}|${s.keywords.join(',')}|${s.appstore?.appId ?? ''}|${s.googlePlay?.appId ?? ''}|${countries.join(',')}`}
              action={update?.[s.name]}
              className="svc-row"
            >
              <span className="badge svc">{s.name}</span>
              <KeywordField defaultValue={s.keywords.join(', ')} disabled={!update} />
              <input
                name="appstoreId"
                defaultValue={s.appstore?.appId ?? ''}
                placeholder="앱스토어 ID"
                inputMode="numeric"
                disabled={!update}
              />
              <input
                name="googlePlayId"
                defaultValue={s.googlePlay?.appId ?? ''}
                placeholder="구글플레이 패키지"
                disabled={!update}
              />
              {/* 국가마다 스토어를 따로 조회한다. 해외에 서비스하는 앱은 여기에 여러 개를 넣어야 반응이 다 들어온다 */}
              <CountryField defaultValue={countries.join(', ')} disabled={!update} />
              {update?.[s.name] && (
                <button type="submit" className="svc-save">
                  저장
                </button>
              )}
              {/* 마지막 하나는 지울 수 없다. 전부 지우면 수집 대상이 없어진다 */}
              {remove?.[s.name] && list.length > 1 && (
                <button
                  type="submit"
                  formAction={remove[s.name]}
                  className="svc-del"
                  formNoValidate
                >
                  삭제
                </button>
              )}
            </form>
          );
        })}
      </div>

      {add && (
        <form action={add} className="svc-add">
          <input name="name" placeholder="서비스 이름" maxLength={40} required />
          <input name="keywords" placeholder="검색 키워드 (쉼표로 구분)" required />
          <input name="appstoreId" placeholder="앱스토어 ID (선택)" inputMode="numeric" />
          <input name="googlePlayId" placeholder="구글플레이 패키지 (선택)" />
          <CountryField defaultValue="" />
          <button type="submit">추가</button>
        </form>
      )}

      {error && <p className="svc-error">{error}</p>}

      <p className="tagger-note">
        추가하면 다음 수집부터 반영됩니다. 앱 ID를 모르면 비워 두고 키워드만 넣어도 되고,
        터미널에서 <code>npm run find-app</code> 으로 찾을 수 있습니다. 지운 서비스의 기존 글은
        목록에 그대로 남습니다.
      </p>
    </section>
  );
}

function TaggerCard({
  status,
  cliPath,
  recheck,
  login,
  loginLaunch,
}: NonNullable<DashboardViewProps['tagger']>) {
  const mode = status ? (MODE_LABEL[status.mode] ?? { text: status.mode, tone: 'warn' as const }) : null;

  const fields = (
    <>
      <label>
        <span>모델</span>
        {/* defaultValue는 마운트 때만 적용된다. 저장 후 새 값이 반영되도록 key로 remount한다 */}
        <select
          key={status?.model ?? 'haiku'}
          name="model"
          defaultValue={status?.model ?? 'haiku'}
          disabled={!recheck}
        >
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
        disabled={!recheck}
      />
    </>
  );

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
            {status.cliFound && `, 로그인 ${status.loggedIn ? '됨' : '안 됨'}`}
            {status.loggedIn && `, 지정 ${status.model || '계정 기본값'}`}
            {/* haiku 같은 별칭은 버전을 감춘다. 실제로 무엇이 돌았는지는 이 값이 근거다 */}
            {status.resolvedModel && `, 실제 호출 ${status.resolvedModel}`}
            {status.apiKeySet && ', API 키 있음'}
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
            <li>브라우저에서 승인하면 인증 코드가 나옵니다. 그 코드를 터미널에 붙여넣고 Enter</li>
            <li>
              완료되면 이 카드가 자동으로 바뀝니다 (최대 90초 대기). 안 바뀌면 [다시 확인]을 누르세요
            </li>
          </ol>
          <p className="tagger-login-note">
            인증은 Claude CLI가 직접 처리합니다. 이 앱은 계정 정보나 인증 코드를 받지도 저장하지도 않습니다.
          </p>
        </div>
      )}

      {loginLaunch && !loginLaunch.launched && (
        <p className="tagger-cmd">
          터미널을 자동으로 열지 못했습니다{loginLaunch.error ? ` (${loginLaunch.error})` : ''}. 위 명령을
          직접 실행해 주세요.
        </p>
      )}

      {/*
        recheck가 없으면 읽기 전용이다 (둘러보기 화면).
        form으로 감싸 두면 action이 없어 버튼을 누를 때 현재 URL로 GET이 날아가 화면이
        초기화되므로, div로 바꾸고 입력을 잠근다. collect.save와 같은 규칙이다.
      */}
      {recheck ? (
        <form action={recheck} className="tagger-form">
          {fields}
          <button type="submit">저장하고 다시 확인</button>
        </form>
      ) : (
        <div className="tagger-form">{fields}</div>
      )}
      <p className="tagger-note">
        (최신)은 별칭이라 버전이 바뀝니다. 저장하면 실제 호출한 모델 ID가 위에 뜹니다.
      </p>
    </section>
  );
}

function fmt(iso?: string): string {
  if (!iso) return '-';
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
  if (!posted) return '-';
  const d = posted.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '-';
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
  prompt,
  briefing,
  nav,
  show,
  categoryHref,
  categoryChips,
  itemsFilterReset,
  collectProgress,
  countryChips,
  servicesAdmin,
}: DashboardViewProps) {
  const { stats, categories, items } = data;
  // show가 없으면 전부 표시 — 투어는 한 화면에서 모든 지점을 순회한다
  const vis = show ?? { brief: true, items: true, collect: true, settings: true };
  const nextRunAt =
    data.lastRunAt && data.intervalHours > 0
      ? new Date(Date.parse(data.lastRunAt) + data.intervalHours * 3_600_000).toISOString()
      : undefined;

  const tt = (name: string) => (tourMode ? name : undefined);

  /**
   * 서비스 칩. 목록 필터 줄과 브리핑 탭 양쪽에서 쓴다.
   *
   * 채널 요약도 서비스별로 갈리는데(getChannelSummaries가 service를 받는다) 칩이 목록 탭에만
   * 있어서, 브리핑에서 한 서비스만 보려면 목록으로 갔다가 칩을 누르고 다시 브리핑으로
   * 돌아와야 했다. 카드가 열 개를 넘으면 그 왕복이 화면을 읽는 것보다 오래 걸린다.
   */
  const serviceChips =
    services && services.options.length > 1 ? (
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
    ) : null;
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
      <header className="page-head">
        <h1>📡 {data.displayName} 피드백 레이더</h1>

        <div className="head-meta">
          <span className="head-label">{data.keywordsLabel ?? '키워드'}</span>
          {data.keywords.map((k) => (
            <span key={k} className="badge svc">
              {k}
            </span>
          ))}
          {/*
            오늘 날짜는 헤더에 두지 않는다. 바로 아래 스케줄러 줄이 마지막·다음 실행 날짜를
            보여주고 있어 같은 정보가 두 번 나온다. data.today는 통계와 브리핑 기준일로만 쓴다.
          */}
          {/*
            어떤 모델이 실제로 돌았는지를 상시 노출한다.
            haiku·sonnet·opus는 별칭이라 지정값만으로는 어떤 버전이 돌았는지 알 수 없고,
            그 값이 설정 카드 안에만 있으면 "opus를 골랐는데 정말 opus가 돌았나"를 확인할
            방법이 없다. 눌러 설정 탭으로 갈 수 있게 링크로 둔다.
          */}
          {tagger?.status && (
            <a
              className={`head-ai ${MODE_LABEL[tagger.status.mode]?.tone ?? 'warn'}`}
              href={nav ? nav.href('settings') : '#'}
              title={
                tagger.lastUsage
                  ? `마지막 분류 ${fmt(tagger.lastUsage.at)}, ${tagger.lastUsage.items.toLocaleString()}건, ` +
                    `입력 ${tagger.lastUsage.inputTokens.toLocaleString()} / 출력 ${tagger.lastUsage.outputTokens.toLocaleString()} 토큰` +
                    // 캐시가 맞고 있는지는 이 두 값을 나란히 봐야 알 수 있다. 읽기가 계속 0이면
                    // 프롬프트 앞부분이 매번 달라진다는 뜻이고 입력을 전액 다시 결제하는 셈이다.
                    (tagger.lastUsage.cacheReadTokens
                      ? `, 캐시 읽기 ${tagger.lastUsage.cacheReadTokens.toLocaleString()} / 쓰기 ${(tagger.lastUsage.cacheCreationTokens ?? 0).toLocaleString()}`
                      : '') +
                    (tagger.lastUsage.costUsd > 0
                      ? `, 환산 $${tagger.lastUsage.costUsd.toFixed(4)} (구독이면 실청구 0)`
                      : '') +
                    `\n${tagger.status.hint}`
                  : tagger.status.hint
              }
            >
              {tagger.status.mode === 'heuristic'
                ? 'AI 미사용 (키워드 규칙)'
                : `AI ${tagger.status.model || '계정 기본값'}`}
              {/*
                실제로 응답한 정식 모델 ID. 마지막 분류 기록이 있으면 그게 사실이고,
                없으면(아직 한 번도 안 돌렸으면) 진단 시점의 값으로 대신한다.
              */}
              {(tagger.lastUsage?.models[0] ?? tagger.status.resolvedModel) && (
                <span className="head-ai-real">
                  → {tagger.lastUsage?.models.join(', ') ?? tagger.status.resolvedModel}
                </span>
              )}
            </a>
          )}
        </div>

      </header>

      {nav && (
        <nav className="viewtabs">
          {nav.items.map((t) => (
            <a key={t.key} className={nav.active === t.key ? 'on' : undefined} href={nav.href(t.key)}>
              {t.label}
            </a>
          ))}
        </nav>
      )}

      <section className="scheduler" data-tour={tt('scheduler')}>
        <div className="scheduler-status">
          <span className={`dot ${data.isRunning ? 'on' : ''}`} />
          {data.isRunning
            ? // 중단은 배치 경계에서만 듣는다. 누른 뒤에도 한동안 도는 것이 정상임을 밝혀 둔다
              data.cancelRequested
              ? '중단 요청됨. 지금 보낸 호출이 끝나면 멈춥니다'
              : '수집 실행 중…'
            : data.runQueued
              ? '실행 대기 중 (30초 이내 시작)'
              : auto
                ? `대기 중 (마지막 실행 ${fmt(data.lastRunAt)}, 다음 ${fmt(nextRunAt)})`
                : `자동 수집 꺼짐 (마지막 실행 ${fmt(data.lastRunAt)}). [지금 실행]으로만 수집합니다`}
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
              {/*
                도는 동안에만 나타난다. 프로세스를 죽이는 버튼이 아니라 다음 배치를 보내지
                말라는 신호라서, 이미 분류한 건은 저장된 채로 남는다.
              */}
              {actions.requestCancelRun && (data.isRunning || data.runQueued) && (
                <form action={actions.requestCancelRun}>
                  <button type="submit" className="danger" disabled={data.cancelRequested}>
                    {data.cancelRequested ? '중단 중…' : '중단'}
                  </button>
                </form>
              )}
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
        {/*
          중단은 실패가 아니다. 같은 빨간 칸에 넣으면 오류가 난 것처럼 읽히고, 남은 건을
          어떻게 처리하는지도 알 수 없다. 문구를 갈라서 다음 행동까지 적어 준다.
        */}
        {data.lastRunStatus && data.lastRunStatus !== 'ok' && (
          <div
            className={
              data.lastRunStatus.startsWith('cancelled') ? 'scheduler-note' : 'scheduler-error'
            }
          >
            {data.lastRunStatus.startsWith('cancelled')
              ? '지난 실행을 중단했습니다. [지금 실행]을 다시 누르면 남은 건부터 이어서 분류합니다'
              : data.lastRunStatus}
          </div>
        )}
      </section>

      {/*
        수집이 도는 동안에는 탭과 무관하게 띄운다. 수십 분 걸리는 작업이라 어느 화면에
        있든 진행 상황이 보여야 한다. 끝난 뒤에는 수집 탭에서 지난 기록으로 남는다.
      */}
      {collectProgress && (collectProgress.running || vis.collect) && (
        <CollectProgress {...collectProgress} />
      )}

      {/*
        브리핑 탭에서도 서비스를 좁힐 수 있게 한다. 목록 탭에서는 아래 필터 줄이 같은 칩을
        이미 보여주므로 그때는 내지 않는다 (같은 칩이 한 화면에 두 벌 나오면 어느 쪽이
        지금 상태인지 헷갈린다).
      */}
      {vis.brief && !vis.items && serviceChips && <div className="filters">{serviceChips}</div>}

      {/* 목록보다 위에 둔다. 50건을 훑기 전에 '무슨 일이 있었나'를 먼저 알아야 한다 */}
      {vis.brief && briefing && <BriefingCard {...briefing} />}

      {/* 무엇을 추적할지가 수집량 설정보다 상위 결정이라 위에 둔다 */}
      {vis.settings && servicesAdmin && <ServicesCard {...servicesAdmin} />}

      {vis.settings && collect && <CollectCard {...collect} />}

      {/* 수집량 다음에 둔다. 무엇을 얼마나 가져올지 정한 뒤에 그것을 어떻게 판정할지 정한다 */}
      {vis.settings && prompt && <PromptCard {...prompt} />}

      {vis.settings && tagger && <TaggerCard {...tagger} />}

      {vis.brief && (
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
      )}

      {vis.brief && categories.length > 0 && (
        <div data-tour={tt('categories')}>
          {/*
            건수는 '오늘 수집한 글' 기준이고(collected_at), 목록의 기간 필터는 '작성일'
            기준이다(posted_at). 그래서 카테고리 링크에 기간을 걸면 앞뒤가 안 맞는다.
            앱 리뷰는 오늘 수집해도 작성일이 몇 달 전인 게 흔해서 목록이 0건으로 나온다.
            링크는 기간을 풀고 카테고리만 걸어 '그 카테고리 글 전체'를 보여준다.
          */}
          <h2>
            오늘 수집된 글의 카테고리
            {categoryHref && (
              <span className="h2-note">누르면 그 카테고리 글 전체를 봅니다 (기간 무관)</span>
            )}
          </h2>
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
                  <td>
                    {categoryHref ? (
                      <a className="cat-link" href={categoryHref(c.category)}>
                        {c.category}
                      </a>
                    ) : (
                      c.category
                    )}
                  </td>
                  <td>{c.count}</td>
                  <td className={c.negative > 0 ? 'sentiment-negative' : ''}>{c.negative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vis.items && (
        <h2>
          {itemsHeading}
          {/*
            채널과 감성 필터는 칩이 없다(브리핑 카드에서 링크로만 들어온다). 해제 수단이
            없으면 사용자가 좁혀진 목록에 갇히고, 되돌리려면 URL을 직접 고쳐야 한다.
          */}
          {itemsFilterReset && (
            <a className="filter-reset" href={itemsFilterReset}>
              필터 해제
            </a>
          )}
        </h2>
      )}

      {/*
        라벨과 버튼을 한 그리드에 넣어 두 줄의 시작점을 맞춘다.
        라벨을 각 줄 안에 두면 글자 수만큼 버튼이 밀려 위아래가 어긋난다.
      */}
      {vis.items &&
        (tabs ||
          periods ||
          categoryChips ||
          (countryChips && countryChips.options.length > 0) ||
          (services && services.options.length > 1)) && (
        <div className="filters">
          {categoryChips && categoryChips.options.length > 1 && (
            <>
              <span className="filter-label">카테고리</span>
              <div className="chips">
                <a className={!categoryChips.active ? 'on' : ''} href={categoryChips.href()}>
                  전체 <span className="n">{categoryChips.total.toLocaleString()}</span>
                </a>
                {categoryChips.options.map((c) => (
                  <a
                    key={c.name}
                    className={categoryChips.active === c.name ? 'on' : ''}
                    href={categoryChips.href(c.name)}
                  >
                    {c.name} <span className="n">{c.count.toLocaleString()}</span>
                  </a>
                ))}
              </div>
            </>
          )}

          {serviceChips}

          {countryChips && countryChips.options.length > 0 && (
            <>
              <span className="filter-label">국가</span>
              <div className="chips" data-tour={tt('countries')}>
                <a className={!countryChips.active ? 'on' : ''} href={countryChips.href()}>
                  전체 <span className="n">{countryChips.total.toLocaleString()}</span>
                </a>
                {countryChips.options.map((c) => (
                  <a
                    key={c.country}
                    className={countryChips.active === c.country ? 'on' : ''}
                    href={countryChips.href(c.country)}
                    title={`${countryName(c.country)}, 부정 ${c.negative.toLocaleString()}건`}
                  >
                    {countryFlag(c.country)} {countryName(c.country)}{' '}
                    <span className="n">{c.count.toLocaleString()}</span>
                  </a>
                ))}
                <span className="tabs-note">
                  스토어 국가가 있는 앱 리뷰만 셉니다. 국가를 고르면 커뮤니티 글은 빠집니다
                </span>
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
                  {periods.undated > 0 && `, 날짜를 못 가져온 ${periods.undated.toLocaleString()}건은 '전체'에서만 보입니다`}
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
                    : 'AI가 우리 서비스와 무관하다고 판단한 글입니다. 판정이 맞는지 확인용'}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {!vis.items ? null : items.length === 0 ? (
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
                    <span className="badge svc">{it.service ?? '-'}</span>
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
                  {it.sentiment ? SENTIMENT_LABEL[it.sentiment] : '-'}
                </td>
                <td>{it.category ?? '-'}</td>
                <td>{it.severity ? <span className={`badge ${it.severity}`}>{it.severity}</span> : '-'}</td>
                <td>{it.team ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vis.items && pager && pager.pageCount > 1 && (
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

      {/* 둘러보기와 발표 슬라이드 링크. 매일 쓰는 기능이 아니라 맨 아래에 둔다 */}
      {links && <footer className="page-foot">{links}</footer>}
    </main>
  );
}
