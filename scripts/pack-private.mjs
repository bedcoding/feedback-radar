#!/usr/bin/env node
/**
 * 비공개 파일을 다른 머신으로 옮기기 위해 압축한다. `npm run pack`
 *
 * 담는 것은 두 가지다: `private/` 폴더와 레포 루트의 `.env`.
 *
 * 수집 데이터는 이제 여기 없다. 중앙 PostgreSQL에 있고 새 머신은 `.env`의 접속 정보만
 * 있으면 같은 데이터를 본다. 그래서 이 압축본이 나르는 것은 테넌트 설정과 접속 정보다.
 * 둘 중 하나라도 빠지면 새 머신에서 조용히 동작이 달라진다. 설정이 없으면 서비스명이
 * 자리표시자로 뜨고, .env가 없으면 접속할 곳을 몰라 실행이 멈춘다.
 *
 * 손으로 압축할 때 걸리는 함정 두 가지를 없애는 게 목적이다.
 *
 * 1. 압축본을 private/ 안에 두면 다음 압축에 그게 또 들어가 중첩된다(옮길 때마다 2배).
 *    → private/ 바깥의 전용 폴더 private-zip/ 에 만든다.
 * 2. 그 폴더는 .gitignore에 이름으로 한 번, 확장자(*.zip)로 한 번, 두 겹으로 막혀 있다.
 *    안에 서비스명, 앱ID, API 키, DB 접속 정보가 들어 있어 실수로 커밋되면 안 된다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PRIVATE = path.join(ROOT, 'private');
/** 압축에서 뺄 것. 이전 이동 산출물과, 옛 로컬 DB의 부속 파일 */
const SKIP_DIRS = new Set(['_TRANSFER']);
const SKIP_EXT = new Set(['.db-wal', '.db-shm']);

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(PRIVATE)) {
  die('private/ 폴더가 없습니다. 옮길 게 없습니다 (`npm run setup` 부터).');
}

// 1) 스테이징 폴더에 private/ 를 복사 (제외 대상 빼고)
const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-pack-'));
const stagePrivate = path.join(stageRoot, 'private');

let copied = 0;
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      copyDir(path.join(src, e.name), path.join(dest, e.name));
    } else if (e.isFile()) {
      if ([...SKIP_EXT].some((ext) => e.name.endsWith(ext))) continue;
      fs.copyFileSync(path.join(src, e.name), path.join(dest, e.name));
      copied += 1;
    }
  }
}
copyDir(PRIVATE, stagePrivate);

// 1-1) 레포 루트의 .env도 함께 담는다 (압축 해제 위치가 레포 루트라 그대로 제자리에 놓인다)
const envSrc = path.join(ROOT, '.env');
const hasEnv = fs.existsSync(envSrc);
if (hasEnv) {
  fs.copyFileSync(envSrc, path.join(stageRoot, '.env'));
  copied += 1;
} else {
  console.log('  주의: 레포 루트에 .env가 없어 압축본에 포함되지 않습니다.');
}

// 2) private-zip/에 압축본을 만든다 (private/ 바깥이라 다음 압축에 딸려 들어가지 않는다)
//    파일명에 만든 시각을 넣는다. 같은 이름으로 덮어쓰면 USB에 옮긴 게 언제 것인지 알 수 없다.
const now = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const date = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
const time = `${p2(now.getHours())}${p2(now.getMinutes())}`;
/** 예: feedback-radar-private_2026-08-02_0330.zip (날짜_시분) */
const stamp = `${date}_${time}`;
const humanTime = `${date} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
const outDir = path.join(ROOT, 'private-zip');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `feedback-radar-private_${stamp}.zip`);
fs.rmSync(outPath, { force: true });
fs.rmSync(outPath.replace(/\.zip$/, '.tgz'), { force: true });

/** 압축에 담을 항목. 해제 위치가 레포 루트이므로 이름이 곧 최종 경로가 된다 */
const ENTRIES = hasEnv ? ['private', '.env'] : ['private'];

if (process.platform === 'win32') {
  const paths = ENTRIES.map((e) => `'${path.join(stageRoot, e)}'`).join(',');
  execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path ${paths} -DestinationPath '${outPath}' -Force`],
    { stdio: 'inherit' },
  );
} else {
  // tar가 zip을 만들 수 있으면 zip으로, 아니면 tgz로 (양쪽 다 루트에 private/와 .env가 들어간다)
  try {
    execFileSync('zip', ['-rq', outPath, ...ENTRIES], { cwd: stageRoot, stdio: 'inherit' });
  } catch {
    const tgz = outPath.replace(/\.zip$/, '.tgz');
    execFileSync('tar', ['-czf', tgz, ...ENTRIES], { cwd: stageRoot, stdio: 'inherit' });
    fs.writeFileSync(path.join(stageRoot, '.used-tgz'), tgz);
  }
}

const finalPath = fs.existsSync(outPath) ? outPath : outPath.replace(/\.zip$/, '.tgz');
fs.rmSync(stageRoot, { recursive: true, force: true });

if (!fs.existsSync(finalPath)) die('압축에 실패했습니다.');
const mb = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(2);

// 같은 폴더에 쌓인 이전 압축본을 같이 보여준다 — 어느 게 최신인지 이름만 보고 알 수 있게
const others = fs
  .readdirSync(outDir)
  .filter((f) => /\.(zip|tgz)$/.test(f) && f !== path.basename(finalPath))
  .sort()
  .reverse();

console.log(`
✔ private-zip/${path.basename(finalPath)}
  ${humanTime} 기준, ${mb} MB, 파일 ${copied}개`);

if (others.length) {
  console.log(`\n  이전 것 ${others.length}개도 남아 있습니다 (필요 없으면 지우세요):`);
  for (const f of others.slice(0, 5)) console.log(`    private-zip/${f}`);
  if (others.length > 5) console.log(`    … 외 ${others.length - 5}개`);
}

console.log(`
private-zip/ 은 gitignore라 커밋되지 않습니다.
**위 파일 하나**를 USB나 개인 클라우드로 옮긴 뒤, 새 머신에서 레포 루트에 풀면 됩니다.

  git clone https://github.com/bedcoding/feedback-radar
  cd feedback-radar
  npm install
  # 여기서 압축 해제 → private/ 폴더와 .env가 생기면 성공
  claude auth login        # 인증 정보는 압축본에 없다. 머신마다 따로
  npm run dev
`);
