'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { flag, regionName, sourceLabel } from './labels';

/**
 * 수집 작업별 진행 상태.
 *
 * 한 번 수집하면 서비스와 소스와 국가를 조합한 작업이 수십 개 돌고, 브라우저 스크래핑이
 * 섞여 있어 몇 분씩 걸린다. 그동안 화면에 '실행 중' 한 줄만 뜨면 멈춘 것과 구별되지 않고,
 * 어느 국가까지 갔는지 무엇이 남았는지도 알 수 없다. 작업 단위로 갈라 보여준다.
 *
 * 작업은 병렬로 돌기 때문에 '진행 중'이 여러 개일 수 있다. 순차로 바꾸면 목록이 한 줄씩
 * 예쁘게 흐르지만 전체 시간이 작업 수만큼 늘어난다.
 */
export interface CollectTaskView {
  seq: number;
  service: string;
  source: string;
  country: string;
  state: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  collected?: number;
  inserted?: number;
  note?: string;
}

/**
 * 상태 표시 기호. 가운뎃점과 줄표는 쓰지 않는다 (화면 전체에서 빼기로 한 기호들이다).
 */
const MARK: Record<CollectTaskView['state'], string> = {
  done: '✓',
  running: '▶',
  failed: '✕',
  skipped: '⊘',
  pending: '○',
};

/** 밀리초를 사람이 읽는 길이로. 40분짜리 실행과 3분짜리를 한눈에 갈라 보게 한다 */
function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 ${s % 60}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

function taskName(t: CollectTaskView): string {
  const parts = [t.service, sourceLabel(t.source)].filter(Boolean);
  const name = parts.join(' ');
  if (!t.country) return name;
  const f = flag(t.country);
  return `${name} ${f ? `${f} ` : ''}${regionName(t.country)}`;
}

/** 오른쪽에 붙는 결과 문구 */
function taskResult(t: CollectTaskView): string {
  switch (t.state) {
    case 'done':
      // 수집 건수와 신규 건수를 같이 보여준다. 이미 있는 글은 UNIQUE로 걸러지므로
      // "200건 수집, 신규 0건"이 정상인 경우가 있고, 그게 이상 신호가 아님을 알아야 한다.
      return `${(t.collected ?? 0).toLocaleString()}건 수집, 신규 ${(t.inserted ?? 0).toLocaleString()}건`;
    case 'running':
      return '수집 중';
    case 'pending':
      return '대기';
    case 'failed':
      return t.note ? `실패: ${t.note}` : '실패';
    case 'skipped':
      return t.note ?? '건너뜀';
  }
}

/**
 * 지금 돌고 있는 단계. 수집이 끝난 뒤에도 분류가 수십 분 이어지는데, 그 구간에
 * 아무 표시가 없으면 멈춘 것과 구별되지 않는다.
 */
export interface RunPhase {
  /** 'collect' | 'tag' | 'brief' | 'cancelled' */
  key: string;
  label: string;
  done: number;
  total: number;
}

/**
 * 지금 보내고 있는 LLM 호출.
 *
 * core의 TagCall과 같은 모양이지만 여기서 다시 적는다. 이 파일은 클라이언트 컴포넌트라
 * core를 import하면 fs와 better-sqlite3가 브라우저 번들에 딸려 온다.
 */
export interface TagCallView {
  index: number;
  total: number;
  items: number;
  chars: number;
  instructions: string;
  lines: { id: number; source: string; text: string }[];
  usageSoFar?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cacheReadTokens?: number;
  };
}

