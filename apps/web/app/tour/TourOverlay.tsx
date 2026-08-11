'use client';

/**
 * 제품 투어 오버레이: 실제 대시보드 UI 위에 스포트라이트와 설명을 얹는다.
 *
 * 슬라이드로 기능을 설명하는 대신 진짜 화면을 짚어 가며 보여주려는 것이라,
 * 강조 지점은 화면 요소의 실제 위치(getBoundingClientRect)를 그대로 따라간다.
 * 어두운 배경은 큰 box-shadow로 만든다. 구멍 뚫린 마스크를 따로 그리지 않아도
 * 강조 영역만 밝게 남는다.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import './tour.css';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface TourStep {
  /** 강조할 요소의 data-tour 값. 없으면 화면 중앙 카드로 표시한다 */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** 설명 카드 위치 (기본: 자동) */
  placement?: 'top' | 'bottom';
  /**
   * 이 단계를 보여줄 탭. 지정하면 단계로 넘어갈 때 그 탭으로 이동한다.
   *
   * 예전에는 둘러보기가 모든 탭을 한 페이지에 쌓아 놓고 스크롤로 순회했다. 오버레이
   * 입장에서는 편하지만, **실제 화면은 탭마다 내용이 갈리므로 발표에서 보여준 구성과
   * 사용자가 실제로 만나는 구성이 달라진다.** 발표 자료가 실물과 다르면 그게 가장 나쁜
   * 결함이라, 단계마다 실제 탭을 따라가게 한다.
   */
  tab?: 'brief' | 'items' | 'collect' | 'settings';
  /**
   * 탭에 처음 들어가는 장. 그 탭이 통째로 어떤 화면인지 먼저 보여준다.
   *
   * 세부 단계는 요소 하나를 확대하고 나머지를 어둡게 덮는다. 탭이 바뀐 직후에 그걸 하면
   * 방금 들어온 화면의 전체 모습을 볼 기회가 없다. 그래서 이 장에서는 강조 구멍을 뚫지
   * 않고 배경을 옅게만 덮고, 카드를 아래쪽에 눕혀 화면 위쪽을 비운다.
   */
  tabIntro?: boolean;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 탭 이름. 화면의 탭 라벨과 같아야 한다 (page.tsx의 nav.items).
 *
 * 다음 단계가 다른 탭이면 카드에 미리 알린다. 예고 없이 화면이 바뀌면 보는 사람은 무엇
 * 때문에 바뀌었는지 모른 채 따라가야 하고, 발표에서는 설명이 끊긴다.
 */
const TAB_LABEL: Record<string, string> = {
  brief: '브리핑',
  items: '목록',
  collect: '수집',
  settings: '설정',
};

const PAD = 10;
/**
 * 설명 카드 너비.
 *
 * 380px일 때 한국어 본문이 줄마다 끊겨 세로로 길어졌고, 그 길이가 아래 조작 바를 덮었다.
 * 넓히면 줄 수가 줄어 그 두 문제가 함께 풀린다.
 */
const CARD_W = 560;
const GAP = 16;
/**
 * 아래 조작 바(SKIP, 단계 점, 다음)가 차지하는 높이.
 *
 * 카드 위치를 잡을 때 이 영역을 비워 둔다. 안 그러면 카드가 바를 덮어 [다음] 버튼이
 * 가려지고, 눌러야 할 것이 눌리지 않는다 (실제로 그렇게 겹쳤다).
 */
const BOTTOM_BAR = 92;
/** 강조 영역이 화면을 다 덮으면 설명 카드를 놓을 자리가 없다. 세로로 이만큼까지만 잡는다 */
const MAX_SPOT_RATIO = 0.56;

