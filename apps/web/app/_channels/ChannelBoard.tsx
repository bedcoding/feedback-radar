/*
  채널별 원문 게시판. 대시보드의 '채널별' 탭이 그리는 화면이다.

  **상태를 주소에 둔다.** 예전에는 고른 채널과 쪽을 리액트 state 에 들고 클라이언트에서
  갈아 끼웠다. 그래서 브리핑·카테고리 표·카드에서 넘어오는 링크가 이 화면에 걸리지
  않았고, 공유한 주소가 남의 화면에서 다른 것을 보여 줬으며, 뒤로 가기가 듣지 않았다.
  지금은 채널도 쪽도 링크다. 서버가 고른 채널의 그 쪽만 읽어 그린다.

  클라이언트 컴포넌트가 아니게 되면서 브라우저로 내려가는 스크립트도 사라졌다.
*/

import type { CSSProperties } from 'react';

import Link from 'next/link';

import { ALL_CHANNEL_ID, type ChannelPostSample, type ChannelSample } from './data';
import { ChannelIdentity, ChannelMark } from './Shared';
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
  /*
    머리줄에 얹을 필터.

    축을 칩으로 펼치지 않는다. 표 탭이 칩 일곱 줄 마흔아홉 개를 늘어놓다가 목록보다
    필터가 길어졌다. 여기서는 축마다 접힌 목록 하나씩이고, 고른 값이 있으면 그 값이
    닫힌 상태의 이름이 된다 — 무엇이 걸렸는지 열어 보지 않아도 읽힌다.
  */
  filters?: {
    menus: {
      id: string;
      /** 아무것도 안 고른 상태에서 보일 이름 */
      label: string;
      active?: string;
      options: { key: string; label: string; count: number }[];
      href: (key: string | null) => string;
    }[];
    /** 걸린 게 하나라도 있을 때만 준다 */
    resetHref?: string;
  };
}

/*
  축 하나를 접어 둔 목록.

  details 를 쓰는 이유는 스크립트 없이 여닫히고 키보드로도 닿기 때문이다.
  고를 값이 하나뿐이면 고를 것이 없는 셈이라 아예 그리지 않는다.
*/
function FilterMenu({
  label,
  active,
  options,
  href,
}: {
  label: string;
  active?: string;
  options: { key: string; label: string; count: number }[];
  href: (key: string | null) => string;
}) {
  if (options.length < 2) return null;
  const activeLabel = options.find((option) => option.key === active)?.label;

  return (
    <details className={styles.readerFilterMenu} data-on={active ? 'true' : undefined}>
      <summary>{activeLabel ?? label}</summary>
      <div>
        <Link href={href(null)} data-on={active ? undefined : 'true'}>
          전체
        </Link>
        {options.map((option) => (
          <Link
            key={option.key}
            href={href(option.key)}
            data-on={active === option.key ? 'true' : undefined}
          >
            {option.label} <b>{option.count.toLocaleString('ko-KR')}</b>
          </Link>
        ))}
      </div>
    </details>
  );
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
  filters,
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
  /*
    쪽 넘기기의 범위 표기 폭을 고정한다.

    '1–50' 과 '51–100' 은 글자 수가 다르다. 그대로 두면 쪽을 넘길 때마다 이 덩어리의
    폭이 변하고, 오른쪽 끝에 붙어 있는 필터 단추들이 그만큼 좌우로 밀린다. 마지막 쪽의
    표기가 가장 넓으므로(예: 3,201–3,260) 그 폭을 미리 잡아 둔다. 숫자는 자간이 고른
    글자꼴로 그리므로 자릿수만 맞추면 폭이 맞는다.
  */
  const totalText = total.toLocaleString('ko-KR');
  const rangeSlot = { '--range-slot': `${totalText.length * 2 + 1}ch` } as CSSProperties;

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
                    마지막 수집 날짜와 건수. 가운뎃점으로 잇지 않고 양끝에 붙여 나눈다.
                    '실데이터'는 적지 않는다 — 화면 전체가 실데이터라 구분이 되지 않고,
                    그 자리에는 언제 것인지가 훨씬 쓸모 있다.

                    **날짜가 왼쪽이다.** 날짜는 열 자로 폭이 고정이지만 건수는 두 자에서
                    다섯 자까지 오간다. 건수를 왼쪽에 두면 그 뒤로 오는 것이 줄마다
                    밀려 기준선이 서지 않는다. 날짜를 왼쪽에 붙여 세로줄을 만들고,
                    건수는 오른쪽 끝에 자릿수를 맞춰 세운다.
                  */}
                  <small>
                    {date && <time dateTime={channel.lastSuccessIso}>{date}</time>}
                    <span>{channel.count.toLocaleString('ko-KR')}건</span>
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
        {/*
          머리는 한 줄이다. 예전에는 두 줄이었는데 같은 값이 두 번 나왔다 —
          건수가 오른쪽 끝과 아랫줄에 각각 있었고, 마지막 수집 시각은 왼쪽 채널
          목록이 이미 같은 줄에 적고 있었다. 중복을 걷어내 생긴 자리에 필터를 넣는다.
        */}
        <header className={styles.readerBoardHeader}>
          <ChannelIdentity channel={selectedChannel} />

          {filters && (
            <div className={styles.readerFilters}>
              {filters.menus.map((menu) => (
                <FilterMenu
                  key={menu.id}
                  label={menu.label}
                  active={menu.active}
                  options={menu.options}
                  href={menu.href}
                />
              ))}
              {filters.resetHref && (
                <Link className={styles.readerFilterReset} href={filters.resetHref}>
                  해제
                </Link>
              )}
            </div>
          )}

          {/*
            머리 오른쪽은 쪽 넘기기만 남긴다. 예전에는 건수와 정렬 기준을 적었는데
            건수는 필터 목록이 이미 축마다 적고 있고, 정렬 기준은 바뀌지 않는 값이라
            매 화면 자리를 차지할 이유가 없다 (아래 footer 로 내렸다).
          */}
          {live && (
            <nav className={styles.readerHeaderPager} style={rangeSlot} aria-label="글 페이지">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} aria-label="이전 쪽">
                  ‹
                </Link>
              ) : (
                <span aria-hidden="true">‹</span>
              )}
              <span>
                <strong>
                  {rangeStart.toLocaleString('ko-KR')}–{rangeEnd.toLocaleString('ko-KR')}
                </strong>{' '}
                / {totalText}
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} aria-label="다음 쪽">
                  ›
                </Link>
              ) : (
                <span aria-hidden="true">›</span>
              )}
            </nav>
          )}
        </header>

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
              {datesUnavailable ? '최근 저장순, 작성일 없음' : '최신 작성순'}
            </span>
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
