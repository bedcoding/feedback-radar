/** @type {import('next').NextConfig} */
const nextConfig = {
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
