import { Fragment } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPitchStats,
  hasPrivateConfig,
  loadConfig,
  localDate,
  openDb,
  privateDir,
  type PitchStats,
} from '@feedback-radar/core';
import { DeckShell } from '../_deck/DeckShell';
import './pitch.css';

/**
 * /pitch — 발표·소개용 슬라이드 (기능과 실제 화면 중심).
 *
 * 서비스명·키워드는 gitignore되는 private/feedback-radar.config.json에서 읽는다.
 * 그 파일이 없는 머신(클론 직후)에서는 자리표시자가 대신 나오므로,
 * 공개 저장소에는 어떤 서비스를 모니터링하는지 남지 않는다.
 * 화면 캡처도 같은 이유로 private/deck-assets/에 두고 /pitch/shot/… 라우트로만 서빙한다.
 */

export const dynamic = 'force-dynamic';

const TITLES = [
  '표지',
  '문제',
  '동작 흐름 5단계',
  '실제 화면: 대시보드',
  '실제 산출물: 일일 브리핑',
  'AI가 하는 일',
  '정량적 성과',
  'AI 자원 효율',
  '확산',
  '마무리',
];

const SLIDE_CLASSES = ['pitch pitch-cover', ...Array(TITLES.length - 1).fill('pitch')];

type ShotName = 'dashboard-full' | 'dashboard-scheduler' | 'dashboard-table' | 'report';

function shotExists(name: ShotName): boolean {
  return fs.existsSync(path.join(privateDir(), 'deck-assets', `${name}.png`));
}

