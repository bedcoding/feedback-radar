import { runDaily } from './daily.js';

runDaily(process.argv.includes('--heuristic')).catch((e) => {
  console.error('파이프라인 실패:', e);
  process.exit(1);
});
