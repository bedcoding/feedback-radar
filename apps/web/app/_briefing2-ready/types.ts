import type { ChannelSummary, TrendCell } from '@feedback-radar/core';

/** Serializable read model. No dependency on the dashboard or the design lab. */
export interface Briefing2Negative {
  id: number;
  text: string;
  severity?: string;
  rating?: number;
  url?: string;
}

export interface Briefing2RawItem {
  id: number;
  source: string;
  service?: string;
  country?: string;
  sentiment?: string;
  category?: string;
  text: string;
  url?: string;
  rating?: number;
  time?: string;
}

export interface Briefing2Data {
  date: string;
  dates: string[];
  summaries: ChannelSummary[];
  rawItems?: Briefing2RawItem[];
  trend: TrendCell[];
  negatives?: Record<string, Briefing2Negative[]>;
  /** All stored items, regardless of the selected date or service. */
  pendingCount?: number;
}

export interface Briefing2Location {
  pathname: string;
  tab?: string;
}

export interface Briefing2ItemScope {
  source: string;
  service: string;
  country: string;
  sentiment?: string;
}

export interface Briefing2Query {
  sdate?: string;
  service?: string;
}

export interface Briefing2ReadyResult {
  data: Briefing2Data;
  selectedService?: string;
  serviceOptions: string[];
  displayName: string;
  notice?: string;
}