function Shot({
  name,
  url,
  className,
}: {
  name: ShotName;
  url: string;
  className?: string;
}) {
  if (!shotExists(name)) {
    return (
      <div className="shot-missing">
        화면 캡처가 아직 없습니다.
        <br />
        대시보드를 띄운 상태에서 <code>npm run shots</code> 를 실행하면 이 자리에 실제 화면이 들어갑니다.
      </div>
    );
  }
  return (
    <div className={`shot ${className ?? ''}`}>
      <div className="shot-bar">
        <i />
        <i />
        <i />
        <span>{url}</span>
      </div>
      {/* private/ 폴더에서 읽어 오는 런타임 이미지라 next/image 최적화 대상이 아니다 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/pitch/shot/${name}`} alt="" />
    </div>
  );
}

function Metric({
  value,
  unit,
  label,
  note,
  plain,
}: {
  value: string | number;
  unit?: string;
  label: string;
  note?: string;
  plain?: boolean;
}) {
  return (
    <div className="metric">
      <div className={`m-value ${plain ? 'plain' : ''}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="m-unit">{unit}</span>}
      </div>
      <div className="m-label">{label}</div>
      {note && <div className="m-note">{note}</div>}
    </div>
  );
}

/** 사람이 전량을 눈으로 확인할 때 드는 시간 vs 브리핑 1장을 보는 시간 */
function savings(stats: PitchStats, secondsPerItem: number, briefingMinutes: number) {
  const manualMinutes = (stats.total * secondsPerItem) / 60;
  const autoMinutes = Math.max(1, stats.collectDays) * briefingMinutes;
  const saved = Math.max(0, manualMinutes - autoMinutes);
  return {
    manualHours: manualMinutes / 60,
    autoMinutes,
    savedHours: saved / 60,
    ratio: autoMinutes > 0 ? manualMinutes / autoMinutes : 0,
  };
}

export default function PitchPage() {
  const configured = hasPrivateConfig();
  const config = loadConfig();
  const db = openDb();
  const stats = getPitchStats(db);
  db.close();

  // 설정이 없는 머신에서는 서비스 식별 정보 대신 자리표시자를 보여준다
  const brand = configured ? config.displayName : '{서비스명}';
  const keywords = configured ? config.keywords : ['{키워드1}', '{키워드2}'];

  const secondsPerItem = config.pitch?.secondsPerItem ?? 30;
  const briefingMinutes = config.pitch?.briefingMinutes ?? 10;
  const s = savings(stats, secondsPerItem, briefingMinutes);

  const sourceLabel: Record<string, string> = {
    appstore: '앱스토어',
    googleplay: '구글플레이',
    'naver-blog': '네이버 블로그',
    'naver-cafe': '네이버 카페',
    dcinside: '커뮤니티',
    threads: 'Threads',
  };

  const hasData = stats.total > 0;
  const irrelevantPct = stats.total > 0 ? Math.round((stats.irrelevant / stats.total) * 100) : 0;

  const slides = [
    /* ── 0. 표지 ── */
    <Fragment key={0}>
      <span className="cover-brand">📡 {brand}</span>
      <h1>
        흩어진 사용자 목소리를,
        <br />
        매일 아침 한 장으로
      </h1>
      <p className="cover-sub">모으고, 걸러내고, 분류하고, 먼저 알려주는 자동 파이프라인</p>
      <div className="metrics" style={{ maxWidth: 780 }}>
        <Metric value={stats.total} unit="건" label="AI가 수집, 분류한 사용자 반응" />
        <Metric value={stats.bySource.length} unit="곳" label="자동 수집 중인 채널" />
        <Metric value="0" unit="분" label="사람이 채널을 도는 시간" note="설정 후에는 전부 자동" />
      </div>
      <p className="keys-hint">
        <kbd>←</kbd> <kbd>→</kbd> 이동, <kbd>G</kbd> 목차, 실제 화면은 <a href="/tour">둘러보기</a>
      </p>
    </Fragment>,

    /* ── 1. 문제 (3컷) ── */
    <Fragment key={1}>
      <div className="slide-kicker">Before</div>
      <h1>흩어져 있고, 늦게 알고, 믿기 어렵다</h1>
      <div className="card-grid">
        <div className="card">
          <div className="card-title">① 흩어져 있다</div>
          <p>스토어 리뷰, 블로그, 카페, 커뮤니티를 매일 사람이 돌며 검색해야 합니다.</p>
        </div>
        <div className="card">
          <div className="card-title">② 늦게 안다</div>
          <p>결제 오류 글이 갑자기 늘어도 누군가 우연히 볼 때까지 아무도 모릅니다.</p>
        </div>
        <div className="card">
          <div className="card-title">③ 믿기 어렵다</div>
          <p>철자만 같은 무관한 글이 섞여 언급량이 부풀고, 신호를 믿을 수 없게 됩니다.</p>
        </div>
      </div>
      <div className="ba">
        <div className="ba-box before">
          <div className="ba-tag">지금</div>
          <p>사람이 채널을 돌고 → 눈으로 훑고 → 정리해 팀에 전달</p>
          <p>바쁘면 밀리고, 밀리면 안 보게 됩니다.</p>
        </div>
        <div className="ba-arrow">→</div>
        <div className="ba-box after">
          <div className="ba-tag">도입 후</div>
          <p>수집 → 분류 → 급증 감지 → 알림이 자동으로 돕니다</p>
          <p>사람은 브리핑 한 장만 읽습니다.</p>
        </div>
      </div>
    </Fragment>,

    /* ── 2. 동작 흐름 ── */
    <Fragment key={2}>
      <div className="slide-kicker">After</div>
      <h1>사람이 개입하지 않는 5단계</h1>
      <div className="steps">
        <div className="step">
          <div className="step-n">1</div>
          <div className="step-t">모은다</div>
          <p>주기마다 채널을 자동 검색. 이미 본 글은 건너뜁니다.</p>
        </div>
        <div className="step">
          <div className="step-n">2</div>
          <div className="step-t">거른다</div>
          <p>AI가 &quot;정말 우리 서비스 얘기인가&quot;를 먼저 판단합니다.</p>
        </div>
        <div className="step">
          <div className="step-n">3</div>
          <div className="step-t">분류한다</div>
          <p>글마다 감성, 주제, 심각도, 담당팀, 요약을 붙입니다.</p>
        </div>
        <div className="step">
          <div className="step-n">4</div>
          <div className="step-t">비교한다</div>
          <p>주제별 언급량을 직전 7일 평균과 비교합니다.</p>
        </div>
        <div className="step">
          <div className="step-n">5</div>
          <div className="step-t">알린다</div>
          <p>브리핑 한 장을 메신저로 보내고 파일로 남깁니다.</p>
        </div>
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-title">지금 자동 수집 중인 채널</div>
          <div className="chips">
            {(hasData
              ? stats.bySource
              : [
                  { source: 'appstore', count: 0 },
                  { source: 'googleplay', count: 0 },
                  { source: 'naver-blog', count: 0 },
                  { source: 'dcinside', count: 0 },
                ]
            ).map((b) => (
              <span className="chip" key={b.source}>
                {sourceLabel[b.source] ?? b.source}
                {hasData && <span className="muted"> {b.count.toLocaleString()}</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">멈추지 않게 만든 부분</div>
          <p>
            채널 한 곳이 막히거나 AI 호출이 실패해도 <strong>나머지는 그대로 돕니다.</strong> 결과 품질만 조금
            낮아질 뿐 브리핑은 매일 나옵니다.
          </p>
        </div>
      </div>
    </Fragment>,

    /* ── 3. 실제 화면 ── */
    <Fragment key={3}>
      <div className="slide-kicker">실제 화면</div>
      <h1>대시보드: 한 화면에서 현황 파악</h1>
      <div className="cols c-64">
        <div>
          <Shot name="dashboard-full" url="localhost:3000" className="hero" />
        </div>
        <div>
          <ul>
            <li>
              누적, 오늘 건수와 <strong>긍정, 부정, 중립</strong> 분포
            </li>
            <li>
              오늘 어떤 주제가 몇 건, 그중 <strong>부정이 몇 건</strong>
            </li>
            <li>글마다 감성, 주제, 심각도, 담당팀 라벨</li>
            <li>
              수집 주기 변경과 <strong>지금 실행</strong>도 화면에서
            </li>
          </ul>
          <div className="assume">
            실제 운영 데이터입니다. 화면을 직접 눌러 보시려면 <a href="/tour">둘러보기</a>로 이동하세요.
          </div>
        </div>
      </div>
    </Fragment>,

    /* ── 4. 실제 산출물 ── */
    <Fragment key={4}>
      <div className="slide-kicker">실제 산출물</div>
      <h1>매일 아침 나가는 브리핑 한 장</h1>
      <div className="cols c-64">
        <div>
          <Shot name="report" url="private/reports/YYYY-MM-DD.md" className="hero" />
        </div>
        <div>
          <ul>
            <li>
              <strong>🔴 급증 감지</strong>: 평소보다 튄 주제를 배수와 함께
            </li>
            <li>
              <strong>⚠️ 우선 확인</strong>: 심각한 부정 반응을 담당팀과 함께
            </li>
            <li>
              <strong>📊 주제별 언급량</strong>: 오늘 vs 직전 7일 평균
            </li>
            <li>
              <strong>🔗 원문 링크</strong>: 요약만 믿고 판단하지 않도록
            </li>
          </ul>
          <div className="assume">
            같은 내용이 사내 메신저(Slack 호환 웹훅)로도 전송됩니다. 받는 사람은 <b>읽기만</b> 하면 됩니다.
          </div>
        </div>
      </div>
    </Fragment>,

    /* ── 5. AI가 하는 일 ── */
    <Fragment key={5}>
      <div className="slide-kicker">AI 활용</div>
      <h1>AI는 글 한 편을 읽고 6가지를 판단합니다</h1>
      <div className="chips">
        <span className="chip">
          <b>관련성</b>정말 우리 서비스 얘기인가
        </span>
        <span className="chip">
          <b>감성</b>긍정 / 부정 / 중립
        </span>
        <span className="chip">
          <b>카테고리</b>결제, 오류, 콘텐츠, 정책, 이벤트, 계정
        </span>
        <span className="chip">
          <b>심각도</b>low / medium / high / critical
        </span>
        <span className="chip">
          <b>담당팀</b>결제, 앱개발, 콘텐츠, 마케팅, CS
        </span>
        <span className="chip">
          <b>요약</b>원문에 있는 내용만 한 줄로
        </span>
      </div>
      <div className="cols">
        <div className="card">
          <div className="card-title">숫자는 AI에게 맡기지 않았습니다</div>
          <p>
            건수, 배수는 코드가 계산합니다. <strong>직전 7일 평균의 3배 + 5건 이상</strong>일 때만 급증으로
            알립니다.
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            같은 데이터면 항상 같은 결론. AI가 틀려도 영향은 그 글 하나의 라벨에 그칩니다.
          </p>
        </div>
        <div className="card">
          <div className="card-title">노이즈는 앞단에서 차단</div>
          <p>
            무관한 글은 집계에서 <strong>제외하되 지우지 않습니다</strong>
            {hasData && (
              <>
                {' '}
                (지금까지 전체의 <strong>{irrelevantPct}%</strong>)
              </>
            )}
            .
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            업종 용어 같은 도메인 지식은 설정 파일로 주입해, 같은 코드가 다른 서비스에도 맞게 동작합니다.
          </p>
        </div>
      </div>
    </Fragment>,

    /* ── 6. 정량적 성과 ── */
    <Fragment key={6}>
      <div className="slide-kicker">정량적 성과</div>
      <h1>숫자로 본 효과</h1>
      {hasData ? (
        <>
          <div className="metrics">
            <Metric
              value={stats.total}
              unit="건"
              label="자동 수집, 분류한 사용자 반응"
              note={
                stats.total === stats.tagged
                  ? 'AI 분류 완료, 미분류 0건'
                  : `AI 분류 ${stats.tagged.toLocaleString()}건`
              }
            />
            <Metric
              value={stats.irrelevant}
              unit="건"
              label="사람이 볼 필요 없어 걸러진 글"
              note={`전체의 ${irrelevantPct}%`}
            />
            <Metric value={stats.urgent} unit="건" label="즉시 확인이 필요했던 부정 반응" note="심각도 high 이상" />
            <Metric
              value={`${s.ratio.toFixed(0)}배`}
              label="전량 수동 확인 대비 시간 단축"
              note="아래 가정 기준"
            />
          </div>
          <div className="cols c-64">
            <div>
              <table>
                <thead>
                  <tr>
                    <th>구분</th>
                    <th>소요 시간</th>
                    <th>계산</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>수동 확인</td>
                    <td>
                      <strong>{s.manualHours.toFixed(1)}시간</strong>
                    </td>
                    <td>
                      {stats.total.toLocaleString()}건 × {secondsPerItem}초
                    </td>
                  </tr>
                  <tr>
                    <td>이 도구 사용</td>
                    <td>
                      <strong>{(s.autoMinutes / 60).toFixed(1)}시간</strong>
                    </td>
                    <td>
                      브리핑 {briefingMinutes}분 × {Math.max(1, stats.collectDays)}일
                    </td>
                  </tr>
                  <tr>
                    <td>절감</td>
                    <td>
                      <strong className="accent">{s.savedHours.toFixed(1)}시간</strong>
                    </td>
                    <td>약 {s.ratio.toFixed(0)}배 단축</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="card-title">시간 외의 효과</div>
              <ul>
                <li>
                  <strong>인지가 빨라진다</strong>: 급증은 다음 수집 주기에 바로 알림
                </li>
                <li>
                  <strong>기준이 일정하다</strong>: 담당자가 바뀌어도 같은 잣대
                </li>
                <li>
                  <strong>기록이 남는다</strong>: 지난주, 지난달과 비교 가능
                </li>
                <li>
                  <strong>전달이 자동</strong>: 정리해 넘기는 일이 사라짐
                </li>
              </ul>
            </div>
          </div>
          <div className="assume">
            <b>시간 절감은 가정치입니다.</b> 글 1건 확인 {secondsPerItem}초, 브리핑 1회 확인 {briefingMinutes}분
            기준이며 두 값은 설정 파일에서 조정할 수 있습니다. 수집 건수와 운영 일수는 실제 DB 집계값입니다.
          </div>
        </>
      ) : (
        <div className="shot-missing">
          아직 수집된 데이터가 없습니다. <code>npm run collect</code> 를 한 번 실행하면
          <br />이 슬라이드의 숫자가 실제 집계값으로 채워집니다.
        </div>
      )}
    </Fragment>,

    /* ── 7. AI 자원 효율 ── */
    <Fragment key={7}>
      <div className="slide-kicker">AI 자원 효율</div>
      <h1>AI를 쓰되, 아껴 쓰도록 설계했습니다</h1>
      <div className="card-grid">
        <div className="card">
          <div className="card-title">① 추가 비용 0원</div>
          <p>
            PC에 이미 있는 <strong>Claude 구독</strong>을 그대로 사용합니다. 없으면 API로, 그마저 없으면 규칙
            기반 분류로 자동 전환됩니다.
          </p>
        </div>
        <div className="card">
          <div className="card-title">② 같은 글에 두 번 쓰지 않기</div>
          <p>
            중복 글은 저장 단계에서, <strong>이미 분류한 글은 호출 전에</strong> 걸러집니다. 매일 돌려도 새 글에만
            비용이 듭니다.
          </p>
        </div>
        <div className="card">
          <div className="card-title">③ 25건씩 묶어 호출</div>
          <p>
            건별 호출 대신 배치로 묶어 <strong>호출 수를 25분의 1로</strong> 줄였습니다. 공통 지시문은 캐시되어
            반복 비용이 없습니다.
          </p>
        </div>
        <div className="card">
          <div className="card-title">④ 작업에 맞는 크기의 모델</div>
          <p>
            라벨 6개를 붙이는 일에는 <strong>가장 가벼운 모델</strong>이면 충분합니다. 스토어 리뷰처럼 판단이 필요
            없는 곳에는 아예 쓰지 않습니다.
          </p>
        </div>
      </div>
      <div className="assume">
        <b>핵심은 &quot;AI를 언제 안 쓰는가&quot;였습니다.</b> 집계는 코드가, 중복, 기분류 건은 건너뛰기, 무관한
        글은 앞단에서 차단. 꼭 필요한 순간에만 호출합니다.
      </div>
    </Fragment>,

    /* ── 8. 확산 ── */
    <Fragment key={8}>
      <div className="slide-kicker">확산</div>
      <h1>설정 파일만 바꾸면 다른 서비스, 팀에 그대로</h1>
      <div className="cols">
        <div>
          <div className="card">
            <div className="card-title">모니터링 키워드: 이 자리만 바꾸면 됩니다</div>
            <div className="chips">
              {keywords.map((k) => (
                <span className="chip" key={k}>
                  {k}
                </span>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-title">옮기고 운영하는 데 필요한 것</div>
            <ul>
              <li>설정 파일의 키워드, 앱 ID 교체. 코드 수정 불필요</li>
              <li>켜 두는 PC 한 대. 서버, DB, 클라우드 계약 불필요</li>
              <li>알림 받을 메신저 웹훅 주소 하나</li>
            </ul>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="card-title">이렇게 넓힐 수 있습니다</div>
            <div className="vstack">
              <div className="node">서비스별로 각각 띄워 팀마다 자기 브리핑 받기</div>
              <div className="node">경쟁 서비스 키워드를 넣어 시장 반응 모니터링</div>
              <div className="node">신규 기능 출시 직후 반응만 집중 추적</div>
              <div className="node">수집 채널 추가: 파일 하나로 확장</div>
            </div>
          </div>
          <div className="assume">
            <b>지키기로 한 원칙</b>: 공식 API와 누구나 볼 수 있는 공개 페이지만 사용합니다. 로그인이 필요한 곳은
            수집하지 않습니다.
          </div>
        </div>
      </div>
    </Fragment>,

    /* ── 9. 마무리 ── */
    <Fragment key={9}>
      <div className="slide-kicker">마무리</div>
      <h1>정리하면</h1>
      <div className="cols c-64">
        <div>
          <table>
            <thead>
              <tr>
                <th>항목</th>
                <th>내용</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>무엇을</td>
                <td>흩어진 사용자 반응을 자동으로 모아 AI가 분류하고 매일 브리핑으로 알림</td>
              </tr>
              <tr>
                <td>실제 적용</td>
                <td>
                  {hasData
                    ? `${brand} 키워드로 운영 중, 누적 ${stats.total.toLocaleString()}건 수집, 분류`
                    : '설정 후 즉시 운영 가능'}
                </td>
              </tr>
              <tr>
                <td>정량 효과</td>
                <td>
                  {hasData
                    ? `수동 확인 대비 약 ${s.ratio.toFixed(0)}배 단축(가정 기준), 무관 글 ${irrelevantPct}% 자동 제외`
                    : '수집 시작 후 집계'}
                </td>
              </tr>
              <tr>
                <td>AI 비용</td>
                <td>기존 구독 활용 시 추가 비용 0원, 배치, 캐시, 중복 스킵으로 호출 최소화</td>
              </tr>
              <tr>
                <td>확산</td>
                <td>설정 파일 교체만으로 다른 서비스, 팀에 그대로 적용</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="card">
            <div className="card-title">가장 신경 쓴 것</div>
            <p>
              <strong>믿고 쓸 수 있을 것.</strong> 숫자는 코드가 계산하고, 인용에는 원문 링크가 붙고, 어딘가 하나가
              실패해도 브리핑은 나옵니다.
            </p>
          </div>
          <div className="card">
            <div className="card-title">실제 동작 보기</div>
            <p>
              <a href="/tour">둘러보기 →</a> 실제 화면 위에서 기능을 하나씩 짚어 드립니다.
            </p>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            기준일 {localDate()}, 화면과 수치는 실제 운영 데이터에서 생성되었습니다.
          </p>
        </div>
      </div>
    </Fragment>,
  ];

  return (
    <DeckShell
      titles={TITLES}
      slides={slides}
      slideClasses={SLIDE_CLASSES}
      footerLabel={`${brand} 피드백 레이더`}
    />
  );
}
