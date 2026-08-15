import crypto from 'node:crypto';
import os from 'node:os';

/**
 * 머신마다 달라야 하는 설정을 담는 키 규칙.
 *
 * settings 표에는 성격이 다른 두 종류가 섞여 있다.
 *
 * - **공용**: 추적 서비스, 수집 주기, 소스 on/off, 수집량 상한. 어느 PC에서 고쳐도 다른
 *   PC와 배포본에 반영되는 것이 의도된 동작이다.
 * - **머신별**: 태거 진단 결과, claude 실행 파일 경로, 로그인 터미널 실행 결과.
 *   같은 계정이라도 PC마다 결과가 다르고, 경로는 OS마다 아예 다르다.
 *
 * 저장소가 `private/data/*.db`(머신 로컬 SQLite)일 때는 둘을 구분할 이유가 없었다.
 * 표 자체가 그 PC 것이었기 때문이다. 그런데 저장소를 중앙 PostgreSQL로 옮기면서
 * (`4eabf8f`) 머신별 값까지 전 머신 공용이 됐다. 그때부터 이런 일이 생긴다.
 *
 *   회사 PC에서 진단 → "Claude 구독 (추가 비용 0)" 저장
 *   집 PC에서 화면을 열면 그 값이 그대로 보인다 (집은 CLI가 403인데도)
 *   집 PC에서 [다시 확인]을 누르면 회사 PC 값이 덮여 사라진다
 *
 * 그래서 머신별 값은 이 접두사를 달아 따로 저장한다. 배포본 전용 값을 `vercel.*`로
 * 나눠 둔 것과 같은 방식이다(collect-limits.ts).
 */

let cachedId: string | undefined;

/**
 * 이 머신을 가리키는 짧은 식별자.
 *
 * **컴퓨터 이름을 그대로 쓰지 않고 해시한다.** 사내 PC 이름에는 회사명이나 사용자 실명이
 * 들어가는 경우가 많은데, 이 값은 설정 키가 되어 DB에 남고 화면과 발표 자료에 노출될 수
 * 있다. 필요한 것은 "같은 머신인가"를 가리는 것뿐이라 원래 이름을 복원할 수 있을 이유가 없다.
 */
export function machineId(): string {
  if (cachedId) return cachedId;
  const raw = `${os.hostname()}|${os.platform()}|${os.homedir()}`;
  cachedId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 8);
  return cachedId;
}

/** 이 머신 전용 설정 키. 예: `host.a1b2c3d4.taggerStatus` */
export function hostKey(key: string): string {
  return `host.${machineId()}.${key}`;
}

/** 값에서 확인 시각을 읽는다. JSON이 아니거나 checkedAt이 없으면 0 (가장 오래된 것으로 본다) */
function checkedAtOf(value: string): number {
  try {
    const parsed = JSON.parse(value) as { checkedAt?: unknown };
    if (typeof parsed.checkedAt !== 'string') return 0;
    const t = Date.parse(parsed.checkedAt);
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

export interface HostSetting {
  value?: string;
  /** 이 머신에서 직접 저장한 값인지. false면 다른 머신 값을 빌려 온 것이다 */
  mine: boolean;
}

/**
 * 머신별 설정을 읽는다. 이 머신 값이 없으면 **다른 머신 값이라도 돌려준다.**
 *
 * 빌려 오는 이유: 없다고 화면을 비우면 아직 한 번도 진단하지 않은 PC에서 카드의 배지와
 * 사실 줄이 통째로 사라진다. 그 PC에서 아무것도 확인할 수 없다는 뜻이 아니라 여기서
 * 확인한 적이 없다는 뜻일 뿐이므로, 값은 보여주고 **출처를 화면이 밝히게 한다**(mine=false).
 *
 * 후보가 여럿이면 확인 시각이 가장 최근인 것을 쓴다. 구버전이 머신 구분 없이 저장하던
 * 키(접두사 없는 이름)도 후보에 넣는다. 마이그레이션 스크립트 없이 자연히 흡수된다.
 */
export function readHostSetting(settings: Record<string, string>, key: string): HostSetting {
  const own = settings[hostKey(key)]?.trim();
  if (own) return { value: own, mine: true };

  const suffix = `.${key}`;
  const candidates = [
    ...Object.keys(settings).filter((k) => k.startsWith('host.') && k.endsWith(suffix)),
    key,
  ]
    .map((k) => settings[k]?.trim())
    .filter((v): v is string => Boolean(v))
    .sort((a, b) => checkedAtOf(b) - checkedAtOf(a));

  return { value: candidates[0], mine: false };
}

/**
 * 이 머신이 저장한 값만 읽는다. 없으면 undefined.
 *
 * 빌려 오면 **안 되는** 값에 쓴다. 대표가 claude 실행 파일 경로다. 맥에서 저장한
 * `/opt/homebrew/bin/claude`를 윈도우가 물려받으면 없는 경로를 CLAUDE_CLI_CMD로 넣게 되고,
 * 그러면 자동 탐색까지 막혀 CLI가 있는데도 못 찾는다. 진단 결과처럼 "참고로 보여주는" 값과
 * 달리 이건 실제 동작에 쓰이므로 남의 값이 섞이면 안 된다.
 */
export function ownHostSetting(
  settings: Record<string, string>,
  key: string,
): string | undefined {
  return settings[hostKey(key)]?.trim() || undefined;
}
