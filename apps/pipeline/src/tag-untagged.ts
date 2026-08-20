import {
  loadPrivateEnv,
  openRadarStore,
  ownHostSetting,
  resolveTagger,
} from '@feedback-radar/core';

loadPrivateEnv();

/**
 * 미분류 글만 분류한다. 수집은 하지 않는다.
 *
 * `npm run collect`는 수집부터 시작하므로, 이미 저장돼 있는 글만 분류하고 싶을 때 쓸 수 없다.
 * 백필로 과거 글을 넣은 뒤가 그런 경우다(backfill-theqoo). 수집을 다시 돌리면 오늘 글이
 * 새로 들어와서, 특정 날짜를 건드리지 않으려는 의도가 깨진다.
 *
 * 브리핑은 만들지 않는다. 그건 `npm run backfill -- --apply` 가 따로 한다.
 *
 * 실행:
 *   npm run tag-untagged                 대상 건수만 보여준다
 *   npm run tag-untagged -- --apply      실제로 분류하고 저장한다
 *   npm run tag-untagged -- --apply --limit=50
 */

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const limitRaw = Number(argv.find((a) => a.startsWith('--limit='))?.split('=')[1]);
const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined;

async function main() {
  const db = await openRadarStore();
  const config = await db.getConfig();
  /*
   * 대시보드에 저장된 claude CLI 경로를 반영한다. daily.ts 가 하는 것과 같다.
   * 이 줄이 없으면 CLI 를 못 찾아 조용히 OpenAI 로 넘어간다. 그러면 "구독 CLI 로 돌린다" 는
   * 전제가 깨지고 화면의 모델 표시도 달라진다. 실제로 한 번 그렇게 새어 나갔다.
   */
  const settings = await db.getSettings();
  const cliOverride = ownHostSetting(settings, 'claudeCliCmd');
  if (cliOverride) process.env.CLAUDE_CLI_CMD = cliOverride;
  const modelOverride = await db.getSetting('claudeCliModel');
  if (modelOverride !== undefined) process.env.CLAUDE_CLI_MODEL = modelOverride;

  const untagged = await db.getUntagged(limit);
  console.log(`미분류 ${untagged.length}건${limit ? ` (상한 ${limit})` : ''}`);
  if (untagged.length === 0 || !apply) {
    if (untagged.length > 0) console.log('  --apply 를 붙이면 분류합니다.');
    await db.close?.();
    return;
  }

  const tagger = await resolveTagger(config);
  console.log(`태거: ${tagger.name}`);
  let saved = 0;
  let writeQueue = Promise.resolve();
  await tagger.tag(untagged, {
    onBatch: (batch) => {
      saved += batch.size;
      const done = saved;
      // 배치마다 저장한다. 중간에 끊겨도 저장된 건은 다음 실행 대상에서 빠진다
      writeQueue = writeQueue.then(() => db.saveTags(batch));
      console.log(`  … ${done}/${untagged.length}건`);
    },
  });
  await writeQueue;
  console.log(`끝. ${saved}건 분류했습니다.`);
  await db.close?.();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
