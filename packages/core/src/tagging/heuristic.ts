import {
  CATEGORY_TEAM,
  mergeCategoryKeywords,
  NEGATIVE_HINTS,
  POSITIVE_HINTS,
  type Category,
  type Sentiment,
  type Severity,
} from '../taxonomy.js';
import { loadConfig, resolveServices, type ServiceConfig } from '../paths.js';
import type { TagResult, Tagger } from '../types.js';

/** 앱 리뷰는 앱 자체에 달린 글이라 관련성 판단이 필요 없다 */
const APP_SOURCES = new Set(['appstore', 'googleplay']);

/**
 * 동음이의어 노이즈 필터 (휴리스틱 버전).
 * 웹 검색 소스(커뮤니티·SNS)는 짧은 키워드(동음이의어 브랜드명 등)가 전혀 다른 의미로
 * 걸릴 수 있어서: ① 4자 이상의 확실한 키워드가 있거나 ② 도메인 힌트 단어(config.relevanceHints)가
 * 함께 나올 때만 관련 글로 인정한다. LLM 태거는 이걸 문맥으로 정확히 판단한다.
 */
function isRelevant(
  source: string,
  text: string,
  svc: ServiceConfig,
): { relevant: boolean; reason: string } {
  if (APP_SOURCES.has(source)) return { relevant: true, reason: '앱 리뷰 채널' };
  // 제외 단어가 먼저다 — 브랜드명이 타 분야 용어와 겹치면 그 글은 아무리 키워드가 맞아도 우리 얘기가 아니다
  const excluded = (svc.excludeHints ?? []).find((w) => text.includes(w));
  if (excluded) return { relevant: false, reason: `제외 단어 '${excluded}'` };
  const strong = svc.keywords.filter((k) => k.length >= 4).find((k) => text.includes(k));
  if (strong) return { relevant: true, reason: `키워드 '${strong}'` };
  const hint = (svc.relevanceHints ?? []).find((h) => text.includes(h));
  if (hint) return { relevant: true, reason: `연관어 '${hint}'` };
  return { relevant: false, reason: '확실한 키워드 없음' };
}

/**
 * 키워드 기반 폴백 태거. LLM 없이 파이프라인을 시험할 때,
 * 그리고 LLM 태깅 정확도를 비교 측정하는 베이스라인으로 쓴다.
 */
export const heuristicTagger: Tagger = {
  name: 'heuristic',
  async tag(items) {
    const config = loadConfig();
    const categoryKeywords = mergeCategoryKeywords(config.categoryKeywords);
    // 서비스마다 관련성 기준(키워드·제외 단어)이 다르다. 항목의 service로 골라 쓴다.
    const services = resolveServices(config);
    const byName = new Map(services.map((s) => [s.name, s]));
    const out = new Map<number, TagResult>();
    for (const it of items) {
      const text = it.content;

      let category: Category = '기타';
      let best = 0;
      for (const [cat, words] of Object.entries(categoryKeywords)) {
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

      const rel = isRelevant(it.source, text, byName.get(it.service ?? '') ?? services[0]);
      out.set(it.id, {
        sentiment,
        category,
        severity,
        team: CATEGORY_TEAM[category],
        summary: text.replace(/\s+/g, ' ').slice(0, 80),
        relevant: rel.relevant,
        // 규칙 기반이라 어떤 단어가 판정을 갈랐는지 정확히 말할 수 있다
        reason: `규칙: ${rel.reason}`,
      });
    }
    return out;
  },
};
