import type { ChannelSummary } from '@feedback-radar/core';
import type { Briefing2Data, Briefing2RawItem } from './types';

type Scope = { source: string; country?: string; service?: string };

export type Briefing2CardEntry =
  | { kind: 'sum'; key: string; service: string; total: number; summary: ChannelSummary }
  | {
      kind: 'raw';
      key: string;
      service: string;
      total: number;
      source: string;
      country: string;
      items: Briefing2RawItem[];
    };

export interface Briefing2Group {
  service: string;
  total: number;
  cards: Briefing2CardEntry[];
}

const scopeKey = (item: Scope): string =>
  `${item.source}|${item.country ?? ''}|${item.service ?? ''}`;

/** One stored summary is one card. Raw posts share a card only in the exact
 * source/country/service scope, and a summary replaces raw posts in that scope. */
export function countBriefing2Cards({ summaries, rawItems = [] }: {
  summaries: readonly Scope[];
  rawItems?: readonly Scope[];
}): number {
  const summarized = new Set(summaries.map(scopeKey));
  const rawScopes = new Set(rawItems.map(scopeKey).filter(key => !summarized.has(key)));
  return summaries.length + rawScopes.size;
}

/** Keep the original service totals, fixed channel priority, descending counts,
 * and stable order for ties. Never reorder a stored bullet or raw-post list. */
export function groupBriefing2Cards({ summaries, rawItems = [] }: Pick<Briefing2Data, 'summaries' | 'rawItems'>): Briefing2Group[] {
  const cards: Briefing2CardEntry[] = summaries.map(summary => ({
    kind: 'sum',
    key: scopeKey(summary),
    service: summary.service || '',
    total: summary.total,
    summary,
  }));
  const summarized = new Set(cards.map(card => card.key));
  const rawBy = new Map<string, Extract<Briefing2CardEntry, { kind: 'raw' }>>();
  for (const item of rawItems) {
    const key = scopeKey(item);
    if (summarized.has(key)) continue;
    const existing = rawBy.get(key);
    if (existing) {
      existing.items.push(item);
      existing.total += 1;
    } else {
      rawBy.set(key, {
        kind: 'raw', key, service: item.service ?? '', total: 1,
        source: item.source, country: item.country ?? '', items: [item],
      });
    }
  }
  cards.push(...rawBy.values());

  const byService = new Map<string, Briefing2Group>();
  for (const card of cards) {
    const group = byService.get(card.service) ?? { service: card.service, total: 0, cards: [] };
    group.total += card.total;
    group.cards.push(card);
    byService.set(card.service, group);
  }
  const rank = (card: Briefing2CardEntry): number => {
    const source = card.kind === 'sum' ? card.summary.source : card.source;
    return source === 'naver-blog' || source === 'naver-cafe' ? 1 : 0;
  };
  return [...byService.values()]
    .map(group => ({
      ...group,
      cards: [...group.cards].sort((a, b) => rank(a) - rank(b) || b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/** Apply the same external-link rule to both stored and caller-supplied data.
 * Return the original string intact so query strings and fragments are kept. */
export function safeBriefing2OriginalUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}
