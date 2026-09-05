import type { ChannelSample } from '../_data/channels';
import { issueClusters } from '../_data/channels';
import {
  ChannelIdentity,
  ChannelMark,
  ChannelMeta,
  ItemList,
  LeadBlock,
  ModeLabel,
  SnapshotNote,
} from '../_components/Shared';
import styles from './VariantsB.module.css';

type ConceptProps = {
  channels: ChannelSample[];
};

function ConceptEyebrow({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <div className={styles.conceptEyebrow}>
      <span>{number}</span>
      <p>{children}</p>
    </div>
  );
}

export function Concept04({ channels }: ConceptProps) {
  const leadChannel = channels[0];
  const secondaryChannels = channels.slice(1, 3);
  const remainingChannels = channels.slice(3);

  if (!leadChannel) return null;

  return (
    <section className={styles.frontPage} aria-labelledby="concept-04-title">
      <header className={styles.frontMasthead}>
        <div>
          <ConceptEyebrow number="04">편집 우선순위로 읽는 비대칭 지면</ConceptEyebrow>
          <h1 id="concept-04-title">오늘의 피드백 지면</h1>
        </div>
        <div className={styles.frontIssueMeta}>
          <SnapshotNote compact />
          <span>7개 채널 · {channels.reduce((sum, channel) => sum + channel.count, 0)}건</span>
        </div>
      </header>

      <div className={styles.frontRule} aria-hidden="true">
        <span>Feedback Radar</span>
        <span>2026. 08. 20</span>
        <span>제품 반응 편집판</span>
      </div>

      <div className={styles.frontLeadGrid}>
        <article className={styles.frontHero}>
          <div className={styles.frontStoryHead}>
            <ChannelIdentity channel={leadChannel} />
            <ChannelMeta channel={leadChannel} />
          </div>
          <LeadBlock channel={leadChannel} headingLevel={2} />
          <div className={styles.frontHeroItems}>
            <ItemList channel={leadChannel} limit={leadChannel.items.length} />
          </div>
        </article>

        <div className={styles.frontSecondary}>
          {secondaryChannels.map((channel, index) => (
            <article className={styles.frontSideStory} key={channel.id}>
              <div className={styles.frontStoryIndex}>0{index + 2}</div>
              <div className={styles.frontStoryHead}>
                <ChannelIdentity channel={channel} compact />
                <ChannelMeta channel={channel} />
              </div>
              <LeadBlock channel={channel} headingLevel={3} compact />
              <ItemList channel={channel} limit={channel.items.length} />
            </article>
          ))}
        </div>
      </div>

      <div className={styles.frontBriefGrid}>
        {remainingChannels.map((channel, index) => (
          <article className={styles.frontBrief} key={channel.id}>
            <div className={styles.frontBriefTopline}>
              <span>0{index + 4}</span>
              <ChannelMeta channel={channel} />
            </div>
            <ChannelIdentity channel={channel} compact />
            <LeadBlock channel={channel} headingLevel={3} compact />
            <ItemList channel={channel} limit={channel.items.length} />
          </article>
        ))}
      </div>
    </section>
  );
}

const clusterTopicMap: Record<string, string[]> = {
  payment: ['결제/코인'],
  login: ['계정/로그인', '알림'],
  navigation: ['UI/사용성', '이벤트', '디자인'],
  performance: ['성능', '앱 오류', 'UI/사용성'],
};

function getClusterStory(channel: ChannelSample, clusterId: string) {
  const topics = clusterTopicMap[clusterId] ?? [];

  if (topics.includes(channel.lead.topic)) {
    return {
      title: channel.lead.title,
      detail: channel.lead.summary,
      meta: `대표 이슈 · ${channel.lead.evidence}`,
    };
  }

  const item = channel.items.find((candidate) => topics.includes(candidate.topic)) ?? channel.items[0];

  return {
    title: item?.title ?? channel.lead.title,
    detail: item?.excerpt ?? channel.lead.summary,
    meta: item ? `${item.topic} · ${item.createdAt}` : channel.lead.evidence,
  };
}

