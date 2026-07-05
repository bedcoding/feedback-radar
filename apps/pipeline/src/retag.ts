import { openDb } from '@feedback-radar/core';

/**
 * 전체 재태깅 준비 — 모든 아이템의 태그 상태를 초기화한다.
 * 태거를 바꿨거나(휴리스틱 → claude), 분류 스키마가 바뀌었을 때
 * `npm run retag && npm run collect`로 기존 데이터를 다시 분류한다.
 */
const db = openDb();
const n = db.prepare(`UPDATE items SET tagged_at = NULL`).run().changes;
console.log(`${n}건 태그 초기화 완료 — 'npm run collect'를 실행하면 현재 태거로 재분류됩니다.`);
db.close();
