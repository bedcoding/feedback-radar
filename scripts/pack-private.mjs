#!/usr/bin/env node
/**
 * private/ 를 다른 머신으로 옮기기 위해 압축한다. `npm run pack`
 *
 * 손으로 압축할 때 걸리는 함정 세 가지를 없애는 게 목적이다.
 *
 * 1. DB가 WAL 모드라 실행 중에 파일을 그냥 복사하면 최근 데이터가 빠지거나
 *    반쯤 쓰인 트랜잭션이 섞인다. → SQLite backup API로 일관된 스냅샷을 뜬다.
 *    (수집이 돌고 있어도 안전하다. 백업 시점 이후의 글만 빠진다.)
 * 2. 압축본을 private/ 안에 두면 다음 압축에 그게 또 들어가 중첩된다(옮길 때마다 2배).
 *    → private/ 바깥의 전용 폴더 private-zip/ 에 만든다.
 * 3. 그 폴더는 .gitignore에 이름으로 한 번, 확장자(*.zip)로 한 번 — 두 겹으로 막혀 있다.
 *    안에 서비스명·앱ID·수집 DB가 통째로 들어 있어 실수로 커밋되면 안 된다.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const ROOT = path.resolve(import.meta.dirname, '..');
const PRIVATE = path.join(ROOT, 'private');
/** 압축에서 뺄 것 — 이전 이동 산출물과 DB 부속 파일(백업본으로 대체된다) */
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

// 2) DB는 복사본 대신 backup API로 다시 뜬다 (수집 중이어도 일관된 스냅샷)
const dbSrc = path.join(PRIVATE, 'data', 'feedback-radar.db');
if (fs.existsSync(dbSrc)) {
  const dbDest = path.join(stagePrivate, 'data', 'feedback-radar.db');
  fs.mkdirSync(path.dirname(dbDest), { recursive: true });
  const db = new Database(dbSrc, { readonly: true });
  try {
    await db.backup(dbDest);
    const n = db.prepare('select count(*) n from items').get().n;
    console.log(`  DB 스냅샷: ${n.toLocaleString()}건`);
  } finally {
    db.close();
  }
}

// 3) private-zip/ 에 압축본을 만든다 (private/ 바깥이라 다음 압축에 딸려 들어가지 않는다)
//    파일명에 만든 시각을 넣는다 — 같은 이름으로 덮어쓰면 USB에 옮긴 게 언제 것인지 알 수 없다.
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

if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stagePrivate}' -DestinationPath '${outPath}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  // tar가 zip을 만들 수 있으면 zip으로, 아니면 tgz로 (양쪽 다 루트에 private/ 가 들어간다)
  try {
    execFileSync('zip', ['-rq', outPath, 'private'], { cwd: stageRoot, stdio: 'inherit' });
  } catch {
    const tgz = outPath.replace(/\.zip$/, '.tgz');
    execFileSync('tar', ['-czf', tgz, 'private'], { cwd: stageRoot, stdio: 'inherit' });
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
  ${humanTime} 기준 · ${mb} MB · 파일 ${copied}개`);

if (others.length) {
  console.log(`\n  이전 것 ${others.length}개도 남아 있습니다 (필요 없으면 지우세요):`);
  for (const f of others.slice(0, 5)) console.log(`    private-zip/${f}`);
  if (others.length > 5) console.log(`    … 외 ${others.length - 5}개`);
}

console.log(`
private-zip/ 은 gitignore라 커밋되지 않습니다.
**위 파일 하나**를 USB·개인 클라우드로 옮긴 뒤, 새 머신에서 레포 루트에 풀면 됩니다.

  git clone https://github.com/bedcoding/feedback-radar
  cd feedback-radar
  npm install
  # 여기서 압축 해제 → private/ 폴더가 생기면 성공
  claude auth login        # 인증 정보는 압축본에 없다. 머신마다 따로
  npm run dev
`);
