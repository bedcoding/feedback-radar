import { asSourceKey, SOURCE_KEYS } from '@feedback-radar/core';
import { runDaily } from './daily.js';

/**
 * `--source=naver` 처럼 소스 하나만 돌린다.
 * 한 소스만 다시 훑거나(예: 네이버 키를 방금 넣었을 때) 스크레이퍼를 손본 뒤
 * 그것만 확인할 때, 5개를 다 돌리며 기다릴 이유가 없다.
 *
 * `--only`는 쓸 수 없다. npm 자체 옵션이라 npm이 삼켜서 스크립트까지 오지 않는다.
 */
const arg = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1];
const only = asSourceKey(arg);
if (arg && !only) {
  console.error(`--source=${arg} 는 알 수 없는 소스입니다. 가능한 값: ${SOURCE_KEYS.join(', ')}`);
  process.exit(1);
}

runDaily(process.argv.includes('--heuristic'), only).catch((e) => {
  console.error('파이프라인 실패:', e);
  process.exit(1);
});
