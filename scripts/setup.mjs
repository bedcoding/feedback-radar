#!/usr/bin/env node
/**
 * 새 머신 초기 셋업 — private/ 를 만들고 프리셋·환경변수 템플릿을 복사한다.
 *
 *   npm run setup                    # 기본 프리셋(content-platform)
 *   npm run setup -- commerce        # 다른 업종 프리셋
 *   npm run setup -- --list          # 프리셋 목록
 *
 * 이미 있는 파일은 덮어쓰지 않는다. private/ 를 통째로 옮겨 온 머신에서 실행해도 안전하다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presetsDir = path.join(root, 'presets');
const privateDir = path.join(root, 'private');

const presets = fs
  .readdirSync(presetsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const args = process.argv.slice(2).filter((a) => a !== '--');

if (args.includes('--list') || args.includes('-l')) {
  console.log('사용 가능한 프리셋:\n');
  for (const name of presets) {
    const p = JSON.parse(fs.readFileSync(path.join(presetsDir, `${name}.json`), 'utf8'));
    console.log(`  ${name.padEnd(20)} ${p._preset ?? ''}`);
  }
  console.log('\n사용법: npm run setup -- <프리셋명>');
  process.exit(0);
}

const preset = args[0] ?? 'content-platform';
if (!presets.includes(preset)) {
  console.error(`'${preset}' 프리셋이 없습니다. 사용 가능: ${presets.join(', ')}`);
  console.error('목록 보기: npm run setup -- --list');
  process.exit(1);
}

fs.mkdirSync(privateDir, { recursive: true });

/** 이미 있으면 건드리지 않는다 — 기존 설정을 덮어쓰는 사고를 막는다 */
function copyIfAbsent(from, to, label) {
  if (fs.existsSync(to)) {
    console.log(`  - ${label}: 이미 있어 건너뜀 (${path.relative(root, to)})`);
    console.log(`      다른 프리셋으로 바꾸려면 이 파일을 지우거나 이름을 바꾼 뒤 다시 실행하세요`);
    return false;
  }
  fs.copyFileSync(from, to);
  console.log(`  ✓ ${label}: ${path.relative(root, to)}`);
  return true;
}

console.log(`\nFeedback Radar 셋업 (프리셋 '${preset}')\n`);
const madeConfig = copyIfAbsent(
  path.join(presetsDir, `${preset}.json`),
  path.join(privateDir, 'feedback-radar.config.json'),
  '설정 파일',
);
copyIfAbsent(path.join(root, '.env.example'), path.join(privateDir, '.env'), '환경변수 파일');

console.log('\n다음 단계:');
if (madeConfig) {
  console.log('  1. private/feedback-radar.config.json 에서 { } 로 표시된 3가지를 채우세요 ← 먼저 하셔야 합니다');
  console.log('     - displayName : 화면과 리포트에 표시할 서비스명');
  console.log('     - keywords    : 웹에서 검색할 키워드 (줄임말과 별칭 포함)');
  console.log('     - appId       : 앱스토어 숫자 ID / 구글플레이 패키지명');
  console.log('     ※ 업종 용어(domainPrompt, categoryKeywords)는 프리셋에 이미 들어 있습니다');
  console.log('     ※ 채우기 전에 실행하면 파이프라인이 안내 메시지와 함께 멈춥니다');
} else {
  console.log('  1. 설정 파일이 이미 있으니 그대로 쓰면 됩니다');
}
console.log('  2. (선택) private/.env 에 네이버 API 키와 웹훅 주소 입력');
console.log('  3. npm run dev\n');
