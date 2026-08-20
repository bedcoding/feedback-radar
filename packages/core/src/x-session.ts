import fs from 'node:fs';
import path from 'node:path';
import { privateDir } from './paths.js';

/**
 * X 로그인 세션 파일 관리.
 *
 * **Playwright를 import하지 않는 것이 이 모듈의 존재 이유다.** 세션을 넣고 지우는 일은 화면
 * (서버 액션)에서도 해야 하는데, 수집기 쪽에 두면 서버 액션이 브라우저 드라이버까지 끌어온다.
 * 파일을 다루는 부분만 여기로 떼어 수집기와 화면이 같은 구현을 공유한다.
 *
 * 파일은 Playwright의 storageState 형식이다. 저장 위치가 private/ 안이라 git에 올라가지 않지만,
 * **내용은 계정 접근권이다.** 값을 로그나 화면에 되돌려 출력하지 않는다.
 */

export const X_SESSION_PATH = path.join(privateDir(), 'x-session.json');

/** X 로그인 여부를 가리는 쿠키. 이게 없으면 로그인이 안 된 세션이다 */
export const X_AUTH_COOKIE = 'auth_token';
/** CSRF 토큰. 읽기만 하면 없어도 대체로 동작하지만, 있으면 같이 실어 준다 */
export const X_CSRF_COOKIE = 'ct0';

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

/** storageState 형식으로 쿠키 하나를 만든다. X 쿠키는 도메인 전체(.x.com)에 걸린다 */
function cookieEntry(name: string, value: string): StorageStateCookie {
  return {
    name,
    value,
    domain: '.x.com',
    path: '/',
    // 만료를 넉넉히 잡는다. 실제 수명은 X가 정하고, 만료되면 수집기가 '세션 만료'로 잡아낸다
    expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    httpOnly: name === X_AUTH_COOKIE,
    secure: true,
    sameSite: 'None',
  };
}

/**
 * 쿠키 값으로 세션 파일을 만든다. 이미 로그인해 둔 브라우저에서 값을 옮겨 올 때 쓴다.
 *
 * `auth_token`이 없으면 만들지 않는다. 빈 세션을 저장하면 다음 수집에서야 '세션 만료'로
 * 드러나서, 넣은 사람은 성공했다고 믿은 채 한 바퀴를 버리게 된다.
 */
export function writeXSession(authToken: string, csrfToken?: string): boolean {
  const auth = authToken.trim();
  if (!auth) return false;
  const csrf = csrfToken?.trim();
  const state = {
    cookies: [cookieEntry(X_AUTH_COOKIE, auth), ...(csrf ? [cookieEntry(X_CSRF_COOKIE, csrf)] : [])],
    origins: [] as unknown[],
  };
  fs.writeFileSync(X_SESSION_PATH, JSON.stringify(state, null, 2));
  return true;
}

export interface XSessionInfo {
  exists: boolean;
  /** 저장 시각 (ISO). 세션이 얼마나 오래된 것인지 화면에서 보여주기 위함 */
  savedAt?: string;
  /** 담긴 쿠키 이름. **값은 절대 내보내지 않는다** */
  cookieNames?: string[];
  /** auth_token이 실제로 들어 있는지. 없으면 로그인 안 된 세션이다 */
  hasAuth?: boolean;
}

/** 세션 파일 상태. 값은 읽지 않고 이름과 시각만 돌려준다 */
export function readXSessionInfo(): XSessionInfo {
  if (!fs.existsSync(X_SESSION_PATH)) return { exists: false };
  try {
    const stat = fs.statSync(X_SESSION_PATH);
    const raw = JSON.parse(fs.readFileSync(X_SESSION_PATH, 'utf8')) as {
      cookies?: { name?: string; value?: string }[];
    };
    const cookies = raw.cookies ?? [];
    return {
      exists: true,
      savedAt: stat.mtime.toISOString(),
      cookieNames: cookies.map((c) => c.name ?? '').filter(Boolean),
      hasAuth: cookies.some((c) => c.name === X_AUTH_COOKIE && c.value),
    };
  } catch {
    // 깨진 파일도 '있음'으로 보고한다. 지우고 다시 넣으라고 화면에서 안내할 수 있다
    return { exists: true, hasAuth: false, cookieNames: [] };
  }
}

/** 세션 파일 삭제. 계정을 바꿀 때 먼저 지우고 새로 넣는다 */
export function removeXSession(): void {
  if (fs.existsSync(X_SESSION_PATH)) fs.rmSync(X_SESSION_PATH);
}
