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

import { ALL_CHANNEL_ID, IRRELEVANT_CHANNEL_ID, type ChannelPostSample, type ChannelSample } from './data';
import { ChannelFilters, type ChannelFilterMenu } from './ChannelFilters';
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

    주소는 함수가 아니라 문자열로 미리 만들어 넘긴다. 이 줄을 그리는 건 클라이언트
    컴포넌트(ChannelFilters)이고, 서버에서 클라이언트로 함수는 넘길 수 없다.
  */
  filters?: {
    menus: ChannelFilterMenu[];
    /** 걸린 게 하나라도 있을 때만 준다 */
    resetHref?: string;
  };
}

/*
  건수 줄여 쓰기.

  자릿수가 길어지면 이름표가 밀리므로 만·억으로 끊는다. 한국어 화면이라 K/M 이 아니라
  만·억이다 — 우리말 수 체계가 네 자리마다 끊겨 1,234,567 은 '123만' 이 바로 읽힌다.

  **반올림이 아니라 내림에 '+' 를 붙인다.** 반올림하면 999,999,999 가 '10억' 이 되어
  실제보다 크게 말한다. 건수는 "적어도 이만큼" 이어야 하는 값이라 넘겨 말하면 안 된다.
  내림한 값이 정확히 떨어질 때만 '+' 를 뗀다.

  다섯 자리(99,999)까지는 그대로 적는다. 지금 실제 건수가 그 안이라 대부분은 정확한
  값이 보이고, 줄여 쓴 경우에도 정확한 값은 title 과 화면 낭독기에 남는다.
*/
function compactCount(value: number): string {
  if (value < 100_000) return value.toLocaleString('ko-KR');

  const [size, unit] = value >= 100_000_000 ? [100_000_000, '억'] : [10_000, '만'];
  const whole = Math.floor(value / size);
  const exact = value % size === 0;
  return `${whole.toLocaleString('ko-KR')}${unit}${exact ? '' : '+'}`;
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
  /*
    채널 이름을 글마다 적을지. '전체'뿐 아니라 '관련 없음'도 전 채널을 합친 보기라
    어느 채널에서 온 글인지가 없으면 판정이 맞았는지 가늠할 근거가 하나 빈다.
  */
  const isAllChannels =
    selectedChannel.id === ALL_CHANNEL_ID || selectedChannel.id === IRRELEVANT_CHANNEL_ID;
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
  /*
    폭은 **덩어리 전체**에 잡는다. 숫자 칸에만 잡으면 짧은 쪽('51–100')에서 남는 자리가
    화살표와 숫자 사이에 생겨 둘이 떨어져 보인다. 덩어리에 잡고 안쪽을 오른쪽으로
    몰면, 남는 자리는 왼쪽 끝 곧 필터와의 사이로 가서 그냥 간격으로 읽힌다.
    가장 긴 표기는 '3,251–3,260 / 3,260' 이고, 뒤의 px 는 화살표 둘과 그 간격이다.
  */
  /*
    쪽 번호 창. 66쪽을 다 늘어놓을 수는 없으니 지금 쪽을 가운데 두고 열 개만 보인다.
    끝에 가까우면 창이 밀리지 않고 그 끝에 붙는다 — 마지막 쪽에서 번호가 하나만
    남으면 옆 쪽으로 옮겨 갈 수단이 사라진다.
  */
  const PAGE_WINDOW = 10;
  const windowEnd = Math.min(
    pageCount,
    Math.max(PAGE_WINDOW, page + Math.floor(PAGE_WINDOW / 2)),
  );
  const windowStart = Math.max(1, windowEnd - PAGE_WINDOW + 1);
  const pageWindow = Array.from(
    { length: windowEnd - windowStart + 1 },
    (_, index) => windowStart + index,
  );
  const pagerSlot = {
    '--pager-slot': `calc(${totalText.length * 3 + 4}ch + 60px)`,
  } as CSSProperties;

  return (
    <section className={styles.readerShell} aria-label="채널별 원문 게시판">
      <aside className={styles.readerChannels} aria-label="채널 목록">
        <nav>
          {channels.map((channel) => {
            const selected = channel.id === selectedChannel.id;
            const date = collectedDate(channel.lastSuccess);
            return (
              <Link
                key={channel.id}
                href={channelHref(channel.id)}
                className={styles.readerChannelButton}
                // 둘러보기의 '엉뚱한 글은 알아서 걸러냅니다' 단계가 이 항목을 짚는다
                data-tour={channel.id === IRRELEVANT_CHANNEL_ID ? 'irrelevant-row' : undefined}
                data-selected={selected ? 'true' : undefined}
                data-aggregate={channel.id === ALL_CHANNEL_ID ? 'true' : undefined}
                aria-current={selected ? 'page' : undefined}
              >
                {/*
                  표식(GP, AS…)을 여기서는 그리지 않는다. 바로 옆에 채널 이름이 그대로
                  적혀 있어 같은 말을 두 번 하는 셈이고, 30px 을 먹는다. 표식은 게시판
                  머리에만 남긴다 — 거기서는 지금 무엇을 보고 있는지를 혼자 나른다.
                */}
                <span>
                  {/*
                    이름 자체를 채널 색 이름표로 그린다. 동그라미 표식을 뺐더니 목록이
                    한 덩어리 글자로 보여 눈이 걸리지 않았다. 색을 이름에 입히면 표식과
                    같은 구실을 하면서 같은 말을 두 번 하지 않는다.

                    폭은 글자만큼만 잡는다. 모든 채널을 가장 긴 이름에 맞추면 이름표가
                    다 같은 폭이 되는데, 그러면 'X' 한 글자가 72px 칸에 혼자 놓인다.

                    **건수를 이름 줄 오른쪽 끝에 둔다.** 아랫줄 날짜와 나란히 두었을
                    때는 같은 회색 숫자 둘이 한 줄에 앉아 어느 쪽이 무엇인지 갈리지
                    않았다. 줄을 나누면 그 문제가 없다 — 위는 '무엇이 얼마나',
                    아래는 '언제까지'다.
                  */}
                  <span className={styles.readerChannelHead}>
                    <strong data-channel={channel.id}>{channel.name}</strong>
                    <em title={`${channel.count.toLocaleString('ko-KR')}건`}>
                      {compactCount(channel.count)}
                    </em>
                  </span>
                  {/*
                    마지막 수집 날짜와 건수. 표식을 빼면서 생긴 자리에 건수를 되살렸다.
                    날짜는 열 자로 폭이 고정이라 왼쪽에 붙여 세로줄을 만들고,
                    건수는 오른쪽 끝에 자릿수를 맞춰 세운다.
                  */}
                  {/*
                    마지막으로 수집에 성공한 날짜만 적는다.

                    건수를 함께 두면 같은 회색 숫자 둘이 한 줄에 앉아 어느 쪽이 무엇인지
                    갈리지 않았다. 떼어 놓아도, 괄호로 묶어도 마찬가지였다. 지금 보고 있는
                    채널의 건수는 아래 쪽 넘기기가 '1–50 / 3,260' 으로 말한다.
                  */}
                  <small>
                    <span className={styles.readerSrOnly}>마지막 수집 </span>
                    {date ? (
                      <time dateTime={channel.lastSuccessIso}>{date}</time>
                    ) : (
                      <span>기록 없음</span>
                    )}
                  </small>
                  <span className={styles.readerSrOnly}>
                    저장 {channel.count.toLocaleString('ko-KR')}건
                  </span>
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
        <header className={styles.readerBoardHeader} data-tour="categories">
          <ChannelIdentity channel={selectedChannel} />

          {filters && (
            <ChannelFilters menus={filters.menus} resetHref={filters.resetHref} />
          )}

          {/*
            머리 오른쪽은 쪽 넘기기만 남긴다. 예전에는 건수와 정렬 기준을 적었는데
            건수는 필터 목록이 이미 축마다 적고 있고, 정렬 기준은 바뀌지 않는 값이라
            매 화면 자리를 차지할 이유가 없다 (아래 footer 로 내렸다).
          */}
          {live && (
            <nav className={styles.readerHeaderPager} style={pagerSlot} aria-label="글 페이지">
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
          <span>{datesUnavailable ? '작성 시각 없음' : '작성 시각 (KST)'}</span>
          <span>원문</span>
        </div>

        {posts.length > 0 ? (
          <ol className={styles.readerPostList} data-tour="items">
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

        {/*
          아래는 쪽 번호만 둔다. 예전에는 정렬 기준과 '제목을 누르면 원문이 열린다'는
          안내를 함께 적었는데, 정렬은 화면마다 바뀌지 않는 값이고 링크가 열린다는 것은
          눌러 보면 아는 일이라 매번 두 줄을 차지할 값이 아니었다. 작성일이 없는 채널이라는
          신호만 위쪽 열 이름으로 옮겼다.
        */}
        {live && pageCount > 1 && (
          <footer className={styles.readerBoardFooter}>
            <nav className={styles.readerPagination} aria-label={`${selectedChannel.name} 글 페이지`}>
              <span className={styles.readerSrOnly} role="status">
                전체 {pageCount.toLocaleString('ko-KR')}쪽 가운데 {page.toLocaleString('ko-KR')}쪽,{' '}
                {rangeStart.toLocaleString('ko-KR')}번부터 {rangeEnd.toLocaleString('ko-KR')}번까지
              </span>

              {page > 1 ? (
                <Link href={pageHref(1)} aria-label="첫 쪽">
                  «
                </Link>
              ) : (
                <span aria-hidden="true">«</span>
              )}
              {page > 1 ? (
                <Link href={pageHref(page - 1)} aria-label="이전 쪽">
                  ‹
                </Link>
              ) : (
                <span aria-hidden="true">‹</span>
              )}

              <ol>
                {pageWindow.map((n) => (
                  <li key={n}>
                    {n === page ? (
                      <span aria-current="page">{n}</span>
                    ) : (
                      <Link href={pageHref(n)}>{n}</Link>
                    )}
                  </li>
                ))}
              </ol>

              {page < pageCount ? (
                <Link href={pageHref(page + 1)} aria-label="다음 쪽">
                  ›
                </Link>
              ) : (
                <span aria-hidden="true">›</span>
              )}
              {page < pageCount ? (
                <Link href={pageHref(pageCount)} aria-label="마지막 쪽">
                  »
                </Link>
              ) : (
                <span aria-hidden="true">»</span>
              )}
            </nav>
          </footer>
        )}
      </div>
    </section>
  );
}
