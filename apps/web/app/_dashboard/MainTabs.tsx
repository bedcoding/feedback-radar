export const MAIN_TABS = [
  { key: 'brief2', label: '브리핑' },
  { key: 'channels', label: '채널별' },
  { key: 'collect', label: '수집' },
  { key: 'settings', label: '설정' },
];

export function MainTabs({ active, items = MAIN_TABS, href = key => `/?tab=${key}`, youtube = false, className = '' }: {
  active: string;
  items?: { key: string; label: string }[];
  href?: (key: string) => string;
  youtube?: boolean;
  className?: string;
}) {
  return <nav className={`viewtabs ${className}`} aria-label="화면 탭">
    {items.map(item => <a key={item.key} href={href(item.key)} className={active === item.key ? 'on' : undefined} aria-current={active === item.key ? 'page' : undefined}>{item.label}</a>)}
    {youtube && <a href="/youtube" className={active === 'youtube' ? 'on' : undefined} aria-current={active === 'youtube' ? 'page' : undefined}>YouTube</a>}
  </nav>;
}
