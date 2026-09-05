import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Feedback Radar',
  description: '외부 채널 사용자 반응 모니터링 대시보드',
};

// 첫 렌더부터 밝게 표시한다. 이전 theme 쿠키와 운영체제 색상 설정은 사용하지 않는다.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
