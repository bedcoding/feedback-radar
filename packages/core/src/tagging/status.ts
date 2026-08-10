import { spawn } from 'node:child_process';
import { parseCliEnvelope, resolveCliCmd, resetCliCache, shellSafe } from './claude-cli.js';
import {
  DEFAULT_OPENAI_MODEL,
  providerKeySet,
  selectedApiProvider,
  type ApiProvider,
} from './provider.js';

/**
 * 태거 진단: "왜 휴리스틱으로 도는지"를 화면에서 바로 알 수 있게 한다.
 *
 * 이 도구의 핵심 이점(구독 요금으로 LLM 분류)이 CLI 미설치, 미로그인 때문에
 * 조용히 꺼지는 일이 잦다. 로그를 뒤지지 않고도 원인과 다음 행동을 알려 주는 게 목적이다.
 *
 * 로그인 자체는 브라우저에서 못 한다. `claude auth login`은 대화형 터미널과
 * 브라우저 승인이 필요하다. 대신 상태를 정확히 보여주고 실행할 명령을 안내한다.
 */

export type TaggerMode = 'cli' | 'openai' | 'anthropic' | 'heuristic';
export type ForcedTaggerMode = TaggerMode | 'api';

export interface TaggerStatus {
  /** 지금 수집을 돌리면 실제로 쓰일 모드 */
  mode: TaggerMode;
  /** TAGGER_MODE로 강제된 경우 그 값 */
  forced?: ForcedTaggerMode;
  cliPath?: string;
  cliFound: boolean;
  /** claude auth status 결과 (CLI를 찾았을 때만) */
  loggedIn?: boolean;
  authMethod?: string;
  /** 분류에 쓰도록 지정한 값. haiku/sonnet/opus는 별칭이라 버전이 드러나지 않는다 */
  model: string;
  claudeModel?: string;
  openaiModel?: string;
  apiProvider?: ApiProvider;
  /**
   * 그 지정값으로 실제 호출했을 때 CLI가 돌려준 정식 모델 ID.
   * 별칭을 쓰면 버전이 언제든 바뀌므로, 무엇이 돌았는지는 이 값으로만 확인할 수 있다.
   */
  resolvedModel?: string;
  /** 실제로 분류 호출이 되는지 (로그인만으로는 알 수 없다) */
  inferenceOk?: boolean;
  /** 추론이 안 될 때 CLI가 준 사유 */
  inferenceError?: string;
  /** 이전 저장 데이터 및 둘러보기 화면과의 호환용: 둘 중 하나라도 있으면 true */
  apiKeySet: boolean;
  anthropicApiKeySet?: boolean;
  openaiApiKeySet?: boolean;
  /** 화면에 보여줄 다음 행동 */
  hint: string;
  /** 사용자가 직접 실행할 수 있는 로그인 명령 (복사용) */
  loginCommand: string;
  checkedAt: string;
}

/**
 * out은 진단 메시지용(stdout+stderr 합본), stdout은 JSON 파싱용.
 * CLI가 경고를 stderr로 흘리면 합본은 JSON으로 못 읽는다.
 */
function run(
  cmd: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<{ code: number; out: string; stdout: string }> {
  return new Promise((resolve) => {
    let out = '';
    let stdout = '';
    try {
      const child = spawn(shellSafe(cmd), args, {
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve({ code: -1, out, stdout });
      }, timeoutMs);
      child.stdout.on('data', (d) => {
        out += d;
        stdout += d;
      });
      child.stderr.on('data', (d) => (out += d));
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ code: -1, out, stdout });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, out, stdout });
      });
    } catch {
      resolve({ code: -1, out, stdout });
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
 * 거쳐 가게 된다. 편의를 위해 감수할 위험이 아니다.
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
        // 명령 이름으로 읽는다. 한 줄 문자열 + shell:true로 넘겨야 cmd가 그대로 파싱한다.
        // .cmd 배치 파일이라 call을 붙인다.
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
export async function waitForLogin(
  cliOverride?: string,
  timeoutMs = 90_000,
  modelOverride?: string,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await diagnoseTagger(cliOverride, modelOverride);
    if (s.loggedIn) return true;
  }
  return false;
}

