import { spawn } from 'node:child_process';
import { resolveCliCmd, resetCliCache, shellSafe } from './claude-cli.js';

/**
 * 태거 진단 — "왜 휴리스틱으로 도는지"를 화면에서 바로 알 수 있게 한다.
 *
 * 이 도구의 핵심 이점(구독 요금으로 LLM 분류)이 CLI 미설치·미로그인 때문에
 * 조용히 꺼지는 일이 잦다. 로그를 뒤지지 않고도 원인과 다음 행동을 알려 주는 게 목적이다.
 *
 * 로그인 자체는 브라우저에서 못 한다 — `claude auth login`은 대화형 터미널과
 * 브라우저 승인이 필요하다. 대신 상태를 정확히 보여주고 실행할 명령을 안내한다.
 */

export type TaggerMode = 'cli' | 'api' | 'heuristic';

export interface TaggerStatus {
  /** 지금 수집을 돌리면 실제로 쓰일 모드 */
  mode: TaggerMode;
  /** TAGGER_MODE로 강제된 경우 그 값 */
  forced?: TaggerMode;
  cliPath?: string;
  cliFound: boolean;
  /** claude auth status 결과 (CLI를 찾았을 때만) */
  loggedIn?: boolean;
  authMethod?: string;
  apiKeySet: boolean;
  /** 화면에 보여줄 다음 행동 */
  hint: string;
  /** 사용자가 직접 실행할 수 있는 로그인 명령 (복사용) */
  loginCommand: string;
  checkedAt: string;
}

function run(cmd: string, args: string[], timeoutMs = 20_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    try {
      const child = spawn(shellSafe(cmd), args, {
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve({ code: -1, out });
      }, timeoutMs);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (out += d));
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ code: -1, out });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, out });
      });
    } catch {
      resolve({ code: -1, out });
    }
  });
}