export function CollectProgress({
  tasks,
  running,
  phase,
  call,
  elapsedMs = 0,
}: {
  tasks: CollectTaskView[];
  /** 스케줄러가 지금 돌고 있는지. 돌 때만 새로고침한다 */
  running: boolean;
  phase?: RunPhase;
  call?: TagCallView;
  /** 도는 중이면 지금까지, 끝났으면 총 소요 시간 */
  elapsedMs?: number;
}) {
  const router = useRouter();

  /**
   * 경과 시간을 1초마다 흐르게 한다.
   *
   * 서버가 준 값을 그대로 쓰면 2초 폴링 주기에 맞춰 숫자가 뛰어서 멈춘 것처럼 보인다.
   * 서버값을 기준점으로 두고 여기서 초를 더한다. 폴링이 새 값을 가져오면 기준점이
   * 갱신되며 더한 값은 0으로 돌아가므로, 시간이 흘러도 실제 시각과 어긋나지 않는다.
   * (Date.now()를 초기값으로 쓰면 서버 렌더와 값이 달라 hydration 경고가 난다.)
   */
  const [ticked, setTicked] = useState(0);
  useEffect(() => {
    setTicked(0);
    if (!running) return;
    const timer = setInterval(() => setTicked((n) => n + 1000), 1000);
    return () => clearInterval(timer);
  }, [running, elapsedMs]);
  const shownMs = elapsedMs > 0 ? elapsedMs + (running ? ticked : 0) : 0;

  /**
   * 수집 중일 때만 폴링한다.
   *
   * 이 화면은 서버 컴포넌트가 DB를 읽어 만들기 때문에, 새로 그리려면 서버에 다시 물어야
   * 한다. 끝난 뒤에도 계속 새로고침하면 서버 렌더가 헛돌고 SQLite를 2초마다 읽는다.
   */
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(timer);
  }, [running, router]);

  /**
   * 아직 한 번도 수집하지 않았으면 빈 카드를 보여준다.
   *
   * 카드를 통째로 숨기면 이 화면이 어디에 있는지조차 알 수 없다. 자리와 함께
   * 무엇을 눌러야 채워지는지 알려 주는 편이 낫다.
   */
  if (tasks.length === 0) {
    return (
      <section className="cp">
        <div className="cp-head">
          <span className="cp-title">수집 진행</span>
        </div>
        <p className="cp-empty">
          아직 수집 기록이 없습니다. 위의 [지금 실행]을 누르면 서비스와 채널과 국가를 조합한
          작업이 여기에 하나씩 나타나고, 끝난 것과 진행 중인 것과 남은 것이 갈려 보입니다.
        </p>
      </section>
    );
  }

  /**
   * 건너뛴 작업은 진행률의 분모에서 뺀다.
   *
   * appId가 없어 건너뛴 것은 '처리됨'이지 '수집됨'이 아니다. 완료로 세면 시작도 안 한
   * 시점에 3/30이 찍혀서, 그 3이 수집을 마친 작업으로 읽힌다.
   */
  const finished = tasks.filter((t) => t.state === 'done' || t.state === 'failed');
  const inFlight = tasks.filter((t) => t.state === 'running');
  const waiting = tasks.filter((t) => t.state === 'pending');
  const skipped = tasks.filter((t) => t.state === 'skipped');
  const target = tasks.length - skipped.length;
  const pct = target > 0 ? Math.round((finished.length / target) * 100) : 100;

  const newTotal = tasks.reduce((n, t) => n + (t.inserted ?? 0), 0);

  /**
   * 분류 단계로 넘어갔는지.
   *
   * 넘어갔으면 화면의 주인공이 바뀐다. 수집은 1분이면 끝나는데 분류는 수십 분이 걸리므로,
   * 끝난 수집 작업 서른 줄이 위를 차지하고 정작 도는 단계가 한 줄로 남으면 "뭘 하는지
   * 모르겠다"가 된다. 분류 카드를 맨 위로 올리고 수집 목록은 접어 둔다.
   */
  const tagging = Boolean(phase && phase.key !== 'collect' && phase.total > 0);

  const elapsedLabel = shownMs > 0 ? `${duration(shownMs)} ${running ? '경과' : '소요'}` : null;

  // 수집 진행 바. 접힌 상태에서는 summary가 이 역할을 대신한다
  const collectHead = (
    <div className="cp-head">
      <span className="cp-title">{running ? '수집 진행' : '지난 수집'}</span>
      <span className="cp-count">
        {finished.length} / {target}
        {skipped.length > 0 && <span className="cp-skip"> (건너뜀 {skipped.length})</span>}
      </span>
      <div className="cp-bar" title={`${pct}%`}>
        <span className="cp-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="cp-pct">{pct}%</span>
      {newTotal > 0 && <span className="cp-new">신규 {newTotal.toLocaleString()}건</span>}
      {/* 분류가 도는 중이면 시간은 아래 분류 줄이 맡는다. 두 곳에 같은 값을 두지 않는다 */}
      {!tagging && elapsedLabel && <span className="cp-elapsed">{elapsedLabel}</span>}
    </div>
  );

  const collectList = (
    <>
      {/*
        지금 무엇을 하고 있는지 한 줄로 알려 준다. 다만 작업이 병렬로 돌아 거의 전부가
        동시에 '진행 중'이 되므로, 이름을 다 나열하면 줄이 화면을 덮고 아래 목록과 겹친다.
        셋을 넘으면 개수만 적는다. 어느 작업인지는 아래 목록의 기호로 이미 보인다.
      */}
      {inFlight.length > 0 && (
        <p className="cp-now">
          현재 진행 중:{' '}
          {inFlight.length <= 3
            ? inFlight.map(taskName).join(', ')
            : `${inFlight.length}개 동시 진행`}
        </p>
      )}

      {/* 건너뛴 것은 맨 아래로 보낸다. 시작하지도 않은 작업이 목록 위를 차지하면 안 된다 */}
      <ul className="cp-list">
        {[...finished, ...inFlight, ...waiting, ...skipped].map((t) => (
          <li key={t.seq} className={`cp-item ${t.state}`}>
            <span className="cp-mark">{MARK[t.state]}</span>
            <span className="cp-name">{taskName(t)}</span>
            <span className="cp-result">{taskResult(t)}</span>
          </li>
        ))}
      </ul>
    </>
  );

  const tagBlock = (
    <>
      {/*
        분류·브리핑 단계의 진행. 실행 시간의 대부분이 여기 들어가므로 이 줄이 없으면
        수집이 끝난 뒤부터 화면이 멈춘 것처럼 보인다.
        수집 단계는 위 진행 바와 겹치므로 제외한다.
      */}
      {phase && phase.key !== 'collect' && phase.total > 0 && (
        <div className="cp-head">
          <span className="cp-title">{phase.label}</span>
          <span className="cp-count">
            {phase.done.toLocaleString()} / {phase.total.toLocaleString()}
          </span>
          <div className="cp-bar">
            <span
              className="cp-bar-fill"
              style={{ width: `${Math.round((phase.done / phase.total) * 100)}%` }}
            />
          </div>
          <span className="cp-pct">{Math.round((phase.done / phase.total) * 100)}%</span>
          {elapsedLabel && <span className="cp-elapsed">{elapsedLabel}</span>}
        </div>
      )}

      {/*
        지금 보내고 있는 호출. 응답 하나에 1분 넘게 걸리는데 그동안 화면에 진행 바만
        있으면 무엇을 근거로 판정하는지 알 수 없다. 담긴 글과 지시문을 함께 보여주면
        결과를 믿을지 판단할 근거가 생기고, 프롬프트를 고칠 단서도 남는다.
      */}
      {call && (
        <div className="cp-call">
          <div className="cp-call-head">
            <span className="cp-call-title">지금 보내는 중</span>
            <span className="cp-call-meta">
              {call.index} / {call.total}번째 호출, 글 {call.items}건을 한 번에,{' '}
              {call.chars.toLocaleString()}자
            </span>
            {call.usageSoFar && call.usageSoFar.inputTokens > 0 && (
              <span className="cp-call-usage">
                여기까지 입력 {call.usageSoFar.inputTokens.toLocaleString()} / 출력{' '}
                {call.usageSoFar.outputTokens.toLocaleString()} 토큰
                {call.usageSoFar.cacheReadTokens
                  ? `, 캐시 재사용 ${call.usageSoFar.cacheReadTokens.toLocaleString()}`
                  : ''}
                {call.usageSoFar.costUsd > 0
                  ? `, 환산 $${call.usageSoFar.costUsd.toFixed(4)}`
                  : ''}
              </span>
            )}
          </div>

          <ul className="cp-call-lines">
            {call.lines.map((l) => (
              <li key={l.id}>
                <span className="cp-call-src">{sourceLabel(l.source)}</span>
                <span className="cp-call-text">{l.text}</span>
              </li>
            ))}
          </ul>

          {/*
            지시문은 호출마다 글자 하나까지 같다. 접어 두되 펼치면 전문이 보이게 한다.
            open을 React가 제어하면 2초 폴링마다 다시 열려서 사용자가 닫을 수 없다.
          */}
          <details className="cp-call-prompt">
            <summary>
              분류 지시문 보기 (호출마다 동일, {call.instructions.length.toLocaleString()}자)
            </summary>
            <pre>{call.instructions}</pre>
          </details>
        </div>
      )}
    </>
  );

  /**
   * 수집과 분류를 별개 카드로 나눈다.
   *
   * 한 카드에 담으면 두 단계의 진행 바가 붙어 있어 어느 쪽이 도는지 헷갈리고, 끝난 수집
   * 목록이 도는 분류 위를 차지한다. 카드를 갈라 놓으면 분류가 시작될 때 그 카드가 위로
   * 올라오고 수집 카드는 접힌 요약 한 줄로 물러난다.
   */
  return (
    <>
      {/*
        투어가 가리키는 지점을 분류 카드에 둔다. 이 도구가 실제로 무엇을 하는지(지금 어느 글을
        판정에 넣고 있는지)가 가장 잘 드러나는 자리다. 분류 카드가 없는 상태(대기 중)에서는
        아래 수집 카드가 그 역할을 맡는다.
      */}
      {(tagging || call) && (
        <section className="cp cp-tagcard" data-tour="progress">
          {tagBlock}
        </section>
      )}

      <section className="cp" data-tour={tagging || call ? undefined : 'progress'}>
        {tagging ? (
          // 끝난 수집은 접는다. 서른 줄이 도는 단계 위를 차지하면 안 된다
          <details className="cp-past">
            <summary>
              수집 {finished.length} / {target} 완료
              {skipped.length > 0 && ` (건너뜀 ${skipped.length})`}
              {newTotal > 0 && `, 신규 ${newTotal.toLocaleString()}건`}
            </summary>
            {collectHead}
            {collectList}
          </details>
        ) : (
          <>
            {collectHead}
            {collectList}
          </>
        )}
      </section>
    </>
  );
}
