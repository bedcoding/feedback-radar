import { createSign } from 'node:crypto';

/**
 * App Store Connect API 인증 토큰(ES256 JWT).
 *
 * 새 의존성을 넣지 않는다. `node:crypto`만으로 서명이 되고, JWT 라이브러리를 붙이면
 * 이 한 곳 때문에 의존성이 늘고 공급망도 늘어난다.
 */

/** 계정 하나의 자격증명. 판매자 계정마다 한 벌씩 있다 */
export interface AscCredentials {
  issuerId: string;
  keyId: string;
  /** .p8 파일 내용 전문 (`-----BEGIN PRIVATE KEY-----` 줄부터) */
  privateKey: string;
}

const b64url = (value: string | Buffer): string => Buffer.from(value).toString('base64url');

/**
 * 환경변수에서 계정 자격증명을 읽는다.
 *
 * 이름에 접미사가 붙는 이유: **키가 계정 단위**라 판매자 계정이 갈리면 키도 갈린다.
 * 전역 키 하나를 가정하면 두 번째 계정에서 통째로 다시 뜯어야 한다.
 *
 * ```
 * ASC_KEY_A_ISSUER_ID / ASC_KEY_A_KEY_ID / ASC_KEY_A_PRIVATE_KEY
 * ASC_KEY_B_ISSUER_ID / ...
 * ```
 *
 * 서비스 설정의 `appstore.ascKey`가 이 접미사를 고른다(없으면 `A`).
 */
export function readAscCredentials(name = 'A'): AscCredentials | undefined {
  const key = name.trim().toUpperCase();
  const issuerId = process.env[`ASC_KEY_${key}_ISSUER_ID`]?.trim();
  const keyId = process.env[`ASC_KEY_${key}_KEY_ID`]?.trim();
  const raw = process.env[`ASC_KEY_${key}_PRIVATE_KEY`]?.trim();
  if (!issuerId || !keyId || !raw) return undefined;
  /*
    .env는 줄바꿈을 그대로 담기 어려워 `\n` 두 글자로 넣는 경우가 많다. 그대로 두면
    PEM 파서가 깨지는데, 오류 메시지가 "error:1E08010C"처럼 원인을 안 알려 준다.
  */
  return { issuerId, keyId, privateKey: raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw };
}

/**
 * 팀 키용 JWT를 만든다.
 *
 * **개인 키(Individual)가 아니라 팀 키(Team)를 전제로 한다.** 개인 키는 페이로드에 `sub`가
 * 필요하고 그 사람의 권한에 묶여, 퇴사·역할 변경 시 조용히 죽는다. 상주 파이프라인에는 맞지 않는다.
 *
 * 수명을 20분이 아니라 **19분**으로 잡는다. Apple 상한이 20분이라 정확히 20분을 쓰면
 * 서버·클라이언트 시계가 몇 초만 어긋나도 401이 난다. 그 401은 원인이 안 보인다.
 */
export function ascToken(cred: AscCredentials): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: cred.keyId, typ: 'JWT' };
  const payload = {
    iss: cred.issuerId,
    iat: now,
    exp: now + 19 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  /*
    🔴 `dsaEncoding: 'ieee-p1363'`이 빠지면 401이 난다.

    Node의 기본값은 DER(길이가 70~72바이트로 들쭉날쭉)인데 JWS ES256은 **고정 64바이트**
    r||s를 요구한다. Apple은 그냥 401만 주고 이유를 말하지 않아서, 이 한 줄이 없으면
    키가 잘못된 줄 알고 재발급까지 가게 된다(.p8은 1회 한정 다운로드라 그 대가가 크다).
    서명부 base64url이 86자면 정상이다.
  */
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: cred.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}