/** `claude auth status`는 JSON을 내보낸다. 형식이 바뀌어도 진단이 죽지 않게 방어적으로 읽는다 */
function parseAuth(out: string): { loggedIn?: boolean; authMethod?: string } {
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start === -1 || end <= start) return {};
  try {
    const j = JSON.parse(out.slice(start, end + 1)) as { loggedIn?: unknown; authMethod?: unknown };
    return {
      loggedIn: typeof j.loggedIn === 'boolean' ? j.loggedIn : undefined,
      authMethod: typeof j.authMethod === 'string' ? j.authMethod : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * @param cliOverride 설정 화면에서 지정한 CLI 경로 (있으면 이것부터 확인)
 */
/**
 * 로그인 터미널 열기.
 *
 * OAuth 로그인은 브라우저 승인이 필요해서 웹 폼으로 대신할 수 없다. 그렇다고
 * 인증 코드를 이 앱이 받아 CLI에 넘기는 구조로 만들면, 계정 자격증명이 우리 코드를
 * 거쳐 가게 된다 — 편의를 위해 감수할 위험이 아니다.
 * 그래서 **터미널만 대신 띄우고** 인증은 공식 CLI가 직접 처리하게 한다.
 * 이 앱은 인증 코드를 보지도 저장하지도 않는다.
 */
export interface LoginLaunch {
  launched: boolean;
  /** 터미널을 못 띄웠을 때 사용자가 직접 실행할 명령 */
  fallbackCommand: string;
  error?: string;
}

export async function openClaudeLogin(cliOverride?: string): Promise<LoginLaunch> {
  if (cliOverride?.trim()) process.env.CLAUDE_CLI_CMD = cliOverride.trim();
  const raw = ((await resolveCliCmd()) ?? 'claude').replace(/^"|"$/g, '');
  const quoted = /\s/.test(raw) ? `"${raw}"` : raw;
  const fallbackCommand = `${quoted} auth login`;

  return new Promise((resolve) => {
    try {
      let child;
      if (process.platform === 'win32') {
        // 인자 배열로 넘기면 Node가 따옴표를 \" 로 이스케이프해 cmd가 경로를 통째로
        // 명령 이름으로 읽는다. 한 줄 문자열 + shell:true 로 넘겨야 cmd가 그대로 파싱한다.
        // .cmd 배치 파일이라 call 을 붙인다.
        child = spawn(`start "Claude 로그인" cmd /k call ${quoted} auth login`, {
          shell: true,
          detached: true,
          stdio: 'ignore',
        });
      } else if (process.platform === 'darwin') {
        child = spawn(
          'osascript',
          [
            '-e',
            `tell application "Terminal" to do script "${raw.replace(/"/g, '\\"')} auth login"`,
            '-e',
            'tell application "Terminal" to activate',
          ],
          { detached: true, stdio: 'ignore' },
        );
      } else {
        child = spawn('x-terminal-emulator', ['-e', `${raw} auth login`], {
          detached: true,
          stdio: 'ignore',
        });
      }

      child.on('error', (e) =>
        resolve({ launched: false, fallbackCommand, error: (e as Error).message }),
      );
      child.unref();
      // spawn 실패는 비동기 이벤트로 오므로 잠깐 기다렸다 성공으로 본다
      setTimeout(() => resolve({ launched: true, fallbackCommand }), 800);
    } catch (e) {
      resolve({ launched: false, fallbackCommand, error: (e as Error).message });
    }
  });
}

/** 로그인이 끝날 때까지 상태를 폴링한다. 끝나면 true */
export async function waitForLogin(cliOverride?: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await diagnoseTagger(cliOverride);
    if (s.loggedIn) return true;
  }
  return false;
}

export async function diagnoseTagger(cliOverride?: string): Promise<TaggerStatus> {
  const checkedAt = new Date().toISOString();
  const apiKeySet = Boolean(process.env.ANTHROPIC_API_KEY);
  const forced = process.env.TAGGER_MODE as TaggerMode | undefined;

  if (cliOverride?.trim()) process.env.CLAUDE_CLI_CMD = cliOverride.trim();
  resetCliCache();

  const cliPath = (await resolveCliCmd()) ?? undefined;
  const cliFound = Boolean(cliPath);
  const bare = (cliPath ?? 'claude').replace(/^"|"$/g, '');
  const loginCommand = `${/\s/.test(bare) ? `"${bare}"` : bare} auth login`;

  let loggedIn: boolean | undefined;
  let authMethod: string | undefined;
  if (cliPath) {
    const res = await run(cliPath, ['auth', 'status']);
    ({ loggedIn, authMethod } = parseAuth(res.out));
  }

  const cliUsable = cliFound && loggedIn === true;
  let mode: TaggerMode;
  if (forced === 'heuristic' || forced === 'api' || forced === 'cli') mode = forced;
  else if (cliUsable) mode = 'cli';
  else if (apiKeySet) mode = 'api';
  else mode = 'heuristic';

  let hint: string;
  if (mode === 'cli' && cliUsable) {
    hint = '구독 요금으로 LLM 분류 중입니다. 추가 비용이 발생하지 않습니다.';
  } else if (!cliFound) {
    hint =
      'claude CLI를 찾지 못했습니다. `npm install -g @anthropic-ai/claude-code` 로 설치하거나, 이미 설치했다면 아래에 실행 파일 경로를 직접 지정하세요.';
  } else if (loggedIn === false) {
    hint =
      'claude CLI는 찾았지만 로그인이 안 돼 있습니다. 터미널에서 `claude auth login` 을 한 번 실행한 뒤 [다시 확인]을 눌러 주세요.';
  } else if (loggedIn === undefined) {
    hint = 'claude CLI 로그인 상태를 확인하지 못했습니다. 터미널에서 `claude auth status` 로 직접 확인해 보세요.';
  } else if (mode === 'api') {
    hint = 'API 키로 분류합니다 (종량제). 구독 요금으로 쓰려면 `claude auth login` 후 다시 확인하세요.';
  } else {
    hint = '키워드 규칙으로 분류 중입니다 — 정확도가 낮습니다. 위 안내대로 LLM 분류를 켜는 것을 권합니다.';
  }
  if (forced) hint = `TAGGER_MODE=${forced} 로 고정돼 있습니다. ` + hint;

  return { mode, forced, cliPath, cliFound, loggedIn, authMethod, apiKeySet, hint, loginCommand, checkedAt };
}
