import { Briefing2Card } from './Briefing2Card';
import { Briefing2Controls } from './Briefing2Controls';
import { countBriefing2Cards } from './presentation';
import { BRIEFING2_TAB_LOCATION, briefing2Href } from './navigation';
import type { Briefing2Data, Briefing2ItemScope, Briefing2Location } from './types';
import styles from './briefing2.module.css';

export interface Briefing2ContentProps {
  data: Briefing2Data;
  serviceOptions: string[];
  selectedService?: string;
  location?: Briefing2Location;
  /** Host-owned destination. Omit until the final channel-board filters are agreed. */
  itemsHref?: (scope: Briefing2ItemScope) => string | undefined;
  notice?: string;
}

/** Tab body only: no app navigation, comparison menus, data writes or lab imports. */
export function Briefing2Content({
  data, serviceOptions, selectedService, location = BRIEFING2_TAB_LOCATION, itemsHref, notice,
}: Briefing2ContentProps) {
  const services = [...new Set([...serviceOptions, ...(selectedService ? [selectedService] : [])])].filter(Boolean);
  const href = (service?: string) => briefing2Href(location, { date: data.date, service });
  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <nav className={styles.index} aria-label="서비스 선택">
          <p className={styles.label}>서비스</p>
          <div className={styles.links}>
            <a href={href()} aria-current={!selectedService ? 'page' : undefined}>
              <span className={styles.number} aria-hidden="true">ALL</span><span>전체</span>
            </a>
            {services.map((service, index) => (
              <a key={service} href={href(service)} aria-current={selectedService === service ? 'page' : undefined}>
                <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span>{service}</span>
              </a>
            ))}
          </div>
        </nav>
        <section className={styles.reading} aria-label={selectedService ? `${selectedService} 브리핑` : '전체 서비스 브리핑'}>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <Briefing2Controls key={`${location.pathname}:${location.tab ?? ''}:${data.date}:${selectedService ?? ''}`}
            selectedService={selectedService} platformCount={countBriefing2Cards(data)}>
            <Briefing2Card {...data} location={location} selectedService={selectedService} itemsHref={itemsHref} />
          </Briefing2Controls>
        </section>
      </div>
    </div>
  );
}
