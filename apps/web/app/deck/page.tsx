'use client';

/**
 * /deck — 프로젝트 동작 원리를 설명하는 HTML 슬라이드 (발표·PDF 겸용).
 * 외부 라이브러리 없이 키보드 내비게이션 + 인쇄 스타일만으로 구성한다.
 * Ctrl+P(가로 방향)로 그대로 PDF 저장이 가능하다.
 */

import { DeckChrome, DeckProgress, useDeckNav } from '../_deck/useDeckNav.js';
import '../_deck/deck.css';

const TITLES = [
  '표지',
  '문제 정의와 설계 목표',
  '전체 아키텍처',
  '모노레포 구조와 비공개 데이터 분리',
  '실행 모델: 프로세스 2개, DB 1개',
  '수집 계층 개요',
  '수집기 상세 ① API형',
  '수집기 상세 ② 브라우저 공통 계층',
  '수집기 상세 ③ 커뮤니티, SNS',
  '배제한 소스와 수집 원칙',
  '저장 계층: SQLite 스키마와 중복 제거',
  '태깅 계층: 3단 폴백 체인',
  'CLI 태거: 배치 처리와 방어적 파싱',
  'API 태거: Structured Outputs와 캐싱',
  '휴리스틱 태거: 규칙 기반 베이스라인',
  '관련성 필터: 동음이의어 노이즈 제거',
  '프로세스 간 통신: SQLite를 IPC로',
  '리포트 생성과 급증 감지',
  'AI 자원 효율 설계',
  '보안, 이식성 설계와 요약',
];

