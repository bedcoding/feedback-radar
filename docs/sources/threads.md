# Threads

> 이 문서는 법률 자문이 아니다.

> **한 줄 요약**: 지금 쓰던 웹 파싱 경로는 **쓰면 안 된다**(robots.txt에 자동 수집 금지가 자연어로 명문화돼 있다).
> 공식 API에 키워드 검색이 있으나 **`threads_keyword_search` 권한을 앱 심사로 승인받기 전에는 본인 글만 검색된다.**
> 붙이려면 ① 법인 비즈니스 인증 → ② 비즈니스 포트폴리오 등록 → ③ 앱 심사, 이 3단계를 먼저 통과해야 하고,
> 코드 쪽에는 **이 저장소에 선례가 없는 60일 회전 토큰 저장·갱신 설계**가 새로 필요하다.

- 실측일: **2026-08-29**
- 관련 문서: [수집 채널 적법성 근거](../data-collection-compliance.md) · [공식 API 전환 계획](../official-api-migration.md)
- 현재 코드: `apps/pipeline/src/collectors/threads.ts` (Playwright DOM 파싱)

---

## 1. 현황

| 항목 | 값 |
|---|---|
| **현재 상태** | **꺼짐.** 운영 설정 `config.sources.threads = false` (2026-08-29 DB 실측). 2026-08-29 결정으로 껐다 → [적법성 문서 10절](../data-collection-compliance.md#10-결정-기록-2026-08-29). 추가로 배포판에서는 브라우저 바이너리가 없어 코드가 강제로 끈다 (`apps/pipeline/src/daily.ts:164`) |
| **적법성 판정** | 🔴 **현행 웹 경로는 명시적 금지 위반** — robots.txt가 자동 수집 금지를 자연어로 못 박고 `Disallow: /`로 전면 차단한다. 공식 API로 옮기면 🟢가 되지만 **권한 승인 전까지는 실질적으로 쓸 수 없다** |
| **비용** | **호출료 0원** (요금 조항 자체가 없다 — 부재 근거). 제약은 돈이 아니라 쿼터다: **사용자 1명당 롤링 24시간 2,200 쿼리**, 우리 사용량은 36 쿼리/일로 **1.6%**. 🔴 **실제 비용은 요금이 아니라 절차와 사람 손이다** — 법인 비즈니스 인증·앱 심사(Meta가 기간을 보장하지 않는다)와 60일 회전 토큰 운영. 그리고 **승인 전에는 0원을 내고 0건을 받는다** → [3절](#3-비용) |
| **연동 난이도** | **상.** 코드가 어려워서가 아니다. ① 외부 승인 3단계가 개발 손 밖에 있고, ② 60일 회전 토큰 저장·갱신 설계가 이 저장소에 **선례가 없으며**, ③ OAuth 리다이렉트용 HTTPS 콜백 주소가 따로 필요하다 |
| **30일 수집량** | **47건** (부정 4건, 심각 1건). 작성일 기준, 2026-08-29 DB 실측 |

### 30일 수집량 상세 (작성일 기준, DB 실측)

| 항목 | 값 |
|---|---|
| 전체 | 47건 |
| 관련 판정 | 14건 |
| 무관 판정 | 33건 (**70%**) |
| 부정 | 4건 |
| 심각 (negative + high/critical) | 1건 |
| 작성일 범위 | 2026-07-30 ~ 2026-08-20 |

### 누적 저장분 (전체 기간)

| 항목 | 값 | 왜 적어 두나 |
|---|---|---|
| 총 건수 | 373건 | |
| 작성일 범위 | 2023-10-11 ~ 2026-08-20 | 현재 경로가 **인기순**이라 3년 전 글까지 끌어온다 |
| 본문 평균 길이 | 57.5자 | 공식 API로 옮겨도 본문 길이 이득은 거의 없다 |
| 본문 최대 길이 | 500자 | 수집기의 `slice(0, 500)` 상한에 닿은 값 |
| `source_id`에 `/media` 꼬리가 붙은 행 | **77건 (20.6%)** | [4-6 함정 ④](#4-6-함정)의 근거. 이 행들은 API 응답과 절대 매칭되지 않는다 |

---

## 2. 적법성 근거

### 2-1. robots.txt 실측

| 항목 | 값 |
|---|---|
| URL | `https://www.threads.com/robots.txt` |
| HTTP 상태 | **200** |
| 실측일 | 2026-08-29 |

**파일 맨 앞에 자연어 고지문이 있다. 원문 그대로:**

```
# Notice: Collection of data on Threads through automated means is
# prohibited unless you have express written permission from Threads
# and may only be conducted for the limited purpose contained in said
# permission.
# All authorized user-agents listed on this page must comply with Meta’s
# Automated Data Collection Terms available at:
# https://www.facebook.com/legal/automated_data_collection_terms
```

**그리고 파일 끝(352번째 줄). 원문 그대로:**

```
User-agent: *
Disallow: /
```

**우리 경로가 걸리는가 — 걸린다.**

| 우리가 요청하던 것 | 판정 |
|---|---|
| `https://www.threads.com/search?q={키워드}&serp_type=default` | ❌ `User-agent: *` → `Disallow: /`에 정면으로 걸린다 |
| 우리 User-Agent가 허용 목록에 있는가 | ❌ 없다. Playwright 기본 브라우저 UA이고, 명명된 크롤러가 아니므로 `*` 규칙이 적용된다 |
| 비로그인이라 괜찮은가 | ❌ 고지문은 접근 방식이 아니라 **"자동화된 수단에 의한 수집"** 자체를 금지한다. 로그인 여부와 무관하다 |

> **robots.txt 중에서도 가장 강한 형태다.** 보통은 경로 패턴만 적는데, 여기는 **"서면 허가 없는 자동 수집 금지"를
> 자연어 문장으로 명문화**하고 그 위에 전면 `Disallow: /`를 얹었다. "기계가 읽는 규칙일 뿐"이라는 해석의 여지가 없다.

### 2-2. 이용약관 — Meta Automated Data Collection Terms

- URL: <https://www.facebook.com/legal/automated_data_collection_terms>
- 2026-08-29 확인. **아래는 해당 조항을 발췌해 원문 그대로 인용한 것이고, 약관 전문 검토가 아니다.**

**자동 수집의 정의:**

```
collection of data from Meta Company Products via the use of automated or
programmatic tools capable of navigating or indexing the surface-layer of
the World Wide Web
```

**핵심 금지 조항:**

```
You will not engage in Automated Data Collection without first obtaining
Meta's express written permission or in any manner that is not explicitly
authorized by Meta.
```

**robots.txt 준수 의무:**

```
You will comply with Meta's robots.txt protocols, page header tags, and
similar opt-out protocols that we implement.
```

**🔴 허용되는 이용 목적 — 이 조항이 이 프로젝트에 중요하다:**

```
The Collected Data shall only be Used for the purpose of (i) providing
results for your Search Engine, or (ii) displaying previews of Meta URLs
to your users
```

**제3자 이전 금지:**

```
transferring, selling, licensing or sublicensing Collected Data and data
derived from Collected Data to any third party, including your subsidiaries
and affiliates
```

> **읽는 법.** 이 약관은 "허가를 받으면 긁어도 된다"는 문이 아니다. 허가받은 자에게도 **용도를 검색엔진 결과
> 제공과 URL 미리보기 두 가지로 못 박는다.** VOC 모니터링은 그 둘 중 어디에도 해당하지 않는다.
> **즉 크롤링 경로는 서면 허가를 받는다 해도 이 도구의 용도로는 열리지 않는다고 읽는 것이 맞다.**
> 남는 길은 크롤링이 아니라 **공식 API**뿐이다.

### 2-3. 개발자 약관 (공식 API 경로에 적용되는 층위)

⚠️ **확인 필요.** 공식 API 경로는 위 자동수집 약관이 아니라 **Meta Platform Terms / Developer Policies**의
적용을 받는데, **이 문서 작성 시점에 그 전문을 확인하지 못했다.** 특히 아래 두 가지는 확인하지 않았다.

| 확인해야 할 것 | 왜 |
|---|---|
| ⚠️ **저장·캐싱 제약 조항이 있는가** | 카카오 운영정책 제5조 20호(캐시 목적 제한 + 최신성 유지 의무)와 같은 조항이 Meta에도 있다면, 이 도구의 `ON CONFLICT ... DO NOTHING` 영구 적재가 걸린다. 같은 함정을 카카오에서 이미 밟았다 → [적법성 문서 4-6](../data-collection-compliance.md#4-6-다음-카페--근거-있음) |
| ⚠️ **수집 데이터의 활용·제3자 전달 범위** | 본문을 LLM에 전달하는 것이 "제3자 전달"에 해당하는지 |

**확인한 척하지 않는다. 이 절의 🟢 판정은 "공식 API라는 정문이 존재한다"는 사실에 대한 것이지,
개발자 약관 전문을 검토한 결과가 아니다.**

### 2-4. 판정과 근거

| 경로 | 판정 | 근거 |
|---|---|---|
| **웹 DOM 파싱** (`threads.com/search`) — 현행 코드 | 🔴 **위반. 써서는 안 된다** | robots.txt 자연어 금지 고지 + `User-agent: * / Disallow: /`. 자동수집 약관의 용도 제한까지 겹쳐 **서면 허가 경로로도 이 용도는 열리지 않는다** |
| **공식 API** (`graph.threads.net/v1.0/keyword_search`) — 승인 후 | 🟢 **적법** (단 2-3 미확인) | Meta가 발급한 토큰으로 호출하는 공식 엔드포인트. robots.txt는 적용 대상이 아니다 |
| **공식 API** — 승인 전 | ⬜ **적법하지만 무의미** | 위반은 아니나 **인증 계정 본인 글만** 검색된다. 모니터링 용도로는 0건과 같다 |

### 2-5. 남은 리스크

**민사 (저작권법 제93조 DB제작자 권리, 부정경쟁방지법)**

| 항목 | 현재 상태 |
|---|---|
| 재게시 | ❌ 안 한다. 외부 미공개다 |
| 원문 대체 | ❌ 안 한다. 모든 인용에 `permalink`를 병기한다 |
| 전수 수집 | ❌ 안 한다. 자사 서비스 언급 키워드만 |
| **본문 저장** | ⚠️ **저장한다.** 현재 500자 상한. 공정이용 판단은 법무 검토 항목이다 (→ [적법성 문서 9절 1번](../data-collection-compliance.md#9-미결-항목-법무-검토-요청)) |
| 판례와의 거리 | 국내 판례(야놀자·잡코리아)는 전부 **경쟁사가 DB를 복제해 자기 서비스에 재게시한** 사안이다. 성격이 다르지만, **그 차이를 유지하는 것이 조건**이다 |

**개인정보**

| 항목 | 현행 웹 경로 | 공식 API로 옮기면 |
|---|---|---|
| 작성자 식별자 | **저장하지 않는다.** `threads.ts`가 `author`를 채우지 않는다 | ⚠️ **응답에 `username`이 온다.** 매핑하는 순간 개인정보 저장이 새로 시작된다 |
| 권고 | — | **`username`을 매핑하지 않는 것이 기본값이어야 한다.** 화면에서 쓰지 않으면 저장하지 않는다 (→ [적법성 문서 7-4](../data-collection-compliance.md#7-4-저장-범위를-최소화한다)) |
| 본문의 외부 전송 | 분류를 위해 LLM에 전달된다 | 동일. LLM 제공자와의 데이터 처리 조건은 미확인 (→ [적법성 문서 9절 7번](../data-collection-compliance.md#9-미결-항목-법무-검토-요청)) |
| 보관 기간 | **무기한** | 동일. 보유기간 정책 미수립 |

---

## 3. 비용

> **한 줄 요약**: 공식 API 호출료는 **0원**이다. 그런데 **승인 전에는 0원을 내고 0건을 받는다.**
> 이 채널에서 실제로 지출되는 것은 요금이 아니라 **외부 승인 절차에 드는 사람 손**과 **60일 회전 토큰 유지**다.
> 상세 근거와 다른 채널과의 비교: [공식 API 비용](../api-costs.md)

### 3-1. 요금 — 0원

**주의: 이 채널에는 금액이 적힌 공식 문장이 존재하지 않는다.** 가격표에 0원이라고 적혀 있는 것이 아니라,
**요금 조항 자체가 없는 것을 확인한 부재 근거**다 ([api-costs.md 1절](../api-costs.md#1-경로별-가격)의 근거 등급 `✅ 원문 확인 (부재 근거)`).

| 항목 | 금액 | 근거 등급 |
|---|---|---|
| `keyword_search` 호출료 | **0원** (요금 조항 없음) | ✅ 원문 확인 (**부재 근거**) |
| 앱 심사 / 비즈니스 인증 | **0원** (요금 조항 없음) | ✅ 원문 확인 (**부재 근거**) |

**대신 공식 문서에 숫자로 적혀 있는 것은 쿼터다. 원문 그대로:**

> 사용자는 연속 24시간 이내에 최대 2,200개의 쿼리를 전송할 수 있습니다. … 이 제한은 여러 앱에 걸쳐 한 사용자에게 적용되며 앱에 따라 구분되지 않습니다.

출처: <https://developers.facebook.com/docs/threads/keyword-search>

### 3-2. 무엇이 대신 제약인가 — 쿼터 (숫자)

| 항목 | 값 |
|---|---|
| 쿼터 | **롤링 24시간당 2,200 쿼리** |
| 적용 단위 | 🔴 **사용자 1명당.** 앱 단위가 아니다 — **계정을 나눠도 늘지 않는다** ([api-costs.md 4절](../api-costs.md#4-돈이-아니라-쿼터가-제약인-곳)) |
| 우리 사용량 | 키워드 9개 × 하루 4회(6시간 주기) = **36 쿼리/일** |
| 소진율 | **1.6%** — 여유가 크다 |
| 0건 쿼리 | **차감되지 않는다** (→ [4-5](#4-5-상한쿼터페이지네이션)) |
| 1회 호출 상한 | `limit` 최대 **100건**. 페이지네이션이 문서화돼 있지 않아 **키워드당 100건이 사실상의 천장**이다 |

> 🔴 **쿼터가 남는다는 것이 "충분히 수집한다"는 뜻은 아니다.** 민감 키워드로 걸리면 HTTP 200에 빈 배열이 오는데,
> **0건 쿼리는 쿼터를 차감하지 않으므로 재시도로도 구별되지 않는다** ([4-6 함정 ②](#4-6-함정)).
> 즉 이 채널에서 한도에 먼저 닿는 것은 쿼터가 아니라 **검색 자체가 막히는 지점**이다.

### 3-3. 진짜 비용 — 절차와 사람 손

**청구서가 없을 뿐, 이 채널에서 가장 비싼 항목이다.** 전부 [4-1](#4-1-사전-준비-사람이-해야-하는-것)·[4-2](#4-2-인증)의 항목이다.

| 항목 | 무엇이 드나 | 개발이 통제 가능한가 |
|---|---|---|
| 법인 비즈니스 인증 | **법무 / 경영지원의 시간.** 법인 실체 증빙 서류를 Meta에 제출해야 하고 개발자가 낼 수 없다 | ❌ |
| 비즈니스 포트폴리오 등록 | 포트폴리오 관리자 권한자의 손 | ❌ |
| 앱 심사 (`threads_keyword_search`) | 권한별 용도 설명·화면 녹화 제작 + **대기 시간.** 🔴 **Meta가 처리 기간을 보장하지 않는다** | ❌ |
| 운영 계정 확보 | 토큰이 계정에 묶인다. **퇴사·계정 변경 시 토큰이 통째로 죽고 절차를 다시 밟는다** | 운영 담당자 |
| HTTPS 콜백 주소 | OAuth `redirect_uri`용. **이 저장소에 지금 없다** | ✅ |
| 60일 회전 토큰 운영 | **이 저장소에 선례가 없는 새 설계**(저장·갱신·만료 경고). 만료되면 갱신조차 불가해 **사람이 OAuth를 처음부터 다시 밟는다.** 배포판은 읽기 전용이라 **갱신이 로컬/스케줄러 실행에만 얹힌다** | ✅ (다만 유지보수가 계속 든다) |

> **읽는 법.** [api-costs.md 6절](../api-costs.md#6-의사결정-요약)의 결론이 이 채널에 그대로 걸린다 —
> Threads의 비용은 0원이고 **실제 장벽은 "비즈니스 인증 + 앱 심사"다.**
> 그러니 이 채널의 일정을 결정하는 것은 예산이 아니라 **절차를 언제 걸었느냐**다 ([4-1의 0단계 메모](#4-1-사전-준비-사람이-해야-하는-것)).

### 3-4. 승인 전 — "무료지만 쓸 수 없다"

**요금이 0원이라는 사실이 이 채널을 지금 쓸 수 있다는 뜻이 아니다.**

| | 승인 전 | 승인 후 |
|---|---|---|
| 지출 | **0원** | **0원** |
| 산출 | 🔴 **사실상 0건** — 검색이 인증 계정 본인 글로 축소된다 | 정상 수집 (30일 40~55건 예상, [5-2](#5-2-정상-기준선-실측값)) |
| 판정 | ⬜ **적법하지만 무의미** ([2-4](#2-4-판정과-근거)) | 🟢 |

승인 전 호출은 **앱 심사의 선행조건(권한마다 성공한 호출 1회)을 만들기 위한 1회 외에는 값이 없다**
([4-1의 순환 조건](#4-1-사전-준비-사람이-해야-하는-것)). 그 1회조차 쿼터·요금이 아니라 **심사 절차의 일부로 드는 손**이다.

### 3-5. 현행 웹 파싱 경로 — 비용을 계산할 대상이 아니다

**이 경로는 싸고 비싸고의 문제가 아니라 금지다** ([2절](#2-적법성-근거)).
robots.txt의 자연어 금지 고지와 자동수집 약관의 용도 제한이 겹쳐, **서면 허가를 받아도 이 도구의 용도로는 열리지 않는다.**

참고로 이 경로에 드는 것은 API 요금이 아니라 다음이다. **다만 이 값이 아무리 싸도 판단을 바꾸지 않는다.**

| 항목 | 내용 |
|---|---|
| 브라우저 구동 자원 | Playwright/Chromium을 띄운다. 배포판에는 바이너리가 없어 **코드가 강제로 끈다** (`apps/pipeline/src/daily.ts:164`) |
| 사람 손이 드는 유지보수 | DOM 셀렉터가 바뀔 때마다 수집기를 고쳐야 한다. `source_id`의 `/media` 꼬리처럼 **과거 저장분이 오염된 채로 남는다**(373건 중 77건, [4-6 함정 ④](#4-6-함정)) |
| 차단 리스크 | `Disallow: /` 대상이므로 차단·차단 우회 어느 쪽도 정당화되지 않는다 |

### 3-6. ⚠️ 확인 필요 (추측하지 않는다)

| # | 항목 | 왜 남겨 두나 |
|---|---|---|
| 1 | **Meta 개발자 계정 등록비 유무** | [api-costs.md](../api-costs.md)가 다루는 Meta 항목은 `keyword_search` 호출료와 앱 심사/비즈니스 인증 두 가지뿐이다. **개발자 계정 등록 자체에 비용이 있는지는 확인하지 않았다** (Apple 99 USD/년, Google $25 같은 항목이 Meta에 있는지 불명) |
| 2 | **앱 심사 리드타임** | Meta가 기간을 보장하지 않는다. **일정 비용을 숫자로 산정할 수 없다** |
| 3 | **수집분의 LLM 분류 비용** | `api-costs.md`는 **수집 API 요금만** 다룬다. 본문이 분류를 위해 LLM에 전달되는데([2-5](#2-5-남은-리스크)), 그 단가는 이 문서에도 비용 문서에도 없다 |
| 4 | **개발자 약관 층위의 비용·저장 제약** | Meta Platform Terms / Developer Policies 전문 미확인 ([2-3](#2-3-개발자-약관-공식-api-경로에-적용되는-층위)). 카카오처럼 **캐싱 제한 조항이 있으면 저장 설계가 바뀌고 그것이 비용이 된다** |

**→ 다른 채널과 비교한 전체 비용 정리는 [../api-costs.md](../api-costs.md)에 있다.**
확인하지 못한 항목의 전체 목록은 [api-costs.md 5절](../api-costs.md#5-확인하지-못한-것) 참고.

---

## 4. 연동 방법

### 4-1. 사전 준비 (사람이 해야 하는 것)

**핵심: 개발자 혼자 끝낼 수 없다. 3단계 외부 승인이 앞에 있고, Meta가 처리 기간을 보장하지 않는다.**

| # | 단계 | 무엇을 하나 | 누가 필요한가 | 개발이 통제 가능한가 |
|---|---|---|---|---|
| 0 | **Meta 개발자 계정** | 개발자 등록 | 개발자 | ✅ |
| 1 | **Threads 앱 생성** | 앱 만들기에서 **Threads 유스케이스**를 골라 앱 생성. 앱 ID / 앱 시크릿을 받는다 | 개발자 | ✅ |
| 2 | 🔴 **법인 비즈니스 인증 (Business Verification)** | 법인 실체 증빙(사업자등록증 등)을 Meta에 제출해 인증받는다. **고급 액세스(Advanced Access)를 요청하는 모든 앱의 필수 조건이다** | **법무 / 경영지원** — 법인 서류와 대표 정보가 필요하다. 개발자가 낼 수 없다 | ❌ |
| 3 | 🔴 **비즈니스 포트폴리오 등록** | 인증된 비즈니스에 앱을 연결한다 | 비즈니스 포트폴리오 관리자 권한자 | ❌ |
| 4 | 🔴 **앱 심사 (App Review)** — `threads_keyword_search` | 권한별로 용도 설명·화면 녹화를 제출하고 심사받는다. **앱이 게시(published) 상태여야 하고, 요청하는 권한마다 성공한 API 호출이 최소 1회 기록돼 있어야 한다** | 개발자 + 승인 담당자 | ❌ **Meta가 기간을 보장하지 않는다** |
| 5 | **인증할 Threads 계정 결정** | 토큰이 그 계정에 묶인다. 개인 계정이 아니라 **운영 계정**이어야 한다 (퇴사·계정 변경 시 토큰이 통째로 죽는다) | 운영 담당자 | ✅ |
| 6 | **HTTPS 콜백 주소 확보** | OAuth `redirect_uri`용. **이 저장소에는 지금 그런 주소가 없다** | 개발자 | ✅ |

> ⚠️ **4번의 순환 조건에 주의.** "권한마다 성공한 API 호출이 최소 1회 필요"인데, 승인 전 호출은
> **본인 글만** 검색한다. 즉 **승인 전에 인증 계정으로 한 번 호출해 두는 것이 심사의 선행조건**이다.
> 승인 나기를 기다렸다가 처음 호출하면 심사가 통과되지 않는다.

> 💡 **0단계는 지금 당장 걸어 둔다.** 리드타임이 개발 손 밖에 있어, 늦게 시작할수록 다른 작업 순서와
> 무관하게 밀린다 (→ [전환 계획 5절](../official-api-migration.md#5-도입-순서)).

### 4-2. 인증

**3단계 OAuth다. 토큰이 회전한다는 점이 이 저장소의 다른 모든 키와 다르다.**

#### ① 인가 창 (사람이 브라우저에서 1회)

```
https://threads.net/oauth/authorize
  ?client_id=<THREADS_APP_ID>
  &redirect_uri=<REDIRECT_URI>
  &scope=<SCOPE>
  &response_type=code
  &state=<STATE>
```

| 파라미터 | 필수 | 값 |
|---|---|---|
| `client_id` | ✅ | Threads 앱 ID (숫자 문자열) |
| `redirect_uri` | ✅ | 인가 후 돌아올 주소. 앱 설정에 등록된 것과 정확히 같아야 한다 |
| `response_type` | ✅ | `code` 고정 |
| `scope` | ✅ | 쉼표 구분 또는 URL 인코딩된 공백 구분 목록. `threads_basic`은 필수 |
| `state` | 권장 | CSRF 방지용 임의 문자열 |

⚠️ **확인 필요**: 공식 문서의 scope 목록에는 `threads_basic`, `threads_content_publish`, `threads_read_replies`,
`threads_manage_replies`, `threads_manage_insights`만 나열돼 있고 **`threads_keyword_search`가 그 목록에 없다.**
키워드 검색 문서는 이 권한이 필수라고 명시한다. **인가 창의 `scope`에 `threads_basic,threads_keyword_search`로
함께 넣어야 하는지 실제 인가 요청으로 확인할 것.** 빠뜨리면 토큰은 정상 발급되는데 검색만 축소된다.

리다이렉트로 돌아오는 `code`는 **1시간 유효**하다.

#### ② 인가 코드 → 단기 토큰

```
POST https://graph.threads.net/oauth/access_token
```

| 파라미터 | 값 |
|---|---|
| `client_id` | Threads 앱 ID |
| `client_secret` | Threads 앱 시크릿 |
| `code` | ①에서 받은 인가 코드 |
| `grant_type` | `authorization_code` 고정 |
| `redirect_uri` | ①과 **동일한** 값 |

⚠️ **확인 필요**: 단기 토큰의 정확한 수명이 공식 문서에 명시돼 있지 않다(인가 코드가 1시간이라는 것만 명시).
③을 **즉시** 이어서 실행하는 것을 전제로 구현한다.

#### ③ 단기 토큰 → 장기 토큰 (60일)

```
GET https://graph.threads.net/access_token
  ?grant_type=th_exchange_token
  &client_secret=<THREADS_APP_SECRET>
  &access_token=<SHORT_LIVED_TOKEN>
```

#### ④ 장기 토큰 갱신

```
GET https://graph.threads.net/refresh_access_token
  ?grant_type=th_refresh_token
  &access_token=<LONG_LIVED_TOKEN>
```

#### 토큰 수명 — 원문 인용

```
valid for 60 days and can be refreshed as long as they are at least 24 hours old
```

```
Tokens that have not been refreshed in 60 days will expire and can no longer be refreshed.
```

| 규칙 | 값 |
|---|---|
| 장기 토큰 수명 | **60일** |
| 갱신 가능 조건 | 발급 후 **24시간 이상** 경과 |
| 갱신 후 수명 | 갱신 시점부터 다시 **60일** |
| 🔴 만료 후 | **갱신 불가.** 사람이 ①부터 다시 밟아야 한다 |
| 참고 | 비공개 프로필 사용자가 부여한 권한은 90일 |

#### API 호출 시 토큰 전달

공식 문서 예시는 **쿼리 파라미터 `access_token`**을 쓴다.

```
...&access_token=<LONG_LIVED_TOKEN>
```

⚠️ **확인 필요**: `Authorization: Bearer <token>` 헤더도 받는지는 확인하지 못했다.
**헤더 방식이 되면 그쪽을 쓴다** — 쿼리 문자열에 자격증명을 넣으면 로그와 에러 메시지에 그대로 찍힌다.
확인 전까지는 로그에 URL을 통째로 찍지 않도록 주의한다.

#### 🔴 토큰 저장 설계 — 이 저장소에 선례가 없다

**이 저장소의 자격증명은 전부 정적 환경변수다.** 실측(2026-08-29)한 전체 목록:

```
ANTHROPIC_API_KEY  OPENAI_API_KEY  NAVER_CLIENT_ID  NAVER_CLIENT_SECRET
X_BEARER_TOKEN  DATABASE_URL  CLAUDE_CLI_CMD  ...
```

**하나도 회전하지 않는다.** 그래서 아래가 전부 새 설계다.

| 문제 | 왜 기존 방식이 안 되나 | 필요한 것 |
|---|---|---|
| 갱신한 토큰을 어디에 쓰나 | 환경변수는 프로세스가 다시 쓸 수 없다 | `settings` 표에 저장 (`CONFIG_KEY` 옆에 새 키). `store.setSetting()` |
| 무엇을 함께 저장하나 | 만료일을 모르면 갱신 시점을 판단할 수 없다 | **토큰 + 발급/갱신 시각**을 같이 저장 |
| 언제 갱신하나 | 24시간 미만이면 갱신 요청이 거부된다 | 수집 실행 시작 시 "발급 후 24시간 경과 && 만료까지 N일 미만"이면 갱신 |
| 🔴 **배포판에서 갱신이 안 된다** | `isReadOnlyMode()`가 참이면 `setSetting()`이 **예외를 던진다** (`store.ts:88`, `writable()`). 배포판은 `VERCEL=1`로 항상 읽기 전용이다 | **갱신은 로컬/스케줄러 실행에서만 한다.** 배포판은 저장된 토큰을 읽기만 한다. 이 전제를 코드 주석에 못 박을 것 |
| 60일 이상 파이프라인이 멈추면 | 토큰이 만료되고 **갱신도 불가**해진다 | **만료 임박 경고**가 필요하다. 없으면 어느 날 조용히 0건이 된다 |

### 4-3. 엔드포인트와 요청

```
GET https://graph.threads.net/v1.0/keyword_search
```

> 참고: 문서상 `graph.threads.com`과 `graph.threads.net` 양쪽으로 접근 가능하다.
> **하나를 골라 고정한다.** 섞어 쓰면 저장된 URL 호스트가 갈린다.

| 파라미터 | 필수 | 기본값 | 값 | 우리는 |
|---|---|---|---|---|
| `q` | ✅ | — | 검색할 키워드 | 설정의 키워드 |
| `access_token` | ✅ | — | 장기 토큰 | 4-2 참고 |
| `search_type` | | **`TOP`** | `TOP` \| `RECENT` | 🔴 **`RECENT`를 명시한다.** 기본값 `TOP`은 3년 전 인기 글을 끌어온다 ([4-6 함정 ⑤](#4-6-함정)) |
| `search_mode` | | `KEYWORD` | `KEYWORD` \| `TAG` | 기본값 그대로 |
| `media_type` | | (전체) | `TEXT` \| `IMAGE` \| `VIDEO` | **지정하지 않는다.** 지정하면 나머지가 조용히 빠진다 |
| `since` | | — | Unix 타임스탬프 또는 파싱 가능한 날짜 | 증분 수집에 쓸 수 있다 |
| `until` | | — | 위와 동일 | |
| `limit` | | **25** | 최대 **100** | 설정의 `threadsPosts` (기본 30, 최대 100) |
| `author_username` | | — | `@` 없는 정확한 사용자명 | 쓰지 않는다 |
| `fields` | | ⚠️ | 반환받을 필드 목록 | 🔴 **반드시 명시한다** — 아래 참고 |

**`fields` 원문:**

```
See the Media documentation for a list of available fields.
Note: The owner field is excluded and will not be returned.
```

⚠️ **확인 필요이자 최우선 검증 항목**: Graph API 계열은 관례적으로 `fields`를 생략하면 `id`만 돌려준다.
그러면 **오류 없이 본문이 통째로 비어 들어온다.** 첫 호출에서 `fields`를 빼고 한 번, 넣고 한 번 실행해
응답을 비교할 것.

**예시 요청:**

```bash
curl -sG "https://graph.threads.net/v1.0/keyword_search" \
  --data-urlencode "q=검색키워드" \
  --data-urlencode "search_type=RECENT" \
  --data-urlencode "fields=id,text,timestamp,permalink,username,media_type,is_quote_post,is_reply,has_replies" \
  --data-urlencode "limit=30" \
  --data-urlencode "access_token=$THREADS_TOKEN"
```

### 4-4. 응답 → RawItem 매핑

`RawItem` 정의: `packages/core/src/types.ts`

| RawItem 필드 | 이 API의 응답 필드 | 비고 |
|---|---|---|
| `source` | — | 고정값 `'threads'`. `SOURCE_KEYS`에 이미 있다 (`packages/core/src/collect-limits.ts`) |
| `sourceId` | **`id`** | 🔴 **현재 저장분은 permalink URL이다.** 체계가 완전히 다르다 → 중복 판정이 끊긴다 ([4-6 함정 ④](#4-6-함정)) |
| `url` | **`permalink`** | 현재는 `https://www.threads.com/@user/post/ID` 형태를 직접 조립했다. 응답 값을 그대로 쓴다 |
| `author` | `username` | ⚠️ **매핑하지 않는 것을 기본값으로 권고한다.** 현행 웹 경로도 저장하지 않고, 화면에서 쓰지 않는다 → [2-5 개인정보](#2-5-남은-리스크) |
| `content` | **`text`** | 웹 파싱과 달리 **본문만** 온다. 참여 수·UI 문자열·계정명이 섞이지 않는다. **품질 개선이지 길이 이득이 아니다** (기존 평균 57.5자) |
| `rating` | — | ❌ **못 채운다.** 별점 개념이 없다. 앱 리뷰 전용 필드다 |
| `postedAt` | **`timestamp`** | `normalizeInstant()`를 반드시 통과시킨다 (`packages/core/src/time.ts`). 안 그러면 UTC/로컬이 섞여 다른 소스와 사전순 비교가 어긋난다 |
| `keyword` | — | ❌ **응답에 없다.** 요청에 보낸 `q`를 호출부에서 채운다 |
| `service` | — | ❌ **응답에 없다.** 호출부의 `svc.name`을 넣는다 |
| `country` | — | ❌ **채우지 않는다.** 스토어 국가 개념이 없는 채널이다. `types.ts` 주석대로 비워 둔다 |

**쓰지 않는 응답 필드:** `media_type`, `has_replies`, `is_quote_post`, `is_reply`.
다만 `is_reply`는 **노이즈 필터로 쓸 여지가 있다**(답글은 맥락이 잘려 무관 판정이 많다).
현재 30일 무관율이 70%(33/47)라 검토할 가치가 있다.

### 4-5. 상한·쿼터·페이지네이션

| 항목 | 값 | 출처 |
|---|---|---|
| `limit` 기본값 | **25** | 공식 문서 |
| `limit` 최댓값 | **100** | 공식 문서 (`only non-negative numbers are allowed`) |
| 쿼터 | **롤링 24시간당 2,200 쿼리** (사용자 단위) | 공식 문서 |
| **0건 쿼리는 차감되지 않는다** | 원문: `Queries which return no results do not count against this limit for the user.` | 공식 문서 |
| 우리 설정 상한 | `threadsPosts` — 기본 30, 최소 10, **최대 100** | `packages/core/src/collect-limits.ts:112` |

**쿼터 여유 계산:** 키워드 9개 × 하루 4회(6시간 주기) = **36 쿼리/일**. 2,200 대비 1.6%다. **여유가 크다.**

**🔴 페이지네이션 — 문서화돼 있지 않다.**

키워드 검색 문서에 커서(`paging.next`, `after`, `before`)에 관한 설명이 **없다.** `limit`만 있다.

| 결론 | 뜻 |
|---|---|
| **키워드당 1회 호출 = 최대 100건이 사실상의 천장이다** | `threadsPosts` 최댓값 100이 API 상한과 우연히 일치한다. 설정을 100으로 올려도 그 이상은 못 받는다 |
| ⚠️ **확인 필요** | 응답에 `paging` 객체가 실제로 오는지 첫 호출에서 확인할 것. 오면 커서 루프를 붙일 수 있다. **오지 않으면 100건 천장을 문서에 명시하고 끝낸다** |

### 4-6. 함정

**조용히 실패하는 지점만 모았다. 아래는 전부 예외를 던지지 않고, 화면에는 "0건" 또는 "정상"으로 보인다.**

#### ① 🔴 미승인 상태를 API 응답만으로 판별하지 못할 가능성이 높다

**공식 문서 원문:**

```
If your app has not been approved for the `threads_keyword_search` permission,
the search will be performed only on posts owned by the authenticated user.
```

**오류가 아니다.** 미승인 앱도 **HTTP 200에 정상 형태의 응답**을 받는다. 다만 검색 범위가 인증 계정 본인 글로
축소될 뿐이다. 자사 운영 계정이 자사 서비스 키워드로 글을 쓸 일이 거의 없으므로, **결과는 빈 배열이 된다.**

| 화면에 보이는 것 | 실제 원인 후보 |
|---|---|
| Threads 0건 | (a) 승인이 안 났다 (b) 민감 키워드로 걸렸다 (c) 정말 언급이 없다 (d) `fields`를 빠뜨렸다 |

**→ 대책: 승인 여부를 API에 묻지 말고 설정값으로 사람이 표시하게 둔다.**
`config`에 `threadsApproved: boolean` 같은 값을 두고, **거짓이면 아예 호출하지 않고 그 사유를
수집 태스크의 `note`에 남긴다** (`CollectTask.note` — "왜 0건인지를 화면에서 알 수 있어야 한다").
승인 전에 그냥 켜 두면 화면의 0건이 어느 원인인지 아무도 모른다.

#### ② 🔴 민감 키워드에 빈 배열이 온다 — 영구 제약

**공식 문서 원문:**

```
The API will return an empty array for any requests that include keywords
that we have deemed sensitive or offensive.
```

| 특징 | 내용 |
|---|---|
| 오류인가 | ❌ **아니다.** HTTP 200에 빈 배열이다 |
| 어떤 키워드가 걸리는지 알 수 있나 | ❌ **목록이 공개돼 있지 않다** |
| 승인 후 풀리나 | ❌ **풀리지 않는다. 승인과 무관한 영구 제약이다** |
| 왜 하필 이 도구에 나쁜가 | 🔴 **이 도구의 용도가 불만·사건 모니터링이다.** 사건이 터졌을 때 그 사건 키워드가 "민감"으로 분류되면, **가장 필요한 순간에 정확히 0건이 온다** |

**→ 대책:** 0건이 반복되는 키워드를 로그로 남겨 사람이 알아채게 한다.
0건 쿼리는 쿼터를 차감하지 않으므로 **재시도로는 절대 구별되지 않는다.**
이 구멍은 코드로 메울 수 없다. **문서에 남기고, 다른 채널로 보완할 수 있는지 판단하는 것이 유일한 대응이다.**

#### ③ 🔴 60일 회전 토큰 — 이 저장소에 선례가 없다

[4-2](#4-2-인증)에 설계를 적었다. 조용히 실패하는 지점만 다시 짚으면:

| 지점 | 증상 |
|---|---|
| 배포판에서 갱신 시도 | `setSetting()`이 `store.ts:88`에서 **예외를 던진다**. 읽기 전용이기 때문이다 |
| 파이프라인이 60일 이상 멈춤 | 토큰 만료 + **갱신 불가**. 사람이 OAuth를 처음부터 다시 밟아야 한다 |
| 만료 후 첫 호출 | 401. 이 수집기가 예외를 삼키는 구조라면 **"실험적 소스 실패" 한 줄 남기고 0건**이 된다 |
| 갱신을 24시간 이내에 시도 | 거부된다. 발급 직후 실행에서 갱신 로직이 도는 설계면 매번 실패 로그가 쌓인다 |

**→ 만료 임박 경고가 필수다.** 저장된 발급 시각으로 남은 일수를 계산해 화면과 로그에 띄운다.

#### ④ 식별자 체계가 바뀌어 중복 판정이 끊긴다

| | 현재 (웹 파싱) | 공식 API |
|---|---|---|
| `sourceId` | `https://www.threads.com/@user/post/ABC` | `ABC...` (숫자/문자 ID) |
| 호스트 | `www.threads.com` | `permalink`가 다른 호스트일 수 있다 |

**DB 실측(2026-08-29):** 저장된 373건 중 **77건(20.6%)**의 `source_id`에 `/media` 꼬리가 붙어 있다.
꼬리를 떼는 정규식이 들어오기 전에 저장된 행이다. 이 행들은 **어떤 정규화를 해도 API 응답과 매칭되지 않는다.**

`store.ts`의 저장은 `ON CONFLICT (source, source_id) DO NOTHING`이므로, **체계가 바뀌면 같은 글이
새 행으로 다시 들어온다.** 건수가 부풀고 분류 비용이 다시 나간다.

**→ 교체 전에 셋 중 하나를 정한다:** 재적재 감수 / 1회 정규화 마이그레이션 / 새 계열로 시작.
`RECENT` 정렬로 가면 최신 것만 오므로 **재적재는 수십 건 수준**이다.

#### ⑤ `search_type` 기본값 `TOP`이 오래된 인기 글을 끌어온다

현재 웹 경로도 인기 성격 정렬이라 **3년 전 글까지 들어온다**(DB 실측: 작성일 최소 2023-10-11).
그래서 "30일 수집 265건 vs 30일 작성 47건"의 괴리가 생겼다.

`search_type`을 안 넣으면 **`TOP`이 기본**이라 같은 문제가 그대로 반복된다.

**→ `RECENT`를 명시한다.** 대신 **저장 건수는 47 수준으로 수렴한다.**
이것을 "손실"로 적으면 안 된다. **모니터링에 필요한 것이 그 47건이다.**

#### ⑥ 함수 시그니처 인자 순서가 조용히 어긋난다

현행 호출부 (`apps/pipeline/src/daily.ts:381`):

```
collectThreads(browser, svc.keywords, svc.name, limits.threadsPosts)
```

API판에서 `browser`가 사라지므로 시그니처를 새로 잡아야 하는데, **`(keywords, limit, service?)`로 잡으면
기존 호출 순서와 어긋나 `limit` 자리에 서비스명 문자열이, `service` 자리에 숫자가 들어간다.**
TypeScript가 잡아 줄 수도 있지만 `string | number` 완화가 하나라도 끼면 **런타임까지 조용히 간다.**

**→ 기존 순서를 유지한다: `(keywords, service?, limit?)`. 호출부도 같이 고친다.**

#### ⑦ 도배 제거 함수의 반환 형태

`dropFlooding()`은 **배열이 아니라 `{ kept, dropped }` 객체를 반환한다** (`x.ts` 참고).
배열로 받으면 `.length`가 `undefined`가 되어 저장이 0건이 된다.

#### ⑧ 브라우저 분기를 같이 정리하지 않으면 두 가지가 남는다

| 위치 | 현재 | 해야 할 일 |
|---|---|---|
| `daily.ts:349` | `needBrowser = ... (sources.dcinside \|\| sources.threads \|\| ...)` | **`sources.threads`를 뺀다.** 안 빼면 Threads만 켠 실행에서 Chromium을 쓸데없이 띄운다 |
| `daily.ts:164` | 배포판에서 `sources.threads = false` 강제 | **이 줄을 지운다.** 안 지우면 배포판에서 API 경로가 영원히 안 돈다 |
| `daily.ts:360` | `import('./collectors/threads.js')`가 브라우저 블록 안에 있다 | 브라우저 밖으로 꺼내 다른 API 수집기와 같은 자리에 둔다 |

#### ⑨ 본문 길이 정책

현재 수집기는 `slice(0, 500)`으로 자른다. API는 본문 전문을 준다.
**상한을 그대로 두면 긴 글이 잘리고, 없애면 저장 범위가 늘어난다** ([2-5](#2-5-남은-리스크)의 공정이용 항목과 연결된다).
**의식적으로 결정하고 주석에 남긴다.** 참고로 기존 373건의 평균은 57.5자라 실질 영향은 작다.

---

## 5. 붙인 뒤 확인할 것

**"오류가 없다"는 이 소스에서 아무것도 증명하지 못한다.** 미승인·민감 키워드·`fields` 누락이 전부
HTTP 200이기 때문이다. 아래를 순서대로 확인한다.

### 5-1. 승인이 실제로 났는지 (가장 중요)

**판별 방법: 인증 계정이 아닌 사람의 글이 들어오는지 본다.**

```sql
SELECT COUNT(DISTINCT author) AS writers, COUNT(*) AS total
FROM items
WHERE source = 'threads' AND collected_at >= '<이번 실행 시각>';
```

| 결과 | 판정 |
|---|---|
| `writers >= 2` (인증 계정 외 사용자 포함) | ✅ **승인이 났다** |
| `writers <= 1`이고 그게 인증 계정 | 🔴 **미승인 상태다.** 검색이 본인 글로 축소돼 있다 |
| 0건 | ①②④ 중 하나. 5-3으로 |

> `author`를 저장하지 않기로 했다면(권고안), **이 검증만 임시로 `username`을 로그에 찍어 확인하고
> 확인 후 걷어낸다.** DB에 남기지 않는다.

### 5-2. 정상 기준선 (실측값)

**공식 API + `RECENT`로 전환하면 30일 작성 기준 47건 수준으로 수렴해야 한다.**

| 지표 | 기대값 (30일, 작성일 기준) | 근거 |
|---|---|---|
| 총 건수 | **40~55건** | 2026-08-29 DB 실측 47건 |
| 관련 판정 | 12~18건 | 실측 14건 |
| 부정 | 3~6건 | 실측 4건 |
| 심각 (high/critical) | 0~2건 | 실측 1건 |
| 작성일 최댓값 | **실행일 기준 최근 며칠 이내** | `RECENT` 정렬이면 오늘~며칠 전이 최신이어야 한다 |
| 🔴 작성일 최솟값 | **1년 이상 과거가 섞이면 `search_type`이 안 먹은 것이다** | 실측 누적 최솟값 2023-10-11 |

```sql
SELECT COUNT(*) AS total,
       MIN(SUBSTRING(posted_at,1,10)) AS oldest,
       MAX(SUBSTRING(posted_at,1,10)) AS newest,
       AVG(LENGTH(content))::numeric(10,1) AS avg_len
FROM items
WHERE source = 'threads'
  AND SUBSTRING(posted_at,1,10) >= TO_CHAR(NOW() - INTERVAL '30 days','YYYY-MM-DD');
```

### 5-3. 0건일 때 원인을 가르는 법

**반드시 이 순서로 확인한다. 위에서 걸리면 아래는 보지 않는다.**

| # | 확인 | 방법 | 0건의 뜻 |
|---|---|---|---|
| 1 | 토큰이 살아 있나 | HTTP 상태가 401/190인가 | 토큰 만료 → OAuth 재수행 |
| 2 | `fields`를 보냈나 | 응답 JSON에 `text` 키가 있는가 | 없으면 `fields` 누락. **본문이 통째로 빈다** ([4-3의 `fields` 경고](#4-3-엔드포인트와-요청)) |
| 3 | 승인이 났나 | 5-1 | 미승인 |
| 4 | 민감 키워드인가 | **키워드 하나씩 따로 호출**해 어느 것이 빈 배열인지 특정 | 그 키워드는 영구 미검색 ([4-6 함정 ②](#4-6-함정)) |
| 5 | 정말 언급이 없나 | 사람이 브라우저로 같은 키워드를 검색해 본다 | 정상 |

### 5-4. 중복 판정이 끊겼는지

교체 직후 첫 실행에서 **저장 건수가 평소보다 크게 튀면** 식별자 체계가 갈린 것이다 ([4-6 함정 ④](#4-6-함정)).

```sql
SELECT COUNT(*) FILTER (WHERE source_id LIKE 'http%') AS old_url_style,
       COUNT(*) FILTER (WHERE source_id NOT LIKE 'http%') AS new_id_style
FROM items WHERE source = 'threads';
```

두 값이 **모두 0보다 크면 두 체계가 공존하는 것이고, 같은 글이 두 번 들어 있을 수 있다.**
실측 기준선: 교체 전에는 `old_url_style = 373`, `new_id_style = 0`이었다.

### 5-5. 토큰 만료일

수집 실행마다 로그에 **남은 일수**가 찍혀야 한다. 안 찍히면 만료 임박 경고가 구현되지 않은 것이다.
60일이 지나면 **갱신조차 불가능**하다 ([4-2](#4-2-인증)).

---

## 6. 출처

**robots.txt · 약관**

- <https://www.threads.com/robots.txt> (2026-08-29 실측, HTTP 200)
- <https://www.facebook.com/legal/automated_data_collection_terms> (Meta Automated Data Collection Terms)

**공식 API 문서**

- <https://developers.facebook.com/docs/threads/keyword-search/> — 키워드 검색 엔드포인트, 파라미터, 쿼터, 미승인 동작, 민감 키워드
- <https://developers.facebook.com/docs/threads/get-started> — 앱 설정, 권한, 앱 심사
- <https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions> — 인가 창, 토큰 교환
- <https://developers.facebook.com/docs/threads/get-started/long-lived-tokens> — 장기 토큰 발급·갱신, 60일 수명
- <https://developers.facebook.com/docs/threads/overview> — 베이스 URL, 엔드포인트별 한도
- <https://developers.facebook.com/docs/permissions/> — 권한 레퍼런스
- <https://developers.facebook.com/docs/development/create-an-app/threads-use-case/> — Threads 유스케이스 앱 생성

**저장소 내부 문서**

- [수집 채널 적법성 근거](../data-collection-compliance.md) — 4-3절이 이 채널의 판정
- [공식 API 전환 계획](../official-api-migration.md) — 2-2절이 이 채널의 전환 조사

**⚠️ 아직 확인하지 못한 출처**

- Meta Platform Terms / Developer Policies — **개발자 약관 층위 전문 미확인** ([2-3](#2-3-개발자-약관-공식-api-경로에-적용되는-층위))