export async function diagnoseTagger(cliOverride?: string, modelOverride?: string): Promise<TaggerStatus> {
  const checkedAt = new Date().toISOString();
  const anthropicApiKeySet = providerKeySet('anthropic');
  const openaiApiKeySet = providerKeySet('openai');
  const apiKeySet = anthropicApiKeySet || openaiApiKeySet;
  const forcedRaw = process.env.TAGGER_MODE;
  const forced = ['cli', 'openai', 'anthropic', 'api', 'heuristic'].includes(forcedRaw ?? '')
    ? (forcedRaw as ForcedTaggerMode)
    : undefined;

  if (cliOverride?.trim()) process.env.CLAUDE_CLI_CMD = cliOverride.trim();
  resetCliCache();

  const cliPath = (await resolveCliCmd()) ?? undefined;
  const cliFound = Boolean(cliPath);
  if (modelOverride !== undefined) process.env.CLAUDE_CLI_MODEL = modelOverride;
  const claudeModel = process.env.CLAUDE_CLI_MODEL ?? 'haiku';
  const openaiModel = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const anthropicModel = process.env.TAGGER_MODEL || 'claude-haiku-4-5';
  const bare = (cliPath ?? 'claude').replace(/^"|"$/g, '');
  const loginCommand = `${/\s/.test(bare) ? `"${bare}"` : bare} auth login`;

  let loggedIn: boolean | undefined;
  let authMethod: string | undefined;
  let inferenceOk: boolean | undefined;
  let inferenceError: string | undefined;
  let resolvedModel: string | undefined;
  if (cliPath && (!forced || forced === 'cli')) {
    const res = await run(cliPath, ['auth', 'status']);
    ({ loggedIn, authMethod } = parseAuth(res.out));

    // 로그인이 됐다고 분류가 되는 건 아니다. 조직 계정은 모델별로 크레딧이 막히기도 한다.
    // 아주 짧은 호출로 실제 가능 여부를 확인한다.
    // json 출력으로 받아야 CLI가 별칭을 어떤 정식 모델 ID로 바꿨는지도 함께 알 수 있다.
    if (loggedIn) {
      const base = ['-p', '--output-format', 'json', 'OK 한 단어만 답하라'];
      const probeArgs = claudeModel ? ['-p', '--model', claudeModel, ...base.slice(1)] : base;
      const probe = await run(cliPath, probeArgs, 45_000);
      inferenceOk = probe.code === 0;
      if (inferenceOk) {
        resolvedModel = parseCliEnvelope(probe.stdout).models.join(', ') || undefined;
      } else {
        inferenceError = probe.out.trim().slice(0, 200) || `종료코드 ${probe.code}`;
      }
    }
  }

  const cliUsable = cliFound && loggedIn === true && inferenceOk === true;
  const configuredProvider = selectedApiProvider();
  let mode: TaggerMode;
  if (forced === 'heuristic') mode = 'heuristic';
  else if (forced === 'cli') mode = 'cli';
  else if (forced === 'openai') mode = openaiApiKeySet ? 'openai' : 'heuristic';
  else if (forced === 'anthropic') mode = anthropicApiKeySet ? 'anthropic' : 'heuristic';
  else if (forced === 'api') {
    mode = configuredProvider && providerKeySet(configuredProvider) ? configuredProvider : 'heuristic';
  } else if (cliUsable) mode = 'cli';
  else if (configuredProvider && providerKeySet(configuredProvider)) mode = configuredProvider;
  else mode = 'heuristic';

  const apiProvider: ApiProvider | undefined =
    mode === 'openai' || mode === 'anthropic' ? mode : configuredProvider;
  const model =
    mode === 'openai' ? openaiModel : mode === 'anthropic' ? anthropicModel : claudeModel;

  let hint: string;
  if ((forced === 'openai' || (forced === 'api' && apiProvider === 'openai')) && !openaiApiKeySet) {
    hint = 'OpenAI API를 선택했지만 OPENAI_API_KEY가 없습니다. 레포 루트 .env에 키를 넣고 다시 확인하세요.';
  } else if (
    (forced === 'anthropic' || (forced === 'api' && apiProvider === 'anthropic')) &&
    !anthropicApiKeySet
  ) {
    hint = 'Anthropic API를 선택했지만 ANTHROPIC_API_KEY가 없습니다. 레포 루트 .env에 키를 넣고 다시 확인하세요.';
  } else if (mode === 'openai') {
    hint = `OpenAI API로 분류합니다 (${openaiModel}). 입력과 출력은 OpenAI 데이터 공유 설정의 적용 대상이 될 수 있습니다.`;
  } else if (mode === 'anthropic') {
    hint = `Anthropic API로 분류합니다 (${anthropicModel}, 종량제).`;
  } else if (mode === 'cli' && cliUsable) {
    // 실제 호출 모델은 카드 상단 facts 줄에 이미 뜬다. 여기서 또 적으면 같은 말이 두 번 보인다
    hint = '구독 요금으로 LLM 분류 중입니다. 추가 비용이 발생하지 않습니다.';
  } else if (!cliFound) {
    hint =
      'claude CLI를 찾지 못했습니다. `npm install -g @anthropic-ai/claude-code` 로 설치하거나, 이미 설치했다면 아래에 실행 파일 경로를 직접 지정하세요.';
  } else if (loggedIn === false) {
    hint =
      'claude CLI는 찾았지만 로그인이 안 돼 있습니다. 터미널에서 `claude auth login` 을 한 번 실행한 뒤 [다시 확인]을 눌러 주세요.';
  } else if (inferenceOk === false) {
    hint =
      `로그인은 됐지만 분류 호출이 거부됐습니다 (${inferenceError ?? '사유 불명'}). ` +
      '아래에서 다른 모델을 골라 [다시 확인]을 눌러 보세요. 해결 전까지는 키워드 규칙으로 분류합니다.';
  } else if (loggedIn === undefined) {
    hint = 'claude CLI 로그인 상태를 확인하지 못했습니다. 터미널에서 `claude auth status` 로 직접 확인해 보세요.';
  } else {
    hint = '키워드 규칙으로 분류 중입니다. 정확도가 낮습니다. Claude CLI 또는 API 키를 설정하세요.';
  }
  if (forced) hint = `TAGGER_MODE=${forced} 로 고정돼 있습니다. ` + hint;

  return {
    mode, forced, cliPath, cliFound, loggedIn, authMethod,
    model, claudeModel, openaiModel, apiProvider, resolvedModel, inferenceOk, inferenceError,
    apiKeySet, anthropicApiKeySet, openaiApiKeySet, hint, loginCommand, checkedAt,
  };
}
