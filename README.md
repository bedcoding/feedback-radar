# Feedback Radar 📡

외부 채널(앱스토어·구글플레이·네이버·커뮤니티·SNS)에 흩어진 서비스 사용자 반응을 주기적으로 수집하고,
LLM이 건별 분류(감성/카테고리/심각도/담당팀)한 뒤 **급증 감지 + 원문 링크가 달린 브리핑**을
웹훅으로 push하는 사용자 피드백(VOC) 모니터링 도구.

- **올인원 로컬 실행**: `npm run dev` 하나로 대시보드 + 스케줄러가 함께 뜬다. 24시간 켜 두는 맥북/미니PC면 충분
- **API 키 없이 동작**: 머신에 [Claude Code](https://claude.com/claude-code)가 로그인돼 있으면
  구독 요금으로 태깅한다 (`claude -p` 배치 호출). 없으면 API 키 → 키워드 휴리스틱 순으로 폴백
- **설계 원칙 "숫자는 코드가, 판단은 LLM이"**: 집계·급증 감지는 SQL, LLM은 건별 분류만.
  리포트의 모든 인용에는 원문 링크가 붙는다

## 구조

```
feedback-radar/
├─ feedback-radar.config.json         # 테넌트 설정 (gitignore) — 이 파일만 바꾸면 다른 서비스에 이식
├─ feedback-radar.config.example.json # 설정 템플릿
├─ packages/core/          # DB(SQLite), 택소노미, 태거 3종, 리포트 생성, 웹훅
├─ apps/pipeline/          # 수집기 + 스케줄러 (대시보드 UI에서 주기 설정)
└─ apps/web/               # Next.js 대시보드
```

수집 소스 (설정으로 켜고 끔):

| 소스 | 방식 | 안정성 |
|---|---|---|
| 앱스토어 리뷰 | iTunes RSS API (공식, 무인증) | ★★★ |
| 구글플레이 리뷰 | google-play-scraper | ★★★ |
| 네이버 블로그/카페 | 네이버 오픈 API (무료 일 25,000회) | ★★★ |
| 디시인사이드 | Playwright 통합검색 | ★★ |
| Threads | Playwright (실험적) | ★ |

## 시작하기

```bash
npm install
npx playwright install chromium   # Edge/Chrome이 설치돼 있으면 생략 가능

# (선택이지만 권장) LLM 태깅을 구독 요금으로 쓰기 위한 Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude --version                  # 안 나오면 PATH 확인. 로그인 안 된 머신이면 `claude` 실행해 1회 로그인
                                  # ※ VS Code에서 Claude Code 확장을 쓰던 머신이면 로그인이 이미 돼 있어 생략됨

cp feedback-radar.config.example.json feedback-radar.config.json   # 키워드·앱ID를 서비스에 맞게 수정
cp .env.example .env                          # 필요한 값만 채우면 됨 (전부 비워도 동작)

npm run dev
```

`npm run dev` 하나로:
- **대시보드** http://localhost:3000 — 수집 현황 + **수집 주기 설정**(예: 8시간마다) + "지금 실행" 버튼
- **스케줄러** — 설정한 주기마다 자동으로 수집→태깅→리포트→웹훅. 첫 시작 시 1회 즉시 실행

주기는 UI에서 바꾸면 30초 이내 반영된다 (프로세스 재시작 불필요).

## 태깅(요약) 모드

| 모드 | 조건 | 비용 |
|---|---|---|
| `cli` | 머신에 Claude Code 설치+로그인 (`claude --version` 확인) | **구독 요금에 포함 (추가 비용 0)** |
| `api` | `.env`에 `ANTHROPIC_API_KEY` | 종량제 (Haiku 기준 일 1천 건 ≈ $1) |
| `heuristic` | 조건 없음 | 무료 (키워드 규칙 기반, 정확도 낮음) |

기본은 자동 선택(cli → api → heuristic). `.env`의 `TAGGER_MODE`로 강제할 수 있다.
cli 모드는 호출 수를 아끼기 위해 25건씩 배치로 분류한다.

> Claude Code CLI 설치: `npm install -g @anthropic-ai/claude-code` 후 `claude` 실행해서 로그인 1회
> (VS Code 확장으로 이미 로그인한 머신이면 인증 정보(`~/.claude`)를 공유하므로 재로그인 불필요).
> 어떤 태거가 선택됐는지는 실행 로그의 `태거: ...` 줄로 확인할 수 있다.
> 구독 rate limit(5시간 윈도우)이 있으므로 수집 주기는 하루 1~3회를 권장.

## 상시 실행 (24시간 켜 두는 맥북 등)

```bash
npm run build && npm run start    # 프로덕션 모드 (dev와 동일하게 웹+스케줄러 함께)
```

- macOS: 시스템 설정에서 잠자기 방지 (또는 `caffeinate -s npm run start`)
- 터미널 종료 후에도 유지하려면: `nohup npm run start > logs/app.log 2>&1 &` 또는 pm2

## 환경변수 (.env)

| 변수 | 설명 |
|---|---|
| `TAGGER_MODE` | 태깅 모드 강제: `cli` \| `api` \| `heuristic` (기본: 자동) |
| `CLAUDE_CLI_CMD` | claude CLI 경로 (기본 `claude`) |
| `ANTHROPIC_API_KEY` / `TAGGER_MODEL` | api 모드용 |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | [developers.naver.com](https://developers.naver.com/apps) 무료 발급 |
| `WEBHOOK_URL` | 리포트 수신 웹훅 (Slack incoming webhook 호환) |
| `DEFAULT_INTERVAL_HOURS` | 최초 기본 주기 (이후 UI에서 변경) |

## 새 서비스에 이식하기

`feedback-radar.config.json`의 키워드·앱 ID·`domainPrompt`(서비스 용어 사전)만 교체하면
동일한 파이프라인이 다른 서비스의 피드백 레이더가 된다. 코드 수정 불필요.
