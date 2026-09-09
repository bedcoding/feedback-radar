'use client';
import { useEffect, useRef, useState } from 'react';
import type { Result } from './collect';
function CommentText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 400 || text.split('\n').length > 6;
  return <><p className={long && !expanded ? styles.clamped : undefined}>{text}</p>{long && <button className={styles.expand} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '접기' : '전체 읽기'}</button>}</>;
}
import { MainTabs } from '../_dashboard/MainTabs';
import { PageHeader, type PageHeaderData } from '../_dashboard/PageHeader';
import styles from './youtube.module.css';
export default function YouTubeView({ configured, header, headerUnavailable }: { configured: boolean; header: PageHeaderData; headerUnavailable: boolean }) {
  const [keywords, setKeywords] = useState('');
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(0);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('');
  const [visible, setVisible] = useState(30);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch('/youtube/api', {cache:'no-store'}).then(async response => {
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error);
      if (cancelled) return;
      setKeywords(saved.keywords.join('\n'));
      if (saved.result) { setResult(saved.result); setSelected(saved.result.videos[0]?.id ?? ''); previous.current = new Set(saved.result.videos.flatMap((v: Result['videos'][number]) => v.comments.map(c => c.id))); }
    }).catch(() => { if (!cancelled) setError('저장된 수집 결과를 불러오지 못했습니다.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const previous = useRef(new Set<string>());
  const running = useRef(false);
  const scope = useRef('');
  async function run() {
    if (running.current || loading) return;
    const list = [...new Set(keywords.split('\n').map(v => v.trim()).filter(Boolean))];
    if (!list.length || list.length > 5 || list.some(v => v.length > 100)) { setError('검색어를 한 줄에 하나씩, 최대 5개 입력해 주세요.'); setAutomatic(false); return; }
    if (scope.current !== JSON.stringify(list)) { previous.current.clear(); scope.current = JSON.stringify(list); }
    running.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/youtube/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: list }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const next = data as Result;
      const ids = next.videos.flatMap(v => v.comments.map(c => c.id));
      setFresh(data.added ?? ids.filter(id => !previous.current.has(id)).length);
      previous.current = new Set(ids);
      setResult(next);
      setSelected(current => next.videos.some(v => v.id === current) ? current : (next.videos[0]?.id ?? ''));
      setVisible(30);
      if (next.videos.some(v => /할당량 소진|조회 실패/.test(v.status))) setAutomatic(false);
    } catch (e) { setError(e instanceof Error ? e.message : '조회 실패'); setAutomatic(false); }
    finally { running.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!automatic) return;
    const timer = setInterval(() => { void run(); }, 2 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [automatic, keywords]);
  const activeVideo = result?.videos.find(v => v.id === selected);
  const comments = activeVideo?.comments.filter(c => c.text.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) ?? [];
  const total = result?.videos.reduce((n, v) => n + v.comments.length, 0) ?? 0;
  const keywordCount = keywords.split('\n').filter(v => v.trim()).length;
  return <main className={styles.shell}>
    <PageHeader {...header} />
    <MainTabs active="youtube" youtube className={styles.tabs} />
    <div className={styles.heading}>
      <div><span className={styles.eyebrow}>영상 속 이야기, 댓글 속 피드백</span><h2>YouTube 누적 수집</h2><p>관련 영상과 댓글을 저장하고, 지난번 멈춘 위치부터 이어서 모읍니다.</p></div>
      <span className={styles.connection}><span className={configured ? styles.ready : styles.offline} />{configured ? 'API 키 설정됨' : '연결 설정 필요'}</span>
    </div>
    {headerUnavailable && <p className={styles.notice} role="status">서비스 설정을 불러오지 못했습니다. 검색어를 직접 입력해 주세요.</p>}
    <section className={styles.searchPanel} aria-label="검색 설정">
      <div className={styles.queryArea}>
        <div className={styles.labelRow}><label htmlFor="youtube-keywords">어떤 서비스를 살펴볼까요?</label><span>{keywordCount} / 5 검색어</span></div>
        <textarea id="youtube-keywords" rows={3} value={keywords} disabled={loading || busy || automatic} onChange={e => setKeywords(e.target.value)} placeholder={'서비스명 또는 해외 서비스명을 입력하세요\n검색어는 한 줄에 하나씩'} />
        <p className={styles.hint}>검색 진행 위치를 저장하고 한 번에 영상 최대 20개씩 이어서 수집합니다.</p>
      </div>
      <div className={styles.searchActions}>
        <button className={styles.primary} disabled={loading || !configured || busy || !keywords.trim()} onClick={() => void run()}>{busy ? '댓글을 모으는 중…' : result ? '이어서 수집하기' : '수집 시작하기'}<span aria-hidden="true">{busy ? '◌' : '→'}</span></button>
        <label className={styles.toggle}><input type="checkbox" checked={automatic} disabled={loading || !configured || busy} onChange={e => { setAutomatic(e.target.checked); if (e.target.checked) void run(); }} /><span>2시간마다 이어서 수집<small>이 화면을 열어 둔 동안 실행</small></span></label>
      </div>
    </section>
    {!configured && <p className={styles.notice} role="status">설정 파일에 YouTube API 키를 추가한 뒤 서버를 다시 시작해 주세요. <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">연결 설정 ↗</a></p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <details className={styles.limits}><summary>수집 범위와 보관 안내</summary><p>한 번에 영상 최대 20개를 처리하고, 영상별 댓글은 최대 200개씩 가져옵니다. 남은 댓글과 답글은 다음 수집에서 이어집니다. 실행당 최대 80회 호출합니다. 검색 결과를 끝까지 확인하면 첫 페이지부터 새 댓글을 확인합니다. 결과와 수집 진행 위치는 프로젝트 DB에 누적 저장됩니다. 수집 시 마지막 확인 후 25일이 지난 기존 영상과 댓글을 다시 확인해 계속 보관합니다. 삭제 또는 비공개가 확인된 원문과 30일 동안 갱신하지 못한 데이터만 정리합니다. 장기 보관하려면 주기적으로 수집을 실행해 주세요. 자동 감정 분석은 적용하지 않습니다.</p></details>
    {busy && <div className={styles.progress} role="status"><span className={styles.spinner} /><div><strong>관련 영상과 댓글을 찾고 있습니다</strong><p>답글까지 확인하고 중복을 정리합니다. 잠시만 기다려 주세요.</p></div></div>}
    {!result && !busy && <section className={styles.empty}>
      <div className={styles.play} aria-hidden="true">▷</div><h3>첫 번째 댓글 탐색을 시작해 보세요</h3><p>검색어만 입력하면, 여러 영상에 흩어진 반응을<br />한 화면에서 읽을 수 있습니다.</p>
      <ol className={styles.steps}><li><span>01</span>서비스 검색</li><li><span>02</span>영상·댓글 자동 조회</li><li><span>03</span>반응과 원문 확인</li></ol>
    </section>}
    {result && <section className={styles.results} aria-label="조회 결과">
      <div className={styles.resultHeading}><h3>탐색 결과</h3><span>{new Date(result.checkedAt).toLocaleString()} 조회 시작 기준{busy ? ' · 새 결과 조회 중' : ''}</span></div>
      <div className={styles.stats} aria-live="polite"><div><span>누적 영상</span><strong>{result.videos.length}<small>개</small></strong></div><div><span>저장된 댓글과 답글</span><strong>{total.toLocaleString()}<small>개</small></strong></div><div><span>이번에 추가된 댓글</span><strong>{fresh.toLocaleString()}<small>개</small></strong></div></div>
      {result.refreshPending && <p className={styles.notice}>기존 데이터 일부를 아직 갱신하지 못했습니다. 다음 수집에서 다시 확인합니다.</p>}
      {result.limited && <p className={styles.notice}>이번 수집 범위에 도달했습니다. 이어서 수집하면 대기 중인 영상과 댓글부터 진행합니다.</p>}
      {!result.videos.length ? <div className={styles.empty}><h3>관련 영상을 찾지 못했습니다</h3><p>서비스의 다른 이름이나 해외 표기로 다시 검색해 보세요.</p></div> : <div className={styles.workspace}>
        <aside className={styles.videoList} aria-label="검색된 영상"><div className={styles.listHeading}>영상 목록 <span>{result.videos.length}</span></div>{result.videos.map((video, index) => <button key={video.id} className={selected === video.id ? styles.selectedVideo : styles.video} aria-pressed={selected === video.id} onClick={() => { setSelected(video.id); setVisible(30); setFilter(''); }}><span className={styles.videoNumber}>{String(index + 1).padStart(2, '0')}</span><span className={styles.videoInfo}><strong>{video.title}</strong><small>{video.comments.length.toLocaleString()}개 댓글 · {video.status}</small></span></button>)}</aside>
        {activeVideo && <article className={styles.reader}><div className={styles.readerHead}><span className={styles.eyebrow}>시청자 댓글</span><h3>{activeVideo.title}</h3><div><span>{activeVideo.status}</span><a href={activeVideo.url} target="_blank" rel="noreferrer">YouTube에서 보기 ↗</a></div></div>
          <div className={styles.filter}><label htmlFor="comment-filter">댓글 내 검색</label><input id="comment-filter" type="search" placeholder="현재 영상의 댓글에서 찾기" value={filter} onChange={e => { setFilter(e.target.value); setVisible(30); }} /><span>{comments.length.toLocaleString()}개</span></div>
          <div className={styles.comments}>{comments.slice(0, visible).map(c => <div key={c.id} className={c.reply ? styles.reply : styles.comment}><div className={styles.commentMeta}><span>{c.reply ? '답글' : '댓글'}</span><time dateTime={c.publishedAt}>{c.publishedAt && new Date(c.publishedAt).toLocaleDateString()}</time><a href={c.url} target="_blank" rel="noreferrer">원문 ↗</a></div><CommentText text={c.text} /></div>)}
          {!comments.length && <p className={styles.noComments}>{filter ? '일치하는 댓글이 없습니다.' : activeVideo.status === '공개 댓글 없음' ? '공개 댓글이 없습니다.' : '표시할 댓글이 없습니다. 위의 조회 상태를 확인해 주세요.'}</p>}</div>
          {visible < comments.length && <button className={styles.more} onClick={() => setVisible(n => n + 30)}>댓글 더 보기 <span>{visible} / {comments.length}</span></button>}
        </article>}
      </div>}
    </section>}
  </main>;
}
