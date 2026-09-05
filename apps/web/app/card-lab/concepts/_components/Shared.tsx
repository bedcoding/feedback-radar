import type { ChannelSample } from '../_data/channels';
import styles from './shared.module.css';

export function ChannelMark({ channel, size = 'md' }: { channel: ChannelSample; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={styles.channelMark} data-channel={channel.id} data-size={size} aria-hidden="true">
      {channel.initials}
    </span>
  );
}

export function ModeLabel({ channel }: { channel: ChannelSample }) {
  return (
    <span className={styles.modeLabel} data-mode={channel.mode}>
      <span aria-hidden="true" />
      {channel.mode}
    </span>
  );
}

export function ChannelIdentity({
  channel,
  compact = false,
}: {
  channel: ChannelSample;
  compact?: boolean;
}) {
  return (
    <div className={styles.identity} data-compact={compact ? 'true' : undefined}>
      <ChannelMark channel={channel} size={compact ? 'sm' : 'md'} />
      <div>
        <strong>{channel.name}</strong>
        <span>{channel.kind}</span>
      </div>
    </div>
  );
}

export function ChannelMeta({ channel, showMode = true }: { channel: ChannelSample; showMode?: boolean }) {
  return (
    <div className={styles.channelMeta}>
      {showMode && <ModeLabel channel={channel} />}
      <time dateTime={channel.lastSuccessIso}>마지막 성공 {channel.lastSuccess}</time>
      <span>{channel.count}건</span>
    </div>
  );
}

export function LeadBlock({
  channel,
  headingLevel = 2,
  compact = false,
}: {
  channel: ChannelSample;
  headingLevel?: 2 | 3 | 4;
  compact?: boolean;
}) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <div className={styles.leadBlock} data-compact={compact ? 'true' : undefined}>
      <span className={styles.topic}>{channel.lead.topic}</span>
      <Heading>{channel.lead.title}</Heading>
      <p>{channel.lead.summary}</p>
      <small>{channel.lead.evidence}</small>
    </div>
  );
}

export function ItemList({
  channel,
  limit = channel.items.length,
  excerpts = false,
}: {
  channel: ChannelSample;
  limit?: number;
  excerpts?: boolean;
}) {
  return (
    <ol className={styles.itemList}>
      {channel.items.slice(0, limit).map((item) => (
        <li key={`${channel.id}-${item.title}`}>
          <div>
            <span>{item.title}</span>
            {excerpts && <p>{item.excerpt}</p>}
          </div>
          <small>
            {item.topic} · {item.createdAt}
          </small>
        </li>
      ))}
    </ol>
  );
}

export function SnapshotNote({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.snapshotNote} data-compact={compact ? 'true' : undefined}>
      <span aria-hidden="true">●</span>
      샘플 데이터
      <small>기존 수집분은 2026.08.20까지</small>
    </div>
  );
}

