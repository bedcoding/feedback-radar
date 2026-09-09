import type { ReactNode } from 'react';

export interface PageHeaderData {
  displayName: string;
  keywords: string[];
  keywordsLabel?: string;
}

/** Shared header structure for every live channel and the dashboard. */
export function PageHeader({ displayName, keywords, keywordsLabel = '키워드', badge, children }: PageHeaderData & { badge?: ReactNode; children?: ReactNode }) {
  return <header className="page-head">
    <div className="page-title-row"><h1>📡 {displayName} 피드백 레이더</h1>{badge}</div>
    <div className="head-meta">
      <span className="head-label">{keywordsLabel}</span>
      {keywords.map(keyword => <span key={keyword} className="badge svc">{keyword}</span>)}
      {children}
    </div>
  </header>;
}
