import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Feedback Radar',
  description: '외부 채널 사용자 반응 모니터링 대시보드',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
