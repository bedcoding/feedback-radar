import type { Briefing2Location, Briefing2Query } from './types';

export const BRIEFING2_TAB_LOCATION: Briefing2Location = { pathname: '/', tab: 'brief2' };
export const BRIEFING2_PREVIEW_LOCATION: Briefing2Location = { pathname: '/briefing2-preview' };

/** Next searchParams may contain arrays for repeated parameters. */
export function readBriefing2Query(params: Record<string, string | string[] | undefined>): Briefing2Query {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return { sdate: first(params.sdate), service: first(params.service) };
}

/** A calendar date, with no timezone conversion. */
export function isBriefingDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function briefing2Href(location: Briefing2Location, next: { date?: string; service?: string }): string {
  const params = new URLSearchParams();
  if (location.tab) params.set('tab', location.tab);
  if (isBriefingDate(next.date)) params.set('sdate', next.date);
  if (next.service?.trim()) params.set('service', next.service.trim());
  return location.pathname + (params.size ? '?' + params.toString() : '');
}
