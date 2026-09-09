import { headers } from 'next/headers';
import { loadPrivateEnv, isReadOnlyMode, openRadarStore, resolveServices } from '@feedback-radar/core';
import type { PageHeaderData } from '../_dashboard/PageHeader';
import YouTubeView from './view';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const host = (await headers()).get('host') ?? '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || isReadOnlyMode()) return <main><h1>YouTube 댓글 탐색</h1><p>로컬 실행에서 사용할 수 있습니다.</p></main>;
  loadPrivateEnv();
  if (isReadOnlyMode()) return <main><h1>YouTube 댓글 탐색</h1><p>조회 전용 화면에서는 사용할 수 없습니다.</p></main>;
  let header: PageHeaderData = { displayName: '', keywords: [], keywordsLabel: '서비스' };
  let headerUnavailable = false;
  try {
    const db = await openRadarStore();
    try {
      const config = await db.getConfig();
      const services = resolveServices(config);
      header = { displayName: config.displayName, keywords: services.length > 1 ? services.map(s => s.name) : (services[0]?.keywords ?? config.keywords), keywordsLabel: services.length > 1 ? '서비스' : '키워드' };
    } finally { await db.close(); }
  } catch { headerUnavailable = true; }
  return <YouTubeView configured={Boolean(process.env.YOUTUBE_API_KEY?.trim())} header={header} headerUnavailable={headerUnavailable} />;
}
