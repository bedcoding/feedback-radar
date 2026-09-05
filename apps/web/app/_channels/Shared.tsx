import type { ChannelSample } from './data';
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
