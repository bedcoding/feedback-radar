import path from 'node:path';

// dev와 프로덕션 빌드의 산출물 폴더를 분리한다.
// 둘 다 .next를 쓰면 `npm run dev`가 떠 있는 상태에서 `npm run build`를 돌렸을 때
// 실행 중인 dev 서버가 자기 청크를 잃어 화면의 CSS·스크립트가 통째로 깨진다
// (증상: 스타일 없는 날것의 HTML, 로그에 "Cannot find module './###.js'").
const forProduction = process.argv.some((a) => a === 'build' || a === 'start');

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: forProduction ? '.next-prod' : '.next',
  transpilePackages: ['@feedback-radar/core', '@feedback-radar/pipeline'],
  /*
    서버에서만 도는 패키지는 번들에 넣지 않고 런타임에 require한다.

    google-play-scraper를 빼는 이유가 특히 중요하다. 이 패키지가 쓰는 debug는 supports-color를
    조건부로 require하는데, 그 모듈이 devDependencies로만 잡혀 있어 프로덕션 설치에는 없다.
    번들링하면 webpack이 정적 분석 단계에서 찾지 못해 빌드가 깨진다. 로컬은 dev 의존성이
    설치돼 있어 통과하므로, 이 문제는 배포에서만 드러난다.

    수집기는 page.tsx → actions.ts → daily.ts 경로로 딸려 오지만 브라우저에서 실행될 일이 없다.
  */
  serverExternalPackages: ['@anthropic-ai/sdk', 'playwright', 'google-play-scraper', 'openai'],
  /*
    설정 파일은 코드에서 import하지 않고 런타임에 경로로 열기 때문에 Next의 추적에 안 잡힌다.
    빠지면 배포는 되고 화면에 서비스명 대신 자리표시자가 뜬다.

    수집 데이터는 여기 없다. 중앙 PostgreSQL에서 오므로 번들에 실을 파일이 없다.
    배포 환경에서는 이 파일 대신 RADAR_CONFIG_JSON 환경변수를 쓰는 편이 낫다.
    로컬 개발에는 영향이 없다 (프로덕션 빌드의 파일 추적 목록일 뿐이다).
  */
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  outputFileTracingIncludes: {
    '/': ['../../private/feedback-radar.config.json'],
    '/tour': ['../../private/feedback-radar.config.json'],
  },
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
