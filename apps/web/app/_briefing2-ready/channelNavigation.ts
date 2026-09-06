import type { Briefing2ItemScope } from './types';

/** Existing channel-board contract: full period, configured services and lowercase
 * countries; `none` selects SQL NULL. Never silently widen an unsupported scope. */
export function createBriefing2ChannelHref(services: readonly string[], pathname = '/') {
  const configured = new Set(services);
  return (scope: Briefing2ItemScope): string | undefined => {
    if (!scope.service || !configured.has(scope.service)) return undefined;
    if (!/^[a-z][a-z-]{0,19}$/.test(scope.source)) return undefined;
    if (scope.source === 'all' || scope.source === 'naver') return undefined;
    if (scope.country && !/^[a-z]{2}$/.test(scope.country)) return undefined;
    // An unpartitioned legacy store summary is not necessarily a NULL-country
    // scope. Leave its count unlinked until that source provides an exact scope.
    if (!scope.country && ['googleplay', 'appstore'].includes(scope.source)) return undefined;
    if (scope.sentiment && !['positive', 'neutral', 'negative'].includes(scope.sentiment)) return undefined;
    const params = new URLSearchParams({ tab: 'channels', period: 'all', source: scope.source, service: scope.service, country: scope.country || 'none' });
    if (scope.sentiment) params.set('sentiment', scope.sentiment);
    return pathname + '?' + params.toString();
  };
}
