import {
  CATEGORY_KEYWORDS,
  CATEGORY_TEAM,
  NEGATIVE_HINTS,
  POSITIVE_HINTS,
  type Category,
  type Sentiment,
  type Severity,
} from '../taxonomy.js';
import type { TagResult, Tagger } from '../types.js';

/**
 * 키워드 기반 폴백 태거. ANTHROPIC_API_KEY 없이 파이프라인을 시험할 때,
 * 그리고 LLM 태깅 정확도를 비교 측정하는 베이스라인으로 쓴다.
 */
export const heuristicTagger: Tagger = {
  name: 'heuristic',
  async tag(items) {
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
      });
    }
    return out;
  },
};
