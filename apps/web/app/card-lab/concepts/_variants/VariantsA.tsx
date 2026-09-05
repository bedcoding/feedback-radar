'use client';

import { useState } from 'react';

import { ChannelMark, ModeLabel } from '../_components/Shared';
import type { ChannelSample } from '../_data/channels';
import styles from './VariantsA.module.css';

type ConceptProps = {
  channels: ChannelSample[];
};

export function Concept01({ channels }: ConceptProps) {
  const [selectedId, setSelectedId] = useState(channels[0]?.id ?? '');
  const selected = channels.find((channel) => channel.id === selectedId) ?? channels[0];

  if (!selected) {
    return null;
  }

  return (
    <section className={styles.desk} aria-label="채널 데스크 시안">
      <aside className={styles.deskRail}>
        <div className={styles.deskRailHeading}>
          <div>
            <span className={styles.eyebrow}>CHANNEL DESK</span>
            <h2>채널</h2>
          </div>
          <span className={styles.railCount}>{channels.length}</span>
        </div>

        <div className={styles.deskTabs} role="tablist" aria-label="상세 내용을 볼 채널">
          {channels.map((channel) => {
            const active = channel.id === selected.id;
            return (
              <button
                className={styles.deskTab}
                data-active={active ? 'true' : undefined}
                id={`concept01-tab-${channel.id}`}
                key={channel.id}
                onClick={() => setSelectedId(channel.id)}
                role="tab"
                type="button"
                aria-controls={`concept01-panel-${channel.id}`}
                aria-selected={active}
              >
                <ChannelMark channel={channel} size="sm" />
                <span className={styles.deskTabCopy}>
                  <strong>{channel.name}</strong>
                  <small>{channel.lastSuccess}</small>
                </span>
                <span className={styles.deskTabMode} data-mode={channel.mode} aria-label={channel.mode} />
              </button>
            );
          })}
        </div>

        <p className={styles.deskRailNote}>채널마다 마지막으로 성공한 시점의 내용을 보여줍니다.</p>
      </aside>

      <article
        className={styles.deskDetail}
        id={`concept01-panel-${selected.id}`}
        role="tabpanel"
        aria-labelledby={`concept01-tab-${selected.id}`}
      >
        <header className={styles.deskDetailHeader}>
          <div className={styles.deskIdentity}>
            <ChannelMark channel={selected} size="lg" />
            <div>
              <span>{selected.kind}</span>
              <h2>{selected.name}</h2>
            </div>
          </div>
          <div className={styles.deskStatus}>
            <ModeLabel channel={selected} />
            <time dateTime={selected.lastSuccessIso}>마지막 성공 {selected.lastSuccess}</time>
            <span>{selected.count}건</span>
          </div>
        </header>

        <div className={styles.deskFeature}>
          <div className={styles.deskLead}>
            <span className={styles.topicLabel}>{selected.lead.topic}</span>
            <h3>{selected.lead.title}</h3>
            <p>{selected.lead.summary}</p>
            <small>{selected.lead.evidence}</small>
          </div>
          <blockquote className={styles.deskQuote}>
            <span>핵심 근거</span>
            <p>“{selected.items[0]?.excerpt ?? selected.lead.summary}”</p>
            <small>{selected.items[0]?.topic ?? selected.lead.topic} · {selected.items[0]?.createdAt}</small>
          </blockquote>
        </div>

        <section className={styles.deskStories} aria-labelledby={`concept01-stories-${selected.id}`}>
          <div className={styles.deskStoriesHeading}>
            <h3 id={`concept01-stories-${selected.id}`}>함께 확인할 내용</h3>
            <span>{selected.items.length}개 항목</span>
          </div>
          <ol>
            {selected.items.map((item, index) => (
              <li key={`${selected.id}-${item.title}`}>
                <span className={styles.storyIndex}>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h4>{item.title}</h4>
                  <p>{item.excerpt}</p>
                </div>
                <small>{item.topic}<br />{item.createdAt}</small>
              </li>
            ))}
          </ol>
        </section>
      </article>
    </section>
  );
}

export function Concept02({ channels }: ConceptProps) {
  return (
    <section className={styles.newsstand} aria-label="뉴스스탠드 시안">
      <header className={styles.newsstandHeader}>
        <div>
          <span className={styles.eyebrow}>CHANNEL NEWSSTAND</span>
          <h2>채널별 최신 수집</h2>
        </div>
        <p>대표 내용은 굵게, 이어지는 소식은 가볍게 훑습니다.</p>
      </header>

      <div className={styles.newsGrid}>
        {channels.map((channel) => (
          <article className={styles.newsCard} key={channel.id}>
            <header className={styles.newsCardHeader}>
              <div className={styles.newsIdentity}>
                <ChannelMark channel={channel} size="sm" />
                <div>
                  <h3>{channel.name}</h3>
                  <span>{channel.kind}</span>
                </div>
              </div>
              <ModeLabel channel={channel} />
            </header>

            <div className={styles.newsDateline}>
              <time dateTime={channel.lastSuccessIso}>{channel.lastSuccess}</time>
              <span>{channel.count}건</span>
            </div>

            <div className={styles.newsLead}>
              <span>{channel.lead.topic}</span>
              <h4>{channel.lead.title}</h4>
              <p>{channel.lead.summary}</p>
            </div>

            <ol className={styles.newsList}>
              {channel.items.map((item) => (
                <li key={`${channel.id}-${item.title}`}>
                  <div>
                    <p>{item.title}</p>
                    <small>{item.topic}</small>
                  </div>
                  <time>{item.createdAt}</time>
                </li>
              ))}
            </ol>

            <footer className={styles.newsCardFooter}>
              <span>{channel.lead.evidence}</span>
              <span aria-hidden="true">→</span>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Concept03({ channels }: ConceptProps) {
  return (
    <section className={styles.shelf} aria-label="채널 선반 시안">
      <header className={styles.shelfHeader}>
        <div>
          <span className={styles.eyebrow}>CHANNEL INDEX</span>
          <h2>채널을 같은 기준으로 읽기</h2>
        </div>
        <p>각 행에 채널 정보, 대표 이슈, 이어지는 내용을 같은 순서로 배치했습니다.</p>
      </header>

      <div className={styles.shelfLabels} aria-hidden="true">
        <span>채널</span>
        <span>대표 이슈</span>
        <span>이어지는 내용</span>
      </div>

      <div className={styles.shelfRows}>
        {channels.map((channel, index) => (
          <article className={styles.shelfRow} key={channel.id}>
            <div className={styles.shelfChannel}>
              <span className={styles.shelfNumber}>{String(index + 1).padStart(2, '0')}</span>
              <div className={styles.shelfChannelIdentity}>
                <ChannelMark channel={channel} size="sm" />
                <div>
                  <h3>{channel.name}</h3>
                  <p>{channel.kind}</p>
                </div>
              </div>
              <div className={styles.shelfMeta}>
                <ModeLabel channel={channel} />
                <time dateTime={channel.lastSuccessIso}>{channel.lastSuccess}</time>
                <span>{channel.count}건</span>
              </div>
            </div>

            <div className={styles.shelfLead}>
              <span>{channel.lead.topic}</span>
              <h4>{channel.lead.title}</h4>
              <p>{channel.lead.summary}</p>
              <small>{channel.lead.evidence}</small>
            </div>

            <ol className={styles.shelfList}>
              {channel.items.slice(0, 3).map((item) => (
                <li key={`${channel.id}-${item.title}`}>
                  <p>{item.title}</p>
                  <small>{item.topic} · {item.createdAt}</small>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}
