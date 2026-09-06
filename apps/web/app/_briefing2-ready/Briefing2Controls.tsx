'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './briefing2.module.css';

type ViewControls = { expanded: boolean; canExpand: boolean; onToggle: () => void };
const Briefing2ViewContext = createContext<ViewControls | null>(null);

/** Height controls surround server-rendered content; its native disclosures keep
 * their DOM and open state when the height changes. Key by date/service upstream
 * when navigation should restore that selection's default reading mode. */
export function Briefing2Controls({ children, selectedService, platformCount }: {
  children: ReactNode;
  selectedService?: string;
  platformCount: number;
}) {
  const [expandCards, setExpanded] = useState(false);
  const onePlatform = Boolean(selectedService) && platformCount <= 1;
  const expanded = onePlatform || expandCards;
  const balanced = Boolean(selectedService) && !expanded;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const toggleHeight = useCallback(() => setExpanded(value => !value), []);
  const controls = useMemo(() => ({
    expanded,
    canExpand: !onePlatform && platformCount > 0,
    onToggle: toggleHeight,
  }), [expanded, onePlatform, platformCount, toggleHeight]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || expanded) return;
    const cards = [...surface.querySelectorAll<HTMLElement>('.briefing-ch')];
    const update = () => {
      for (const card of cards) {
        const head = card.querySelector<HTMLElement>('.briefing-ch-head');
        card.style.setProperty('--card-head-height', `${head?.offsetHeight ?? 42}px`);
        const scrollable = card.clientHeight > 0 && card.scrollHeight > card.clientHeight + 1;
        if (scrollable) {
          const service = card.closest('.briefing-group')?.querySelector('.bg-name')?.textContent ?? selectedService ?? '';
          const platform = head?.querySelector('strong')?.textContent ?? '플랫폼';
          const country = head?.querySelector<HTMLElement>('.briefing-country')?.title ?? '';
          card.tabIndex = 0;
          card.setAttribute('aria-label', `${service} ${platform} ${country} 내용 스크롤`.replace(/\s+/g, ' ').trim());
          card.dataset.scrollable = 'true';
        } else {
          card.removeAttribute('tabindex');
          card.removeAttribute('aria-label');
          delete card.dataset.scrollable;
        }
      }
    };
    const observer = new ResizeObserver(update);
    for (const card of cards) {
      observer.observe(card);
      // A disclosure can change content height while its outer frame stays capped.
      card.querySelectorAll('.briefing-ch-head, .briefing-bullets, .briefing-raw-list, .briefing-neg, .briefing-feedback')
        .forEach(element => observer.observe(element));
    }
    const revealFeedback = (event: Event) => {
      const details = event.target;
      if (!(details instanceof HTMLDetailsElement) || !details.matches('.briefing-feedback')) return;
      const card = details.closest<HTMLElement>('.briefing-ch');
      if (!card) return;
      update();
      if (!details.open) {
        card.scrollTop = 0;
        return;
      }
      const headHeight = card.querySelector<HTMLElement>('.briefing-ch-head')?.offsetHeight ?? 0;
      // Reveal only this card's disclosure and first feedback, keeping page and
      // keyboard focus in place. The sticky summary remains available to close it.
      card.scrollTop += details.getBoundingClientRect().top - card.getBoundingClientRect().top - headHeight;
    };
    surface.addEventListener('toggle', revealFeedback, true);
    update();
    return () => {
      observer.disconnect();
      surface.removeEventListener('toggle', revealFeedback, true);
      for (const card of cards) {
        card.removeAttribute('tabindex');
        card.removeAttribute('aria-label');
        card.style.removeProperty('--card-head-height');
        delete card.dataset.scrollable;
      }
    };
  }, [expanded, children, selectedService]);

  return (
    <div ref={surfaceRef} className={styles.surface} data-card-height={expanded ? 'expanded' : 'compact'} data-platform-layout={balanced ? 'balanced' : 'natural'}>
      <Briefing2ViewContext.Provider value={controls}>
        {children}
      </Briefing2ViewContext.Provider>
    </div>
  );
}

/** Place this control in the briefing header without importing server data. */
export function Briefing2ExpandButton() {
  const controls = useContext(Briefing2ViewContext);
  if (!controls?.canExpand) return null;
  return (
    <button type="button" className="briefing-expand" aria-pressed={controls.expanded} onClick={controls.onToggle}>
      {controls.expanded ? '기본 높이' : '모두 펼치기'}
    </button>
  );
}
