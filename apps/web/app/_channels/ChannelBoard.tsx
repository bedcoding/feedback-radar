'use client';

/*
  채널별 원문 게시판. 대시보드의 '채널별' 탭이 그리는 화면이다.

  카드 시안 갤러리(card-lab)에서 09번 시안으로 시작해 그대로 승격됐다. 갤러리를
  걷어내면서 이 파일만 떼어 왔고, 목록 페이지를 불러오는 주소도 랩 경로가 아니라
  /api/channels/items 로 옮겼다.
*/

import { useRef, useState } from 'react';

import {
  ALL_CHANNEL_ID,
  channelPostSamples,
  type ChannelPostSample,
  type ChannelSample,
} from './data';
import { ChannelIdentity, ChannelMark, ChannelMeta } from './Shared';
import styles from './channelBoard.module.css';

type ChannelBoardProps = {
  channels: ChannelSample[];
};

export function ChannelBoard({ channels }: ChannelBoardProps) {
  const pageSize = 50;
  const firstChannel = channels[0];
  const [selectedChannelId, setSelectedChannelId] = useState(firstChannel?.id ?? '');
  const [page, setPage] = useState(1);
  const [pageCache, setPageCache] = useState<Record<string, ChannelPostSample[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const boardHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? firstChannel;

  if (!selectedChannel) {
    return null;
  }

  const hasDatabaseData = selectedChannel.dataOrigin === 'database';
  /* '전체'는 채널 하나가 아니라 전 채널 합계다. 글마다 어디서 왔는지를 같이 적어야 한다 */
  const isAllChannels = selectedChannel.id === ALL_CHANNEL_ID;
  const pageKey = `${selectedChannel.id}:${page}`;
  const firstPagePosts = hasDatabaseData
    ? selectedChannel.items
    : [...selectedChannel.items, ...(channelPostSamples[selectedChannel.id] ?? [])];
  const posts = page === 1 ? firstPagePosts : (pageCache[pageKey] ?? []);
  const pageCount = hasDatabaseData ? Math.max(1, Math.ceil(selectedChannel.count / pageSize)) : 1;
  const datesUnavailable = posts.length > 0
    && posts.every((item) => item.createdAt === '작성일 미확인');
  const rangeStart = posts.length > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = (page - 1) * pageSize + posts.length;
  const boardHeadingId = `reader-board-${selectedChannel.id}`;

  function focusBoardStart() {
    requestAnimationFrame(() => {
      boardHeadingRef.current?.focus();
      boardHeadingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  function selectChannel(channelId: string) {
    requestIdRef.current += 1;
    setSelectedChannelId(channelId);
    setPage(1);
    setLoading(false);
    setLoadError('');
    setFailedPage(null);
  }

  async function selectPage(nextPage: number) {
    if (!hasDatabaseData || loading || nextPage < 1 || nextPage > pageCount || nextPage === page) {
      return;
    }
    const nextKey = `${selectedChannel.id}:${nextPage}`;
    if (nextPage === 1 || pageCache[nextKey]) {
      setPage(nextPage);
      setLoadError('');
      setFailedPage(null);
      focusBoardStart();
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setLoadError('');
    setFailedPage(null);
    try {
      const params = new URLSearchParams({ source: selectedChannel.id, page: String(nextPage) });
      const response = await fetch(`/api/channels/items?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('request failed');
      const payload = (await response.json()) as { items?: ChannelPostSample[] };
      if (!Array.isArray(payload.items)) throw new Error('invalid response');
      if (requestId !== requestIdRef.current) return;
      setPageCache((current) => ({ ...current, [nextKey]: payload.items! }));
      setPage(nextPage);
      focusBoardStart();
    } catch {
      if (requestId === requestIdRef.current) {
        setLoadError('목록을 불러오지 못했습니다. 다시 시도해 주세요.');
        setFailedPage(nextPage);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  return (
    <section className={styles.readerShell} aria-label="채널별 원문 게시판">
      <aside className={styles.readerChannels} aria-label="채널 목록">
        <div className={styles.readerRailTitle}>
          <span>채널</span>
          {/* '전체'는 채널이 아니라 합계 보기라 채널 수에서 뺀다 */}
          <small>{channels.filter((channel) => channel.id !== ALL_CHANNEL_ID).length}</small>
        </div>
        <nav>
          {channels.map((channel) => {
            const selected = channel.id === selectedChannel.id;
            return (
              <button
                type="button"
                key={channel.id}
                className={styles.readerChannelButton}
                data-selected={selected ? 'true' : undefined}
                data-aggregate={channel.id === ALL_CHANNEL_ID ? 'true' : undefined}
                aria-pressed={selected}
                onClick={() => selectChannel(channel.id)}
              >
                <ChannelMark channel={channel} size="sm" />
                <span>
                  <strong>{channel.name}</strong>
                  <small>
                    {channel.count.toLocaleString('ko-KR')}건 ·{' '}
                    {channel.dataOrigin === 'database' ? '실데이터' : channel.mode.replace(' 방식', '')}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div
        className={styles.readerBoard}
        /* 전체 보기에서는 채널 열이 하나 더 붙는다. 그리드 칸 수를 CSS가 여기서 읽는다 */
        data-aggregate={isAllChannels ? 'true' : undefined}
        role="region"
        aria-labelledby={boardHeadingId}
        aria-busy={loading}
      >
        <h2
          className={styles.readerSrOnly}
          id={boardHeadingId}
          ref={boardHeadingRef}
          tabIndex={-1}
        >
          {selectedChannel.name} 수집 글 목록
        </h2>
        <header className={styles.readerBoardHeader}>
          <ChannelIdentity channel={selectedChannel} />
          <ChannelMeta channel={selectedChannel} showMode={false} />
        </header>

        <div className={styles.readerBoardToolbar}>
          <span>
            {hasDatabaseData ? '수집 글' : '샘플 글'}{' '}
            <strong>
              {hasDatabaseData
                ? `${rangeStart.toLocaleString('ko-KR')}–${rangeEnd.toLocaleString('ko-KR')}`
                : posts.length.toLocaleString('ko-KR')}
            </strong>
            {hasDatabaseData && ` / ${selectedChannel.count.toLocaleString('ko-KR')}`}건
          </span>
          <small>{datesUnavailable ? '최근 저장순 · 작성일 없음' : '최신 작성순'}</small>
        </div>

        <div className={styles.readerPostHead} aria-hidden="true">
          <span>번호</span>
          <span>제목</span>
          {isAllChannels && <span>채널</span>}
          <span>서비스 및 분류</span>
          <span>작성 시각 (KST)</span>
          <span>원문</span>
        </div>

        {posts.length > 0 ? (
          <ol className={styles.readerPostList}>
            {posts.map((item, index) => {
            const row = (
              <>
                <span className={styles.readerPostNumber}>
                  {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                </span>
                <span className={styles.readerPostTitle}>{item.title}</span>
                {isAllChannels && (
                  <span className={styles.readerPostSource}>
                    {item.sourceLabel ?? '채널 미상'}
                  </span>
                )}
                <span className={styles.readerPostContext}>
                  {item.service && <span>{item.service}</span>}
                  <small>{item.topic}</small>
                </span>
                <time dateTime={item.createdAtIso} data-precision={item.createdAtPrecision}>
                  {datesUnavailable ? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className={styles.readerSrOnly}>작성일 미확인</span>
                    </>
                  ) : (
                    <>
                      {item.createdAt}
                      {item.createdAtPrecision === 'date' && <small>시각 미제공</small>}
                    </>
                  )}
                </time>
                <span className={styles.readerPostAction}>
                  {item.url ? (
                    <>열기 <span aria-hidden="true">↗</span></>
                  ) : '원문 없음'}
                </span>
              </>
            );

            return (
              <li key={`${selectedChannel.id}-post-${item.id ?? `${item.createdAt}-${item.title}`}`}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row}
                  </a>
                ) : (
                  <div
                    className={styles.readerPostUnavailable}
                    aria-disabled="true"
                    title="샘플 데이터에는 원문 주소가 없습니다"
                  >
                    {row}
                  </div>
                )}
              </li>
            );
            })}
          </ol>
        ) : (
          <p className={styles.readerEmptyState} role="status">
            이 페이지에 표시할 수집 글이 없습니다.
          </p>
        )}

        <footer className={styles.readerBoardFooter}>
          <div>
            <span>
              {hasDatabaseData
                ? '제목을 누르면 원문을 새 탭에서 엽니다.'
                : '샘플 원문 주소는 연결 전입니다.'}
            </span>
            {loadError && (
              <strong className={styles.readerLoadError} role="alert">
                {loadError}
                {failedPage !== null && (
                  <button type="button" onClick={() => selectPage(failedPage)}>다시 시도</button>
                )}
              </strong>
            )}
          </div>
          {hasDatabaseData ? (
            <nav className={styles.readerPagination} aria-label={`${selectedChannel.name} 글 페이지`}>
              <button
                type="button"
                disabled={page === 1 || loading}
                onClick={() => selectPage(page - 1)}
              >
                이전
              </button>
              <span>
                <span aria-hidden="true">{loading ? '불러오는 중…' : `${page} / ${pageCount}`}</span>
                <span className={styles.readerSrOnly} role="status">
                  {loading
                    ? `${selectedChannel.name} 글을 불러오는 중입니다.`
                    : `${selectedChannel.name} ${rangeStart.toLocaleString('ko-KR')}번부터 ${rangeEnd.toLocaleString('ko-KR')}번까지, 전체 ${selectedChannel.count.toLocaleString('ko-KR')}건`}
                </span>
              </span>
              <button
                type="button"
                disabled={page === pageCount || loading}
                onClick={() => selectPage(page + 1)}
              >
                다음
              </button>
            </nav>
          ) : (
            <span>{posts.length} / {selectedChannel.count.toLocaleString('ko-KR')}건 표시</span>
          )}
        </footer>
      </div>
    </section>
  );
}