export function Concept05({ channels }: ConceptProps) {
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const totalClusterCount = issueClusters.reduce((sum, cluster) => sum + cluster.count, 0);

  return (
    <section className={styles.issueLens} aria-labelledby="concept-05-title">
      <header className={styles.lensHeader}>
        <div>
          <ConceptEyebrow number="05">채널을 가로질러 반복되는 문제를 묶습니다</ConceptEyebrow>
          <h1 id="concept-05-title">이슈 렌즈</h1>
          <p>어디에서 들어왔는지보다 같은 경험이 몇 개 채널에서 반복됐는지를 먼저 보여줍니다.</p>
        </div>
        <div className={styles.lensSummary}>
          <strong>{totalClusterCount}</strong>
          <span>분류된 반응</span>
          <small>4개 이슈 · 전체 7개 채널 포함</small>
        </div>
      </header>

      <div className={styles.lensChannelStrip} aria-label="포함된 채널">
        <span>포함 채널</span>
        {channels.map((channel) => (
          <div key={channel.id}>
            <ChannelMark channel={channel} size="sm" />
            <span>{channel.name}</span>
          </div>
        ))}
        <SnapshotNote compact />
      </div>

      <div className={styles.lensGrid}>
        {issueClusters.map((cluster, clusterIndex) => {
          const clusterChannels = cluster.channelIds
            .map((channelId) => channelById.get(channelId))
            .filter((channel): channel is ChannelSample => Boolean(channel));

          return (
            <article
              className={styles.lensPanel}
              data-featured={clusterIndex === 0 ? 'true' : undefined}
              key={cluster.id}
            >
              <header className={styles.lensPanelHeader}>
                <div className={styles.lensRank}>0{clusterIndex + 1}</div>
                <div>
                  <span>{clusterChannels.length}개 채널에서 반복</span>
                  <h2>{cluster.name}</h2>
                  <p>{cluster.summary}</p>
                </div>
                <div className={styles.lensCount}>
                  <strong>{cluster.count}</strong>
                  <span>건</span>
                </div>
              </header>

              <div className={styles.lensCoverage} aria-label={`${cluster.name} 채널 범위`}>
                {channels.map((channel) => (
                  <span
                    data-active={cluster.channelIds.includes(channel.id) ? 'true' : undefined}
                    key={channel.id}
                    title={channel.name}
                  />
                ))}
              </div>

              <div className={styles.lensSources}>
                {clusterChannels.map((channel) => {
                  const story = getClusterStory(channel, cluster.id);
                  return (
                    <div className={styles.lensSource} key={`${cluster.id}-${channel.id}`}>
                      <ChannelMark channel={channel} size="sm" />
                      <div className={styles.lensSourceBody}>
                        <div className={styles.lensSourceMeta}>
                          <span>{channel.name}</span>
                          <small>{story.meta}</small>
                        </div>
                        <p>{story.title}</p>
                        <small>{story.detail}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function splitCollectionStamp(value: string) {
  const divider = value.lastIndexOf(' ');
  return {
    day: value.slice(0, divider),
    time: value.slice(divider + 1),
  };
}

export function Concept06({ channels }: ConceptProps) {
  const orderedChannels = [...channels].sort(
    (left, right) => Date.parse(right.lastSuccessIso) - Date.parse(left.lastSuccessIso),
  );

  return (
    <section className={styles.collectionTimeline} aria-labelledby="concept-06-title">
      <header className={styles.timelineHeader}>
        <div>
          <ConceptEyebrow number="06">각 채널의 마지막 성공 기록을 시간순으로 정렬합니다</ConceptEyebrow>
          <h1 id="concept-06-title">수집 타임라인</h1>
          <p>동일한 24시간 비교가 아니라, 채널마다 마지막으로 저장된 시점을 기준으로 읽는 화면입니다.</p>
        </div>
        <div className={styles.timelineLegend}>
          <SnapshotNote compact />
          <span>최신 성공 순</span>
        </div>
      </header>

      <ol className={styles.timelineList}>
        {orderedChannels.map((channel, index) => {
          const stamp = splitCollectionStamp(channel.lastSuccess);
          const previousStamp = index > 0 ? splitCollectionStamp(orderedChannels[index - 1].lastSuccess) : null;
          const startsNewDay = !previousStamp || previousStamp.day !== stamp.day;

          return (
            <li className={styles.timelineEvent} key={channel.id}>
              <div className={styles.timelineStamp}>
                <time dateTime={channel.lastSuccessIso}>
                  <span>{startsNewDay ? stamp.day : ''}</span>
                  <strong>{stamp.time}</strong>
                </time>
                <span className={styles.timelineDot} data-mode={channel.mode} aria-hidden="true" />
              </div>

              <article className={styles.timelineCard}>
                <header className={styles.timelineCardHeader}>
                  <ChannelIdentity channel={channel} />
                  <div>
                    <ModeLabel channel={channel} />
                    <span>{channel.count}건 저장</span>
                  </div>
                </header>
                <div className={styles.timelineCardBody}>
                  <LeadBlock channel={channel} headingLevel={2} />
                  <div className={styles.timelineItems}>
                    <span>함께 들어온 내용</span>
                    <ItemList channel={channel} excerpts limit={channel.items.length} />
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
