# Feedback Radar 📡

외부 채널(앱스토어·구글플레이·네이버·커뮤니티·SNS)에 흩어진 서비스 사용자 반응을 주기적으로 수집하고,
LLM이 건별 분류(감성/카테고리/심각도/담당팀)한 뒤 **급증 감지 + 원문 링크가 달린 브리핑**을
웹훅으로 push하는 사용자 피드백(VOC) 모니터링 도구.

- **올인원 로컬 실행**: `npm run dev` 하나로 대시보드 + 스케줄러가 함께 뜬다. 24시간 켜 두는 PC 한 대면 충분
- **API 키 없이 동작**: 머신에 [Claude Code](https://claude.com/claude-code)가 로그인돼 있으면
  구독 요금으로 태깅한다 (`claude -p` 배치 호출). 없으면 API 키 → 키워드 휴리스틱 순으로 폴백
- **설계 원칙 "숫자는 코드가, 판단은 LLM이"**: 집계·급증 감지는 SQL, LLM은 건별 분류만.
  리포트의 모든 인용에는 원문 링크가 붙는다

## 화면

| 경로 | 용도 |
|---|---|
| `/` | 대시보드 — 수집 현황, 수집 주기 설정, "지금 실행" |
| `/tour` | **둘러보기** — 실제 UI 위에 설명을 얹는 제품 투어. 데모용 예시 데이터라 클론 직후에도 그대로 동작 |
| `/pitch` | **소개 슬라이드** (발표용) — 기능·실제 화면·성과 중심. 실데이터로 수치가 채워짐 |
| `/deck` | **동작 원리 슬라이드** (개발자용) — 내부 구조를 20장으로 상세히 |

- 투어는 `←` `→`로 넘기고 `Esc`로 닫는다. **DB를 읽지 않고 예시 데이터로 동작**하므로 아직 한 번도
  수집하지 않은 머신에서도 화면이 똑같이 나온다 (서비스명만 설정에서 가져오고, 설정이 없으면 자리표시자)
- 슬라이드는 `←` `→`로 넘기고 `G`로 목차를 연다. `Ctrl+P`(가로 방향)로 그대로 PDF 저장이 된다

## 구조

```
feedback-radar/
├─ private/                            # 🔒 비공개 파일 전용 (gitignore) — 설정·.env·DB·리포트·캡처
│   ├─ feedback-radar.config.json      #    테넌트 설정 (서비스명·키워드·용어 사전)
│   ├─ .env                            #    API 키·웹훅 주소
│   ├─ data/feedback-radar.db          #    SQLite
│   ├─ reports/YYYY-MM-DD.md           #    일일 브리핑 보관
│   └─ deck-assets/*.png               #    /pitch 에 넣을 화면 캡처
├─ feedback-radar.config.example.json  # 설정 템플릿
├─ packages/core/          # DB(SQLite), 택소노미, 태거 3종, 리포트 생성, 웹훅
├─ apps/pipeline/          # 수집기 + 스케줄러 + 캡처 스크립트
└─ apps/web/               # Next.js 대시보드 + 슬라이드
```

**`private/` 한 폴더 원칙**: 서비스를 식별할 수 있는 정보는 전부 여기에만 있다.
저장소 코드에는 서비스명이 하드코딩된 곳이 없고, 화면에 뜨는 이름·키워드는 전부 이 설정에서 읽는다.
설정이 없는 머신에서는 `/pitch`가 `{서비스명}` 같은 자리표시자를 대신 보여준다.

수집 소스 (설정으로 켜고 끔):

| 소스 | 방식 | 안정성 |
|---|---|---|
| 앱스토어 리뷰 | iTunes RSS API (공식, 무인증) | ★★★ |
| 구글플레이 리뷰 | google-play-scraper | ★★★ |
| 네이버 블로그/카페 | 네이버 오픈 API (무료 일 25,000회) | ★★★ |
| 디시인사이드 | Playwright 통합검색 | ★★ |
| Threads | Playwright (실험적) | ★ |

### 지원하지 않는 소스와 이유

주요 SNS를 직접 방문 테스트(2026-07)한 뒤 아래 소스들은 **의도적으로 배제**했다:

| 소스 | 배제 이유 |
|---|---|
| X(트위터) | 비로그인 검색이 차단됨 (검색 URL 진입 시 로그인 페이지로 강제 리다이렉트). 약관이 스크래핑을 명시적으로 금지하고, 로그인 계정 우회는 봇 탐지로 계정 정지 리스크. 공식 API는 종량제(읽기 건당 $0.005)라 일일 키워드 모니터링에 월 수백 달러 규모 |
| 인스타그램 | 검색·해시태그 페이지가 로그인 필수 (로그인 페이지로 리다이렉트) |
| Bluesky | 로그아웃 상태에서 검색 기능 자체가 비활성화 |
| 페이스북, 더쿠 등 | 검색이 로그인 전용이거나 비공개 (더쿠는 통합검색 HTTP 403) |

원칙: **로그인 계정으로 우회 수집하지 않는다** — 약관 위반이고, 파이프라인이 계정 정지 하나로
무너지는 단일 장애점이 되기 때문. 대신 공식 API와 비로그인 공개 페이지만 사용한다.
Threads는 예외적으로 비로그인 상태에서도 검색 결과가 렌더링되는 것이 확인되어 실험적으로 지원한다.

---

# 처음 설치하기

새 머신(집 PC, 회사 PC)에서 처음부터 세팅하는 순서다. **Windows / macOS 명령을 나눠 적었다.**

## 0. 사전 요구사항

| 항목 | 버전/조건 | 확인 명령 |
|---|---|---|
| Node.js | **20.12 이상** (`process.loadEnvFile` 사용) | `node -v` |
| Git | 아무 버전 | `git --version` |
| 브라우저 | Edge 또는 Chrome (커뮤니티·SNS 수집용) | Windows는 Edge 기본 내장 |

Node가 없거나 낮으면 [nodejs.org](https://nodejs.org)에서 LTS를 설치한다.

## 1. 클론 & 설치

**Windows (PowerShell)**
```powershell
git clone https://github.com/bedcoding/feedback-radar
cd feedback-radar
npm install
```

**macOS / Linux**
```bash
git clone https://github.com/bedcoding/feedback-radar
cd feedback-radar
npm install
```

브라우저가 없는 환경(서버, Docker 등)이라면 추가로:

```bash
npx playwright install chromium
```

> Edge나 Chrome이 깔려 있으면 이 단계는 건너뛰어도 된다. 실행 시 설치된 브라우저를 자동으로 찾는다.

## 2. 프리셋으로 설정 만들기 (한 줄)

`private/`는 gitignore라 클론 직후에는 **없다.** 아래 명령이 폴더를 만들고
업종 프리셋과 `.env` 템플릿을 복사한다. **이미 있는 파일은 덮어쓰지 않는다.**

```bash
npm run setup -- --list           # 어떤 프리셋이 있는지 보기
npm run setup -- content-platform # 프리셋 골라 셋업 (생략하면 content-platform)
```

| 프리셋 | 대상 |
|---|---|
| `content-platform` | 연재형 콘텐츠 플랫폼 — 회차 단위 소비, 자체 재화 결제 |
| `commerce` | 쇼핑몰·마켓플레이스 — 주문·배송·반품 중심 |
| `saas` | 구독형 앱·SaaS — 요금제·계정 관리 중심 |

프리셋에는 **업종 용어 사전(`domainPrompt`·`categoryKeywords`·`relevanceHints`)이 이미 들어 있다.**
새 머신에서 이걸 다시 기억해 낼 필요가 없다는 뜻이다.

## 3. 설정에서 3가지만 채우기

`private/feedback-radar.config.json`을 열어 **아래 3개만** 본인 서비스에 맞게 바꾸면 된다.

```jsonc
{
  "displayName": "우리 서비스",          // ← 화면·리포트에 표시될 이름
  "keywords": ["서비스명", "줄임말"],     // ← 웹에서 검색할 키워드 (별칭·오타 변형 포함)
  "appstore":   { "appId": "123456789" },              // ← 앱스토어 숫자 ID
  "googlePlay": { "appId": "com.example.app" }         // ← 구글플레이 패키지명
}
```

**앱 ID는 아래 명령으로 찾을 수 있다** (양쪽 스토어를 동시에 검색해 후보를 출력한다):

```bash
npm run find-app -- "서비스명"
```

직접 찾으려면 앱스토어는 `apps.apple.com/kr/app/이름/id`**`1234567890`** 의 숫자,
구글플레이는 `play.google.com/store/apps/details?id=`**`com.example.app`** 부분이다.
- 나머지 항목은 프리셋 값을 그대로 쓰면 되고, 필요할 때만 손보면 된다:
  - **`domainPrompt`** — LLM에 주는 서비스 용어 사전. 잘 채울수록 분류가 정확해진다
  - **`categoryKeywords`** — 휴리스틱 모드가 카테고리를 고를 때 쓰는 추가 키워드
  - **`relevanceHints`** — 관련 글로 인정하려면 함께 나와야 하는 문맥 단어
  - **`excludeHints`** — 이 단어가 있으면 무관으로 판정 (동음이의어 차단, 아래 참고)

### 여러 서비스를 함께 추적하기

계열 서비스를 한 대시보드에서 보려면 `services` 배열을 쓴다. 있으면 최상위
`keywords`·`appstore`·`googlePlay`보다 **우선**한다 (없으면 최상위 값이 서비스 하나가 된다 — 구버전 호환).

```jsonc
{
  "displayName": "우리 서비스들",     // 대시보드 제목
  "services": [
    {
      "name": "서비스A",              // 목록에 배지로 표시된다
      "keywords": ["서비스A", "줄임말"],
      "appstore":   { "appId": "123456789" },
      "googlePlay": { "appId": "com.example.a" },
      "relevanceHints": ["A만의 용어"], // 전역 힌트에 더해진다
      "excludeHints": []
    },
    { "name": "서비스B", "keywords": ["서비스B"], "googlePlay": { "appId": "com.example.b" } }
  ]
}
```

- 수집·분류·집계가 **서비스별로 분리**되어 저장된다. 목록에 서비스 배지가 붙고,
  관련성 판정도 그 서비스의 키워드·힌트로 이뤄진다
- 앱이 없는 서비스는 `appId`를 비워 두면 그 소스만 건너뛴다 (로그에 이유가 남는다)
- **해외 서비스는 아직 이득이 적다** — 네이버·커뮤니티 수집기가 한국어 소스 전용이라,
  해외 앱은 스토어 리뷰만 모인다. 그 경우 `appstore.country` / `googlePlay.lang`을 맞춰야 한다

> **왜 회사 고유명사만 설정에 두는가**: 이 저장소는 공개다. 코드와 프리셋에는 업종 수준의
> 일반 용어만 두고, **어느 회사·어느 서비스인지 특정할 수 있는 값(서비스명·키워드·앱 ID)만**
> gitignore되는 `private/`에 둔다. 그래서 새 머신에서도 채울 게 3개뿐이다.

## 4. (권장) LLM 태깅 켜기 — 추가 비용 0원

Claude Code CLI가 설치·로그인돼 있으면 **개인 구독 요금으로** 태깅한다.

```bash
npm install -g @anthropic-ai/claude-code
claude          # 최초 1회 실행해 로그인
claude --version
```

> **`claude --version`이 "명령을 찾을 수 없음"이면** npm 전역 bin 폴더가 PATH에 없는 것이다.
> 이 경우에도 파이프라인은 표준 설치 위치(`%APPDATA%\npm\claude.cmd`, `~/.claude/local/claude` 등)를
> 자동으로 찾는다. 그래도 안 되면 `private/.env`의 `CLAUDE_CLI_CMD=`에 전체 경로를 적는다.
>
> VS Code에서 Claude Code 확장을 쓰던 머신이면 인증 정보(`~/.claude`)를 공유하므로 재로그인이 필요 없다.

API 키로 쓰려면 `private/.env`에 `ANTHROPIC_API_KEY`를 넣으면 된다 (종량제, Haiku 기준 일 1천 건 ≈ $1).
둘 다 없으면 키워드 휴리스틱으로 동작한다 — 무료지만 정확도가 낮다.

### 어떤 모델이 실제로 도는지 확인하기

대시보드의 **AI 분류 상태** 카드에서 모델을 고른다 (`private/.env`의 `CLAUDE_CLI_MODEL`로도 지정 가능).

`haiku`·`sonnet`·`opus`는 **별칭**이라 CLI가 그때그때 최신 버전으로 바꿔 넘긴다. 즉 이 값만
봐서는 어떤 버전이 돌았는지 알 수 없다. 그래서 진단과 분류 호출을 모두
`claude -p --output-format json` 으로 실행해, CLI가 돌려주는 `modelUsage` 키(정식 모델 ID)를 그대로 보여준다.

- 카드 상단: `지정 haiku · 실제 호출 claude-haiku-4-5-20251001`
- 수집 로그: `claude-cli 배치 1: 25/25건 분류 (claude-haiku-4-5-20251001)` + 배치 합계에 토큰·환산 비용

버전을 고정하려면 목록에서 별칭 대신 정식 ID(`claude-haiku-4-5` 등)를 고른다. 다만 계정·조직 설정에
따라 특정 모델이 거부될 수 있는데(`Usage credits are required for this model.`), 저장 직후 실제 호출을
한 번 해보므로 거부되면 카드에 사유가 바로 뜬다.

## 5. 실행

```bash
npm run dev
```

- **대시보드** http://localhost:3000 — 수집 현황 + 수집 주기 설정 + "지금 실행" 버튼
- **스케줄러** — 설정한 주기마다 자동으로 수집→태깅→리포트→웹훅. 첫 시작 시 1회 즉시 실행

주기는 UI에서 바꾸면 30초 이내 반영된다 (프로세스 재시작 불필요).

## 6. 잘 되는지 확인

```bash
npm run collect        # 수집 파이프라인을 1회 즉시 실행
```

출력의 `태거:` 줄에 `claude-cli(...)`가 보이면 LLM 모드로 동작 중이다.
`heuristic`이면 4번 단계를 다시 확인한다.

---

# 일상 사용법

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run setup -- <프리셋>` | 새 머신 초기 셋업 (private/ 생성 + 프리셋 복사) |
| `npm run find-app -- "서비스명"` | 앱스토어·구글플레이 앱 ID 찾기 |
| `npm run dev` | 대시보드 + 스케줄러 (개발 모드) |
| `npm run build` && `npm run start` | 프로덕션 모드로 상시 실행 |
| `npm run collect` | 수집 파이프라인 1회 실행 |
| `npm run collect:heuristic` | LLM 없이 휴리스틱으로만 1회 실행 (비교·테스트용) |
| `npm run retag` | 모든 데이터의 태그를 초기화 (다음 `collect`에서 현재 태거로 재분류) |
| `npm run shots` | `/pitch` 슬라이드에 넣을 화면 캡처 (대시보드가 떠 있어야 함) |
| `npm run dev:web` | 대시보드만 (스케줄러 없이) |

**태거를 바꾼 뒤 기존 데이터를 다시 분류하려면**: `npm run retag` 후 `npm run collect`
(데이터 건수에 비례해 시간이 든다 — 25건당 LLM 호출 1회)

## 발표·데모

- **`/tour`** — 실제 화면 위에 설명이 뜨는 제품 투어. 예시 데이터로 동작하므로
  수집 이력이 없는 노트북에서도 그대로 보여줄 수 있다. **시연에는 이게 가장 좋다**
- **`/pitch`** — 10장짜리 소개 슬라이드. 수치는 실제 DB 집계에서 나온다
- **`/deck`** — 20장짜리 내부 동작 원리 슬라이드

## 발표 자료 캡처 (`/pitch`)

`/pitch` 슬라이드에는 실제 동작 화면이 들어간다. 캡처는 실데이터가 찍히므로
**gitignore되는 `private/deck-assets/`에만 저장**되고, 저장소에는 올라가지 않는다.

```bash
npm run dev:web     # 터미널 1 — 대시보드를 띄워 둔다
npm run shots       # 터미널 2 — 캡처 4장 생성
```

캡처가 없는 머신에서는 그 자리에 "캡처가 아직 없습니다" 안내가 대신 나온다.

## 상시 실행 (24시간 켜 두는 PC)

```bash
npm run build && npm run start
```

대시보드는 **127.0.0.1(로컬 전용)** 로 바인딩된다. 대시보드에는 인증이 없으므로
같은 네트워크의 다른 기기에서 열려면 위험을 감수하고 `apps/web/package.json`의
`start` 스크립트에서 `-H 127.0.0.1`을 지운다.

**Windows**
- 절전 방지: `설정 → 시스템 → 전원 및 배터리 → 화면 및 절전`에서 절전을 "안 함"으로,
  또는 관리자 PowerShell에서 `powercfg /change standby-timeout-ac 0`
- 백그라운드 유지: [pm2](https://pm2.keymetrics.io/) 또는 `작업 스케줄러`에 "로그온 시 시작"으로 등록

**macOS**
- 잠자기 방지: 시스템 설정에서 잠자기 끄기, 또는 `caffeinate -s npm run start`
- 터미널 종료 후에도 유지: `mkdir -p logs && nohup npm run start > logs/app.log 2>&1 &` 또는 pm2

포트 3000이 이미 쓰이고 있으면 `private/.env`에 `PORT=3001`처럼 지정한다.

---

# 집 PC ↔ 회사 PC 오가며 쓰기

코드는 GitHub로, **비공개 데이터는 `private/` 폴더 하나로** 움직인다.

## 옮길 때 (기존 머신)

프로세스를 먼저 **끈다** (SQLite WAL 데이터가 아직 파일에 반영되지 않았을 수 있다).

**Windows (PowerShell)**
```powershell
Compress-Archive -Path private -DestinationPath feedback-radar-private.zip -Force
```

**macOS / Linux**
```bash
tar -czf feedback-radar-private.tgz private/
```

## 받을 때 (새 머신)

```bash
git clone https://github.com/bedcoding/feedback-radar
cd feedback-radar
```

압축을 레포 루트에 풀어 `private/` 폴더가 생기게 한다.

**Windows (PowerShell)**
```powershell
Expand-Archive feedback-radar-private.zip -DestinationPath . -Force
npm install
npm run dev
```

**macOS / Linux**
```bash
tar -xzf feedback-radar-private.tgz
npm install
npm run dev
```

## `private/` 없이 새로 세팅할 때 (예: 회사 PC에서 처음 여는 경우)

**서비스 이름만으로는 부족하다** — 앱 ID는 이름에서 유추할 수 없기 때문이다.
대신 아래 4줄이면 끝난다.

```bash
npm install
npm run setup                       # private/ 생성 + 업종 프리셋 복사
npm run find-app -- "서비스명"       # 앱스토어·구글플레이 앱 ID 출력 → 복사
# private/feedback-radar.config.json 에서 displayName · keywords · appId 2개 채우기
npm run dev
```

채워야 할 값은 이 4개뿐이다. **업종 용어 사전은 프리셋에 들어 있어 다시 적을 필요가 없다.**

| 값 | 어디서 얻나 |
|---|---|
| `displayName` | 화면·리포트에 표시할 이름 (아무 문자열) |
| `keywords` | 웹 검색어. 정식명 + 줄임말·별칭을 함께 넣으면 수집량이 는다 |
| `appstore.appId` | `npm run find-app` 결과의 숫자 |
| `googlePlay.appId` | `npm run find-app` 결과의 패키지명 |

선택 사항: `private/.env`의 네이버 API 키(없으면 네이버만 건너뜀)와 웹훅 주소,
그리고 LLM 태깅을 쓰려면 `claude` 로그인.

> 값을 안 채운 채 실행하면 파이프라인이 **안내 메시지와 함께 멈춘다** — 자리표시자를
> 그대로 검색해서 헛돌지 않게 하기 위한 것이다.
>
> 집에서 쓰던 설정을 그대로 쓰려면 위 과정 없이 `private/` 폴더만 옮기면 된다 (아무것도 안 채워도 됨).

> **DB까지 옮길지 선택**: `private/data/`를 빼고 옮기면 새 머신에서 빈 DB로 시작한다.
> 두 머신에서 각각 수집하면 데이터가 갈라지므로, **한쪽을 주 수집기로 정하고** 다른 쪽은
> 개발용으로 쓰는 편이 낫다. USB·개인 클라우드로 `private/`를 통째로 동기화해도 되지만,
> **동시에 두 머신에서 실행하면 DB가 충돌**한다.

## 데이터 없이 코드만 확인할 때

`private/`가 없어도 실행은 된다. example 설정으로 돌아가고, 대시보드는 비어 있으며,
`/pitch`는 서비스명 대신 자리표시자를 보여준다. 코드 리뷰나 새 머신 점검에 쓸 수 있다.

---

# 참고

## 태깅(요약) 모드

| 모드 | 조건 | 비용 |
|---|---|---|
| `cli` | 머신에 Claude Code 설치+로그인 | **구독 요금에 포함 (추가 비용 0)** |
| `api` | `.env`에 `ANTHROPIC_API_KEY` | 종량제 (Haiku 기준 일 1천 건 ≈ $1) |
| `heuristic` | 조건 없음 | 무료 (키워드 규칙 기반, 정확도 낮음) |

기본은 자동 선택(cli → api → heuristic). `.env`의 `TAGGER_MODE`로 강제할 수 있다.
cli 모드는 호출 수를 아끼기 위해 25건씩 배치로 분류한다.
구독 rate limit(5시간 윈도우)이 있으므로 **수집 주기는 하루 1~3회를 권장**한다.

**관련성 필터**: 짧은 검색 키워드는 동음이의어 노이즈를 끌고 온다 (예: "애플" → 과일, IT 기업).
태거가 건별로 "실제 우리 서비스 얘기인가"를 판단해(`relevant`) 무관 글을 리포트·집계에서 제외한다.
무관 글은 **지우지 않고 표시만** 하므로 대시보드의 "걸러진 글" 탭에서 판정이 맞았는지 확인할 수 있다.

정확도를 올리는 순서 (효과 큰 것부터):

| 방법 | 효과 | 방법 |
|---|---|---|
| **LLM 태깅 켜기** | ★★★ | `claude` 로그인. 규칙 기반과 문맥 이해의 차이가 가장 크다 |
| **`excludeHints` 추가** | ★★★ | "걸러진 글" 탭에서 반복되는 노이즈 주제를 찾아 그 분야 단어를 넣는다 |
| **`domainPrompt` 보강** | ★★ | 자체 재화·이벤트 명칭·은어를 적을수록 LLM 분류가 정확해진다 |
| **키워드 좁히기** | ★★ | 너무 짧은 키워드는 노이즈를 부른다. 정식명 위주로 |
| **`relevanceHints` 추가** | ★ | 휴리스틱 모드에서만 쓰인다 |

> **별도의 "학습"은 없다.** 모델을 파인튜닝하지 않고, 위 설정값이 곧 프롬프트로 들어가
> 분류 기준이 된다. 즉 **설정 파일을 고치는 것이 이 도구에서의 학습**이다.
> 잘못 분류된 건을 발견하면 그 패턴을 `excludeHints`나 `domainPrompt`에 반영한 뒤
> `npm run retag && npm run collect` 로 전체를 다시 분류하면 된다.

## 환경변수 (private/.env)

| 변수 | 설명 |
|---|---|
| `TAGGER_MODE` | 태깅 모드 강제: `cli` \| `api` \| `heuristic` (기본: 자동) |
| `CLAUDE_CLI_CMD` | claude CLI 경로 (기본: PATH → 표준 설치 위치 자동 탐색) |
| `ANTHROPIC_API_KEY` / `TAGGER_MODEL` | api 모드용 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | [developers.naver.com](https://developers.naver.com/apps) 무료 발급 |
| `WEBHOOK_URL` | 리포트 수신 웹훅 (Slack incoming webhook 호환) |
| `DEFAULT_INTERVAL_HOURS` | 최초 기본 주기 (이후 UI에서 변경) |
| `PORT` | 대시보드 포트 (기본 3000) |
| `DB_PATH` | DB 경로 오버라이드 |

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 리포트 날짜가 하루 어긋난다 | 리포트의 '하루'는 **실행 머신의 로컬 날짜** 기준이다. UTC로 동작하는 서버·컨테이너에서 돌린다면 `TZ=Asia/Seoul`을 지정할 것 |
| `태거: heuristic`만 나온다 | claude CLI 미설치·미로그인. `claude --version` 확인 후 `CLAUDE_CLI_CMD` 지정 |
| 네이버 결과가 0건 | `NAVER_CLIENT_ID`/`SECRET` 미설정. 없으면 조용히 건너뛴다 |
| `브라우저 기동 실패` 경고 | Edge/Chrome 없음. `npx playwright install chromium` 실행. 다른 소스는 계속 수집된다 |
| 대시보드가 비어 있다 | 아직 수집 전. `npm run collect` 실행 |
| 대시보드 숫자와 DB가 안 맞는다 | 웹과 스케줄러가 다른 DB를 볼 때. `.env`의 `DB_PATH`를 확인 |
| 포트 3000 충돌 | `.env`에 `PORT=3001` 지정 |
| `/pitch`에 캡처가 안 보인다 | `npm run shots` 미실행. 대시보드를 띄운 상태에서 실행 |
| 화면에 `{서비스명}`이 보인다 | 설정 파일이 없거나, 있어도 `displayName`을 아직 안 채운 것 |
| `설정을 아직 채우지 않았습니다` 로 중단됨 | `keywords`에 `{ }` 자리표시자가 남아 있음. 본인 서비스 값으로 교체 |
| 앱스토어·구글플레이만 0건 | `appId` 미설정. 실행 로그에 `appId 미설정, 건너뜀` 이 찍힌다 |

## 새 서비스에 이식하기

`private/feedback-radar.config.json`의 키워드·앱 ID·`domainPrompt`(서비스 용어 사전)만 교체하면
동일한 파이프라인이 다른 서비스의 피드백 레이더가 된다. **코드 수정 불필요.**
