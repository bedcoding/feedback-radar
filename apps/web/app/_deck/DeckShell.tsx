'use client';

/**
 * 슬라이드 공용 껍데기 — 슬라이드 본문을 배열로 받으므로
 * 서버 컴포넌트(DB·설정을 읽는 /pitch)에서도 그대로 감싸 쓸 수 있다.
 *
 * children이 아니라 배열 prop인 이유: Children.toArray는 Fragment를 펼쳐 버려서
 * 슬라이드 하나가 여러 장으로 쪼개진다.
 */

import type { ReactNode } from 'react';
import { DeckChrome, DeckProgress, useDeckNav } from './useDeckNav.js';
import './deck.css';

interface Props {
  titles: string[];
  footerLabel: string;
  slides: ReactNode[];
  /** 슬라이드별 추가 클래스 (인덱스 대응) — 표지 등 레이아웃이 다른 슬라이드에 쓴다 */
  slideClasses?: (string | undefined)[];
}

export function DeckShell({ titles, footerLabel, slides, slideClasses = [] }: Props) {
  const nav = useDeckNav(slides.length);

  return (
    <div className="deck-root">
      <DeckProgress nav={nav} />
      {slides.map((slide, i) => (
        <section key={i} className={`slide ${slideClasses[i] ?? ''} ${i === nav.idx ? 'active' : ''}`}>
          {slide}
        </section>
      ))}
      <DeckChrome nav={nav} titles={titles} label={footerLabel} />
    </div>
  );
}