export default function DeckPage() {
  const nav = useDeckNav(TITLES.length);
  const { idx } = nav;

  const S = ({ n, children, className }: { n: number; children: React.ReactNode; className?: string }) => (
    <section className={`slide ${idx === n ? 'active' : ''} ${className ?? ''}`}>{children}</section>
  );

  return (
    <div className="deck-root">
      <DeckProgress nav={nav} />

      {/* ─────────────────── 0. 표지 ─────────────────── */}
      <S n={0} className="title-slide">
        <div className="slide-kicker">Technical Deep Dive</div>
        <h1>Feedback Radar 📡</h1>
        <p className="tagline">
          외부 채널에 흩어진 사용자 반응을 수집하고, LLM이 건별 분류한 뒤,
          <br />
          급증 감지 브리핑을 대시보드와 파일로 내보내는 VOC 모니터링 파이프라인
        </p>
        <div className="title-badges">
          <span className="badge">TypeScript 모노레포</span>
          <span className="badge">Next.js 15</span>
          <span className="badge">SQLite (better-sqlite3)</span>
          <span className="badge">Playwright</span>
          <span className="badge">Claude CLI / API / 휴리스틱 3단 폴백</span>
        </div>
        <p className="keys-hint">
          <kbd>←</kbd> <kbd>→</kbd> 이동, <kbd>G</kbd> 목차, <kbd>Home</kbd>/<kbd>End</kbd> 처음/끝, {' '}
          <kbd>Ctrl+P</kbd> PDF 저장 (가로 방향 권장)
        </p>
      </S>

      {/* ─────────────────── 1. 문제 정의 ─────────────────── */}
      <S n={1}>
        <div className="slide-kicker">01, Why</div>
        <h1>문제 정의와 설계 목표</h1>
        <div className="cols">
          <div>
            <h2>문제</h2>
            <ul>
              <li>
                사용자 반응이 <strong>앱스토어, 구글플레이, 블로그, 카페, 커뮤니티, SNS</strong>에 흩어져 있어,
                사람이 채널을 순회하며 눈으로 확인해야 한다
              </li>
              <li>결제 오류, 접속 장애 같은 <strong>급증 이슈를 늦게 인지</strong>하면 대응 비용이 커진다</li>
              <li>짧은 브랜드 키워드로 검색하면 <strong>동음이의어 노이즈</strong>가 대량으로 섞인다</li>
              <li>수집기, 분류기, 대시보드를 각각 SaaS로 사면 비용이 크고 데이터가 외부로 나간다</li>
            </ul>
            <h2>설계 목표</h2>
            <ul>
              <li>
                <strong>올인원 로컬 실행</strong>: 명령 하나(<code>npm run dev</code>)로 대시보드 + 스케줄러가
                함께 뜬다. 24시간 켜 두는 개인 PC 한 대면 충분
              </li>
              <li>
                <strong>API 키 없이도 동작</strong>: LLM 태깅을 CLI 구독 → API → 키워드 규칙 순으로 폴백
              </li>
              <li>
                <strong>근거 있는 브리핑</strong>: 리포트의 모든 인용에 원문 링크를 붙인다
              </li>
            </ul>
          </div>
          <div>
            <div className="card">
              <div className="card-title">핵심 설계 원칙: “숫자는 코드가, 판단은 LLM이”</div>
              <p>
                집계, 급증 감지, 중복 제거는 <strong>SQL이 결정론적으로</strong> 수행하고, LLM은{' '}
                <strong>건별 분류(감성, 카테고리, 심각도, 담당팀, 관련성)만</strong> 담당한다.
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                LLM에 집계를 맡기면 숫자가 흔들리고 환각이 섞인다. 역할을 분리하면 리포트의 수치는 항상
                재현 가능하고, LLM 오류의 영향 범위는 개별 건의 라벨로 국한된다.
              </p>
            </div>
            <div className="card">
              <div className="card-title">한 사이클의 흐름</div>
              <div className="vstack">
                <div className="node">① 수집: 5개 소스에서 원문 긁어오기 (병렬, 소스별 독립)</div>
                <div className="node">② 저장: SQLite에 INSERT, (source, source_id)로 자동 중복 제거</div>
                <div className="node">③ 태깅: 미분류 건만 LLM/휴리스틱으로 라벨링</div>
                <div className="node">④ 리포트: SQL 집계 + 급증 감지 → 마크다운 생성</div>
              </div>
            </div>
          </div>
        </div>
      </S>

      {/* ─────────────────── 2. 전체 아키텍처 ─────────────────── */}
      <S n={2}>
        <div className="slide-kicker">02, Architecture</div>
        <h1>전체 아키텍처</h1>
        <div className="arch">
          <div className="arch-col">
            <div className="node">앱스토어 <small>iTunes RSS (공식 API)</small></div>
            <div className="node">구글플레이 <small>google-play-scraper</small></div>
            <div className="node">네이버 블로그, 카페 <small>오픈 API</small></div>
            <div className="node">커뮤니티 검색 <small>Playwright</small></div>
            <div className="node">Threads <small>Playwright (실험적)</small></div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-col">
            <div className="node hub">
              apps/pipeline
              <small>수집기 5종 + 스케줄러 (상주 프로세스)</small>
            </div>
            <div className="node hub">
              packages/core
              <small>DB, 태거 3종, 리포트 (공유 라이브러리)</small>
            </div>
            <div className="node hub">
              SQLite (WAL)
              <small>items + settings: 유일한 상태 저장소</small>
            </div>
            <div className="node hub">
              apps/web
              <small>Next.js 대시보드 (수집 현황 + 주기 제어)</small>
            </div>
          </div>
          <div className="arch-arrow">→</div>
          <div className="arch-col">
            <div className="node">태깅 <small>Claude CLI → API → 휴리스틱</small></div>
            <div className="node">일일 리포트 <small>마크다운 (원문 링크 포함)</small></div>
            <div className="node">private/reports/ <small>파일 보관</small></div>
          </div>
        </div>
        <ul>
          <li>
            프로세스는 <strong>둘뿐</strong>이다: Next.js 대시보드와 스케줄러. 별도 큐, 브로커, 데몬 없이{' '}
            <strong>SQLite 파일 하나</strong>가 데이터 저장소이자 두 프로세스의 통신 채널이다
          </li>
          <li>
            수집기는 <code>Promise.allSettled</code>로 병렬 실행. <strong>한 소스가 죽어도 나머지는 계속</strong> 돈다
          </li>
          <li>외부 의존은 수집 대상 사이트와 (선택적) LLM 호출뿐. 데이터는 전부 로컬에 남는다</li>
        </ul>
      </S>

      {/* ─────────────────── 3. 모노레포 구조 ─────────────────── */}
      <S n={3}>
        <div className="slide-kicker">03, Repository Layout</div>
        <h1>모노레포 구조와 비공개 데이터 분리</h1>
        <div className="cols c-46">
          <div>
            <pre>
              <code>{`feedback-radar/
├─ packages/core/          # 공유 라이브러리
│   └─ src/
│       ├─ db.ts           # SQLite 스키마, 쿼리 전부
│       ├─ taxonomy.ts     # 분류 체계(카테고리, 팀, 키워드 사전)
│       ├─ types.ts        # RawItem / TagResult / Tagger 계약
│       ├─ paths.ts        # 레포 루트 탐색, config 로드
│       ├─ tagging/        # claude-cli, claude(API), heuristic
│       ├─ report/daily.ts # 리포트 생성 + 급증 감지
├─ apps/pipeline/          # 수집, 스케줄링 프로세스
│   └─ src/
│       ├─ collectors/     # 소스별 수집기 5종
│       ├─ browser.ts      # Playwright 공통 계층
│       ├─ daily.ts        # 수집→태깅→요약→리포트 오케스트레이션
│       └─ scheduler.ts    # 상주 스케줄러 (30초 틱)
├─ apps/web/               # Next.js 대시보드 (+ 이 슬라이드)
└─ private/                # 🔒 gitignore. 비공개 데이터 전용`}</code>
            </pre>
          </div>
          <div>
            <h2>npm workspaces 3개</h2>
            <ul>
              <li>
                <code>@feedback-radar/core</code>: 순수 로직만. 수집기와 웹 양쪽에서 import하며,{' '}
                <strong>DB 접근은 전부 이 패키지를 통해서만</strong> 이뤄진다
              </li>
              <li>
                <code>@feedback-radar/pipeline</code>: tsx로 실행되는 Node 프로세스. core에 의존
              </li>
              <li>
                <code>@feedback-radar/web</code>: Next.js 15.{' '}
                <code>transpilePackages</code>로 core의 TS 소스를 직접 번들, <code>better-sqlite3</code>는
                네이티브 모듈이라 <code>serverExternalPackages</code>로 제외
              </li>
            </ul>
            <div className="card">
              <div className="card-title">private/: 비공개 데이터 단일 폴더 원칙</div>
              <p>
                서비스 설정(키워드, 앱 ID, 도메인 용어 사전), <code>.env</code>, DB, 리포트가 전부{' '}
                <code>private/</code> 한 폴더에 모인다. 이 폴더만 gitignore하면{' '}
                <strong>공개 저장소에 서비스 식별 정보가 올라갈 경로가 없고</strong>, 다른 머신으로 옮길 때도
                이 폴더 하나만 압축하면 끝난다. 저장소 코드에는 서비스명이 하드코딩된 곳이 없다. 전부
                설정 파일에서 주입된다.
              </p>
            </div>
          </div>
        </div>
      </S>

      {/* ─────────────────── 4. 실행 모델 ─────────────────── */}
      <S n={4}>
        <div className="slide-kicker">04, Runtime Model</div>
        <h1>실행 모델: 프로세스 2개, DB 1개</h1>
        <pre>
          <code>{`npm run dev
└─ concurrently -k
   ├─ [web]       next dev          → http://localhost:3000  (대시보드)
   └─ [scheduler] tsx scheduler.ts  → 30초 틱 상주, 주기 도래 시 runDaily() 실행`}</code>
        </pre>
        <div className="cols">
          <div>
            <h2>스케줄러 동작 (scheduler.ts)</h2>
            <ul>
              <li>
                <code>setInterval(tick, 30_000)</code>: 30초마다 깨어나{' '}
                <strong>“지금 실행할 때가 됐는가”만 판단</strong>한다 (크론 표현식 없이 단순 유지)
              </li>
              <li>
                실행 조건: <code>lastRunAt + intervalHours</code> 경과 <span className="muted">또는</span> 대시보드의
                “지금 실행” 요청(<code>runRequestedAt</code>)이 있을 때
              </li>
              <li>
                <code>running</code> 플래그로 <strong>중복 실행 방지</strong>: 이전 사이클이 끝나기 전에는 틱이
                그냥 통과한다
              </li>
              <li>프로세스 시작 시: 마지막 실행이 주기보다 오래됐으면 즉시 1회 실행</li>
              <li>
                실행 결과는 <code>lastRunStatus</code>(ok / error: 메시지)로 기록되어 대시보드에 노출
              </li>
            </ul>
          </div>
          <div>
            <h2>설정 변경이 반영되는 방식</h2>
            <ul>
              <li>
                수집 주기는 <strong>매 틱마다 DB에서 다시 읽는다</strong>: UI에서 바꾸면 30초 이내 반영,
                프로세스 재시작 불필요
              </li>
              <li>
                주기 하한 0.5시간(<code>Math.max(0.5, …)</code>), 대시보드 폼도 0.5~168시간으로 검증
              </li>
            </ul>
            <div className="card">
              <div className="card-title">왜 크론이 아니라 30초 틱인가</div>
              <p>
                요구사항이 “N시간마다 + 지금 실행 버튼”뿐이라 크론 파서, 타이머 재등록이 오히려 복잡도를
                높인다. 틱 방식은 <strong>설정 핫리로드와 즉시 실행 요청을 같은 코드 경로</strong>로 처리하고,
                프로세스가 재시작돼도 <code>lastRunAt</code>이 DB에 있어 스케줄이 이어진다.
              </p>
            </div>
          </div>
        </div>
      </S>

      {/* ─────────────────── 5. 수집 계층 개요 ─────────────────── */}
      <S n={5}>
        <div className="slide-kicker">05, Collection Layer</div>
        <h1>수집 계층 개요. 소스 5종, 전부 설정으로 on/off</h1>
        <table>
          <thead>
            <tr>
              <th>소스</th>
              <th>방식</th>
              <th>인증</th>
              <th>1회 수집량 (기본)</th>
              <th>안정성</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>앱스토어 리뷰</td>
              <td>iTunes RSS API (공식)</td>
              <td>불필요</td>
              <td>페이지당 50건 × 3페이지</td>
              <td>★★★</td>
              <td>별점 포함</td>
            </tr>
            <tr>
              <td>구글플레이 리뷰</td>
              <td>google-play-scraper</td>
              <td>불필요</td>
              <td>최신순 200건</td>
              <td>★★★</td>
              <td>별점 포함</td>
            </tr>
            <tr>
              <td>네이버 블로그, 카페</td>
              <td>네이버 오픈 API</td>
              <td>무료 키 (일 25,000회)</td>
              <td>키워드 × 채널 2종 × 50건</td>
              <td>★★★</td>
              <td>키 없으면 조용히 스킵</td>
            </tr>
            <tr>
              <td>커뮤니티 통합검색</td>
              <td>Playwright 스크래핑</td>
              <td>불필요 (비로그인 공개 페이지)</td>
              <td>키워드당 최대 50건</td>
              <td>★★</td>
              <td>DOM 앵커 전략 (뒤 슬라이드)</td>
            </tr>
            <tr>
              <td>Threads</td>
              <td>Playwright 스크래핑</td>
              <td>불필요</td>
              <td>키워드당 최대 30건</td>
              <td>★</td>
              <td>실험적: 기본 off</td>
            </tr>
          </tbody>
        </table>
        <ul>
          <li>
            모든 수집기는 같은 계약을 따른다: <code>(…) ⇒ Promise&lt;RawItem[]&gt;</code>.{' '}
            <code>RawItem</code>은 <code>source</code>, <code>sourceId</code>(중복 제거 키), <code>url</code>,{' '}
            <code>content</code>, <code>rating?</code>, <code>postedAt?</code>, <code>keyword?</code>를 담는다
          </li>
          <li>
            수집기는 <strong>수집만</strong> 한다. DB 저장, 분류는 오케스트레이터(daily.ts)와 core의 몫.
            그래서 새 소스 추가 = 파일 하나 + 설정 한 줄
          </li>
          <li>
            브라우저가 필요한 소스가 하나도 켜져 있지 않으면 <strong>Playwright는 아예 실행되지 않는다</strong>
          </li>
        </ul>
      </S>

      {/* ─────────────────── 6. 수집기 상세 ① API형 ─────────────────── */}
      <S n={6}>
        <div className="slide-kicker">06, Collectors (API)</div>
        <h1>수집기 상세 ①: API형 3종</h1>
        <div className="card-grid">
          <div className="card">
            <div className="card-title">앱스토어: iTunes RSS</div>
            <ul>
              <li>
                <code>itunes.apple.com/{'{국가}'}/rss/customerreviews/…/json</code> 공식 엔드포인트,
                최신순 정렬
              </li>
              <li>1~3페이지를 순회하며 응답이 비거나 HTTP 오류면 조기 중단</li>
              <li>
                entry가 1건이면 객체로 오는 RSS 특성 방어: <code>Array.isArray(raw) ? raw : [raw]</code>
              </li>
              <li>제목과 본문이 다르면 <code>제목\n본문</code>으로 병합해 문맥 보존</li>
              <li>
                <code>sourceId</code> = 리뷰 고유 id → 재수집 시 자동 중복 제거
              </li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title">구글플레이: google-play-scraper</div>
            <ul>
              <li>비공식이지만 성숙한 라이브러리로 최신순 200건 조회</li>
              <li>빈 텍스트 리뷰(별점만 남긴 경우) 필터링</li>
              <li>
                리뷰 상세로 바로 가는 딥링크 생성: <code>…&reviewId={'{id}'}</code>
              </li>
              <li>별점(<code>score</code>)을 보존해 태거, 리포트에서 활용</li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title">네이버: 오픈 API (blog + cafearticle)</div>
            <ul>
              <li>
                설정의 <strong>키워드마다</strong> 블로그, 카페 두 엔드포인트를 최신순으로 검색
              </li>
              <li>
                응답의 <code>&lt;b&gt;</code> 강조 태그 등 HTML을 정규식으로 제거 후{' '}
                <code>제목\n요약</code>으로 합침
              </li>
              <li>
                <code>sourceId</code> = 게시글 URL, 검색에 쓴 <code>keyword</code>도 함께 저장 (노이즈 분석용)
              </li>
              <li>
                키가 없으면 <strong>에러가 아니라 스킵</strong>: “전부 비워도 동작”하는 설정 철학
              </li>
            </ul>
          </div>
        </div>
        <p className="muted">
          공통점: 전부 무인증 또는 무료 키로 동작하는 <strong>공식, 준공식 경로</strong>라 차단 위험이 낮고,
          실패해도 예외가 <code>Promise.allSettled</code>에 흡수되어 다른 소스에 영향을 주지 않는다.
        </p>
      </S>

      {/* ─────────────────── 7. 브라우저 공통 계층 ─────────────────── */}
      <S n={7}>
        <div className="slide-kicker">07, Collectors (Browser)</div>
        <h1>수집기 상세 ②: Playwright 공통 계층 (browser.ts)</h1>
        <div className="cols">
          <div>
            <h2>브라우저 채널 3단 폴백</h2>
            <div className="flow">
              <div className="node">
                msedge
                <small>시스템 Edge</small>
              </div>
              <div className="arrow">→</div>
              <div className="node">
                chrome
                <small>시스템 Chrome</small>
              </div>
              <div className="arrow">→</div>
              <div className="node">
                번들 chromium
                <small>playwright install</small>
              </div>
            </div>
            <ul>
              <li>
                시스템에 설치된 Edge/Chrome을 먼저 시도 →{' '}
                <strong>브라우저 바이너리 다운로드 없이 바로 동작</strong> (Windows는 Edge가 기본 내장)
              </li>
              <li>셋 다 실패하면 설치 안내 메시지와 함께 명시적 에러</li>
              <li>항상 <code>headless: true</code>: 백그라운드 상주에 적합</li>
            </ul>
          </div>
          <div>
            <h2>컨텍스트 위장</h2>
            <pre>
              <code>{`browser.newContext({
  userAgent: '(일반 데스크톱 Chrome UA)',
  locale: 'ko-KR',
  viewport: { width: 1280, height: 900 },
})`}</code>
            </pre>
            <ul>
              <li>기본 Playwright UA는 봇으로 식별되기 쉬워 일반 브라우저 UA로 교체</li>
              <li>수집기마다 새 컨텍스트를 만들고 <code>finally</code>에서 반드시 닫아 세션, 쿠키 누적 방지</li>
              <li>
                브라우저 인스턴스는 <strong>한 사이클에 1개</strong>만 띄우고 모든 브라우저형 수집기가 공유,
                사이클 종료 시 <code>browser.close()</code>
              </li>
            </ul>
          </div>
        </div>
      </S>

      {/* ─────────────────── 8. 커뮤니티, SNS 수집 ─────────────────── */}
      <S n={8}>
        <div className="slide-kicker">08, Collectors (Browser)</div>
        <h1>수집기 상세 ③: DOM 앵커 전략</h1>
        <p>
          커뮤니티, SNS는 클래스명이 수시로 바뀌거나 난독화돼 있다. 그래서 CSS 클래스 대신{' '}
          <strong>“바뀌지 않는 것”. 게시물 링크(permalink)의 URL 패턴</strong>을 앵커로 삼는다.
        </p>
        <div className="cols">
          <div className="card">
            <div className="card-title">커뮤니티 통합검색</div>
            <ul>
              <li>비로그인 통합검색 URL로 진입 후 3초 대기 (동적 렌더링 안정화)</li>
              <li>
                페이지의 <strong>모든 앵커</strong> 중 게시글 URL 패턴(갤러리 도메인 + <code>no=</code> 파라미터)을
                가진 것만 채택. 특정 클래스명에 의존하지 않음
              </li>
              <li>
                앵커에서 <code>closest('li')</code>로 올라가 목록 항목 전체 텍스트를 본문으로 수집 (500자 컷)
              </li>
              <li>
                본문에서 <code>YYYY.MM.DD</code> 패턴을 찾아 게시일 추출, 키워드당 50건 캡
              </li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title">Threads (실험적, 기본 off)</div>
            <ul>
              <li>
                비로그인 상태에서도 검색 결과가 DOM에 렌더링되는 것을 실측 확인 후 지원. 8초 대기
                (SPA 렌더링이 느림)
              </li>
              <li>
                <code>a[href*="/post/"]</code> permalink에서 <strong>부모로 최대 6단계</strong> 올라가며
                텍스트 60자 이상인 게시물 컨테이너 탐색 (난독화 클래스명 회피)
              </li>
              <li>
                <code>&lt;time datetime&gt;</code> 속성에서 게시 시각 추출, 10자 미만 텍스트는 버림,
                키워드당 30건 캡
              </li>
              <li>
                수집기 내부에 자체 <code>try/catch</code>: 깨져도{' '}
                <strong>빈 배열을 반환하고 파이프라인은 계속</strong>
              </li>
            </ul>
          </div>
        </div>
        <p className="muted">
          공통 방어: 중복 href는 <code>Set</code>으로 제거하고, URL을 <code>sourceId</code>로 쓰므로 DB 층에서
          한 번 더 중복이 걸러진다. 두 수집기 모두 화면에 보이는 공개 데이터만 읽는다.
        </p>
      </S>

      {/* ─────────────────── 9. 배제한 소스 ─────────────────── */}
      <S n={9}>
        <div className="slide-kicker">09, What We Don't Collect</div>
        <h1>배제한 소스와 수집 원칙</h1>
        <div className="cols c-64">
          <div>
            <table>
              <thead>
                <tr>
                  <th>소스</th>
                  <th>배제 이유 (직접 방문 테스트 결과)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>X (트위터)</td>
                  <td>
                    비로그인 검색 차단 (로그인 페이지로 강제 리다이렉트). 약관이 스크래핑을 명시적으로 금지.
                    공식 API는 읽기 건당 과금이라 키워드 상시 모니터링엔 월 수백 달러 규모
                  </td>
                </tr>
                <tr>
                  <td>인스타그램</td>
                  <td>검색, 해시태그 페이지가 로그인 필수</td>
                </tr>
                <tr>
                  <td>Bluesky</td>
                  <td>로그아웃 상태에서 검색 기능 자체가 비활성화</td>
                </tr>
                <tr>
                  <td>페이스북 등</td>
                  <td>검색이 로그인 전용이거나 비공개 (일부 커뮤니티는 통합검색이 HTTP 403)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="card">
              <div className="card-title">원칙: 로그인 계정으로 우회 수집하지 않는다</div>
              <ul>
                <li><strong>약관 위반</strong>이며 법적 리스크가 있다</li>
                <li>
                  계정 정지 하나로 파이프라인 전체가 무너지는 <strong>단일 장애점</strong>이 된다
                </li>
                <li>
                  대신 <strong>공식 API와 비로그인 공개 페이지만</strong> 사용. 지속 가능성이 수집량보다
                  우선
                </li>
              </ul>
            </div>
            <p className="muted">
              이 원칙 덕분에 파이프라인에는 소셜 로그인 자격증명이 하나도 없고, 계정 차단, CAPTCHA 대응
              같은 유지보수 부담도 없다.
            </p>
          </div>
        </div>
      </S>

      {/* ─────────────────── 10. 저장 계층 ─────────────────── */}
      <S n={10}>
        <div className="slide-kicker">10, Storage</div>
        <h1>저장 계층: SQLite 스키마와 중복 제거</h1>
        <div className="cols">
          <div>
            <pre>
              <code>{`CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,        -- 'appstore' | 'googleplay' | ...
  source_id TEXT NOT NULL,     -- 소스 내 고유 ID(리뷰 id, 게시글 URL)
  url TEXT, author TEXT,
  content TEXT NOT NULL,
  rating INTEGER,              -- 앱 리뷰 별점
  posted_at TEXT,              -- 원문 게시 시각
  collected_at TEXT NOT NULL,  -- 수집 시각 (리포트 기준일)
  keyword TEXT,                -- 검색에 쓴 키워드
  -- ↓ 태깅 결과 (수집 시점엔 NULL)
  sentiment TEXT, category TEXT, severity TEXT,
  team TEXT, summary TEXT,
  relevant INTEGER,            -- 관련성 필터 (0 = 무관 판정)
  tagged_at TEXT,              -- NULL = 미태깅 → 태깅 대상 선별 키
  UNIQUE(source, source_id)    -- ★ 중복 제거의 핵심
);
CREATE TABLE settings (        -- 스케줄러 ↔ 대시보드 공유 상태
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);`}</code>
            </pre>
          </div>
          <div>
            <ul>
              <li>
                <strong>중복 제거를 애플리케이션이 아니라 DB 제약으로</strong>:{' '}
                <code>INSERT OR IGNORE</code> + <code>UNIQUE(source, source_id)</code>. 수집기가 같은 글을 몇 번
                가져와도 신규 건만 삽입되고, <code>changes</code> 합산으로 “신규 N건”을 집계한다
              </li>
              <li>
                <code>journal_mode = WAL</code>: 대시보드(읽기)와 스케줄러(쓰기)가{' '}
                <strong>동시에 접근해도 서로 블로킹하지 않는다</strong>. 두 프로세스 아키텍처의 전제 조건
              </li>
              <li>
                삽입은 <code>db.transaction()</code>으로 묶어 배치 커밋 (better-sqlite3 동기 API라 레이스 없음)
              </li>
              <li>
                구버전 DB 호환: 시작 시 <code>PRAGMA table_info</code>로 <code>relevant</code> 컬럼 유무를
                검사해 없으면 <code>ALTER TABLE</code>: 무중단 마이그레이션
              </li>
              <li>
                날짜 집계는 <code>substr(collected_at, 1, 10)</code>(= YYYY-MM-DD) 기준.{' '}
                <code>collected_at</code>, <code>category</code>에 인덱스
              </li>
              <li>
                재분류 필요 시 <code>npm run retag</code> → <code>tagged_at</code>만 전체 NULL로 리셋 →
                다음 수집 때 현재 태거로 다시 분류 (원문은 보존)
              </li>
            </ul>
          </div>
        </div>
      </S>

      {/* ─────────────────── 11. 태깅 계층 ─────────────────── */}
      <S n={11}>
        <div className="slide-kicker">11, Tagging</div>
        <h1>태깅 계층: 3단 폴백 체인</h1>
        <p>
          모든 태거는 같은 인터페이스(<code>Tagger.tag(items) ⇒ Map&lt;id, TagResult&gt;</code>)를 구현한다.
          결과는 <strong>감성, 카테고리, 심각도, 담당팀, 60자 요약, 관련성</strong> 6개 필드.
        </p>
        <div className="flow">
          <div className="node hl">
            ① Claude Code CLI
            <small>구독 요금: 추가 비용 0</small>
          </div>
          <div className="arrow">
            →<small>CLI 없음</small>
          </div>
          <div className="node hl">
            ② Claude API
            <small>종량제 (Haiku 기본)</small>
          </div>
          <div className="arrow">
            →<small>API 키 없음</small>
          </div>
          <div className="node hl">
            ③ 키워드 휴리스틱
            <small>무료, 오프라인</small>
          </div>
        </div>
        <div className="cols">
          <div>
            <h2>자동 선택 로직 (resolve.ts)</h2>
            <ol>
              <li>
                <code>TAGGER_MODE</code> 환경변수가 있으면 무조건 그 모드 (<code>cli</code>, <code>api</code>, {' '}
                <code>heuristic</code>)
              </li>
              <li>
                없으면: <code>claude --version</code>을 10초 타임아웃으로 실행해 <strong>CLI 가용성을 실측</strong> →
                성공 시 CLI 모드
              </li>
              <li>
                실패 시 <code>ANTHROPIC_API_KEY</code> 존재 여부 → API 모드
              </li>
              <li>둘 다 없으면 휴리스틱 (안내 로그와 함께)</li>
            </ol>
          </div>
          <div>
            <h2>계층적 폴백: 파이프라인은 절대 안 죽는다</h2>
            <ul>
              <li>
                모드 선택 폴백(위)과 별개로, <strong>실행 중 실패도 건별로 폴백</strong>한다: CLI 배치가
                실패하거나 응답에서 빠진 항목, API 개별 호출 실패 건은 그 자리에서 휴리스틱으로 채운다
              </li>
              <li>
                결과: LLM이 전혀 없어도, 있다가 죽어도 <strong>태깅 단계는 항상 완료</strong>되고 리포트는
                나간다. 품질만 단계적으로 떨어진다 (graceful degradation)
              </li>
            </ul>
          </div>
        </div>
      </S>

      {/* ─────────────────── 12. CLI 태거 ─────────────────── */}
      <S n={12}>
        <div className="slide-kicker">12, Tagging (CLI)</div>
        <h1>CLI 태거: 배치 처리와 방어적 파싱</h1>
        <div className="cols">
          <div>
            <h2>호출 방식</h2>
            <ul>
              <li>
                <code>claude -p</code>를 <code>spawn</code>하고 프롬프트는 <strong>stdin으로</strong> 전달.
                수집한 외부 텍스트가 <strong>셸 인자로 들어가지 않아</strong> 명령 주입 여지가 없고, 길이 제한도
                안 받는다
              </li>
              <li>호출당 타임아웃 5분, 초과 시 프로세스 kill</li>
              <li>
                <strong>25건씩 배치</strong>로 묶어 한 번에 분류. 호출 수가 1/25로 줄어 구독 rate limit(5시간
                윈도우) 안에서 하루 1~3회 수집이 가능해진다
              </li>
              <li>항목당 원문을 400자로 절단해 프롬프트 크기 제어</li>
            </ul>
            <h2>프롬프트 구성</h2>
            <ul>
              <li>역할 정의 + 분류 규칙(택소노미 enum 그대로 명시) + “JSON 배열만 출력” 지시</li>
              <li>
                설정 파일의 <code>domainPrompt</code>(서비스 용어 사전)를 주입. 서비스 특화 지식은{' '}
                <strong>코드가 아니라 설정</strong>에 산다
              </li>
              <li>각 항목에 채널, 별점 메타를 붙여 문맥 제공</li>
            </ul>
          </div>
          <div>
            <h2>방어적 파싱 (parseBatchOutput)</h2>
            <p className="muted">LLM 출력은 신뢰하지 않는 외부 입력으로 취급한다:</p>
            <ol>
              <li>
                응답에서 <strong>첫 <code>[</code> ~ 마지막 <code>]</code></strong>만 잘라 JSON 파싱. 인사말, 코드블록
                래핑이 섞여도 흡수
              </li>
              <li>
                파싱 실패, 배열 아님 → <strong>빈 결과 반환</strong> (예외 아님)
              </li>
              <li>
                항목별 검증: <code>index</code>가 1~배치크기 정수인지, 4개 라벨이 전부{' '}
                <strong>택소노미 enum에 실존하는 값인지</strong>: 하나라도 어긋나면 그 항목만 버림
              </li>
              <li>
                <code>summary</code>는 100자로 강제 절단, <code>relevant</code>는 boolean 아니면 true로 보정
              </li>
              <li>
                검증에서 떨어진 항목은 <strong>휴리스틱 태거가 보충</strong>: 배치 일부만 성공해도 손실 없음
              </li>
            </ol>
            <p className="muted">
              → 프롬프트 주입으로 LLM 출력이 오염돼도, 영향 범위는 “미리 정의된 enum 중 하나가 잘못
              선택되는 것”으로 제한된다. 임의 문자열이 라벨로 저장될 수 없다.
            </p>
          </div>
        </div>
      </S>

      {/* ─────────────────── 13. API 태거 ─────────────────── */}
      <S n={13}>
        <div className="slide-kicker">13, Tagging (API)</div>
        <h1>API 태거: Structured Outputs와 캐싱</h1>
        <div className="cols">
          <div>
            <h2>파싱 실패가 구조적으로 없는 호출</h2>
            <pre>
              <code>{`client.messages.parse({
  model: 'claude-haiku-4-5',   // TAGGER_MODEL로 교체 가능
  system: [{ text: systemPrompt,
             cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user',
               content: \`[채널: \${source}, 별점: …]\n\${content}\` }],
  output_config: { format: zodOutputFormat(TagSchema) },
})`}</code>
            </pre>
            <ul>
              <li>
                <strong>zod 스키마를 structured outputs로 강제</strong>: 6개 필드가 enum, 타입 수준에서
                보장되므로 CLI 태거 같은 수동 파싱, 검증이 아예 불필요
              </li>
              <li>건별 호출이라 배치 파싱 실패의 연쇄 손실이 없음, 원문 2,000자 컷</li>
            </ul>
          </div>
          <div>
            <h2>비용, 처리량 설계</h2>
            <ul>
              <li>
                기본 모델은 <strong>Haiku</strong>: 6필드 분류 작업에 상위 모델은 과투자. 일 1천 건 ≈ $1 수준
              </li>
              <li>
                시스템 프롬프트(공통 분류 원칙 + 도메인 사전)에 <code>cache_control</code>:{' '}
                <strong>프롬프트 캐시로 반복 입력 토큰 비용 절감</strong>. 캐시 최소 프리픽스(Haiku 기준 4096
                토큰)를 넘기려면 domainPrompt를 충분히 채우는 게 오히려 이득
              </li>
              <li>
                자체 구현한 <strong>동시성 4 워커 풀</strong>로 rate limit을 피하면서 병렬 처리
              </li>
              <li>개별 건 실패는 경고 로그 + 휴리스틱 폴백 (파이프라인 지속)</li>
            </ul>
          </div>
        </div>
      </S>

      {/* ─────────────────── 14. 휴리스틱 태거 ─────────────────── */}
      <S n={14}>
        <div className="slide-kicker">14, Tagging (Heuristic)</div>
        <h1>휴리스틱 태거: 규칙 기반 베이스라인</h1>
        <div className="cols">
          <div>
            <h2>분류 규칙</h2>
            <ul>
              <li>
                <strong>카테고리</strong>: 택소노미의 카테고리별 키워드 사전과 매칭, <strong>히트 수 최다</strong>{' '}
                카테고리 선택 (동률, 무히트 시 ‘기타’)
              </li>
              <li>
                <strong>감성</strong>: 별점이 있으면 우선 (≤2 부정, ≥4 긍정, 3점은 텍스트 힌트로). 없으면
                부정/긍정 힌트 단어 수 비교
              </li>
              <li>
                <strong>심각도</strong>: 부정 + 결제, 계정 카테고리 = high, ‘환불’+‘안’ 동시 출현 = critical
              </li>
              <li>
                <strong>담당팀</strong>: 카테고리 → 팀 고정 매핑 테이블
              </li>
              <li>
                <strong>요약</strong>: 생성하지 않고 원문 앞 80자. 규칙 기반에서 환각 0%를 보장하는 방법
              </li>
            </ul>
          </div>
          <div>
            <h2>세 가지 역할</h2>
            <ol>
              <li><strong>최후 폴백</strong>: LLM이 전혀 없는 환경에서도 파이프라인 완주</li>
              <li><strong>부분 실패 보충</strong>: LLM 배치에서 빠진 건을 즉석에서 채움</li>
              <li>
                <strong>베이스라인</strong>: LLM 태깅 정확도를 비교 측정하는 대조군.{' '}
                <code>npm run collect:heuristic</code>으로 강제 실행 가능
              </li>
            </ol>
            <div className="card">
              <div className="card-title">한계 (의도된 트레이드오프)</div>
              <p className="muted">
                반어법(‘미쳤다’=극찬), 문맥 의존 표현은 오분류한다. 그래서 기본 모드가 아니라 폴백이며,
                리포트 하단에 어떤 태거가 쓰였는지 로그로 남긴다.
              </p>
            </div>
          </div>
        </div>
      </S>

      {/* ─────────────────── 15. 관련성 필터 ─────────────────── */}
      <S n={15}>
        <div className="slide-kicker">15, Relevance Filter</div>
        <h1>관련성 필터: 동음이의어 노이즈 제거</h1>
        <p>
          짧은 브랜드 키워드로 웹을 검색하면 <strong>같은 철자의 전혀 다른 주제</strong>(타업종 제품, 인명, 일반명사)가
          대량으로 걸린다. 이 노이즈가 집계에 섞이면 “언급량 급증” 알림 자체를 신뢰할 수 없게 된다.
        </p>
        <div className="cols">
          <div>
            <h2>동작 방식</h2>
            <ul>
              <li>
                태거가 건별로 <code>relevant: boolean</code>을 판정해 DB에 저장. <strong>삭제하지 않고 표시만</strong>{' '}
                한다 (판정 검증, 재분류 가능)
              </li>
              <li>
                앱 리뷰 채널(앱스토어, 구글플레이)은 <strong>무조건 관련</strong>: 앱 자체에 달린 글이므로
              </li>
              <li>
                리포트, 집계 쿼리는 공통 조건{' '}
                <code>(relevant IS NULL OR relevant != 0)</code>으로 무관 글 제외. NULL(필터 도입 전 구데이터)은
                관련으로 취급해 하위 호환
              </li>
              <li>리포트 헤더에 “무관 글 N건 제외됨”을 명시해 필터 동작을 투명하게 노출</li>
              <li>대시보드에서는 무관 판정 행을 반투명 + ‘무관’ 배지로 표시</li>
            </ul>
          </div>
          <div>
            <h2>판정 주체별 전략</h2>
            <table>
              <thead>
                <tr>
                  <th>태거</th>
                  <th>판정 방법</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>LLM (CLI/API)</td>
                  <td>
                    문맥으로 판단. 프롬프트에서 <strong>“가장 먼저 relevant부터 판단하라”</strong>고 지시,
                    무관 글이면 나머지 필드에 노력을 쓰지 않게
                  </td>
                </tr>
                <tr>
                  <td>휴리스틱</td>
                  <td>
                    ① 4자 이상의 확실한 키워드가 본문에 있거나 ② 설정의 <code>relevanceHints</code>(업종
                    단어)가 함께 나올 때만 관련 인정. 근사치
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="muted">
              부수 효과: 무관 글은 리포트에서 빠지므로 이후 단계(사람의 확인 시간)까지 아끼는{' '}
              <strong>다운스트림 비용 절감 장치</strong>이기도 하다.
            </p>
          </div>
        </div>
      </S>

      {/* ─────────────────── 16. IPC ─────────────────── */}
      <S n={16}>
        <div className="slide-kicker">16, IPC</div>
        <h1>프로세스 간 통신: SQLite를 IPC로</h1>
        <p>
          대시보드(Next.js)와 스케줄러는 별개 프로세스다. 메시지 큐나 HTTP API 대신{' '}
          <strong>settings 테이블(key-value)이 통신 채널</strong>이다. 상태가 곧 메시지다.
        </p>
        <div className="cols c-46">
          <div>
            <table>
              <thead>
                <tr>
                  <th>키</th>
                  <th>쓰는 쪽</th>
                  <th>읽는 쪽</th>
                  <th>의미</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>intervalHours</code></td>
                  <td>대시보드</td>
                  <td>스케줄러</td>
                  <td>수집 주기 (매 틱 재조회)</td>
                </tr>
                <tr>
                  <td><code>runRequestedAt</code></td>
                  <td>대시보드</td>
                  <td>스케줄러</td>
                  <td>“지금 실행” 요청 (소비 후 비움)</td>
                </tr>
                <tr>
                  <td><code>runningSince</code></td>
                  <td>스케줄러</td>
                  <td>대시보드</td>
                  <td>실행 중 표시 (완료 시 비움)</td>
                </tr>
                <tr>
                  <td><code>lastRunAt</code></td>
                  <td>스케줄러</td>
                  <td>양쪽</td>
                  <td>다음 실행 시각 계산 기준</td>
                </tr>
                <tr>
                  <td><code>lastRunStatus</code></td>
                  <td>스케줄러</td>
                  <td>대시보드</td>
                  <td>ok / error: 메시지</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h2>“지금 실행” 버튼의 전체 경로</h2>
            <ol>
              <li>
                버튼 → Next.js <strong>서버 액션</strong>이 <code>runRequestedAt</code>에 현재 시각 기록 →{' '}
                <code>revalidatePath('/')</code>
              </li>
              <li>대시보드는 즉시 “실행 대기 중 (30초 이내 시작)” 표시, 버튼 비활성화</li>
              <li>
                스케줄러가 다음 틱(≤30초)에 값을 발견 → <strong>키를 비우고</strong> 파이프라인 시작,{' '}
                <code>runningSince</code> 기록
              </li>
              <li>완료 후 <code>lastRunAt</code>, <code>lastRunStatus</code> 갱신 → 대시보드에 결과 반영</li>
            </ol>
            <div className="card">
              <div className="card-title">왜 이 방식인가</div>
              <p className="muted">
                포트, 인증, 직렬화가 필요 없고, WAL 모드라 동시 접근이 안전하며, 프로세스가 재시작돼도
                상태가 유실되지 않는다. 초 단위 지연(≤30s)은 이 용도에서 충분히 허용 가능한 트레이드오프.
              </p>
            </div>
          </div>
        </div>
      </S>

      {/* ─────────────────── 17. 리포트, 급증 감지 ─────────────────── */}
      <S n={17}>
        <div className="slide-kicker">17, Report & Spike Detection</div>
        <h1>리포트 생성과 급증 감지: 전부 SQL로</h1>
        <div className="cols">
          <div>
            <h2>급증 감지 수식</h2>
            <pre>
              <code>{`직전 7일 평균(avg) = 카테고리별 언급량 / 7  (기준일 제외)

급증 판정:
  count >= 5 인 카테고리 중
  ├─ avg > 0  → count > avg × 3     (평소의 3배 초과)
  └─ avg == 0 → count >= 10          (신규 이슈는 더 높은 문턱)`}</code>
            </pre>
            <ul>
              <li>
                최소 5건 조건이 <strong>저볼륨 노이즈</strong>(0→2건도 “급증”이 되는 문제)를 막고, 평균 0일 때의
                별도 문턱이 <strong>신규 카테고리 오탐</strong>을 막는다
              </li>
              <li>7일 평균은 SQL 한 방(<code>date(?, '-N days')</code> 윈도우). LLM 개입 없음</li>
            </ul>
          </div>
          <div>
            <h2>리포트 구성 (마크다운)</h2>
            <ol>
              <li>헤더: 수집 N건 (소스별 내역), 무관 글 제외 수</li>
              <li>🔴 급증 감지. 카테고리, 건수, 평소 대비 배수</li>
              <li>⚠️ 우선 확인. 부정 + high/critical 상위 5건, <strong>담당팀 명시</strong></li>
              <li>카테고리별 언급량 표 (건수, 부정, 7일 평균)</li>
              <li>🟢 긍정 하이라이트 3건</li>
            </ol>
            <ul>
              <li>
                <strong>모든 인용에 원문 링크</strong>: 요약만 보고 판단하지 않고 한 클릭으로 원문 검증 가능.
                LLM 요약의 신뢰 문제를 링크로 상쇄한다
              </li>
              <li>
                산출물: <code>private/reports/날짜.md</code> 로 날짜별 보관. 대시보드의 브리핑
                탭과 같은 내용을 텍스트로 남겨 둔다
              </li>
            </ul>
          </div>
        </div>
      </S>

      {/* ─────────────────── 18. AI 자원 효율 ─────────────────── */}
      <S n={18}>
        <div className="slide-kicker">18, Cost Engineering</div>
        <h1>AI 자원 효율 설계: 토큰, 호출, 비용</h1>
        <div className="card-grid">
          <div className="card">
            <div className="card-title">호출 수 최소화</div>
            <ul>
              <li>CLI 모드 <strong>25건 배치</strong> → 호출 수 1/25</li>
              <li>
                <code>tagged_at IS NULL</code>인 건만 태깅. <strong>같은 글에 토큰을 두 번 쓰지 않는다</strong>
              </li>
              <li>중복 제거(DB 제약)가 태깅보다 먼저라 중복 글에는 토큰 지출 0</li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title">토큰 다이어트</div>
            <ul>
              <li>원문 절단: CLI 400자 / API 2,000자. 분류에 필요한 만큼만</li>
              <li>공백 정규화로 낭비 토큰 제거</li>
              <li>시스템 프롬프트 <strong>캐시</strong>(cache_control)로 반복 입력 비용 절감</li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title">모델, 요금제 선택</div>
            <ul>
              <li>분류 작업엔 <strong>Haiku</strong>가 기본. 일 1천 건 ≈ $1</li>
              <li>
                CLI 모드는 <strong>구독 요금에 포함</strong>(추가 비용 0). rate limit(5시간 윈도우)을 고려해
                수집 주기 하루 1~3회 권장
              </li>
              <li>휴리스틱은 언제나 무료 대조군</li>
            </ul>
          </div>
          <div className="card">
            <div className="card-title">사람 시간 절감 (다운스트림)</div>
            <ul>
              <li>관련성 필터가 무관 글을 리포트에서 제거. 확인할 필요가 없는 글은 보이지도 않게</li>
              <li>급증, 심각 건만 상단 배치. 전량 정독 대신 예외 관리</li>
              <li>원문 링크로 검증 시간 최소화</li>
            </ul>
          </div>
        </div>
        <p className="muted">
          요약: “LLM을 얼마나 잘 쓰느냐”만큼 <strong>“LLM을 언제 안 쓰느냐”</strong>를 설계했다. 집계는 SQL,
          중복, 기태깅 건은 스킵, 무관 글은 조기 차단.
        </p>
      </S>

      {/* ─────────────────── 19. 보안, 이식성 + 요약 ─────────────────── */}
      <S n={19}>
        <div className="slide-kicker">19, Security & Wrap-up</div>
        <h1>보안, 이식성 설계와 요약</h1>
        <div className="cols">
          <div>
            <h2>보안, 프라이버시</h2>
            <ul>
              <li>
                <strong>비공개 정보의 단일 격리 폴더</strong>: 설정, <code>.env</code>, DB, 리포트는 전부{' '}
                <code>private/</code>: 폴더째 gitignore + 루트 낙오 파일용 이중 안전망 패턴
              </li>
              <li>
                코드에는 서비스 식별자가 없다. 서비스명, 키워드, 용어 사전은 전부 설정 주입.{' '}
                <strong>저장소를 공개해도 어떤 서비스를 모니터링하는지 드러나지 않는다</strong>
              </li>
              <li>외부 텍스트는 stdin/파라미터 바인딩으로만 흐른다. 셸 인자, SQL 문자열 연결 없음</li>
              <li>LLM 출력은 enum 검증을 통과해야만 저장. 주입돼도 임의 문자열이 침투 불가</li>
              <li>로그인 계정 우회 수집 금지. 자격증명 자체가 파이프라인에 없음</li>
            </ul>
            <h2>이식성</h2>
            <ul>
              <li>
                다른 머신 이전 = <code>private/</code> 압축 → 클론 → 해제 → <code>npm install</code>
              </li>
              <li>
                <strong>다른 서비스 이식 = 설정 파일 교체뿐</strong> (키워드, 앱 ID, domainPrompt, relevanceHints).
                코드 수정 0줄
              </li>
            </ul>
          </div>
          <div>
            <h2>핵심 설계 결정 요약</h2>
            <table>
              <thead>
                <tr>
                  <th>결정</th>
                  <th>효과</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>숫자는 SQL, 판단은 LLM</td>
                  <td>재현 가능한 수치 + 환각 영향 범위 최소화</td>
                </tr>
                <tr>
                  <td>태거 3단 폴백 + 건별 폴백</td>
                  <td>어떤 환경에서도 파이프라인 완주</td>
                </tr>
                <tr>
                  <td>SQLite 하나 (WAL)</td>
                  <td>저장소 + IPC + 스케줄 상태를 파일 1개로</td>
                </tr>
                <tr>
                  <td>UNIQUE 제약 중복 제거</td>
                  <td>수집기 단순화, 토큰 이중 지출 방지</td>
                </tr>
                <tr>
                  <td>URL 패턴 DOM 앵커</td>
                  <td>클래스명 변경에 강한 스크래핑</td>
                </tr>
                <tr>
                  <td>비로그인 공개 소스만</td>
                  <td>약관 준수 + 단일 장애점 제거</td>
                </tr>
                <tr>
                  <td>관련성 필터 (relevant)</td>
                  <td>동음이의어 노이즈가 집계를 오염시키지 않음</td>
                </tr>
                <tr>
                  <td>private/ 단일 폴더</td>
                  <td>공개 저장소 + 비공개 운영의 안전한 공존</td>
                </tr>
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 12 }}>
              끝. <kbd>G</kbd>를 눌러 목차로 돌아갈 수 있습니다.
            </p>
          </div>
        </div>
      </S>

      <DeckChrome nav={nav} titles={TITLES} label="Feedback Radar: 동작 원리" />
    </div>
  );
}
