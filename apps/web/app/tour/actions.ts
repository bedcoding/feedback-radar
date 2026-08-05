'use server';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { findRepoRoot, privateDir } from '@feedback-radar/core';

/**
 * 둘러보기 PDF를 굽는다.
 *
 * 실제 작업은 apps/pipeline의 deck-pdf.ts가 한다. 웹 프로세스에서 직접 Playwright를 띄우지
 * 않는 이유: 대시보드 번들에 브라우저 자동화 의존성이 끌려 들어가고, 무엇보다 **자기 자신을
 * 찍어야** 하므로 같은 프로세스에서 하면 렌더를 기다리는 동안 그 렌더를 막는다.
 * 별 프로세스로 띄우면 지금 떠 있는 서버를 그대로 찍는다.
 *
 * 오래 걸리는 작업(14단계 × 1.4초 + 브라우저 기동 ≈ 40초)이라 서버 액션이 끝날 때까지
 * 화면은 대기한다. 진행률을 따로 중계하지 않는 이유는 이 값이 발표 자료를 만들 때 한 번
 * 누르는 버튼이고, 실패하면 사유가 통째로 필요하기 때문이다 (부분 진행보다 로그가 낫다).
 */
export async function buildTourPdf(live: boolean): Promise<void> {
  const root = findRepoRoot();
  const args = ['run', 'deck', '-w', '@feedback-radar/pipeline'];
  // npm은 `--` 뒤를 스크립트로 넘긴다. 루트 스크립트를 거치지 않고 직접 부르므로 여기서 붙인다
  if (live) args.push('--', '--live');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: root,
      // 웹 서버가 어느 포트로 떴는지 알려 준다. 기본값(3000)과 다르면 캡처가 빈 화면을 찍는다
      env: { ...process.env, SHOTS_BASE_URL: process.env.SHOTS_BASE_URL || 'http://localhost:3000' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    // 브라우저가 안 뜨거나 화면이 안 그려지면 영원히 매달릴 수 있다
    const timer = setTimeout(
      () => {
        child.kill();
        reject(new Error('PDF 생성 타임아웃 (5분)'));
      },
      5 * 60_000,
    );
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // 로그를 서버 콘솔에 남긴다. 실패 사유는 대개 이 안에 있다
      console.log(out.trim());
      if (code === 0) return resolve();
      reject(new Error(`PDF 생성 실패 (종료코드 ${code}): ${(err.trim() || out.trim()).slice(0, 300)}`));
    });
  });

  revalidatePath('/tour');
}

/** PDF가 이미 있는지, 언제 만든 것인지 */
export async function tourPdfInfo(live: boolean): Promise<{ exists: boolean; at?: string }> {
  const file = path.join(privateDir(), 'deck-assets', `tour-deck${live ? '-live' : ''}.pdf`);
  if (!fs.existsSync(file)) return { exists: false };
  return { exists: true, at: fs.statSync(file).mtime.toISOString() };
}