export function TourOverlay({ steps }: { steps: TourStep[] }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef(-1);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const step = steps[idx];

  /**
   * 시작 단계를 URL에서 받는다 (`?tstep=3`).
   *
   * 발표 자료를 만드는 스크립트가 단계를 하나씩 지정해 열기 위한 값이다. 단계를 컴포넌트
   * 상태로만 두면 밖에서 특정 단계를 열 방법이 없어서, PDF를 만들 때마다 사람이 [다음]을
   * 눌러 가며 화면을 찍어야 한다.
   *
   * useState 초기값으로 쓰지 않는 이유: 서버 렌더는 URL을 모르니 0이 되고, 클라이언트가
   * 다른 값으로 시작하면 hydration이 어긋난다. 마운트 뒤에 한 번만 옮긴다.
   */
  useEffect(() => {
    const n = Number(search.get('tstep'));
    if (Number.isFinite(n) && n >= 1 && n <= steps.length) setIdx(n - 1);
    // 처음 한 번만 반영한다. 이후 단계 이동은 버튼과 키보드가 맡는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 단계가 요구하는 탭으로 옮긴다.
   *
   * 탭 상태는 URL에 있고 화면은 서버가 그린다. 그래서 이동은 router로 하되, 다른
   * 파라미터(tour=1, service 등)를 잃지 않도록 기존 쿼리에 얹는다. `tour=1`이 지워지면
   * 투어 자체가 꺼져 버린다.
   *
   * replace를 쓰는 이유: 단계마다 히스토리가 쌓이면 브라우저 뒤로가기가 투어 단계를
   * 거꾸로 되짚는 이상한 동작이 된다. 단계 이동은 이미 [이전] 버튼이 맡는다.
   * scroll: false로 두는 것도 중요하다. 이동 직후 아래에서 강조 지점으로 스크롤하는데,
   * 라우터가 먼저 맨 위로 올려 버리면 화면이 두 번 튄다.
   */
  useEffect(() => {
    const want = step?.tab;
    if (!want || search.get('tab') === want) return;
    const next = new URLSearchParams(search.toString());
    next.set('tab', want);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [step, search, pathname, router]);

  const measure = useCallback(() => {
    if (step?.tabIntro || !step?.target) {
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
    // 화면 밖으로 벗어난 부분은 잘라 낸다. 목록처럼 긴 요소를 통째로 강조하면
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

  /**
   * 강조 대상이 화면 밖이면 먼저 스크롤한다. 단계당 한 번만: 매 측정마다 스크롤하면 흔들린다.
   *
   * 탭이 바뀌는 단계에서는 대상 요소가 아직 DOM에 없다. 라우터가 화면을 다시 그릴 때까지
   * 기다려야 하는데 그 시점을 알 수 없어서, 몇 번에 걸쳐 다시 찾는다. 요소를 못 찾은 회차는
   * scrolledFor를 채우지 않으므로 다음 회차가 스크롤을 맡는다.
   * deps에 쿼리 문자열을 넣어 탭이 실제로 바뀐 직후에도 한 번 더 돌게 한다.
   */
  const query = search.toString();
  useLayoutEffect(() => {
    /*
      탭 개요 장은 화면 맨 위로 올린다. 앞 단계가 아래쪽 요소를 짚고 있었으면 스크롤이
      그 자리에 남아 있어서, 탭 전체를 보여주겠다면서 중간부터 보이게 된다.
    */
    if (step?.tabIntro) {
      setRect(null);
      if (scrolledFor.current !== idx) {
        scrolledFor.current = idx;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    if (!step?.target) {
      setRect(null);
      return;
    }
    const tryScroll = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el && scrolledFor.current !== idx) {
        scrolledFor.current = idx;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      measure();
    };
    tryScroll();
    const timers = [140, 420, 800].map((ms) => setTimeout(tryScroll, ms));
    return () => timers.forEach(clearTimeout);
  }, [idx, step, measure, query]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  /**
   * 투어를 끝내고 대시보드로 내보낸다.
   *
   * 예전에는 그 자리에 "다시 시작" 버튼만 남겼는데, /tour는 설명용 경로라 끝난 뒤에도
   * 거기 머물면 다음에 무엇을 눌러야 하는지가 화면에 없다. 처음 보는 사람이 그대로 이탈한다.
   *
   * 실데이터 투어(/?tour=1)는 이미 대시보드 위에 얹혀 있으므로 표식만 떼고 그 자리에 둔다.
   * 보고 있던 탭과 필터를 유지하려는 것이다. /tour는 예시 화면이라 남길 상태가 없어 루트로 보낸다.
   */
  const exit = useCallback(() => {
    if (pathname === '/tour') {
      router.push('/');
      return;
    }
    const next = new URLSearchParams(search.toString());
    next.delete('tour');
    next.delete('tstep');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, search]);

  const go = useCallback(
    (next: number) => {
      if (next >= steps.length) return exit();
      setIdx(Math.max(0, next));
    },
    [steps.length, exit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
      else if (e.key === 'Escape') exit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, go, exit]);

  if (!step) return null;

  // 다음 단계가 다른 탭으로 넘어가는지 (같은 탭이거나 마지막 단계면 알릴 것이 없다)
  const upcoming = steps[idx + 1]?.tab;
  const nextTab = upcoming && upcoming !== step.tab ? TAB_LABEL[upcoming] : undefined;

  // 카드 위치: 강조 영역 아래를 우선하되, 공간이 부족하면 위로 올리고,
  // 어느 쪽도 안 되면 화면 안에 들어오도록 강제로 붙인다.
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
  /**
   * 카드가 차지할 수 있는 최대 높이. 위치를 잡을 때만 쓴다.
   *
   * **화면 크기에서 나온 값을 인라인 style로 내보내지 않는다.** 서버 렌더는 창 크기를 모르니
   * 대체값(800)으로 계산하는데, 클라이언트는 실제 크기로 계산해서 두 결과가 어긋난다.
   * React는 그걸 hydration 불일치로 보고 콘솔에 오류를 낸다 (실제로 그렇게 났다).
   * 그래서 최대 높이와 최대 너비는 CSS(calc과 vh, vw)에 맡기고, 여기서는 위치 계산에만 쓴다.
   */
  const maxH = Math.max(200, vh - GAP - BOTTOM_BAR);
  let cardStyle: React.CSSProperties;
  if (!rect) {
    // 서버와 첫 클라이언트 렌더가 함께 타는 분기다. 창 크기에 따라 달라지는 값을 넣으면 안 된다
    cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_W };
  } else {
    // rect는 마운트 뒤 측정으로만 채워지므로 이 아래는 클라이언트 전용이다
    const h = Math.min(cardH || 220, maxH); // 첫 렌더에는 실측값이 없어 대략치로 시작한다
    const spotBottom = rect.top + rect.height;
    // 아래에 놓을 수 있는지 판단할 때도 조작 바를 침범하지 않아야 한다
    const fitsBelow = spotBottom + GAP + h <= vh - BOTTOM_BAR;
    const fitsAbove = rect.top - GAP - h >= GAP;
    const place = step.placement ?? (fitsBelow ? 'bottom' : fitsAbove ? 'top' : 'bottom');
    const desiredTop = place === 'bottom' ? spotBottom + GAP : rect.top - GAP - h;
    cardStyle = {
      top: clamp(desiredTop, GAP, Math.max(GAP, vh - BOTTOM_BAR - h)),
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
        <div className={`tour-scrim ${step.tabIntro ? 'soft' : ''}`} />
      )}

      {/*
        탭 개요 장은 위치를 CSS에 맡긴다. 화면 아래쪽에 눕히는 것이 목적이라 강조 영역을
        기준으로 계산할 것이 없고, 창 크기로 계산한 값을 인라인 style에 넣으면 서버 렌더와
        어긋난다(그래서 이 파일 전체가 크기 계산을 CSS로 넘기고 있다).
      */}
      <div
        ref={cardRef}
        className={`tour-card ${step.tabIntro ? 'tab-intro' : rect ? '' : 'center'}`}
        style={step.tabIntro ? undefined : cardStyle}
      >
        <div className="tour-step-no">
          {idx + 1} / {steps.length}
        </div>
        <h3>{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        {/*
          다음 단계가 다른 탭이면 미리 알린다. 단계를 재배치해도 따라오도록 단계 정의에서
          자동으로 뽑는다 (본문에 손으로 적으면 순서를 바꿀 때마다 어긋난다).
        */}
        {nextTab && (
          <div className="tour-next-tab">
            다음은 <strong>{nextTab} 탭</strong>입니다. [다음]을 누르면 그 탭으로 이동합니다
          </div>
        )}
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
        {/*
          라벨이 곧 목적지다. 'SKIP'은 무엇을 건너뛰는지도, 어디로 가는지도 말하지 않아
          처음 보는 사람은 누르기를 망설인다. 설명을 그만 보고 실제 화면을 보려는 사람에게
          그 경로가 화면에 분명히 있어야 한다.
        */}
        <button className="ghost tour-exit" onClick={exit}>
          대시보드 →
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
