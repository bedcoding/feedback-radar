// dev와 프로덕션 빌드의 산출물 폴더를 분리한다.
// 둘 다 .next를 쓰면 `npm run dev`가 떠 있는 상태에서 `npm run build`를 돌렸을 때
// 실행 중인 dev 서버가 자기 청크를 잃어 화면의 CSS·스크립트가 통째로 깨진다
// (증상: 스타일 없는 날것의 HTML, 로그에 "Cannot find module './###.js'").
const forProduction = process.argv.some((a) => a === 'build' || a === 'start');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: forProduction ? '.next-prod' : '.next',
  transpilePackages: ['@feedback-radar/core'],
  serverExternalPackages: ['better-sqlite3', '@anthropic-ai/sdk'],
  // @feedback-radar/core는 NodeNext ESM이라 `./x.js` 임포트가 `.ts` 소스를 가리킴 — webpack에 매핑을 알려준다
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },
};

export default nextConfig;
