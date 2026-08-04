import type { ReactNode } from 'react';

export const metadata = {
  title: '둘러보기 | Feedback Radar',
  description: '실제 화면 위에서 기능을 짚어 주는 제품 투어',
};

export default function TourLayout({ children }: { children: ReactNode }) {
  return children;
}
