#!/usr/bin/env node
/**
 * 심사용 조회 전용 데모를 비공개 저장소로 내보낸다. `npm run demo`
 *
 * 공개 저장소에는 코드만 있고 수집 결과(private/)는 gitignore로 막혀 있어 클론해도 빈
 * 화면이 뜬다. 심사에서 보여줄 것은 "실제로 모아서 분류한 결과"라 DB가 함께 가야 하고,
 * 그 DB에는 서비스명과 수집 원문이 들어 있으니 저장소는 비공개다.
 *
 * **폴더를 물리적으로 나누는 게 이 방식의 핵심이다.** 같은 작업 트리에 remote를 둘 걸어
 * 두면, DB를 담으려고 .gitignore를 푸는 순간부터 공개 쪽으로 실수 한 번이면 유출이다.
 * 폴더가 다르면 원본의 .gitignore가 그대로 공개 저장소를 막는다.
 *
 * 배포본은 Vercel이 넣어 주는 VERCEL=1로 조회 전용이 된다. DB를 읽기 전용으로 열고
 * 수집, 설정 버튼은 "로컬에서만 실행됩니다" 안내로 바뀐다.
 *
 * 복사에서 빠지는 것과 이유:
 * - `.git/`      복제본의 remote가 공개 저장소로 덮이면 방식 자체가 무너진다
 * - `.gitignore` 복제본은 private/를 담아야 해서 원본 것을 쓸 수 없다. 아래에서 새로 쓴다
 * - `.env`       루트의 그 파일. 비공개 저장소라도 API 키와 DB 접속 정보는 올리지 않는다.
 *                 GitHub 비밀 검사가 감지하면 키가 폐기된다. 배포본은 플랫폼 환경변수로 받는다
 * - `deck-assets/`, `reports/`  화면이 읽지 않는다. 합쳐서 6MB라 뺀다
 * - `*.bak-*`    DB 백업본. git이 이미 이력을 갖는다
 * - node_modules, .next  용량만 차지하고 재생성된다
 *
 * DB는 rsync로 옮기지 않는다. WAL 모드라 파일만 복사하면 아직 본체에 반영되지 않은 최근
 * 수집분이 통째로 빠진다. SQLite backup API로 일관된 단일 파일 스냅샷을 뜬다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEST = process.env.DEMO_DEST || path.join(path.dirname(ROOT), 'feedback-radar-demo');
const REPO = process.env.DEMO_REPO || 'bedcoding/feedback-radar-demo';

const apply = process.argv.includes('--apply') || process.argv.includes('--push');
const push = process.argv.includes('--push');

const EXCLUDES = [
  '.git/',
  '.gitignore',
  '.env',
  'private/deck-assets/',
  'private/reports/',
  'private/data/',
  'private/*.bak',
  'private/*.bak-*',
  'private/retag-before-*',
  'node_modules/',
  '.next/',
  '.next-prod/',
  'private-zip/',
  '*.tsbuildinfo',
];

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
}
function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ── 1. 복제본이 공개 저장소를 가리키고 있지 않은지 ─────────────
if (fs.existsSync(path.join(DEST, '.git'))) {
  let remote = '';
  try {
    remote = sh('git', ['remote', 'get-url', 'origin'], { cwd: DEST });
  } catch {
    remote = '';
  }
  const origin = sh('git', ['remote', 'get-url', 'origin'], { cwd: ROOT });
  if (remote && remote === origin) {
    die(
      `복제본의 origin이 원본(공개 저장소)과 같습니다: ${remote}\n` +
        '  이대로 푸시하면 수집 DB가 공개됩니다. 복제본의 remote를 바꾸세요:\n' +
        `  git -C ${DEST} remote set-url origin https://github.com/${REPO}.git`,
    );
  }
}

// ── 2. 코드 복사 ───────────────────────────────────────────────
console.log(`\n${apply ? '복사' : '미리보기'}: ${ROOT}\n     → ${DEST}\n`);
if (apply) fs.mkdirSync(DEST, { recursive: true });
const rsyncArgs = ['-a', '--delete', ...EXCLUDES.map((e) => `--exclude=${e}`), `${ROOT}/`, `${DEST}/`];
if (!apply) rsyncArgs.unshift('--dry-run', '--itemize-changes');

const r = spawnSync('rsync', rsyncArgs, { encoding: 'utf8' });
if (r.status !== 0) die(`rsync 실패\n${r.stderr}`);
const lines = (r.stdout || '').split('\n').filter((l) => l.trim() && !l.startsWith('sending'));
console.log(`  코드 ${lines.length}개 파일${apply ? ' 복사됨' : ' 변경 예정'}`);

// ── 3. DB 스냅샷 (WAL 반영) ────────────────────────────────────
const srcDb = path.join(ROOT, 'private', 'data', 'feedback-radar.db');
const dstDb = path.join(DEST, 'private', 'data', 'feedback-radar.db');
if (!fs.existsSync(srcDb)) die(`DB가 없습니다: ${srcDb}`);

const src = new Database(srcDb, { readonly: true });
const total = src.prepare('SELECT COUNT(*) c FROM items').get().c;
if (apply) {
  fs.mkdirSync(path.dirname(dstDb), { recursive: true });
  await src.backup(dstDb);
  const check = new Database(dstDb, { readonly: true });
  const n = check.prepare('SELECT COUNT(*) c FROM items').get().c;
  const tagged = check.prepare('SELECT COUNT(*) c FROM items WHERE tagged_at IS NOT NULL').get().c;
  check.close();
  if (n !== total) die(`스냅샷 건수가 원본과 다릅니다 (${n} vs ${total})`);
  console.log(
    `  DB 스냅샷 ${mb(fs.statSync(dstDb).size)}: ${n.toLocaleString()}건 (분류 ${tagged.toLocaleString()}건)`,
  );
} else {
  console.log(`  DB 스냅샷 예정: ${total.toLocaleString()}건 (WAL 반영해 단일 파일로)`);
}
src.close();

// ── 4. 복제본 .gitignore ───────────────────────────────────────
// 원본 규칙은 물려받되, 이 저장소가 담아야 하는 것만 풀어 준다.
const UNBLOCK = [
  'private/',
  'feedback-radar.config.json',
  'data/',
  'reports/',
  'deck-assets/',
  'PLAN.md',
  '/CLAUDE.md',
];
const srcIgnore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n');
const destIgnore = [
  '# npm run demo 가 원본 .gitignore에서 만들어 낸다. 직접 고치지 마라.',
  '# 비공개 저장소이므로 private/ 는 담고, API 키(.env)는 그대로 막는다.',
  '',
  ...srcIgnore.filter((l) => !UNBLOCK.includes(l.trim())),
  '',
  '# 화면이 읽지 않는 것들 (용량만 차지한다)',
  'private/deck-assets/',
  'private/reports/',
  'private/*.bak',
  'private/*.bak-*',
];
if (apply) {
  fs.writeFileSync(path.join(DEST, '.gitignore'), destIgnore.join('\n'), 'utf8');
  console.log('  .gitignore 생성 (private/ 포함, .env 차단 유지)');
}

if (!apply) {
  console.log('\n미리보기입니다. 실제로 내보내려면:');
  console.log('  npm run demo -- --apply     복사만');
  console.log('  npm run demo -- --push      복사 + 커밋 + 푸시');
  process.exit(0);
}

// ── 5. git 준비 ────────────────────────────────────────────────
if (!fs.existsSync(path.join(DEST, '.git'))) {
  sh('git', ['init', '-b', 'main'], { cwd: DEST });
  sh('git', ['remote', 'add', 'origin', `https://github.com/${REPO}.git`], { cwd: DEST });
  const email = sh('git', ['config', 'user.email'], { cwd: ROOT });
  const name = sh('git', ['config', 'user.name'], { cwd: ROOT });
  sh('git', ['config', 'user.email', email], { cwd: DEST });
  sh('git', ['config', 'user.name', name], { cwd: DEST });
  console.log(`  git 초기화: origin=${REPO}, author=${name} <${email}>`);
}

// 공개 저장소로 잘못 밀지 않게 마지막으로 한 번 더 본다
const remote = sh('git', ['remote', 'get-url', 'origin'], { cwd: DEST });
if (!remote.includes(REPO.split('/')[1])) die(`복제본 origin이 예상과 다릅니다: ${remote}`);

if (!push) {
  console.log(`\n복사 완료. 커밋과 푸시는 하지 않았습니다.\n  git -C ${DEST} status`);
  process.exit(0);
}

// ── 6. 커밋과 푸시 ─────────────────────────────────────────────
if (!sh('git', ['status', '--porcelain'], { cwd: DEST })) {
  console.log('\n바뀐 것이 없습니다. 커밋 생략.');
  process.exit(0);
}
sh('git', ['add', '-A'], { cwd: DEST });
const subject = sh('git', ['log', '-1', '--format=%s'], { cwd: ROOT });
const short = sh('git', ['log', '-1', '--format=%h'], { cwd: ROOT });
sh(
  'git',
  ['commit', '-m', `demo: ${subject}`, '-m', `원본 ${short} 기준 조회 전용 스냅샷. npm run demo 로 생성.`],
  { cwd: DEST },
);
console.log(`\n커밋: demo: ${subject}`);

try {
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: DEST, stdio: 'inherit' });
  console.log(`\n✔ https://github.com/${REPO} 에 푸시했습니다.`);
  console.log('  Vercel에서 이 저장소를 연결하면 배포됩니다 (VERCEL=1 은 자동으로 들어갑니다).');
} catch {
  die(`푸시 실패. 저장소가 없으면 만드세요:\n  gh repo create ${REPO} --private`);
}
