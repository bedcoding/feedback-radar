'use client';

/**
 * 슬라이드 공용 내비게이션 — /deck(개발자용)과 /pitch(발표용)가 함께 쓴다.
 * 키보드 이동, URL 해시 동기화, 목차 오버레이, 진행 바, 하단 바가 여기 모여 있다.
 */

import { useCallback, useEffect, useState } from 'react';

export interface DeckNav {
  idx: number;
  total: number;
  go: (next: number) => void;
  overview: boolean;
  setOverview: (v: boolean) => void;
}

export function useDeckNav(total: number): DeckNav {
  const [idx, setIdx] = useState(0);
  const [overview, setOverview] = useState(false);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setIdx(clamped);
      setOverview(false);
      if (typeof window !== 'undefined') window.location.hash = String(clamped + 1);
    },
    [total],
  );

  // 새로고침해도 같은 슬라이드 유지 (#N)
  useEffect(() => {
    const fromHash = Number(window.location.hash.slice(1));
    if (Number.isInteger(fromHash) && fromHash >= 1 && fromHash <= total) setIdx(fromHash - 1);
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') go(idx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(idx - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(total - 1);
      else if (e.key === 'g' || e.key === 'G') setOverview((v) => !v);
      else if (e.key === 'Escape') setOverview(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, go, total]);

  return { idx, total, go, overview, setOverview };
}

/** 진행 바 — 슬라이드보다 먼저 렌더해야 한다 */
export function DeckProgress({ nav }: { nav: DeckNav }) {
  return <div className="deck-progress" style={{ width: `${((nav.idx + 1) / nav.total) * 100}%` }} />;
}

/** 목차 오버레이 + 하단 바 — 슬라이드 뒤에 렌더한다 */
export function DeckChrome({ nav, titles, label }: { nav: DeckNav; titles: string[]; label: string }) {
  const { idx, total, go, overview, setOverview } = nav;
  return (
    <>
      {overview && (
        <div className="deck-overview" onClick={() => setOverview(false)}>
          <h2>
            목차 {idx + 1} / {total}
          </h2>
          <ol>
            {titles.map((t, i) => (
              <li
                key={t}
                className={i === idx ? 'current' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  go(i);
                }}
              >
                {t}
              </li>
            ))}
          </ol>
        </div>
      )}

      <footer className="deck-footer">
        <span>
          {label}, <kbd>G</kbd> 목차
        </span>
        <div className="nav-btns">
          <button onClick={() => go(idx - 1)}>← 이전</button>
          <span style={{ alignSelf: 'center' }}>
            {idx + 1} / {total}
          </span>
          <button onClick={() => go(idx + 1)}>다음 →</button>
        </div>
      </footer>
    </>
  );
}
