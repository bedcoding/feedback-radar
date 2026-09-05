'use client';

import { useRef, useState } from 'react';

import {
  channelPostSamples,
  type ChannelPostSample,
  type ChannelSample,
} from '../_data/channels';
import { ChannelIdentity, ChannelMeta, ChannelMark, ItemList, ModeLabel } from '../_components/Shared';
import styles from './VariantsC.module.css';

type ConceptProps = {
  channels: ChannelSample[];
};

function totalCount(channels: ChannelSample[]) {
  return channels.reduce((sum, channel) => sum + channel.count, 0);
}

export function Concept07({ channels }: ConceptProps) {
  return (
    <section className={styles.matrixShell} aria-label="채널 비교 매트릭스">
      <div className={styles.matrixIntro}>
        <p>각 채널의 대표 이슈와 마지막 수집 상태를 같은 열에서 비교합니다.</p>
        <span>행을 열면 세부 항목을 확인할 수 있습니다</span>
      </div>

      <div className={styles.matrixTable}>
        <div className={styles.matrixHead} aria-hidden="true">
          <span>채널</span>
          <span>대표 이슈</span>
          <span>마지막 성공</span>
          <span>건수</span>
          <span>보기</span>
        </div>

        {channels.map((channel, index) => (
          <details className={styles.matrixRow} key={channel.id} open={index === 0}>
            <summary>
              <span className={styles.matrixIdentity}>
                <ChannelIdentity channel={channel} compact />
                <ModeLabel channel={channel} />
              </span>
              <span className={styles.matrixLead}>{channel.lead.title}</span>
              <time dateTime={channel.lastSuccessIso}>{channel.lastSuccess}</time>
              <span className={styles.matrixCount}>{channel.count}</span>
              <span className={styles.matrixToggle} aria-hidden="true">
                <span>열기</span>
                <i />
              </span>
            </summary>

            <div className={styles.matrixExpansion}>
              <div className={styles.matrixBrief}>
                <span>{channel.lead.topic}</span>
                <p>{channel.lead.summary}</p>
                <small>{channel.lead.evidence}</small>
              </div>
              <ItemList channel={channel} excerpts />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Concept08({ channels }: ConceptProps) {
  return (
    <section className={styles.accordionShell} aria-label="채널 아코디언">
      <header className={styles.accordionIntro}>
        <div>
          <span>CHANNEL INDEX</span>
          <p>대표 문장을 먼저 읽고, 궁금한 채널만 펼쳐 세부 내용을 확인하세요.</p>
        </div>
        <dl>
          <div>
            <dt>채널</dt>
            <dd>{channels.length}</dd>
          </div>
          <div>
            <dt>저장 항목</dt>
            <dd>{totalCount(channels)}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.accordionList}>
        {channels.map((channel, index) => (
          <details key={channel.id} className={styles.accordionItem} open={index === 0}>
            <summary>
              <span className={styles.accordionNumber}>{String(index + 1).padStart(2, '0')}</span>
              <ChannelIdentity channel={channel} compact />
              <span className={styles.accordionHeadline}>{channel.lead.title}</span>
              <span className={styles.accordionMeta}>
                <ModeLabel channel={channel} />
                <time dateTime={channel.lastSuccessIso}>{channel.lastSuccess}</time>
                <span>{channel.count}건</span>
              </span>
              <span className={styles.accordionToggle} aria-hidden="true" />
            </summary>

            <div className={styles.accordionBody}>
              <div className={styles.accordionLead}>
                <span>{channel.lead.topic}</span>
                <p>{channel.lead.summary}</p>
                <small>{channel.lead.evidence}</small>
              </div>
              <ItemList channel={channel} excerpts />
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Concept09({ channels }: ConceptProps) {
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
      const response = await fetch(`/card-lab/concepts/09-news-reader/items?${params.toString()}`, {
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
          <small>{channels.length}</small>
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

export function Concept10({ channels }: ConceptProps) {
  const total = totalCount(channels);
  const automatic = channels.filter((channel) => channel.mode === '자동 방식').length;
  const manual = channels.filter((channel) => channel.mode === '수동 방식').length;

  return (
    <article className={styles.reportShell} aria-label="채널 수집 리포트">
      <header className={styles.reportCover}>
        <div className={styles.reportEdition}>
          <span>FEEDBACK RADAR</span>
          <time dateTime="2026-08-20">2026. 08. 20</time>
        </div>
        <div className={styles.reportTitleBlock}>
          <p>채널 수집 스냅샷</p>
          <h2>일곱 개 채널에서<br />마지막으로 확인된 반응</h2>
          <span>
            동일한 기간 비교가 아닌, 채널마다 마지막으로 성공한 수집분을 정리한 편집 리포트입니다.
          </span>
        </div>
        <dl className={styles.reportStats}>
          <div>
            <dt>채널</dt>
            <dd>{channels.length}</dd>
          </div>
          <div>
            <dt>저장 항목</dt>
            <dd>{total}</dd>
          </div>
          <div>
            <dt>자동 / 수동</dt>
            <dd>{automatic} / {manual}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.reportLayout}>
        <aside className={styles.reportToc}>
          <p>목차</p>
          <nav aria-label="채널 리포트 목차">
            {channels.map((channel, index) => (
              <a key={channel.id} href={`#report-${channel.id}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {channel.name}
              </a>
            ))}
          </nav>
          <small>샘플 데이터<br />기존 수집분은 2026.08.20까지</small>
        </aside>

        <div className={styles.reportChapters}>
          <section className={styles.reportPreface}>
            <span>EDITOR&apos;S NOTE</span>
            <p>
              이 문서는 채널 간 우열을 정하기보다, 마지막 저장 시점에 어떤 이용자 반응이 남아 있었는지
              차분히 읽기 위해 구성했습니다. 수집 시각과 방식은 각 장의 머리말에 따로 표기합니다.
            </p>
          </section>

          {channels.map((channel, index) => (
            <section className={styles.reportChapter} id={`report-${channel.id}`} key={channel.id}>
              <header className={styles.reportChapterHeader}>
                <span className={styles.reportChapterNumber}>{String(index + 1).padStart(2, '0')}</span>
                <ChannelIdentity channel={channel} />
                <ChannelMeta channel={channel} />
              </header>

              <div className={styles.reportLead}>
                <span>{channel.lead.topic}</span>
                <h3>{channel.lead.title}</h3>
                <p>{channel.lead.summary}</p>
                <small>{channel.lead.evidence}</small>
              </div>

              <ol className={styles.reportItemList}>
                {channel.items.map((item) => (
                  <li key={`${channel.id}-report-${item.title}`}>
                    <div>
                      <span>{item.topic}</span>
                      <time>{item.createdAt}</time>
                    </div>
                    <h4>{item.title}</h4>
                    <p>{item.excerpt}</p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
