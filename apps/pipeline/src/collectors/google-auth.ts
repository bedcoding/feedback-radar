import { createSign } from 'node:crypto';

/**
 * Google 서비스 계정 → OAuth2 액세스 토큰 (RS256 JWT bearer).
 *
 * Apple과 달리 **JWT를 그대로 API에 보내지 않는다.** JWT로 토큰 엔드포인트를 두드려
 * 액세스 토큰을 받고, 그 토큰으로 API를 부른다. 한 단계가 더 있다.
 *
 * 새 의존성은 넣지 않는다. `googleapis` 패키지는 이 한 가지를 위해 붙이기에 너무 크다.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const b64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

/**
 * 서비스 계정 JSON을 읽는다.
 *
 * **자격증명이 한 벌인 것이 앱스토어와 다른 점이다.** 서비스 계정 하나를 만들고 그 이메일을
 * 개발자 계정마다 초대하므로, 키는 하나고 늘어나는 것은 권한 부여 건수다.
 */
function readServiceAccount(): ServiceAccount | undefined {
  const raw = process.env.GOOGLE_PLAY_SA_JSON?.trim();
  if (!raw) return undefined;
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch (e) {
    console.warn(`  구글플레이: GOOGLE_PLAY_SA_JSON 파싱 실패 (${(e as Error).message})`);
    return undefined;
  }
  if (!parsed.client_email || !parsed.private_key) {
    console.warn('  구글플레이: GOOGLE_PLAY_SA_JSON에 client_email 또는 private_key가 없습니다');
    return undefined;
  }
  /*
    JSON 안의 private_key는 줄바꿈이 `\n` 두 글자로 들어 있다. JSON.parse가 그것을 실제
    줄바꿈으로 풀어 주지만, .env에 넣는 과정에서 한 번 더 이스케이프되는 경우가 있어
    남아 있으면 여기서 푼다. 안 풀면 PEM 파서가 원인을 안 알려 주는 오류를 낸다.
  */
  const privateKey = parsed.private_key.includes('\\n')
    ? parsed.private_key.replace(/\\n/g, '\n')
    : parsed.private_key;
  return { client_email: parsed.client_email, private_key: privateKey };
}

/** 발급받은 토큰과 만료 시각(ms). 한 번 받아 두고 만료 전까지 재사용한다 */
let cached: { token: string; expiresAt: number } | undefined;

/**
 * 액세스 토큰을 얻는다. 유효한 것이 있으면 그대로 준다.
 *
 * 수집 한 회차에 앱마다 여러 번 호출하므로, 매번 발급받으면 토큰 엔드포인트를 그만큼
 * 두들기게 된다. 만료 1분 전부터는 새로 받는다(호출 도중 만료되는 것을 피한다).
 */
export async function googlePlayToken(): Promise<string | undefined> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const sa = readServiceAccount();
  if (!sa) return undefined;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  /*
    🔴 `sub`를 넣지 않는다.

    공식 문서의 클레임 표에는 sub가 함께 있는데 그건 **도메인 전체 위임(domain-wide
    delegation)** 전용이다. 서비스 계정 단독 호출에서 넣으면 `unauthorized_client`로 막힌다.
    표를 그대로 따라 하다 걸리기 쉬운 자리다.
  */
  const claims = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    // 상한이 1시간이다. 넘기면 invalid_grant
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
  const assertion = `${signingInput}.${signature.toString('base64url')}`;

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`  구글플레이 토큰 요청 실패: ${(e as Error).message}`);
    return undefined;
  }

  const json = (await res.json().catch(() => undefined)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | undefined;

  if (!res.ok || !json?.access_token) {
    // 사유를 남긴다. invalid_grant(시계 어긋남·키 문제)와 unauthorized_client(sub 넣음)를
    // 구별할 수 있어야 어디를 고칠지 정해진다
    const why = json?.error_description ?? json?.error ?? `HTTP ${res.status}`;
    console.warn(`  구글플레이 토큰 발급 실패: ${why}`);
    return undefined;
  }

  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}
