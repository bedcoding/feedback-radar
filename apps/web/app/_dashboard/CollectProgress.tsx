'use client';

import { useEffect } from 'react';
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

export function CollectProgress({
  tasks,
  running,
}: {
  tasks: CollectTaskView[];
  /** 스케줄러가 지금 돌고 있는지. 돌 때만 새로고침한다 */
  running: boolean;
}) {
  const router = useRouter();

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

  if (tasks.length === 0) return null;

  // 끝난 것을 위에, 진행 중을 가운데, 대기를 아래에 둔다. 목록이 위에서 아래로 채워진다.
  const finished = tasks.filter((t) => t.state !== 'pending' && t.state !== 'running');
  const inFlight = tasks.filter((t) => t.state === 'running');
  const waiting = tasks.filter((t) => t.state === 'pending');
  const pct = Math.round((finished.length / tasks.length) * 100);

  const newTotal = tasks.reduce((n, t) => n + (t.inserted ?? 0), 0);

  return (
    <section className="cp">
      <div className="cp-head">
        <span className="cp-title">{running ? '수집 진행' : '지난 수집'}</span>
        <span className="cp-count">
          {finished.length} / {tasks.length}
        </span>
        <div className="cp-bar" title={`${pct}%`}>
          <span className="cp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="cp-pct">{pct}%</span>
        {newTotal > 0 && <span className="cp-new">신규 {newTotal.toLocaleString()}건</span>}
      </div>

      {/* 지금 무엇을 하고 있는지 한 줄로 먼저 알려 준다. 목록을 훑지 않아도 되게 */}
      {inFlight.length > 0 && (
        <p className="cp-now">
          현재 진행 중: {inFlight.map(taskName).join(', ')}
        </p>
      )}

      <ul className="cp-list">
        {[...finished, ...inFlight, ...waiting].map((t) => (
          <li key={t.seq} className={`cp-item ${t.state}`}>
            <span className="cp-mark">{MARK[t.state]}</span>
            <span className="cp-name">{taskName(t)}</span>
            <span className="cp-result">{taskResult(t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
