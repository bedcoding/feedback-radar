import type { Metadata } from 'next';

import SelectionStateLab from './SelectionStateLab';

export const metadata: Metadata = {
  title: '채널 선택 강조 방식 비교 | Feedback Radar',
  description: '채널 게시판의 선택 상태를 여섯 가지 시각 언어로 비교하는 인터랙티브 시안',
};

export default function ChannelSelectionLabPage() {
  return <SelectionStateLab />;
}
