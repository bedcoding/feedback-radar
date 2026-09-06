import { Briefing2Content } from './Briefing2Content';
import { loadBriefing2ReadyData } from './loadData';
import { BRIEFING2_TAB_LOCATION, briefing2Href } from './navigation';
import type { Briefing2ItemScope, Briefing2Location, Briefing2Query } from './types';
import styles from './briefing2.module.css';

export interface Briefing2ReadyScreenProps {
  query: Briefing2Query;
  location?: Briefing2Location;
  itemsHref?: (scope: Briefing2ItemScope) => string | undefined;
}

/** Optional read-only server entry. Hosts may instead provide their own data to
 * Briefing2Content and keep all fetching within their current dashboard loader. */
export async function Briefing2ReadyScreen({ query, location = BRIEFING2_TAB_LOCATION, itemsHref }: Briefing2ReadyScreenProps) {
  const result = await loadBriefing2ReadyData(query).catch(() => {
    // No driver messages, query details or connection URLs in the HTML or log.
    console.warn('[briefing2-ready] READ_FAILED');
    return undefined;
  });
  if (!result) {
    return <div className={styles.root}><section className={styles.empty} role="status">
      <h2>브리핑 자료를 불러오지 못했습니다.</h2>
      <p>연결 상태를 확인한 뒤 다시 열어주세요.</p>
      <a href={briefing2Href(location, { date: query.sdate, service: query.service })}>다시 불러오기</a>
    </section></div>;
  }
  return <Briefing2Content data={result.data} serviceOptions={result.serviceOptions}
    selectedService={result.selectedService} notice={result.notice} location={location} itemsHref={itemsHref} />;
}
