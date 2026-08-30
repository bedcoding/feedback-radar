import './globals.css';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';

export const metadata = {
  title: 'Feedback Radar',
  description: '외부 채널 사용자 반응 모니터링 대시보드',
};

/*
  테마를 서버에서 정해 <html>에 박는다.

  클라이언트에서 정하면 첫 페인트가 반대 테마로 한 번 번쩍인다(FOUC). 쿠키를 서버가
  읽어 속성으로 내려보내면 그 순간부터 맞는 색으로 그려진다.

  쿠키가 없으면 속성을 붙이지 않는다. 그때는 CSS의 prefers-color-scheme이 결정한다
  — 즉 **기본값은 보는 사람의 시스템 설정**이다.
*/
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get('theme')?.value;
  const attr = theme === 'light' || theme === 'dark' ? theme : undefined;
  return (
    <html lang="ko" data-theme={attr}>
      <body>{children}</body>
    </html>
  );
}
