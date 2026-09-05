/*
  채널별 원문 게시판. 대시보드의 '채널별' 탭이 그리는 화면이다.

  **상태를 주소에 둔다.** 예전에는 고른 채널과 쪽을 리액트 state 에 들고 클라이언트에서
  갈아 끼웠다. 그래서 브리핑·카테고리 표·카드에서 넘어오는 링크가 이 화면에 걸리지
  않았고, 공유한 주소가 남의 화면에서 다른 것을 보여 줬으며, 뒤로 가기가 듣지 않았다.
  지금은 채널도 쪽도 링크다. 서버가 고른 채널의 그 쪽만 읽어 그린다.

  클라이언트 컴포넌트가 아니게 되면서 브라우저로 내려가는 스크립트도 사라졌다.
*/

import Link from 'next/link';

import { ALL_CHANNEL_ID, type ChannelPostSample, type ChannelSample } from './data';
import { ChannelIdentity, ChannelMark, ChannelMeta } from './Shared';
import styles from './channelBoard.module.css';

const PAGE_SIZE = 50;

interface ChannelBoardProps {
  /** 왼쪽 목록. 맨 앞이 '전체'다 */
  channels: ChannelSample[];
  /** 지금 고른 채널. 주소의 source 가 정한다 */
  selectedId: string;
  /** 이번 쪽에 보일 글 */
  posts: ChannelPostSample[];
  page: number;
  /** 고른 채널에서 지금 조건에 걸린 전체 건수 */
  total: number;
  /** 실데이터인지. 아니면 쪽 넘기기를 내지 않는다 */
  live: boolean;
  channelHref: (channelId: string) => string;
  pageHref: (page: number) => string;
}

/* 수집 시각에서 날짜만. 형식이 다르면(‘시각 없음’ 등) 적지 않는다 */
function collectedDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

export function ChannelBoard({
  channels,
  selectedId,
  posts,
  page,
  total,
  live,
  channelHref,
  pageHref,
}: ChannelBoardProps) {
  const selectedChannel =
    channels.find((channel) => channel.id === selectedId) ?? channels[0];

  if (!selectedChannel) {
    return null;
  }

  /* '전체'는 채널 하나가 아니라 전 채널 합계다. 글마다 어디서 왔는지를 같이 적어야 한다 */
  const isAllChannels = selectedChannel.id === ALL_CHANNEL_ID;
  const pageCount = live ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const datesUnavailable =
    posts.length > 0 && posts.every((item) => item.createdAt === '작성일 미확인');
  const rangeStart = posts.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = (page - 1) * PAGE_SIZE + posts.length;
  const boardHeadingId = `reader-board-${selectedChannel.id}`;

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
            const date = collectedDate(channel.lastSuccess);
            return (
              <Link
                key={channel.id}
                href={channelHref(channel.id)}
                className={styles.readerChannelButton}
                data-selected={selected ? 'true' : undefined}
                data-aggregate={channel.id === ALL_CHANNEL_ID ? 'true' : undefined}
                aria-current={selected ? 'page' : undefined}
              >
                <ChannelMark channel={channel} size="sm" />
                <span>
                  <strong>{channel.name}</strong>
                  {/*
                    건수와 마지막 수집 날짜. 가운뎃점으로 잇지 않고 양끝에 붙여 나눈다.
                    '실데이터'는 적지 않는다 — 화면 전체가 실데이터라 구분이 되지 않고,
                    그 자리에는 언제 것인지가 훨씬 쓸모 있다.
                  */}
                  <small>
                    <span>{channel.count.toLocaleString('ko-KR')}건</span>
                    {date && <time dateTime={channel.lastSuccessIso}>{date}</time>}
                  </small>
                </span>
              </Link>
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
      >
        <h2 className={styles.readerSrOnly} id={boardHeadingId}>
          {selectedChannel.name} 수집 글 목록
        </h2>
        <header className={styles.readerBoardHeader}>
          <ChannelIdentity channel={selectedChannel} />
          <ChannelMeta channel={selectedChannel} showMode={false} />
        </header>

        <div className={styles.readerBoardToolbar}>
          <span>
            {live ? '수집 글' : '샘플 글'}{' '}
            <strong>
              {live
                ? `${rangeStart.toLocaleString('ko-KR')}–${rangeEnd.toLocaleString('ko-KR')}`
                : posts.length.toLocaleString('ko-KR')}
            </strong>
            {live && ` / ${total.toLocaleString('ko-KR')}`}건
          </span>
          <small>{datesUnavailable ? '최근 저장순, 작성일 없음' : '최신 작성순'}</small>
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
                    {String((page - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}
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
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {row}
                    </a>
                  ) : (
                    <div
                      className={styles.readerPostUnavailable}
                      aria-disabled="true"
                      title="이 글에는 원문 주소가 없습니다"
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
            지금 걸린 조건에 맞는 글이 없습니다.
          </p>
        )}

        <footer className={styles.readerBoardFooter}>
          <div>
            <span>
              {live
                ? '제목을 누르면 원문을 새 탭에서 엽니다.'
                : '샘플 원문 주소는 연결 전입니다.'}
            </span>
          </div>
          {live && pageCount > 1 && (
            <nav className={styles.readerPagination} aria-label={`${selectedChannel.name} 글 페이지`}>
              {page > 1 ? (
                <Link href={pageHref(page - 1)}>이전</Link>
              ) : (
                <span aria-disabled="true">이전</span>
              )}
              <span>
                <span aria-hidden="true">{page} / {pageCount}</span>
                <span className={styles.readerSrOnly} role="status">
                  {selectedChannel.name} {rangeStart.toLocaleString('ko-KR')}번부터{' '}
                  {rangeEnd.toLocaleString('ko-KR')}번까지, 전체{' '}
                  {total.toLocaleString('ko-KR')}건
                </span>
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)}>다음</Link>
              ) : (
                <span aria-disabled="true">다음</span>
              )}
            </nav>
          )}
        </footer>
      </div>
    </section>
  );
}
