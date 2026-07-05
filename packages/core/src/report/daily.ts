import {
  categoryCountsForDate,
  categoryDailyAverage,
  countIrrelevantForDate,
  getItemsByDate,
  type RadarDb,
} from '../db.js';
import type { ItemRow } from '../types.js';

const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  'naver-blog': '네이버 블로그',
  'naver-cafe': '네이버 카페',
  dcinside: '디시인사이드',
  threads: 'Threads',
};

function label(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

function itemLine(it: ItemRow): string {
  const text = (it.summary ?? it.content).replace(/\s+/g, ' ').slice(0, 90);
  const rating = it.rating != null ? ` ★${it.rating}` : '';
  const link = it.url ? ` [원문](${it.url})` : '';
  return `  - "${text}" (${label(it.source)}${rating})${link}`;
}

/**
 * 일일 브리핑 마크다운 생성.
 * 원칙: 집계 숫자는 전부 SQL에서 오고, 모든 개별 언급에는 원문 링크를 붙인다.
 */
export function buildDailyReport(db: RadarDb, date: string, displayName: string): string {
  const items = getItemsByDate(db, date);
  const counts = categoryCountsForDate(db, date);
  const avg = categoryDailyAverage(db, date, 7);

  const bySource = new Map<string, number>();
  for (const it of items) bySource.set(it.source, (bySource.get(it.source) ?? 0) + 1);
  const sourceSummary = [...bySource.entries()].map(([s, c]) => `${label(s)} ${c}`).join(' · ');

  const irrelevant = countIrrelevantForDate(db, date);

  const lines: string[] = [];
  lines.push(`# 📊 ${displayName} 피드백 데일리 — ${date}`);
  lines.push('');
  lines.push(
    `수집 ${items.length}건 (${sourceSummary || '없음'})` +
      (irrelevant > 0 ? ` · 동음이의어 등 무관 글 ${irrelevant}건 제외됨` : ''),
  );
  lines.push('');

  // 급증 감지: 직전 7일 평균 대비 3배 이상 + 최소 5건
  const spikes = counts.filter((c) => {
    const a = avg.get(c.category) ?? 0;
    return c.count >= 5 && (a === 0 ? c.count >= 10 : c.count > a * 3);
  });
  if (spikes.length > 0) {
    lines.push(`## 🔴 급증 감지`);
    for (const s of spikes) {
      const a = avg.get(s.category) ?? 0;
      lines.push(
        `- **${s.category}** ${s.count}건 (직전 7일 평균 ${a.toFixed(1)}건${a > 0 ? `, ${(s.count / a).toFixed(1)}배↑` : ''})`,
      );
    }
    lines.push('');
  }

  // 심각 건: critical/high 부정 건 상위 5개
  const severe = items
    .filter((it) => it.sentiment === 'negative' && (it.severity === 'critical' || it.severity === 'high'))
    .slice(0, 5);
  if (severe.length > 0) {
    lines.push(`## ⚠️ 우선 확인 필요 (${severe.length}건)`);
    for (const it of severe) {
      lines.push(`- **[${it.category} → ${it.team}팀]** ${it.severity === 'critical' ? '🚨 ' : ''}`);
      lines.push(itemLine(it));
    }
    lines.push('');
  }

  // 카테고리 요약
  if (counts.length > 0) {
    lines.push(`## 카테고리별 언급량`);
    lines.push('| 카테고리 | 건수 | 부정 | 직전 7일 평균 |');
    lines.push('|---|---|---|---|');
    for (const c of counts) {
      lines.push(`| ${c.category} | ${c.count} | ${c.negative} | ${(avg.get(c.category) ?? 0).toFixed(1)} |`);
    }
    lines.push('');
  }

  // 긍정 하이라이트
  const positive = items.filter((it) => it.sentiment === 'positive').slice(0, 3);
  if (positive.length > 0) {
    lines.push(`## 🟢 긍정 반응`);
    for (const it of positive) lines.push(itemLine(it));
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Feedback Radar 자동 생성 · 모든 인용에는 원문 링크가 있습니다_`);
  return lines.join('\n');
}
