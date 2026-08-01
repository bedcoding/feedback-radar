'use client';

/**
 * 제품 투어 오버레이 — 실제 대시보드 UI 위에 스포트라이트와 설명을 얹는다.
 *
 * 슬라이드로 기능을 설명하는 대신 진짜 화면을 짚어 가며 보여주려는 것이라,
 * 강조 지점은 화면 요소의 실제 위치(getBoundingClientRect)를 그대로 따라간다.
 * 어두운 배경은 큰 box-shadow로 만든다 — 구멍 뚫린 마스크를 따로 그리지 않아도
 * 강조 영역만 밝게 남는다.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import './tour.css';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface TourStep {
  /** 강조할 요소의 data-tour 값. 없으면 화면 중앙 카드로 표시한다 */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** 설명 카드 위치 (기본: 자동) */
  placement?: 'top' | 'bottom';
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 10;
const CARD_W = 380;
const GAP = 16;
/** 강조 영역이 화면을 다 덮으면 설명 카드를 놓을 자리가 없다. 세로로 이만큼까지만 잡는다 */
const MAX_SPOT_RATIO = 0.56;

export function TourOverlay({ steps }: { steps: TourStep[] }) {
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef(-1);

  const step = steps[idx];

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    // 화면 밖으로 벗어난 부분은 잘라 낸다 — 목록처럼 긴 요소를 통째로 강조하면
    // 어두운 영역이 사라져 오히려 무엇을 가리키는지 알 수 없다.
    const top = clamp(r.top - PAD, GAP, vh - GAP);
    const bottom = clamp(r.bottom + PAD, top, vh - GAP);
    const height = Math.min(bottom - top, vh * MAX_SPOT_RATIO);
    setRect({ top, left: r.left - PAD, width: r.width + PAD * 2, height });
  }, [step]);

  // 카드 높이를 실측해야 화면 밖으로 나가지 않게 위치를 잡을 수 있다
  useLayoutEffect(() => {
    setCardH(cardRef.current?.offsetHeight ?? 0);
  }, [idx, rect]);

  // 강조 대상이 화면 밖이면 먼저 스크롤한다. 단계당 한 번만 — 매 측정마다 스크롤하면 흔들린다.
  useLayoutEffect(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (el && scrolledFor.current !== idx) {
      scrolledFor.current = idx;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    measure();
    const t = setTimeout(measure, 420); // 스크롤 애니메이션이 끝난 뒤 위치 보정
    return () => clearTimeout(t);
  }, [idx, step, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  const go = useCallback(
    (next: number) => {
      if (next >= steps.length) return setDone(true);
      setIdx(Math.max(0, next));
    },
    [steps.length],
  );

  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'Escape') setDone(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, go, done]);

  if (done) {
    return (
      <button className="tour-restart" onClick={() => { setDone(false); setIdx(0); scrolledFor.current = -1; }}>
        ↻ 둘러보기 다시 시작
      </button>
    );
  }
  if (!step) return null;

  // 카드 위치: 강조 영역 아래를 우선하되, 공간이 부족하면 위로 올리고,
  // 어느 쪽도 안 되면 화면 안에 들어오도록 강제로 붙인다.
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  let cardStyle: React.CSSProperties;
  if (!rect) {
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 520 };
  } else {
    const h = cardH || 220; // 첫 렌더에는 실측값이 없어 대략치로 시작한다
    const spotBottom = rect.top + rect.height;
    const fitsBelow = spotBottom + GAP + h <= vh - GAP;
    const fitsAbove = rect.top - GAP - h >= GAP;
    const place = step.placement ?? (fitsBelow ? 'bottom' : fitsAbove ? 'top' : 'bottom');
    const desiredTop = place === 'bottom' ? spotBottom + GAP : rect.top - GAP - h;
    cardStyle = {
      top: clamp(desiredTop, GAP, Math.max(GAP, vh - h - GAP)),
      left: clamp(rect.left, GAP, Math.max(GAP, vw - CARD_W - GAP)),
      width: CARD_W,
    };
  }

  return (
    <div className="tour-root">
      {rect ? (
        <div
          className="tour-spot"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="tour-scrim" />
      )}

      <div ref={cardRef} className={`tour-card ${rect ? '' : 'center'}`} style={cardStyle}>
        <div className="tour-step-no">
          {idx + 1} / {steps.length}
        </div>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          {idx > 0 && (
            <button className="ghost" onClick={() => go(idx - 1)}>
              이전
            </button>
          )}
          <button className="primary" onClick={() => go(idx + 1)}>
            {idx === steps.length - 1 ? '끝내기' : '다음'}
          </button>
        </div>
      </div>

      <div className="tour-bar">
        <button className="ghost" onClick={() => setDone(true)}>
          SKIP
        </button>
        <div className="tour-dots">
          {steps.map((s, i) => (
            <button
              key={s.title}
              className={`dot ${i === idx ? 'on' : ''}`}
              aria-label={`${i + 1}단계: ${s.title}`}
              onClick={() => {
                scrolledFor.current = -1;
                setIdx(i);
              }}
            />
          ))}
        </div>
        <button className="ghost" onClick={() => go(idx + 1)}>
          다음 ›
        </button>
      </div>
    </div>
  );
}
