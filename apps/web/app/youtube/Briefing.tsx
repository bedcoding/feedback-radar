'use client';
import { useEffect, useState } from 'react';
import type { Result } from './collect';
export function YouTubeBriefing() {
  const [result,setResult] = useState<Result>();
  const [failed,setFailed] = useState(false);
  useEffect(() => {
    let cancelled=false;
    fetch('/youtube/api',{cache:'no-store'}).then(async r => { if(!r.ok) throw new Error(); const data=await r.json();if(!cancelled)setResult(data.result); }).catch(()=>{if(!cancelled)setFailed(true);});
    return ()=>{cancelled=true;};
  },[]);
  const summaries=result?.videos.filter(v=>v.summary) ?? [];
  return <section aria-label="YouTube 브리핑" style={{padding:'24px',marginTop:'24px',border:'1px solid var(--line, #ddd)',borderRadius:12}}>
    <h2>YouTube 브리핑</h2>
    <p>댓글 표본에 대한 자체 AI 요약이며 YouTube의 공식 분석이 아닙니다. <a href="/youtube">수집 상태 보기</a></p>
    {failed ? <p>저장된 YouTube 브리핑을 불러오지 못했습니다.</p> : !summaries.length ? <p>아직 생성된 요약이 없습니다. 요약 기능과 AI 설정을 켜면 수집 시 변경된 영상부터 요약합니다.</p> : summaries.map(v=><article key={v.id}>
      <h3><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a></h3>
      <p>요약 시각 {v.summarizedAt ? new Date(v.summarizedAt).toLocaleString('ko-KR') : ''} / 사용 댓글 {v.summarySampleSize}개{v.summaryNeeded ? ' / 새 댓글 수에 따른 갱신 대기' : ''}</p>
      <p style={{whiteSpace:'pre-wrap'}}>{v.summary}</p>
    </article>)}
  </section>;
}
