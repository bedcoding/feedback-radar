import { loadPrivateEnv, migrateSqliteToPostgres } from '@feedback-radar/core';

loadPrivateEnv();

const mib = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

async function main(): Promise<void> {
  const result = await migrateSqliteToPostgres();
  console.log('PostgreSQL 마이그레이션 완료');
  console.log(`  스키마: ${result.schema}`);
  console.log(
    `  items: ${result.before.items.toLocaleString()} → ${result.after.items.toLocaleString()}`,
  );
  console.log(
    `  settings: ${result.before.settings.toLocaleString()} → ${result.after.settings.toLocaleString()}`,
  );
  console.log(
    `  channel_summaries: ${result.before.channel_summaries.toLocaleString()} → ${result.after.channel_summaries.toLocaleString()}`,
  );
  console.log(
    `  collect_progress: ${result.before.collect_progress.toLocaleString()} → ${result.after.collect_progress.toLocaleString()}`,
  );
  console.log(`  스키마 용량: ${mib(result.schemaBytes)}`);
  console.log(`  DB 전체 용량: ${mib(result.databaseBytes)}`);
}

main().catch((error) => {
  console.error(`PostgreSQL 마이그레이션 실패: ${(error as Error).message}`);
  process.exitCode = 1;
});
