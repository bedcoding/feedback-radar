import {
  CATEGORY_KEYWORDS,
  CATEGORY_TEAM,
  NEGATIVE_HINTS,
  POSITIVE_HINTS,
  type Category,
  type Sentiment,
  type Severity,
} from '../taxonomy.js';
import { loadConfig, type RadarConfig } from '../paths.js';
import type { TagResult, Tagger } from '../types.js';

/** 앱 리뷰는 앱 자체에 달린 글이라 관련성 판단이 필요 없다 */
const APP_SOURCES = new Set(['appstore', 'googleplay']);

/**
 * 동음이의어 노이즈 필터 (휴리스틱 버전).
 * 웹 검색 소스(커뮤니티·SNS)는 짧은 키워드(동음이의어 브랜드명 등)가 전혀 다른 의미로
 * 걸릴 수 있어서: ① 4자 이상의 확실한 키워드가 있거나 ② 도메인 힌트 단어(config.relevanceHints)가
 * 함께 나올 때만 관련 글로 인정한다. LLM 태거는 이걸 문맥으로 정확히 판단한다.
 */
function isRelevant(source: string, text: string, config: RadarConfig): boolean {
  if (APP_SOURCES.has(source)) return true;
  const strong = config.keywords.filter((k) => k.length >= 4);
  if (strong.some((k) => text.includes(k))) return true;
  const hints = config.relevanceHints ?? [];
  return hints.some((h) => text.includes(h));
}

/**
 * 키워드 기반 폴백 태거. LLM 없이 파이프라인을 시험할 때,
 * 그리고 LLM 태깅 정확도를 비교 측정하는 베이스라인으로 쓴다.
 */
export const heuristicTagger: Tagger = {
  name: 'heuristic',
  async tag(items) {
    const config = loadConfig();
    const out = new Map<number, TagResult>();
    for (const it of items) {
      const text = it.content;

      let category: Category = '기타';
      let best = 0;
      for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
        const hits = words.filter((w) => text.includes(w)).length;
        if (hits > best) {
          best = hits;
          category = cat as Category;
        }
      }

      let sentiment: Sentiment = 'neutral';
      const neg = NEGATIVE_HINTS.filter((w) => text.includes(w)).length;
      const pos = POSITIVE_HINTS.filter((w) => text.includes(w)).length;
      if (it.rating != null) {
        if (it.rating <= 2) sentiment = 'negative';
        else if (it.rating >= 4) sentiment = 'positive';
        else sentiment = neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral';
      } else if (neg > pos) sentiment = 'negative';
      else if (pos > neg) sentiment = 'positive';

      let severity: Severity = 'low';
      if (sentiment === 'negative') {
        severity = category === '결제/코인' || category === '계정/로그인' ? 'high' : 'medium';
        if (text.includes('환불') && text.includes('안')) severity = 'critical';
      }

      out.set(it.id, {
        sentiment,
        category,
        severity,
        team: CATEGORY_TEAM[category],
        summary: text.replace(/\s+/g, ' ').slice(0, 80),
        relevant: isRelevant(it.source, text, config),
      });
    }
    return out;
  },
};
