import type { RadarStore } from '../store.js';
import type { ItemRow } from '../types.js';
import { findBursts } from './burst.js';
import { resolveServices } from '../paths.js';

const SOURCE_LABEL: Record<string, string> = {
  appstore: '앱스토어',
  googleplay: '구글플레이',
  'naver-blog': '네이버 블로그',
  'naver-cafe': '네이버 카페',
  dcinside: '디시인사이드',
  threads: 'Threads',
  x: 'X',
  theqoo: '더쿠',
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
export async function buildDailyReport(db: RadarStore, date: string, displayName: string): Promise<string> {
  const BASELINE_DAYS = 7;
  const [items, counts, avg, baselineDays, irrelevant] = await Promise.all([
    db.getItemsByDate(date),
    db.categoryCountsForDate(date),
    db.categoryDailyAverage(date, BASELINE_DAYS),
    db.countCollectionDays(date, BASELINE_DAYS),
    db.countIrrelevantForDate(date),
  ]);
  // 직전 구간에 수집이 하루도 없으면 비교 기준선이 없다. 이때의 '평균 0건'은
  // "평소엔 없던 일"이 아니라 "잰 적이 없음"이므로 급증이라고 말하면 안 된다.
  const hasBaseline = baselineDays > 0;

  const bySource = new Map<string, number>();
  for (const it of items) bySource.set(it.source, (bySource.get(it.source) ?? 0) + 1);
  const sourceSummary = [...bySource.entries()].map(([s, c]) => `${label(s)} ${c}`).join(', ');

  const lines: string[] = [];
  lines.push(`# 📊 ${displayName} 피드백 데일리 ${date}`);
  lines.push('');
  lines.push(
    `수집 ${items.length}건 (${sourceSummary || '없음'})` +
      (irrelevant > 0 ? `, 동음이의어 등 무관 글 ${irrelevant}건 제외됨` : ''),
  );
  lines.push('');

  /**
   * 시간대 집중을 카테고리 급증보다 **먼저** 둔다.
   *
   * 카테고리 급증은 하루가 끝나야 판정되고 카테고리별로 갈린다. 배포 직후 반응처럼 몇 시간에
   * 몰리는 사건은 그 두 성질 때문에 다 새어 나갔다(실측 2026-08-20: 한 기능 개편 반응이
   * 12~14시에 몰렸는데 카테고리가 셋으로 갈려 어느 쪽도 임계를 못 넘었다).
   * 지금 무슨 일이 벌어지는지가 가장 위에 있어야 한다.
   */
  const keywords = resolveServices(await db.getConfig()).flatMap((s) => s.keywords);
  const bursts = findBursts(items, keywords);
  if (bursts.windows.length > 0) {
    lines.push(`## 🔴 시간대 집중`);
    for (const w of bursts.windows) {
      const pct = Math.round(w.share * 100);
      lines.push(
        `- **${w.startHour}시~${w.endHour}시에 ${w.count}건** (하루 평균 대비 ${w.multiple.toFixed(1)}배, 그날의 ${pct}%, 부정 ${w.negative}건)`,
      );
      for (const t of w.topics) {
        lines.push(`  - \`${t.term}\` ${t.count}건${t.negative > 0 ? ` (부정 ${t.negative})` : ''}`);
        // 주제어만 있으면 무슨 얘기인지 모른다. 대표 글을 원문 링크와 함께 붙인다
        for (const sample of t.samples.slice(0, 2)) lines.push(`  ${itemLine(sample)}`);
      }
    }
    if (bursts.undated > 0) {
      lines.push(
        `> 작성 시각을 못 가져온 ${bursts.undated}건은 이 집계에서 빠졌습니다 (앱 리뷰는 시각이 없는 경우가 많습니다).`,
      );
    }
    lines.push('');
  }

  // 급증 감지: 직전 7일 평균 대비 3배 이상 + 최소 5건
  const spikes = hasBaseline
    ? counts.filter((c) => {
        const a = avg.get(c.category) ?? 0;
        return c.count >= 5 && (a === 0 ? c.count >= 10 : c.count > a * 3);
      })
    : [];
  if (!hasBaseline) {
    lines.push(
      `> 급증 감지는 직전 ${BASELINE_DAYS}일과 비교합니다. **아직 비교할 수집 이력이 없어 이번 브리핑에서는 생략합니다.**`,
    );
    lines.push('');
  } else if (spikes.length > 0) {
    lines.push(`## 🔴 급증 감지`);
    for (const s of spikes) {
      const a = avg.get(s.category) ?? 0;
      lines.push(
        `- **${s.category}** ${s.count}건 (직전 ${baselineDays}일 평균 ${a.toFixed(1)}건${a > 0 ? `, ${(s.count / a).toFixed(1)}배↑` : ''})`,
      );
    }
    lines.push('');
  }

  // 심각 건: critical/high 부정 건 상위 5개.
  // 최신순으로 자르면 critical이 high에 밀려 통째로 누락될 수 있어 심각도를 먼저 정렬한다.
  const severeAll = items
    .filter((it) => it.sentiment === 'negative' && (it.severity === 'critical' || it.severity === 'high'))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
  const SEVERE_SHOWN = 5;
  const severe = severeAll.slice(0, SEVERE_SHOWN);
  if (severe.length > 0) {
    // 헤더는 전체 건수를 알려야 한다. 잘린 뒤 개수를 쓰면 항상 5건으로 보인다
    const more = severeAll.length > SEVERE_SHOWN ? `, 상위 ${SEVERE_SHOWN}건 표시` : '';
    /*
      '우선 확인 필요'라고 적지 않는다. 이 섹션이 하는 일은 읽을 순서를 정해 주는 것인데,
      그 제목은 "지금 대응하라"는 지시로 읽혔다. 아래에 실리는 것은 글 몇 건이고 담당팀
      표시는 어디로 갈 얘기인지 알려주는 안내이지 배정이 아니다.
    */
    lines.push(`## ⚠️ 먼저 읽어 볼 글 (${severeAll.length}건${more})`);
    for (const it of severe) {
      lines.push(`- **[${it.category} → ${it.team}팀]** ${it.severity === 'critical' ? '🚨 ' : ''}`);
      lines.push(itemLine(it));
    }
    lines.push('');
  }

  // 카테고리 요약
  if (counts.length > 0) {
    lines.push(`## 카테고리별 언급량`);
    // 기준선이 없을 때 0.0을 찍으면 "잰 적 없음"이 "평소 0건"으로 읽힌다
    const avgHeader = hasBaseline ? `직전 ${baselineDays}일 평균` : '직전 평균';
    lines.push(`| 카테고리 | 건수 | 부정 | ${avgHeader} |`);
    lines.push('|---|---|---|---|');
    for (const c of counts) {
      const a = hasBaseline ? (avg.get(c.category) ?? 0).toFixed(1) : '-';
      lines.push(`| ${c.category} | ${c.count} | ${c.negative} | ${a} |`);
    }
    if (hasBaseline && baselineDays < BASELINE_DAYS) {
      lines.push('');
      lines.push(
        `_평균은 직전 ${BASELINE_DAYS}일 중 실제 수집이 있었던 ${baselineDays}일 기준입니다._`,
      );
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
  lines.push(`_Feedback Radar 자동 생성, 모든 인용에는 원문 링크가 있습니다_`);
  return lines.join('\n');
}
