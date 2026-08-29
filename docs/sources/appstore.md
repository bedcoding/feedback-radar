# 앱스토어 리뷰

> 이 문서는 법률 자문이 아니다.

> **한 줄 요약**: 지금 쓰는 iTunes RSS는 Apple이 robots.txt로 막아 둔 경로다(그래서 꺼져 있다).
> App Store Connect API로 옮기면 적법해지고 수집량도 늘어난다. 붙이려면 **판매자 계정마다에서 각각
> API 키(.p8)를 받고**(.p8은 1회만 내려받을 수 있다) **ES256 JWT 서명 코드**를 새로 써야 한다.
> 새 의존성은 필요 없지만(`node:crypto`만으로 된다) **고칠 파일은 5개**다.
> **호출료는 0원**이고 제약은 돈이 아니라 쿼터다 → [3절](#3-비용).

- **실측일: 2026-08-29** (이 문서의 robots.txt·API 스펙·DB 숫자는 모두 이 날 직접 확인한 값이다)
- 현재 코드: [../../apps/pipeline/src/collectors/appstore.ts](../../apps/pipeline/src/collectors/appstore.ts)
- 짝 문서: [../data-collection-compliance.md](../data-collection-compliance.md) (판정) /
  [../official-api-migration.md](../official-api-migration.md) (전환 계획)

---

## 1. 현황

| 항목 | 값 |
|---|---|
| 현재 상태 | **꺼짐.** 2026-08-29 결정으로 운영 설정의 `sources.appstore`를 `false`로 박았다. 이유는 아래 적법성 판정 |
| 적법성 판정 | 🟠 **지금 경로(iTunes RSS)는 robots.txt 위반.** `Disallow: /*/rss/*`가 우리 URL에 정확히 걸린다<br>🟢 **전환 후(App Store Connect API)는 적법.** 인증 API라 robots.txt 층위가 적용 대상이 아니고, 개발자 약관이 명시적으로 허용하는 "Apple이 제공하는 데이터"에 해당한다 |
| 비용 | **호출료 0원.** 추가 지출이 없다(연회비 99 USD/년은 앱을 서비스하는 이상 어차피 내는 돈이다). 돈 대신 **API 키당 롤링 1시간 요청 수**가 제약이다 → [3절](#3-비용) |
| 연동 난이도 | **중.** 새 의존성은 없지만 **고칠 파일이 5개**(+ 조건부 1개)다 — ① `apps/pipeline/src/collectors/appstore.ts`(교체 + `APPSTORE_CUTOVER` 상수) ② `packages/core/src/appstore-jwt.ts`(신설) ③ `packages/core/src/collect-limits.ts`(1쪽 건수·기본값·최대값 + 배포판 기본값) ④ `apps/pipeline/src/daily.ts`(호출부·국가 루프 + 작업 `note` 전달) ⑤ `packages/core/src/paths.ts`(설정 타입 + alpha-3 변환표), 그리고 국가 루프를 지우는 경우에만 ⑥ `apps/web/app/page.tsx`(총량 추산). 한 파일에서 손댈 자리가 여럿이라 [4-2의 표](#설정과-시그니처)는 9행이지만 **파일 수는 5개(+조건부 1개)가 맞다.** 줄 번호까지는 [4-2 설정과 시그니처](#설정과-시그니처)와 [4-5](#4-5-상한쿼터페이지네이션)에 있다. 난이도가 '하'가 아닌 이유는 두 가지다 — ① ES256 JWT 서명을 직접 써야 하고(한 줄 잘못 쓰면 조용히 401), ② **판매자 계정이 2곳으로 갈려 키가 2벌 필요한데 그 발급 일정을 개발이 통제할 수 없다** |
| 30일 수집량 | **11건** (부정 8건, 심각 3건) — 2026-08-29 DB 실측, 작성일 기준. 전 기간 누적은 344건, 전부 한 국가 스토어 |

**"11건"을 적은 수집량으로 읽으면 안 된다.** 부정 비율이 73%(8/11)로 켜져 있던 어느 채널보다 높았고,
심각(high/critical) 3건이 여기서 나왔다. 그리고 11건이라는 수 자체가 RSS의 상한과
[4-6의 RSS 고갈 정황](#4-6-함정) 때문일 가능성이 크다. 공식 API는 한 번에 200건까지 준다.

---

## 2. 적법성 근거

### 2-1. robots.txt 실측 — 지금 경로 (iTunes RSS)

- **URL**: `https://itunes.apple.com/robots.txt`
- **HTTP 상태**: 200 (`text/plain`)
- **실측일**: 2026-08-29

**원문 (전문):**

```
User-agent: *
Disallow: /WebObjects/MZFastFinance.woa
Disallow: /WebObjects/MZFinance.woa
Disallow: /WebObjects/MZPersonalizer.woa
Disallow: /WebObjects/MZStoreElements.woa
Disallow: /station/idst.
Disallow: /WebObjects/*
Allow: /WebObjects/MZStore.woa/wa/viewMultiRoom?*
Disallow: /search*
Disallow: /*/rss/*
Disallow: /*/lookup?

User-agent: Googlebot      
Disallow: /*/album/*/*?i=*
Disallow: /*/tv-season/*/*?i=*
Disallow: /*/podcast/*/*?i=*
```

**우리 경로가 걸리는가 — 걸린다.**

| | 값 |
|---|---|
| 코드가 요청하는 URL | `https://itunes.apple.com/{국가}/rss/customerreviews/page={N}/id={앱ID}/sortby=mostrecent/json` |
| 적용되는 그룹 | `User-agent: *` (우리는 Googlebot으로 이름이 지정된 크롤러가 아니다) |
| 매칭되는 규칙 | `Disallow: /*/rss/*` |
| 매칭 근거 | 실제 경로 `/kr/rss/customerreviews/...` 에서 `/*` → `/kr`, `/rss/`, `*` → `customerreviews/...` 로 패턴이 그대로 맞는다 |

README가 이 엔드포인트를 "공식, 무인증"으로 표기해 왔지만, **널리 쓰인다는 것과 Apple이 허용했다는 것은
다른 문제다.** Apple은 이 경로에 대한 자동 접근을 문서로 거부하고 있다.

> 참고: 링크 문자열을 만들 때 쓰는 `apps.apple.com`은 **요청하지 않는다**(URL을 조립만 한다).
> 그쪽 robots.txt에 무엇이 있든 우리가 그 경로로 요청을 보내지 않으므로 판정 대상이 아니다.

### 2-2. robots.txt 실측 — 옮겨갈 경로 (App Store Connect API)

- **URL**: `https://api.appstoreconnect.apple.com/robots.txt`
- **HTTP 상태**: **401** (`application/json`) — robots.txt가 없고, 인증 없는 모든 요청이 거부된다
- **실측일**: 2026-08-29

**응답 본문 원문:**

```json
{
	"errors": [{
		"status": "401",
		"code": "NOT_AUTHORIZED",
		"title": "Authentication credentials are missing or invalid.",
		"detail": "Provide a properly configured and signed bearer token, and make sure that it has not expired. Learn more about Generating Tokens for API Requests https://developer.apple.com/go/?id=api-generating-tokens"
	}]
}
```

**즉 이 호스트는 robots.txt를 두지 않고 인증으로 접근을 통제한다.** 네이버 검색 API와 같은 구조라
robots.txt 층위(층위 1)가 애초에 적용 대상이 아니다.

### 2-3. 개발자 약관

- **문서**: Apple Developer Program License Agreement
- **URL**: <https://developer.apple.com/support/terms/apple-developer-program-license-agreement/>
- **해당 조항**: § 3.3.3 Data and Privacy → **D. Legal and Other Requirements** 세 번째 항목
- **실측일**: 2026-08-29 (위 HTML 판 전문에서 확인)

**원문 인용:**

```
Neither You nor Your Application may perform any functions or link to any content,
services, information or data or use any robot, spider, site search or other retrieval
application or device to scrape, mine, retrieve, cache, analyze or index software, data
or services provided by Apple or its licensors, or obtain (or try to obtain) any such
data, except the data that Apple expressly provides or makes available to You in
connection with such services. You agree that You will not collect, disseminate or use
any such data for any unauthorized purpose; and
```

**이 한 문장이 두 경로를 정확히 갈라 준다.**

| | 판단 |
|---|---|
| **iTunes RSS** | `use any robot ... to scrape, mine, retrieve, cache ... data ... provided by Apple` 에 해당한다. robots.txt로 거부된 경로이므로 뒤의 예외("Apple이 명시적으로 제공하거나 이용 가능하게 한 데이터")에 들어간다고 보기 어렵다 |
| **App Store Connect API** | 바로 그 예외인 `the data that Apple expressly provides or makes available to You` 다. Apple이 키를 발급하고 문서화한 엔드포인트로 자기 앱 데이터를 내주는 것이다 |

> ⚠️ **해석 여지 하나**: 이 조항의 주어는 `You`(개발자 주체)와 `Your Application`이다. VOC 모니터링
> 도구가 여기서 말하는 `Application`인지, 아니면 `You`의 행위로만 걸리는지는 법률 해석 문제다.
> 다만 `Neither You nor ...`로 시작해 **주체(You) 자신의 행위도 대상**으로 삼으므로, "이건 앱이 아니라
> 내부 도구다"라는 반박은 성립하기 어렵다고 본다. 최종 판단은 법무 검토가 필요하다.

> ⚠️ **확인 필요 — 리뷰 데이터의 저장·보유 조항**: 위 협약서 전문에서 `customer review`,
> `ratings and reviews`, `review data`를 검색했으나 **리뷰 데이터의 캐싱·보유기간을 제한하는 조항은
> 찾지 못했다**(검색 결과는 앱 순위 산정 설명뿐이었다). 카카오 운영정책 제5조 20호 같은
> "캐시 목적 제한 + 최신성 유지 의무" 조항이 Apple 쪽에 있는지는 **협약서 전문 법무 검토로 확인해야
> 한다.** 이 도구는 수집물을 `items` 표에 영구 적재하고 갱신하지 않는다
> (`ON CONFLICT ... DO NOTHING`, [../../packages/core/src/store.ts](../../packages/core/src/store.ts)).
> 같은 함정이 다른 서비스에서 실제로 나왔으므로([../official-api-migration.md](../official-api-migration.md) 2-5절)
> "공식 API니까 안전하다"로 넘기지 않는다.

> ⚠️ **확인 필요 — App Store Connect 서비스 약관**: App Store Connect 자체 이용약관
> (<https://appstoreconnect.apple.com/WebObjects/iTunesConnect.woa/wa/termsOfService/>)은
> **로그인해야 열려서 원문을 확인하지 못했다.** 키 발급 담당자가 접속할 수 있으므로 발급 시
> 함께 확인해 이 절에 원문을 붙일 것.

### 2-4. 판정

| 경로 | 판정 | 근거 |
|---|---|---|
| iTunes RSS (현재) | 🟠 **위반 상태 — 대체 가능** | robots.txt `Disallow: /*/rss/*` + 개발자 약관 3.3.3(D). **대체 경로가 있으므로 논쟁할 이유가 없다** |
| App Store Connect API (전환 후) | 🟢 **적법** | robots.txt 적용 대상 아님(인증 API, 실측 401) + 개발자 약관 3.3.3(D)의 예외에 정면으로 해당 |

**결론: 지금 켜면 안 되고, 공식 API로 옮긴 뒤 켠다.**

### 2-5. 남은 리스크

전환을 마쳐도 **약관·robots 층위가 아닌 두 층위는 그대로 남는다.**

**민사 (저작권 / 데이터베이스제작자 권리 / 부정경쟁)**

| 항목 | 상태 |
|---|---|
| 리뷰 본문의 저작권 | 작성자는 Apple도 우리도 아닌 **이용자**다. API로 적법하게 받았다고 해서 본문 저장·2차 이용 문제가 자동으로 정리되지는 않는다 |
| 완화되는 조건 (유지해야 함) | ① **외부 미공개** — 외부에 공개하지 않는다 ② 원문을 대체하지 않고 **모든 인용에 원문 링크를 병기**한다 ③ **자사 앱 리뷰만** 본다 ④ 상업적 재판매를 하지 않는다 |
| 판례상 위험 지대 | 국내 판례에서 문제가 된 것은 **원문 DB를 통째로 복제해 남의 서비스를 대체한** 사안이다. 위 4개 조건을 유지하는 한 성격이 다르다 → [../data-collection-compliance.md](../data-collection-compliance.md) 2절 |
| ⚠️ 남는 것 | 본문 전문을 무기한 저장한다는 사실. 공정이용 판단은 **법무 미결 항목** |

**개인정보**

| 항목 | 상태 |
|---|---|
| 저장하는 개인 식별 요소 | **작성자 닉네임 하나** (RSS `author.name` → API `reviewerNickname`). 전 기간 344건 **전부** 닉네임이 채워져 있다(DB 실측) |
| 실명·연락처 | 수집하지 않음 |
| 보관기간 | **무기한.** 삭제 정책이 코드에 없다 |
| 권고 | **전환 시점이 닉네임을 버릴 가장 좋은 타이밍이다.** 어차피 식별자 체계가 바뀌어 전량 재적재하므로([4-6](#4-6-함정)), 그때 `author`를 채우지 않으면 정리 비용이 0이다. 분류·집계 어디에도 닉네임이 쓰이지 않는지 먼저 확인할 것 |
| ⚠️ 확인 필요 | 닉네임의 보유기간과 처리 근거는 법무 미결 항목이다 → [../data-collection-compliance.md](../data-collection-compliance.md) 6절 |

---

## 3. 비용

**결론: 호출료 0원. 이 전환으로 새로 나가는 돈은 없다.** 제약은 돈이 아니라
**API 키당 롤링 1시간 요청 수**다. 전 채널 비교와 계산 근거는 [../api-costs.md](../api-costs.md).

### 3-1. 금액이 적힌 공식 문장 (원문 그대로)

> The Apple Developer Program is 99 USD per membership year. Prices may vary by region and are listed in local currency during the enrollment process.

출처: <https://developer.apple.com/programs/enroll/> (조사일 2026-08-29)

**이 99 USD는 이 도구 때문에 새로 나가는 돈이 아니다.** 자사 앱을 스토어에 올려 두는 한
어차피 유지해야 하는 멤버십이고, 이미 그 계정으로 앱을 서비스하고 있다.
**App Store Connect API 사용료를 따로 받는다는 조항은 가격 페이지에도 API 문서에도 없다**(부재 근거).

> 판매자 계정이 2곳이므로 멤버십도 2건이지만 **둘 다 이미 유지 중**이다.
> 앱을 스토어에 두려면 필수라 이 도구의 비용으로 잡지 않는다. → [4-1](#4-1-사전-준비-사람이-해야-하는-것)

### 3-2. 무료 대신 무엇이 제약인가 — 쿼터 숫자

| 항목 | 값 | 근거 |
|---|---|---|
| 호출 단가 | **0원** | 종량 과금 조항 없음(부재 근거) |
| 요청 수 상한의 단위 | **API 키당**, 롤링 1시간 | 원문: `The limits apply to requests you send using the same API key.` |
| 공식 문서의 예시 값 | **시간당 3,500회** (잔여 500회) | 원문 예시: `user-hour-lim:3500;user-hour-rem:500;` |
| **우리 키의 실제 상한** | ⚠️ **확인 필요** | 원문이 `Actual limits can vary.`라고 명시한다. 첫 호출 헤더로 확인 → [5-5](#5-5-쿼터-여유-확인) |
| 초과 시 | **HTTP 429**, 에러 코드 `RATE_LIMIT_EXCEEDED` (추가 과금이 아니라 거부) | Apple 문서 |
| **우리가 실제로 쓰는 호출 수** | **앱 1종·1회 수집당 최대 5회** (`appstorePages` 최대 5, 1쪽 200건) | [4-5](#4-5-상한쿼터페이지네이션) |
| 여유 | 앱이 10종이어도 1시간 주기로 **시간당 50회**. 문서 예시 상한 3,500의 **1.4%** | 계산 |

**토큰 발급은 호출 수에 들어가지 않는다.** JWT는 로컬에서 서명해 만들고 Apple에 요청을 보내지 않는다
([4-2](#4-2-인증)). 즉 쿼터를 쓰는 것은 리뷰 조회뿐이다.

> ⚠️ **확인 필요로 남기는 것**: 우리 두 키의 `user-hour-lim` 실제 값. 추측하지 않는다.
> [5-5](#5-5-쿼터-여유-확인)에서 두 계정 각각 찍어 이 표에 되적는다.

---

## 4. 연동 방법

### 4-1. 사전 준비 (사람이 해야 하는 것)

#### 왜 키가 2벌인가

**자사 앱이 하나의 판매자 계정에 모여 있지 않다.** 스토어 공개 정보로 확인한 결과(2026-08-29),
현재 수집 대상 앱들은 **App Store Connect 기준 2개 판매자 계정**에 나뉘어 있다. 브랜드가 같아도
법인이 갈리면 계정이 갈리기 때문이다.

**App Store Connect API 키는 계정 단위다.** 한 계정의 팀 키로 다른 계정의 앱을 읽을 수 없다.
따라서 **판매자 계정마다 1벌씩, 총 2벌**이 필요하다.

> 지금 RSS 방식이 편했던 이유가 정확히 이것이다. **앱 ID만 알면 계정 소유권과 무관하게 전부 읽혔다.**
> 그 편의가 robots.txt 위반의 대가였다.

**→ 코드에 미치는 요구사항: 수집기는 서비스(앱)별로 다른 자격증명을 골라 쓸 수 있어야 한다.**
전역 키 하나를 가정하고 만들면 두 번째 계정에서 통째로 다시 뜯어고쳐야 한다.

#### 절차 (판매자 계정마다 반복)

| # | 단계 | 누가 | 산출물 | 비고 |
|---|---|---|---|---|
| 1 | 그 계정의 **Admin** 권한 보유자를 찾는다 | 개발 → 각 법인 담당자 | 담당자 확정 | ✅ 팀 키 생성은 Admin만 가능하다(Apple 문서 명시). **개발이 통제할 수 없는 일정은 여기서 시작된다** |
| 2 | App Store Connect → **사용자 및 액세스(Users and Access) → 통합(Integrations)** 탭 → 왼쪽에서 **App Store Connect API** 선택 | 각 계정 Admin | — | |
| 3 | **팀 키(Team Keys)** 탭에서 `Generate API Key` (또는 `+`) 클릭 | 각 계정 Admin | — | 이름은 참조용이라 아무거나 |
| 4 | **Access(역할)** 선택 | 각 계정 Admin | — | 아래 "어떤 역할이 필요한가" 참고 |
| 5 | **.p8 개인키 다운로드** | 각 계정 Admin | `AuthKey_XXXXXXXXXX.p8` | 🔴 **1회 한정.** 아래 경고 참고 |
| 6 | **Key ID** 복사 | 각 계정 Admin | 10자 영숫자 (예: `2X9R4HXF34`) | 같은 화면의 Active 아래 열. 커서를 올리면 `Copy Key ID` |
| 7 | **Issuer ID** 복사 | 각 계정 Admin | UUID (예: `57246542-96fe-1a63-e053-0824d011072a`) | 같은 페이지 상단. `Copy` 버튼 |
| 8 | 세 값을 안전하게 전달받는다 | 개발 | 계정당 3개 값 | 🔴 **저장소에 커밋하지 않는다.** Apple 약관이 명시적으로 금지한다 |
| 9 | 앱의 리소스 ID를 확인한다 | 개발 | 앱별 ID | 아래 "앱 ID" 참고 |

#### 🔴 .p8은 1회만 내려받을 수 있다

Apple 문서 원문:

```
The private key is available for download a single time
```
```
The download link only appears if you haven't downloaded the private key.
Apple doesn't keep a copy of the private key.
```

**Apple은 사본을 보관하지 않는다. 잃으면 재발급 = 다른 법인 Admin에게 다시 요청 = 일정이 다시 밀린다.**

- 다운로드 담당자에게 **"받는 즉시 비공개 저장소에 넣어라"**를 절차 5번과 함께 전달할 것
- 파일을 열어 본 채로 방치하지 말 것. 유출이 의심되면 즉시 App Store Connect에서 revoke

#### 어떤 역할(Role)이 필요한가

Apple의 역할 설명 원문 (App Store Connect Help, 실측 2026-08-29):

```
Admin — Serves as a secondary contact for teams and has many of the same responsibilities
as the Account Holder. Admins have access to all apps.
```
```
Customer Support — Analyzes and responds to customer reviews on the App Store.
```

- **Admin 역할 키는 확실히 된다** (모든 앱 접근).
- **최소 권한 후보는 `Customer Support`다.** 설명이 리뷰를 명시한다.
- ⚠️ **확인 필요**: `Customer Support` 역할로 발급한 키가 이 API 엔드포인트에서 실제로 200을 주는지는
  **확인하지 못했다.** Apple 문서가 엔드포인트별 필요 역할을 표로 주지 않는다.
  **키를 받은 뒤 [5절](#5-붙인-뒤-확인할-것)의 1단계로 즉시 검증할 것.** 403이면 Admin으로 재발급해야 한다.
  최소 권한이 원칙이므로 `Customer Support`를 먼저 시도하는 편을 권한다.

> **팀 키(Team) vs 개인 키(Individual)**: 개인 키는 그 사용자의 권한에 묶여 사람이 퇴사·역할 변경하면
> 조용히 죽는다. **상주 파이프라인에는 팀 키를 쓴다.** (JWT 페이로드가 달라진다 → [4-2](#4-2-인증))

#### 앱 ID

Apple 문서상 경로 파라미터 설명은 다음과 같다.

```
The opaque resource ID that uniquely identifies the apps resource that represents your app.
Obtain the app resource ID from the GET-v1-apps response.
```

그런데 **같은 문서의 공식 예시는 숫자 App Store ID를 그대로 쓴다:**

```
https://api.appstoreconnect.apple.com/v1/apps/682658836/customerReviews?limit=1
```

**즉 현재 설정에 들어 있는 숫자 `appId`를 그대로 쓸 수 있을 가능성이 높다.** 다만
"opaque resource ID"라는 표현이 남아 있으므로 ⚠️ **첫 실행 때 반드시 확인하고**, 404가 나면
`GET /v1/apps`로 목록을 받아 `data[].id`를 쓴다. 확인 절차는 [5-2](#5-2-앱-id가-맞는가)다.

> 🔴 **404가 나오는 경우 챙길 것이 하나 더 있다.** 경로에 쓰는 ID를 opaque ID로 바꾸면
> **사람이 여는 링크(`apps.apple.com/.../id{숫자}`)까지 같이 깨진다.** 그때는 지금 설정에 들어 있는
> 숫자 값을 버리지 말고 `storeId`로 옮겨 링크 전용으로 남긴다
> → [4-4의 `url` 결정 트리](#url-결정-트리--조각-두-개가-다-바뀔-수-있다) ·
> [4-2 설정과 시그니처](#설정과-시그니처).

---

### 4-2. 인증

#### 형식

| 항목 | 값 | 근거 |
|---|---|---|
| 방식 | ES256으로 서명한 JWT를 Bearer 토큰으로 | Apple 문서 |
| 헤더 | `Authorization: Bearer {서명된 JWT}` | Apple 문서 예시: `curl -v -H 'Authorization: Bearer [signed token]' "https://api.appstoreconnect.apple.com/v1/apps"` |
| 토큰 수명 | **이 엔드포인트는 최대 20분.** `exp - iat > 1200`이면 거부된다. 원문이 `For most requests`로 시작하는 이유는 예외가 있기 때문인데, **그 예외에 우리 경로가 없다**(아래 설명) | 원문: `For most requests, App Store Connect rejects a token with a lifetime greater than 20 minutes.` |
| 갱신 | 회전 토큰이 아니다. **키(.p8)는 영구고, 토큰은 필요할 때 로컬에서 만든다.** 외부 갱신 호출이 없다 | — |
| 재사용 | 만료 전까지 재사용하라고 Apple이 권한다. 원문: `You don't need to generate a new token for every API request. To get better performance from the App Store Connect API, reuse the same signed token for multiple requests until it expires.` | |

**"20분"의 예외를 오해하지 말 것 — 우리에게는 예외가 없다.** Apple 문서는 세 조건을
모두 만족할 때만 최대 6개월짜리 토큰을 받는다고 적는다(원문: `The token defines a scope.` /
`The scope only includes GET requests.` / `The resources in the scope allow long-lived tokens.`).
그리고 **긴 수명을 허용하는 리소스 13개를 이름으로 나열하는데, 거기에 `customerReviews`도 `apps`도 없다**
(2026-08-29 실측 목록: build-actions, build-runs, git-references, issues, macos-versions, products,
providers, power-and-performance-metrics-and-logs, pull-requests, repositories, test-results,
workflows, xcode-versions). **따라서 이 문서가 다루는 경로에서는 scope를 쓰든 안 쓰든 20분이 상한이다.**
(우리는 [4-6 (8)](#4-6-함정)에 따라 scope 자체를 쓰지 않는다.)

> **회전 자격증명이 아니라는 점이 중요하다.** 이 저장소의 키는 전부 정적 환경변수인데,
> 앱스토어는 그 패턴을 깨지 않는다. (다른 소스는 60일 회전 토큰·1시간 토큰이라 새 설계가 필요하다.)

#### JWT 헤더 (Apple 문서 원문 표 기준)

| 필드 | 값 |
|---|---|
| `alg` | `ES256` — 원문: `All JWTs for App Store Connect API must be signed with ES256 encryption.` |
| `kid` | 4-1에서 받은 **Key ID** (예: `2X9R4HXF34`) |
| `typ` | `JWT` |

#### JWT 페이로드 — **팀 키** (우리가 쓸 것)

| 필드 | 값 |
|---|---|
| `iss` | 4-1에서 받은 **Issuer ID** (UUID) |
| `iat` | 생성 시각, UNIX epoch 초 |
| `exp` | 만료 시각, UNIX epoch 초. `exp - iat ≤ 1200` |
| `aud` | `appstoreconnect-v1` (고정) |
| `scope` | 선택. 허용할 요청 목록 |

#### JWT 페이로드 — 개인 키 (쓰지 않을 것이지만 헷갈리기 쉬워 적어 둔다)

개인 키는 **`iss`를 쓰지 않고 `sub: "user"`를 쓴다.** Apple 문서 원문:
`Individual keys don't use the Issuer ID key iss, but do require the Subject key sub.`
팀 키 페이로드에 `sub`를 넣거나 개인 키에 `iss`를 넣으면 401이 난다.

#### `node:crypto`만으로 만드는 방법 (의존성 추가 없음)

이 저장소에 JWT 코드는 **한 줄도 없다**(전 저장소 grep 0건). 새로 만든다.

```ts
// packages/core/src/appstore-jwt.ts (신설)
import crypto from 'node:crypto';

export interface AscKey {
  /** App Store Connect > 사용자 및 액세스 > 통합 상단의 Issuer ID (UUID) */
  issuerId: string;
  /** 같은 화면의 Key ID (10자 영숫자) */
  keyId: string;
  /** .p8 파일 내용 전문. '-----BEGIN PRIVATE KEY-----' 줄부터 그대로 */
  privateKeyPem: string;
}

/** JWT는 표준 base64가 아니라 base64url이다. 패딩(=)을 남기면 서명 검증이 깨진다 */
const b64u = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * App Store Connect용 ES256 JWT 한 장.
 *
 * 수명 기본 15분: Apple 상한이 20분이라 딱 맞추면 시계 오차만큼 위험해진다.
 * 한 번 수집이 끝나기에 충분하고, 상한에 여유를 둔다.
 */
export function ascToken(key: AscKey, lifetimeSeconds = 15 * 60): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'ES256', kid: key.keyId, typ: 'JWT' };
  const payload = {
    iss: key.issuerId,
    iat: now,
    exp: now + lifetimeSeconds,
    aud: 'appstoreconnect-v1',
  };

  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;

  // ⚠️ dsaEncoding: 'ieee-p1363' 이 이 함수의 전부다. 아래 주석 참고.
  const signature = crypto
    .createSign('SHA256')
    .update(signingInput)
    .sign({ key: key.privateKeyPem, dsaEncoding: 'ieee-p1363' });

  return `${signingInput}.${b64u(signature)}`;
}
```

#### 🔴 `dsaEncoding: 'ieee-p1363'`을 빼면 조용히 401이 난다

**이것 하나가 직접 구현할 때 가장 많이 틀리는 지점이다.**

Node의 `createSign(...).sign()`은 EC 키에 대해 **기본으로 DER(ASN.1) 인코딩 서명**을 낸다.
JWT의 ES256은 **R‖S를 이어붙인 고정 64바이트(IEEE P1363)** 를 요구한다. 형식이 다르면
토큰 자체는 멀쩡히 만들어지고, **Apple이 401로만 답한다.** 코드에는 아무 오류가 없다.

로컬 실측 (Node v22.17.1, P-256 키, 2026-08-29):

| 옵션 | 서명 길이 | 첫 바이트 |
|---|---|---|
| 기본 (DER) | **72바이트** (키에 따라 70~72로 **가변**) | `0x30` (ASN.1 SEQUENCE) |
| `dsaEncoding: 'ieee-p1363'` | **64바이트 고정** | — |

**자체 점검법**: 만든 JWT의 세 번째 조각(base64url 서명부) 길이가 **86자**면 맞다.
`0x30`으로 시작하는 DER이면 base64url로 96자 내외가 되고 길이도 실행마다 흔들린다.

#### .p8 파일 다루기

- .p8은 **PKCS#8 PEM**이고 `-----BEGIN PRIVATE KEY-----`로 시작한다.
  **Node가 그대로 읽는다.** 변환할 필요가 없다(실측 확인).
- 환경변수에 넣을 때 **개행이 죽는 것**이 흔한 사고다. 두 방법 중 하나를 쓴다.
  - 파일 경로만 환경변수에 두고 `readFileSync`로 읽는다 (권장)
  - 값을 base64로 감싸 넣고 `Buffer.from(v, 'base64').toString('utf8')`로 되돌린다
  - `\n`을 리터럴 두 글자로 넣고 `.replace(/\\n/g, '\n')`로 되살리는 방식은 동작하지만 실수가 잦다
- 계정이 2개이므로 환경변수도 계정별로 갈린다. 이름 규칙을 아래로 고정한다:
  `ASC_KEY_{계정이름}_ISSUER_ID` / `ASC_KEY_{계정이름}_KEY_ID` / `ASC_KEY_{계정이름}_P8_PATH`
  (예: `ASC_KEY_A_ISSUER_ID`, `ASC_KEY_B_P8_PATH`). **서비스(앱) → 어느 키를 쓸지**의
  대응표는 설정에 넣는다 → 바로 아래 소절.

#### 설정과 시그니처

**이 소절이 없으면 [4-6 (6)](#4-6-함정)의 경고가 지시로 바뀌지 않는다.** 고칠 자리를 줄 번호로 못 박는다.

**행은 9개지만 파일은 5개(+조건부 1개)다.** 한 파일에서 손댈 자리가 여럿이라 자리마다 한 행으로 적는다.

| # | 파일 · 자리 | 지금 | 바꿀 것 |
|---|---|---|---|
| 1 | `packages/core/src/appstore-jwt.ts` | 없음 | 신설. `ascToken()` + `loadAscKeys()` |
| 2 | [`packages/core/src/paths.ts`](../../packages/core/src/paths.ts) **81줄** | `appstore?: { appId: string; country?: string; countries?: string[] }` | `ascKey?`, `storeId?` 추가 — 아래 (b) |
| 3 | 같은 파일 **359줄**(`LANG_BY_COUNTRY` 바로 위·아래) | 국가 코드 변환표가 없다 | `ALPHA3_BY_COUNTRY` + `toAlpha2()` + `toAlpha3()` 신설. **표와 코드 전문은 [4-6 (3)](#4-6-함정)에 있다.** `paths.ts`는 `index.ts` 4줄에서 `export *` 되므로 수집기가 `@feedback-radar/core`로 그대로 가져다 쓴다 |
| 4 | [`apps/pipeline/src/collectors/appstore.ts`](../../apps/pipeline/src/collectors/appstore.ts) **13~18줄** | `collectAppStore(appId, country, pages, service)` | 아래 새 시그니처 (c). **`APPSTORE_CUTOVER` 상수도 이 파일 맨 위에 둔다** → [4-6 (5)](#4-6-함정) |
| 5 | [`apps/pipeline/src/daily.ts`](../../apps/pipeline/src/daily.ts) **264~275줄** | 264줄 `const { appId } = svc.appstore!;` + 267줄부터의 국가 루프 + `collectAppStore(appId, country, limits.appstorePages, svc.name)` | 통째로 아래 새 호출부 (d). **264줄부터다** — 구조분해에서 `ascKey`·`storeId`를 같이 꺼내야 해서 267줄만 바꾸면 컴파일되지 않는다 |
| 6 | 같은 파일 **215~222줄**(`tasks` 타입)과 **460줄**(`state: 'done'`) | 작업이 사유를 밖으로 내보낼 칸이 없다 | `note?` 필드 추가 + `done`에 실어 보내기 — 아래 (e). **이게 없으면 [5-7](#5-7-실패를-조용히-넘기지-않는가)의 합격 기준이 성립하지 않는다** |
| 7 | [`packages/core/src/collect-limits.ts`](../../packages/core/src/collect-limits.ts) **105줄** | `perUnit: 50`, `unit: '페이지 (앱당, 1페이지=50건)'`, `min: 1`, `def: 3`, `max: 10` | → [4-5](#4-5-상한쿼터페이지네이션) |
| 8 | 같은 파일 **143~144줄** (`API_COLLECT_DEFAULTS.appstorePages: 1`) | 배포판 첫 실행용 보수적 기본값 | **값은 그대로 두되 판단은 하고 넘어간다** → [4-5](#4-5-상한쿼터페이지네이션). 1쪽이 200건이 되므로 같은 `1`이 배포판 1회 수집량을 50 → 200건으로 올린다 |
| 9 | [`apps/web/app/page.tsx`](../../apps/web/app/page.tsx) **611~614줄** | `n + (s.appstore?.appId ? storeCountries(s.appstore).length : 0)` | **국가 루프를 지우는 경우에만** `n + (s.appstore?.appId ? 1 : 0)`. 안 고치면 총량 추산이 국가 수만큼 부풀고, 그 숫자를 보고 상한을 정하게 된다 |

**(a) 키 꾸러미 읽기** — `appstore-jwt.ts`에 `ascToken()`과 함께 둔다.

```ts
// packages/core/src/appstore-jwt.ts (신설)
import fs from 'node:fs';

/**
 * 환경변수에서 판매자 계정별 키를 모은다.
 *   ASC_KEY_<이름>_ISSUER_ID / _KEY_ID / _P8_PATH  →  keys['<이름>']
 *
 * 계정 이름을 코드에 박지 않는 이유: 계정이 3곳으로 늘거나 이름이 바뀌어도 코드를 안 고친다.
 */
export function loadAscKeys(env: NodeJS.ProcessEnv = process.env): Record<string, AscKey> {
  const keys: Record<string, AscKey> = {};
  for (const [name, issuerId] of Object.entries(env)) {
    const m = /^ASC_KEY_(.+)_ISSUER_ID$/.exec(name);
    if (!m || !issuerId) continue;
    const keyId = env[`ASC_KEY_${m[1]}_KEY_ID`];
    const p8Path = env[`ASC_KEY_${m[1]}_P8_PATH`];
    // 셋 중 하나라도 비면 만들지 않는다. 반쪽 키로 401을 받는 것보다
    // '키 없음'으로 건너뛰고 사유를 남기는 편이 원인을 훨씬 빨리 찾는다
    if (!keyId || !p8Path) {
      console.warn(`  앱스토어 키 ${m[1]}: KEY_ID 또는 P8_PATH가 비어 건너뜁니다`);
      continue;
    }
    // .p8은 PKCS#8 PEM 그대로 읽는다. 환경변수에 본문을 넣지 않는 이유는 위 '.p8 파일 다루기' 참고
    keys[m[1]] = { issuerId, keyId, privateKeyPem: fs.readFileSync(p8Path, 'utf8') };
  }
  return keys;
}
```

**(b) 설정 타입** — `paths.ts` 81줄. **구버전 설정이 그대로 돌아야 한다**(기본값 폴백).

```ts
appstore?: {
  appId: string;
  country?: string;
  countries?: string[];
  /**
   * (신설) 이 앱이 속한 판매자 계정. loadAscKeys()가 만든 키 이름과 같아야 한다.
   * 비면 'A'로 읽는다 — 계정이 하나뿐이던 구버전 설정 파일이 고치지 않아도 그대로 돈다.
   */
  ascKey?: string;
  /**
   * (신설, 조건부) 사람이 여는 링크에 쓸 **숫자** App Store ID.
   * appId가 숫자면 필요 없다. 5-2에서 404가 나 opaque resource ID를 쓰게 될 때만 채운다 → 4-4
   */
  storeId?: string;
};
```

**(c) 새 수집기 시그니처** — 인자 순서가 아니라 **객체 3개**로 받는다. 국가·키·경계날짜가 앞으로도
늘어날 자리라 위치 인자로 두면 다음 변경 때 또 전부 고친다.

🔴 **반환형이 `RawItem[]`이 아니다.** 401·404·429·타임아웃은 전부 **앞쪽 페이지가 이미 `items`에
들어온 뒤에** 터진다. 예외를 던지면 받아 둔 것까지 버리고, 그냥 배열만 돌려주면 사유를 담을 칸이 없어
화면에는 "완료, 0건"으로 뜬다 — [4-6 (10)](#4-6-함정)과 [5-7](#5-7-실패를-조용히-넘기지-않는가)이
막겠다는 바로 그 고장이다. **그래서 `{ items, note? }`로 돌려준다.** 같은 저장소에 선례가 있다:
`collectXWeb`이 `{ items, blocked, note }`를 돌려주고 `daily.ts` **394~401줄**의 `run` 래퍼가
사유를 꺼낸다.

```ts
// apps/pipeline/src/collectors/appstore.ts (교체)

/**
 * 이 날짜(ISO, 로컬 기준)보다 오래된 리뷰는 저장하지 않는다 → 4-6 (5) 방침 C.
 * **전환 배포일**(공식 API로 첫 정상 수집을 돌린 날)을 적는다. daily.ts가 이 상수를 import 한다.
 */
export const APPSTORE_CUTOVER = '____-__-__'; // ⚠️ 전환 배포일에 채운다 → 4-6 (5)

export interface AppStoreResult {
  items: RawItem[];
  /**
   * 정상 종료가 아니었을 때의 사유(HTTP 401/404/429, 타임아웃 등).
   * daily.ts가 이 값을 그대로 작업의 note로 올린다 → (e). 비면 '끝까지 정상'이라는 뜻이다.
   */
  note?: string;
}

export async function collectAppStore(
  app: {
    appId: string;
    /** 이 앱이 속한 계정의 키. 전역 상수로 읽지 않는다 → 4-6 (6) */
    key: AscKey;
    /** 링크 조립용 숫자 ID. 없으면 appId를 쓴다 → 4-4 */
    storeId?: string;
    /** territory 변환에 실패했을 때 링크에 쓸 국가 (설정의 첫 국가) → 4-4 */
    fallbackCountry?: string;
  },
  opts: {
    /** 최대 페이지 수. 설정의 appstorePages를 그대로 넘긴다 → 4-5 */
    pages: number;
    /** 이 ISO 날짜보다 오래된 createdDate는 저장하지 않고 루프를 끊는다 → 4-6 (5) 방침 C */
    since?: string;
    /** filter[territory]에 넣을 alpha-3 목록. 비우면 필터 없이 부른다 → 4-6 (4) */
    territories?: string[];
  },
  service?: string,
): Promise<AppStoreResult>;
```

**(d) 호출부** — `daily.ts` **264~275줄**을 통째로 바꾼다(264줄 구조분해부터다 → 위 표 5행).

```ts
// 38줄 import를 고친다. 경계 날짜 상수는 수집기가 소유한다 → 4-6 (5)
import { APPSTORE_CUTOVER, collectAppStore } from './collectors/appstore.js';

// 루프 밖에서 한 번만. 앱마다 .p8을 다시 읽을 이유가 없다
const ascKeys = loadAscKeys();
/**
 * 최초 1회 백필. 켜면 경계 날짜를 넘기지 않아 API가 주는 과거까지 전부 받는다 → 4-5 `max`
 * 상시 수집에서는 절대 켜지 않는다(매 실행이 전 기간을 훑는다).
 */
const appstoreBackfill = process.env.APPSTORE_BACKFILL === '1';

// ... services 루프 안, sources.appstore 분기 ...
const { appId, ascKey = 'A', storeId } = svc.appstore!;
const key = ascKeys[ascKey];
if (!key) {
  // 키가 없으면 '리뷰 0건'이 아니라 '건너뜀 + 사유'로 남긴다 → 5-7
  const note = `앱스토어 키 ${ascKey} 없음 (ASC_KEY_${ascKey}_* 환경변수 확인)`;
  console.warn(`  - ${label(svc.name, 'appstore')}: ${note}, 건너뜀`);
  skippedTasks.push({ service: svc.name, source: 'appstore', country: '', note });
} else {
  // 국가 루프가 사라져 앱당 작업이 1개다. country는 응답 territory에서 항목마다 채워진다.
  // task를 먼저 const로 잡는 이유: run 안에서 자기 note 칸에 사유를 적어야 한다 → (e)
  const task = {
    name: label(svc.name, 'appstore'),
    service: svc.name,
    source: 'appstore',
    country: '',
    note: undefined as string | undefined,
    run: async () => {
      const r = await collectAppStore(
        { appId, key, storeId, fallbackCountry: storeCountries(svc.appstore)[0] },
        {
          pages: limits.appstorePages,
          since: appstoreBackfill ? undefined : APPSTORE_CUTOVER,
        },
        svc.name,
      );
      /*
        사유를 밖으로 들고 나온다. 이 경로는 예외가 아니라 '건수만 적은 성공'으로 실패하므로,
        여기서 note를 안 옮기면 429도 401도 화면에 '완료, 0건'으로 뜬다 → 4-6 (10) · 5-7.
        throw 하지 않는 이유: 앞쪽 페이지는 이미 받아 뒀고, 던지면 그것까지 버린다.
        (collectXWeb + daily.ts 394~401줄이 쓰는 것과 같은 패턴이다.)
      */
      task.note = r.note;
      return r.items;
    },
  };
  tasks.push(task);
}
```

> 🔴 **(d)는 [5-4](#5-4-국가가-섞여-오는가)를 통과한 뒤에만 이 형태로 간다.**
> 5-4에서 필터 없이도 여러 `territory`가 오면 위 코드가 맞다. **한 국가만 오면 국가 루프를 남긴다** —
> 작업 이름과 `country` 칸은 지금 형태를 유지하고, 설정의 소문자 두 자를
> [4-6 (3)](#4-6-함정)의 `toAlpha3()`로 바꿔 `opts.territories`에 넘긴다.
> 시그니처는 두 경우를 다 받으므로 **(c)는 어느 쪽이든 안 바뀐다.**
>
> ```ts
> // 국가 루프를 남기는 경우의 분기 (위 tasks.push 자리를 대신한다)
> for (const country of storeCountries(svc.appstore)) {
>   const territory = toAlpha3(country);
>   if (!territory) {
>     // 변환표에 없는 국가를 필터에 그대로 넣으면 400이거나, 무시되고 전 국가가 온다(5-4).
>     // 어느 쪽이든 조용하니 여기서 건너뛰고 사유를 남긴다 → 5-7
>     const note = `앱스토어 국가 '${country}': alpha-3 변환표에 없음 (paths.ts ALPHA3_BY_COUNTRY에 추가)`;
>     console.warn(`  - ${label(svc.name, 'appstore')}(${country}): ${note}, 건너뜀`);
>     skippedTasks.push({ service: svc.name, source: 'appstore', country, note });
>     continue;
>   }
>   const task = { /* 위와 같되 */ country, note: undefined as string | undefined,
>     run: async () => {
>       const r = await collectAppStore(
>         { appId, key, storeId, fallbackCountry: country },
>         { pages: limits.appstorePages, since: appstoreBackfill ? undefined : APPSTORE_CUTOVER,
>           territories: [territory] },
>         svc.name,
>       );
>       task.note = r.note;
>       return r.items;
>     } };
>   tasks.push(task);
> }
> ```

**(e) 사유를 화면까지 나르는 두 자리** — `daily.ts` **215~222줄**(`tasks` 타입)과 **460줄**(`done` 확정).

**이 소절이 [5-7](#5-7-실패를-조용히-넘기지-않는가)의 합격 기준을 실현 가능하게 만든다.** 지금 `note`가
`markCollectTask`에 닿는 경로는 셋뿐이고(**416줄** 건너뛴 작업, **449~451줄** `run`이 throw한 경우,
**463~465줄** 저장 실패), 정상 반환은 **460줄** `{ state: 'done', collected, inserted }`로 가서
사유를 적을 칸이 없다. 부분 수집은 정상 반환이므로 **지금 구조로는 429·401이 절대 화면에 안 뜬다.**

```ts
// 215~222줄: tasks 타입에 칸을 하나 만든다 (기존 필드와 주석은 그대로 두고 note만 더한다)
const tasks: {
  name: string;
  /** 진행 화면이 '<서비스명> 구글플레이 미국'처럼 읽어 주기 위한 메타 */
  service: string;
  source: string;
  country: string;
  /** 부분 수집·조기 종료 사유. run이 채우면 done 상태에 그대로 붙는다 (앱스토어 429·401 등) */
  note?: string;
  run: () => Promise<RawItem[]>;
}[] = [];

// 460줄: 성공으로 끝나도 사유가 있으면 같이 남긴다
await db.markCollectTask(runId, i, {
  state: 'done',
  collected: items.length,
  inserted,
  note: t.note,
});
```

> `markCollectTask`의 UPDATE는 `note=COALESCE($6, note)`라
> ([store.ts](../../packages/core/src/store.ts) **379줄**) `note: undefined`를 넘겨도
> 기존 값을 덮어쓰지 않는다. **다른 소스의 작업은 이 변경으로 아무것도 바뀌지 않는다.**

> 국가 루프를 지우면 작업 목록의 `country` 칸이 빈다. 화면에서 앱스토어 작업의 국기 칩이 사라지는데,
> 항목별 `country`는 여전히 채워지므로 **목록·필터·집계는 그대로다.** 바뀌는 것은 진행 화면 한 칸뿐이다.

---

### 4-3. 엔드포인트와 요청

#### URL

```
GET https://api.appstoreconnect.apple.com/v1/apps/{id}/customerReviews
```

`{id}`는 앱의 리소스 ID → [4-1의 "앱 ID"](#4-1-사전-준비-사람이-해야-하는-것) 참고.

#### 쿼리 파라미터 (Apple 문서 실측, 2026-08-29)

| 파라미터 | 필수 | 타입 | 허용값 / 상한 | 우리가 쓸 값 |
|---|---|---|---|---|
| `sort` | 아니오 | [string] | **`rating` \| `-rating` \| `createdDate` \| `-createdDate`**. 원문: `Supports one sort parameter at a time.` | **`-createdDate` 를 반드시 명시한다** → [4-6](#4-6-함정) |
| `limit` | 아니오 | integer | **최대 200** | `200` |
| `filter[territory]` | 아니오 | [string] | **ISO 3166-1 alpha-3** 코드 목록 (`KOR`, `USA`, `JPN`, `FRA` …) | **넣지 않는다** → [4-6](#4-6-함정) |
| `filter[rating]` | 아니오 | [string] | 1~5. 원문: `An array of numerical rating values by which to filter.` | 쓰지 않는다 (별점 낮은 것만 보면 급증 감지가 망가진다) |
| `fields[customerReviews]` | 아니오 | [string] | `rating`, `title`, `body`, `reviewerNickname`, `createdDate`, `territory`, `response`, `reviewTerritory` | **`rating,title,body,createdDate,territory`** — 🔴 `reviewerNickname`을 **넣지 않는다**(아래 참고) |
| `exists[publishedResponse]` | 아니오 | boolean | `true` / `false` | 쓰지 않는다 (답글 유무는 우리 관심사가 아니다) |
| `include` | 아니오 | [string] | **`response`, `reviewTerritory`** | 쓰지 않는다 (관계 데이터를 저장하지 않는다) |
| `fields[customerReviewResponses]` | 아니오 | [string] | `responseBody`, `lastModifiedDate`, `state`, `review` | 쓰지 않는다 (`include=response`를 쓸 때만 의미가 있다) |
| `filter[reviewTerritory]` | 아니오 | [string] | (허용값 목록·설명이 **둘 다 비어 있다**) | ⚠️ `filter[territory]`와 무엇이 다른지 **확인하지 못했다. 쓰지 않으므로 판별 절차도 두지 않는다** — 필요해지면 그때 확인한다 |
| `fields[territories]` | 아니오 | [string] | **`currency`** | 쓰지 않는다 (`include=reviewTerritory`를 쓸 때만 의미가 있다) |

> **작성일로 거르는 파라미터는 없다.** 위 표가 공식 스펙의 **전체 목록**이다(2026-08-29 실측).
> `filter[createdDate]` 같은 항목은 존재하지 않는다. 경계 날짜 처리는 전부 클라이언트 몫이다
> → [4-6 (5)](#4-6-함정).

> 🔴 **`reviewerNickname`을 요청 목록에서 뺀 것은 실수가 아니다.** [2-5](#2-5-남은-리스크)와
> [4-4](#4-4-응답--rawitem-매핑)가 전환 시점에 닉네임을 버리라고 권하는데, 예시가 그걸 계속 요청하면
> 복사해 쓰는 사람이 권고를 어기게 된다. **닉네임이 필요하다고 결정되면 여기에 되넣는다** —
> 필드 하나 추가로 끝난다.

#### 예시 요청

```bash
TOKEN="<4-2에서 만든 JWT>"
APP_ID="<앱 리소스 ID>"

curl -sS -D - \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/customerReviews?limit=200&sort=-createdDate&fields%5BcustomerReviews%5D=rating,title,body,createdDate,territory"
```

`-D -`로 응답 헤더를 같이 본다. `X-Rate-Limit`을 확인하기 위해서다 → [4-5](#4-5-상한쿼터페이지네이션).
`fields[customerReviews]`에 `reviewerNickname`이 없는 것은 의도한 것이다(위 표 참고).

#### 예시 응답 (Apple 공식 문서의 예시 **전문**, 2026-08-29 실측)

아래는 공식 문서의 `GET .../v1/apps/682658836/customerReviews?limit=1` 응답 예시를 **자르지 않고**
옮긴 것이다. **최상위 `links`와 `meta`가 이 문서의 페이지네이션 설계 근거**라 반드시 같이 봐야 한다.

```json
{
  "data": [
    {
      "type": "customerReviews",
      "id": "00000028-b08c-0014-729e-fbd500000000",
      "attributes": {
        "rating": 5,
        "title": "Awesome!!!",
        "body": "It's a really fantastic app!",
        "reviewerNickname": "Anne Johnson",
        "createdDate": "2017-11-15T08:10:34-08:00",
        "territory": "USA"
      },
      "relationships": {
        "response": {
          "links": {
            "self": "https://api.appstoreconnect.apple.com/v1/customerReviews/00000028-b08c-0014-729e-fbd500000000/relationships/response",
            "related": "https://api.appstoreconnect.apple.com/v1/customerReviews/00000028-b08c-0014-729e-fbd500000000/response"
          }
        }
      },
      "links": {
        "self": "https://api.appstoreconnect.apple.com/v1/customerReviews/00000028-b08c-0014-729e-fbd500000000"
      }
    }
  ],
  "links": {
    "self": "https://api.appstoreconnect.apple.com/v1/apps/682658836/customerReviews?limit=1",
    "next": "https://api.appstoreconnect.apple.com/v1/apps/682658836/customerReviews?cursor=AQ.AMt2C-U&limit=1"
  },
  "meta": {
    "paging": {
      "total": 4326,
      "limit": 1
    }
  }
}
```

> 이 예시에 `reviewerNickname`이 보이는 것은 **Apple이 필드를 안 골라서**다.
> 우리는 [위 표](#4-3-엔드포인트와-요청)대로 `fields[customerReviews]`에서 빼므로 응답에 오지 않는다.

**여기서 놓치면 안 되는 두 가지.**

| 필드 | 왜 중요한가 |
|---|---|
| **최상위 `links.next`** | 항목 안의 `links.self`(리뷰 하나의 API 주소)와 **다른 것**이다. 페이지를 넘기는 것은 최상위 `links.next` 하나뿐이다 → [4-5](#4-5-상한쿼터페이지네이션) |
| **`meta.paging.total`** | 그 앱의 **전체 리뷰 수를 첫 응답이 그냥 알려준다**(예시에서 4,326). 페이지 상한이 충분한지, 수집이 도중에 끊겼는지를 사후 SQL 없이 그 자리에서 판정할 수 있다 → [4-5](#4-5-상한쿼터페이지네이션) · [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가) |

#### 오류 응답 규격

공식 문서가 이 엔드포인트에 대해 명시하는 상태 코드는 **200 / 400 / 401 / 403 / 404 / 429**이고,
**200을 제외한 전부가 같은 `ErrorResponse` 본문**을 돌려준다(2026-08-29 실측).

```json
{
  "errors": [
    {
      "status": "401",
      "code": "NOT_AUTHORIZED",
      "title": "Authentication credentials are missing or invalid.",
      "detail": "Provide a properly configured and signed bearer token, ...",
      "id": "d1f4e2a0-....",
      "source": { "parameter": "limit" }
    }
  ]
}
```

| 키 | 필수 | 뜻 |
|---|---|---|
| `errors[].status` | ✅ | 문자열로 담긴 HTTP 상태. 원문: `The HTTP status code of the error.` 요청이 오류를 여러 개 내면 응답 상태와 다를 수 있다 |
| `errors[].code` | ✅ | **분기에 쓸 값.** 점으로 구분된 계층형 문자열. 원문: `This value is parseable for programmatic error handling in code.` |
| `errors[].title` / `.detail` | ✅ | 사람이 읽는 설명. 원문이 **`Do not use this field for programmatic error handling.`** 이라고 못 박는다 — 문자열 매칭으로 분기하지 말 것 |
| `errors[].id` | | 이 오류 인스턴스의 고유 ID. Apple에 문의할 때 쓴다. **로그에 같이 남긴다** |
| `errors[].source` | | `source.Parameter`(쿼리 파라미터가 원인) 또는 `source.JsonPointer`(본문이 원인) |

**우리가 실제로 갈라야 하는 것은 셋이다.**

| 상태 | 대표 `code` | 뜻과 조치 |
|---|---|---|
| **401** | `NOT_AUTHORIZED` | JWT 문제. 서명 형식·Issuer ID·만료 → [4-6 (2)](#4-6-함정) · [4-6 (7)](#4-6-함정) |
| **403** | (역할 관련) | 서명은 맞고 **권한이 부족**하거나 **그 앱이 이 키의 계정 소유가 아니다** → [5-1](#5-1-jwt가-유효한가-수집기-없이-키만-검증) · [5-2](#5-2-앱-id가-맞는가) |
| **429** | `RATE_LIMIT_EXCEEDED` | 쿼터 초과. **재시도하지 말고 사유를 남기고 끊는다** → [4-6 (10)](#4-6-함정) |

> `code` 값은 401의 `NOT_AUTHORIZED`와 429의 `RATE_LIMIT_EXCEEDED`만 공식 문서에서 확인했다.
> ⚠️ **403·404의 정확한 `code` 문자열은 확인하지 못했다.** 그래서 아래 코드는 `code`가 아니라
> **HTTP 상태로 분기**하고, `code`는 로그에만 남긴다. 실제 값을 받으면 이 표에 되적는다 → [5-1](#5-1-jwt가-유효한가-수집기-없이-키만-검증)

---

### 4-4. 응답 → RawItem 매핑

`RawItem`은 [../../packages/core/src/types.ts](../../packages/core/src/types.ts)에 있다.

| RawItem 필드 | 이 API의 응답 필드 | 비고 |
|---|---|---|
| `source` | — | 코드가 고정으로 `'appstore'`. **바꾸지 않는다.** 소스 키를 바꾸면 화면 필터·상한 설정·기존 데이터가 전부 갈라진다 |
| `sourceId` | `data[].id` | 🔴 UUID 형식 문자열(`00000028-b08c-...`). **RSS는 숫자 문자열(`14431380242`)이었다.** 체계가 달라 중복 판정이 이어지지 않는다 → [4-6](#4-6-함정) |
| `url` | ⚠️ **조립한다 (응답에 없다)** | API는 리뷰 개별 URL을 주지 않는다. 항목의 `links.self`는 API 주소라 사람이 못 연다. `https://apps.apple.com/{2자국가}/app/id{숫자ID}?see-all=reviews`를 문자열로 만든다(요청은 보내지 않는다). 🔴 **두 조각을 어디서 가져오는지가 이 전환에서 바뀐다 → 바로 아래 결정 트리.** 리뷰별이 아니라 앱별 링크인 것은 RSS 시절과 같다 |
| `author` | ⛔ **비운다** (`attributes.reviewerNickname`을 **요청하지 않는다**) | ⚠️ 개인정보. [2-5](#2-5-남은-리스크)의 권고대로 전환 시점에 버린다 — 어차피 전량 재적재라 정리 비용이 0이다. [4-3](#4-3-엔드포인트와-요청)의 `fields[customerReviews]`에 넣지 않으므로 **응답에 아예 오지 않는다.** 되살리려면 그 목록에 필드 하나를 더하고 이 행을 `attributes.reviewerNickname`으로 되돌리면 된다 |
| `content` | `attributes.title` + `attributes.body` | 현행 규칙 유지: 둘 다 있고 서로 다르면 `제목\n본문`, 아니면 있는 쪽 하나. 🔴 **둘 다 비면 그 항목을 버린다** — 현행 수집기 **57줄의 스킵 조건**(id가 없거나 title·body가 둘 다 빈 항목을 `continue`)을 그대로 옮긴다. 이 스킵이 없으면 `content: ''` 행이 생겨 [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 "빈 문자열 0건" 기준이 첫 실행부터 깨진다. **RSS 대비 손실 없음** |
| `rating` | `attributes.rating` | 1~5 정수. RSS는 문자열이라 `Number()`가 필요했는데 여기선 이미 숫자다 |
| `postedAt` | `attributes.createdDate` | `2017-11-15T08:10:34-08:00` 형식(오프셋 포함). **기존 `normalizeInstant()`가 그대로 처리한다** — RSS도 태평양 오프셋이었으므로 로직 변경 없음 |
| `keyword` | ❌ **못 채운다** | 앱 리뷰는 키워드 검색이 아니다. 현행도 비어 있으므로 변화 없음 |
| `service` | — | 코드가 채운다. **어느 앱을 조회했는지**로 정한다 (현행과 동일) |
| `country` | `attributes.territory` | 🔴 **형식이 다르다.** API는 **alpha-3 대문자**(`KOR`, `USA`), `RawItem.country`는 **소문자 두 자**(`kr`, `us`). 변환 함수가 필요하다 → [4-6](#4-6-함정) |

#### `url` 결정 트리 — 조각 두 개가 다 바뀔 수 있다

**링크가 깨져도 오류가 안 난다.** 우리는 이 주소로 요청을 보내지 않고 문자열만 만들기 때문에,
잘못 만들어도 수집은 성공하고 **사람이 클릭하는 순간에만 드러난다.** 이 문서가 잡겠다는 조용한 실패다.

**조각 ①  `{숫자ID}` — [5-2](#5-2-앱-id가-맞는가)의 결과로 갈린다**

| 5-2 결과 | 경로 파라미터에 쓸 값 | 링크에 쓸 값 |
|---|---|---|
| 설정의 숫자 `appId`로 **200** | `appId` 그대로 | `appId` 그대로. `storeId`는 비워 둔다 |
| **404** (opaque resource ID가 필요) | `GET /v1/apps`의 `data[].id` | 🔴 **그 UUID를 링크에 쓰면 안 된다.** 설정의 `appId`를 opaque ID로 갈아끼우고, **지금 들어 있던 숫자 값을 `storeId`로 옮긴다**([4-2 설정과 시그니처](#설정과-시그니처)의 `storeId?`). 링크는 `storeId`만 쓴다 |

`apps.apple.com/kr/app/id00000028-b08c-...`는 사람이 열면 없는 페이지다. **그런데 수집기는 아무 오류도 내지 않는다.**

**조각 ②  `{2자국가}` — [5-4](#5-4-국가가-섞여-오는가)의 결과로 갈린다**

| 5-4 결과 | 국가 루프 | 링크의 국가 |
|---|---|---|
| 필터 없이 **여러 territory**가 온다 | 지운다 | 🔴 **입력 국가가 사라진다.** 항목의 `attributes.territory`(`KOR`)를 alpha-2 소문자(`kr`)로 변환해 쓴다 — 즉 `RawItem.country`와 **같은 값**이다 |
| **한 국가만** 온다 | 남긴다 | 조회에 쓴 국가를 그대로 쓴다 (현행과 동일) |

**어느 쪽이든 아래 한 줄로 수렴한다.** 국가 루프를 남기는 경우에도 응답의 `territory`는 조회 국가와
같으므로 이 코드가 그대로 맞는다.

```ts
// alpha-3 → 소문자 alpha-2. 함수와 변환표 전문은 4-6 (3)에 있고,
// 사는 곳은 packages/core/src/paths.ts 359줄(LANG_BY_COUNTRY 옆)이다 → 4-2 표 3행
import { toAlpha2 } from '@feedback-radar/core';

const cc = toAlpha2(r.attributes.territory);
if (!cc) {
  // 링크를 통째로 비우지 않는다. 모르는 코드 하나 때문에 그 앱 링크가 전부 사라지는 편이 더 나쁘다
  console.warn(`  앱스토어: 모르는 territory '${r.attributes.territory}' — 링크 국가를 설정 기본값으로 대체`);
}
const url =
  `https://apps.apple.com/${cc ?? app.fallbackCountry ?? 'kr'}` +
  `/app/id${app.storeId ?? app.appId}?see-all=reviews`;
```

검증은 [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 `url` 행에서 한다.

**요약: RSS 대비 잃는 필드가 없다.** 바뀌는 것은 세 가지다 — `sourceId` 체계,
`country` 표기 형식, 그리고 `url`을 만드는 **입력의 출처**. 뒤의 둘은 코드로 흡수할 수 있고,
`sourceId`는 흡수가 아니라 재적재다([4-6 (5)](#4-6-함정)).

---

### 4-5. 상한·쿼터·페이지네이션

| 항목 | 값 | 근거 |
|---|---|---|
| 한 번에 받는 건수 | 기본값은 문서에 없음. **`limit` 최대 200** | Apple 문서 파라미터 스펙 (`maximum: 200`) |
| 시간당 요청 수 | **API 키마다** 롤링 1시간 기준. 값은 응답 헤더로 알려준다 | 원문: `The limits apply to requests you send using the same API key.` |
| 한도 확인 방법 | 모든 응답의 `X-Rate-Limit` 헤더. 형식: `user-hour-lim:3500;user-hour-rem:500;` | Apple 문서 예시 그대로 |
| 초과 시 | **HTTP 429**, 에러 코드 `RATE_LIMIT_EXCEEDED` | Apple 문서 |
| 시간 창 | 원문: `The time frame is a "rolling hour."` 즉 지난 60분 누적 기준 | |

> ⚠️ **`3500`은 예시 숫자다.** Apple 문서 원문이 `Actual limits can vary.`라고 명시한다.
> **우리 키의 실제 한도는 첫 호출의 헤더를 찍어서 확인해야 한다** → [5-5](#5-5-쿼터-여유-확인).
> 다만 앱 몇 종을 하루 몇 번 도는 규모에서는 어느 쪽이든 여유가 크다([3-2](#3-2-무료-대신-무엇이-제약인가--쿼터-숫자)에 계산).

#### 몇 쪽까지 받을 것인가 — `maxPages`의 값과 근거

**`maxPages`는 새로 만드는 상수가 아니다. 기존 설정값 `appstorePages`를 그대로 쓴다.**

```ts
const maxPages = Math.max(1, opts.pages);   // opts.pages = limits.appstorePages
```

새 상수를 만들면 화면의 상한 카드와 실제 수집량이 갈라진다. 화면에서 조정할 수 있는 값 하나가
그대로 페이지 상한이어야 [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 건수 검증이 성립한다.

**그래서 [`collect-limits.ts` 105줄](../../packages/core/src/collect-limits.ts)을 이렇게 고친다.**
1쪽이 50건에서 200건으로 4배가 되므로 **같은 숫자를 두면 수집량이 조용히 4배가 된다.**

| 항목 | 지금 | 바꿀 값 | 왜 |
|---|---|---|---|
| `perUnit` | `50` | **`200`** | API 1쪽이 200건이다(`limit` 최대). 안 고치면 총량 추산과 분류 호출 추산이 실제의 1/4로 나온다 |
| `unit` | `'페이지 (앱당, 1페이지=50건)'` | **`'쪽 (앱당, 1쪽=200건)'`** | 카드에 그대로 뜨는 문구다. 숫자가 틀리면 사람이 상한을 잘못 정한다 |
| `min` | `1` | **그대로 `1`** | 🔴 **값은 안 바뀌는데 뜻이 바뀐다.** 1쪽이 200건이 되므로 **최소 수집량이 50 → 200건으로 오르고, 그 아래로 내릴 수단이 사라진다.** 그래도 `1` 그대로 둔다 — 더 낮추려면 요청의 `limit`을 200 미만으로 줄여야 하는데, 그러면 `perUnit`(200)과 화면 추산이 갈려 [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 건수 검증이 무너진다. 200건이 부담이면 줄일 자리는 `min`이 아니라 **수집 주기**다 |
| `def` | `3` (=150건) | **`1`** (=200건) | 상시 수집의 기본값. 최근 30일 실측이 11건이라 200건이면 넘친다. 3을 두면 600건을 매번 훑는다 |
| `max` | `10` (=500건) | **`5`** (=1,000건) | **상시 수집이 아니라 예외 실행용 여유다**(어떤 실행인지는 바로 아래 ⚠️). 전 기간 누적이 344건이므로, 경계 날짜를 끄고 도는 백필이라면 1,000건으로 과거가 한 번에 끝난다. `10`을 그대로 두면 **앱당 2,000건 상한**이 되어, 사람이 슬라이더를 끝까지 밀었을 때 분류 비용이 예상의 4배로 튄다 |
| `effect` | `OLDER` | **그대로** | "값을 키우면 최근 글이 아니라 더 옛날 리뷰가 들어옵니다"는 API에서도 참이다(`sort=-createdDate`) |

> ⚠️ **`max`의 근거는 상시 수집에서는 성립하지 않는다.** 권고안인 [4-6 (5)](#4-6-함정) 방침 C를
> 따르면 상시 수집은 `since: APPSTORE_CUTOVER`를 넘겨 경계에서 루프가 끊기므로 **5쪽까지 갈 일이 없다.**
> `5`가 실제로 쓰이는 경우는 셋뿐이다.
>
> | 언제 | 경계 날짜 |
> |---|---|
> | 방침 B(옛 행 삭제 후 전량 재적재)를 고른 경우 | 끈다 (`APPSTORE_BACKFILL=1`) |
> | `meta.paging.total` 대조를 한 번 해 보는 검증 실행 → [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가) | 끈다 |
> | 방침 C인데 파이프라인이 오래 멈췄다가 밀린 리뷰를 한 번에 받을 때 | 켠 채로 (경계 이후만 받으면 되고, 그 양이 1쪽을 넘을 수 있다) |
>
> **앞의 둘은 [4-2 (d)](#설정과-시그니처)의 `APPSTORE_BACKFILL` 스위치가 없으면 실행할 방법이 없다.**
> 그래서 `max: 5`와 그 스위치는 한 몸이다. 스위치를 안 만들 거라면 `max`는 `2`면 충분하다.

**같은 파일 143~144줄도 같은 논리에 걸린다 — `API_COLLECT_DEFAULTS.appstorePages: 1`**

배포판(요청 하나·최대 5분)이 쓰는 보수적 첫 시작점이다. **값은 `1` 그대로 두지만 그냥 지나치면 안 된다.**

| | 값 | 판단 |
|---|---|---|
| 지금 | `appstorePages: 1` (=50건) | — |
| 전환 후 | `appstorePages: 1` (=**200건**) | **그대로 둔다.** 이미 `min`이고, 요청 수는 1회로 같아 5분 예산에는 영향이 없다 |
| 그래도 확인할 것 | — | 배포판 1회 수집량이 **50 → 200건으로 4배**가 되고, **분류 호출도 그만큼 늘어난다.** 5분 예산이 모자라면 여기가 아니라 분류 쪽에서 먼저 걸린다 → [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)에서 첫 실행 시간을 잰다 |

**최대 상한 = 앱당 5쪽 × 200건 = 1,000건.** 국가 루프를 남기는 경우에는 **앱·국가당** 1,000건이다.

> ⚠️ **344건은 RSS로 받은 수이지 그 앱의 전체 리뷰 수가 아니다.** RSS에는 상한이 있었고
> [(9)](#4-6-함정)처럼 이미 리뷰를 안 주고 있었을 수 있다. **실제 전체 건수는 첫 실행의
> `meta.paging.total`이 알려준다**(아래). 그 값이 1,000을 크게 넘으면 `max`를 올리기보다
> **백필을 여러 주기에 나눠 받는 편**이 낫다 — 한 번에 분류 비용을 몰아 쓰지 않는다.

#### 전체 건수를 응답이 알려준다 — `meta.paging.total`

**첫 응답의 `meta.paging.total`이 그 앱의 전체 리뷰 수다**([4-3의 예시 응답](#4-3-엔드포인트와-요청) 참고).
페이지 상한이 충분한지, 수집이 도중에 끊겼는지를 **사후 SQL 없이 그 자리에서** 판정할 수 있다.

- 남은 페이지 = `ceil(total / 200)`. 이 값이 `maxPages`보다 크면 **이번 실행은 전부 못 받는다.**
- 상한에 걸려 끊긴 것과 정말 다 받은 것을 **로그로 구별한다.** 구별하지 않으면 매번 잘려 들어오는데도
  "정상 종료"로 보인다 — 이 문서가 잡겠다는 조용한 실패다.
- ⚠️ **`meta`는 선택 필드다**(`CustomerReviewsResponse` 스펙에서 `required: false`, 실측 확인).
  **없을 수 있다고 보고 코드를 짠다.** 없으면 이 검사를 건너뛰고, 있다고 가정해 `.total`을 바로 읽지 않는다.

#### 페이지 넘기는 방법

응답의 `links` 객체를 따라간다 (`PagedDocumentLinks` 스펙, 실측 확인):

| 필드 | 의미 |
|---|---|
| `links.self` | 이번 요청 URL (필수) |
| `links.next` | **다음 페이지의 완성된 URL.** 없으면 마지막 페이지 |
| `links.first` | 첫 페이지 URL |

**`links.next`를 문자열 그대로 다시 GET한다.** 커서를 직접 조립하지 않는다.
(내부 파라미터는 `cursor`다 — Apple의 scope 문서가 `limit`, `cursor`, `sort`를 스코프 검사에서
무시한다고 언급하며 이름을 드러낸다. 하지만 **직접 만들 필요가 없다.**)

> ⚠️ **`links.next`가 원래 쿼리를 전부 물고 가는지는 확인하지 못했다.** 공식 예시의 next URL은
> `...?cursor=AQ.AMt2C-U&limit=1`인데, 그 예시 요청 자체가 `?limit=1`뿐이라 `sort`·`fields`가
> 이어지는지 알 수 없다. **만약 안 이어지면 2쪽부터 정렬이 바뀌고 닉네임이 딸려 온다** — 오류 없이.
>
> 🔴 **닉네임 쪽은 사후에 못 잡는다.** [4-4](#4-4-응답--rawitem-매핑)의 매핑이 `reviewerNickname`을
> **아예 읽지 않으므로**, 응답에 딸려 와도 `items.author`는 항상 빈다. 즉
> [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 `닉네임_유입` SQL은 쿼리가 유실된
> 상황에서도 0을 낸다. **그 검사는 "우리가 요청 목록에 닉네임을 되넣지 않았는가"를 보는 것이지
> 이 문제의 안전망이 아니다.**
>
> **실제 안전망은 두 개다.**
> - **실행 중**: 쪽이 넘어갈 때 **직전 쪽의 최소 `createdDate`보다 새로운 항목이 나오면** 정렬이
>   이어지지 않은 것이다. 아래 코드의 `prevPageMin` 검사가 이걸 그 자리에서 경고로 남긴다.
>   **이 검사는 방침 C의 조기 종료가 올바른지도 같이 지킨다** — 순서가 깨지면 "오래된 것 하나"가
>   끝을 뜻하지 않게 되어 [4-6 (5)](#4-6-함정)의 `reachedBoundary`가 멀쩡한 리뷰를 버린다.
> - **첫 실행 눈 검사**: [5-3](#5-3-정렬이-실제로-최신순인가--가장-중요)에서 1쪽의 `links.next`를
>   그대로 GET해 2쪽의 `createdDate` 순서와 `reviewerNickname` 유무를 직접 본다.
>
> 이어지지 않는 것으로 확인되면 `links.next`의 `cursor`만 뽑아 우리 쿼리에 붙여 쓴다.

```ts
const q = new URLSearchParams({
  limit: '200',
  sort: '-createdDate',                 // 생략하면 안 된다 → 4-6 (1)
  'fields[customerReviews]': 'rating,title,body,createdDate,territory',
});
// 5-4 결과에 따라 국가 필터를 걸 수도, 안 걸 수도 있다 → 4-6 (4)
if (opts.territories?.length) q.set('filter[territory]', opts.territories.join(','));

let url = `https://api.appstoreconnect.apple.com/v1/apps/${app.appId}/customerReviews?${q}`;
const maxPages = Math.max(1, opts.pages);
const sinceMs = opts.since ? new Date(opts.since).getTime() : undefined;
const items: RawItem[] = [];

let token = ascToken(app.key);          // 수명 15분 → 4-2
let tokenAt = Date.now();
let total: number | undefined;          // meta.paging.total. 없을 수 있다
let stoppedEarly = false;               // 오류로 끊겼는지 (총건수 경고를 중복으로 내지 않으려고)
let prevPageMin: number | undefined;    // 직전 쪽의 가장 오래된 createdDate (정렬 유실 감지용)
let sortWarned = false;

/**
 * 화면 작업 목록에 올릴 사유. 로그만으로는 안 된다 — 이 경로의 고장은 예외가 아니라
 * '건수만 적은 성공'이라 note가 비면 429도 401도 '완료, 0건'으로 보인다 → 4-6 (10) · 5-7
 */
let note: string | undefined;
const addNote = (m: string): void => {
  note = (note ? `${note} / ${m}` : m).slice(0, 200);
};

for (let page = 0; page < maxPages; page++) {
  // 긴 수집 중 토큰이 만료되면 중간부터 401이고, 앞 페이지는 이미 들어와 '부분 수집'으로
  // 조용히 끝난다. 12분이 지났으면 새로 만든다 (상한 20분, 발급 수명 15분) → 4-6 (7)
  if (Date.now() - tokenAt > 12 * 60_000) {
    token = ascToken(app.key);
    tokenAt = Date.now();
  }

  let res: Response;
  try {
    // 타임아웃이 없으면 애플이 응답을 붙들 때 쪽마다 수 분씩 매달리고, 상주 스케줄러는
    // 그 시간 내내 다음 주기를 건너뛴다. AbortSignal.timeout()은 **throw**하므로
    // 이 try/catch가 없으면 예외가 수집기 밖으로 튄다 (현행 수집기와 같은 이유)
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`  앱스토어 ${page + 1}쪽 요청 실패: ${(e as Error).message}`);
    addNote(`${page + 1}쪽 요청 실패: ${(e as Error).message}`);
    stoppedEarly = true;
    break;
  }

  // 0건으로 끝났을 때 이유를 남긴다. 조용히 break하면 401/429를 '리뷰 없음'으로 오해한다.
  // 로그와 note에 **둘 다** 남긴다 — 로그는 원인 추적용, note는 화면용이다 → 5-7
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 429) {
      // 쿼터는 롤링 1시간이라 몇 초 기다려도 안 풀린다. 재시도하지 않는다 → 4-6 (10)
      const limitHeader = res.headers.get('x-rate-limit') ?? 'X-Rate-Limit 헤더 없음';
      console.warn(`  앱스토어 ${page + 1}쪽 쿼터 초과(HTTP 429): ${limitHeader} ${body}`);
      addNote(`HTTP 429 쿼터 초과 (${page + 1}쪽에서 중단, ${limitHeader})`);
    } else {
      console.warn(`  앱스토어 ${page + 1}쪽 응답 오류: HTTP ${res.status} ${body}`);
      // 본문의 code/title로 분기하지 않는다 → 4-3. 상태 코드만 사유로 올린다
      addNote(`HTTP ${res.status} (${page + 1}쪽에서 중단)`);
    }
    stoppedEarly = true;
    break;
  }

  const json = await res.json();
  total ??= json.meta?.paging?.total;   // meta는 선택 필드다. 있을 때만 쓴다

  let reachedBoundary = false;
  let pageMin: number | undefined;      // 이 쪽에서 본 가장 오래된 createdDate
  for (const r of json.data ?? []) {
    const at = new Date(r.attributes?.createdDate).getTime();
    /*
      쪽이 넘어갈 때 정렬이 이어졌는지 본다. links.next가 sort를 버리면 2쪽부터 순서가
      바뀌는데 오류가 나지 않는다(위 ⚠️). 직전 쪽의 최솟값보다 **새로운** 항목이 나오면 그 신호다.
      경고만 남기고 계속 받는다 — 여기서 끊으면 정상인 경우까지 잘린다.
    */
    if (!sortWarned && prevPageMin !== undefined && !Number.isNaN(at) && at > prevPageMin) {
      sortWarned = true;
      const m = `${page + 1}쪽부터 정렬이 이어지지 않은 것으로 보입니다 (links.next가 sort를 버린 듯)`;
      console.warn(`  앱스토어: ${m} — 4-5의 links.next 항목 참고`);
      addNote(m);
    }
    /*
      경계 날짜보다 오래된 것이 나오면 이후는 전부 더 오래됐다(sort=-createdDate).
      더 받을 이유가 없으므로 그 자리에서 끊는다 → 4-6 (5) 방침 C.
      문자열 비교를 쓰지 않는 이유: createdDate에 오프셋이 붙어 와서(-08:00 등)
      사전순 비교가 실제 시각 순서와 어긋난다.
      🔴 정렬이 깨진 상태(sortWarned)에서는 이 조기 종료가 멀쩡한 리뷰를 버린다. 그래서 위 검사가
      단순한 경고가 아니다 — 경고가 뜨면 cursor 방식으로 바꾸기 전까지 백필 결과를 믿지 않는다.
    */
    if (sinceMs !== undefined && at < sinceMs) {
      reachedBoundary = true;
      break;
    }
    if (!Number.isNaN(at)) pageMin = pageMin === undefined ? at : Math.min(pageMin, at);
    const it = toRawItem(r, app, service);
    if (it) items.push(it);             // title·body가 둘 다 비면 null → 4-4
  }
  if (pageMin !== undefined) prevPageMin = pageMin;
  if (reachedBoundary) break;

  if (!json.links?.next) break;         // 마지막 페이지
  url = json.links.next;                // 커서를 조립하지 않고 그대로 따라간다
}

// 상한에 걸려 잘린 것과 정말 다 받은 것을 구별해 남긴다. 안 하면 매번 잘려도 '정상'으로 보인다
if (!stoppedEarly && total !== undefined && items.length < total && sinceMs === undefined) {
  const m = `전체 ${total}건 중 ${items.length}건에서 멈춤 (쪽 상한 ${maxPages})`;
  console.warn(
    `  앱스토어(id=${app.appId}): ${m}. 첫 수집이면 정상이고, 매번 이러면 appstorePages를 올릴 것`,
  );
  addNote(m);
}

// 사유는 로그가 아니라 이 반환값으로 화면까지 간다 → 4-2 (d) · (e)
return { items, note };
```

**`maxPages` 상한을 반드시 둔다.** 페이지가 끝없이 이어질 때 루프가 멈추지 않으면 상주 스케줄러가
다음 주기를 통째로 건너뛴다(현재 RSS 코드가 타임아웃을 두는 이유와 같다).

> **경계 날짜를 쓰는 동안에는 `total` 경고가 꺼진다**(`sinceMs === undefined` 조건).
> 방침 C는 **일부러** 오래된 것을 안 받는 것이라, 그 상태에서 `items.length < total`은 정상이다.
> 조건을 빼면 매 실행마다 거짓 경고가 뜨고, 사람이 곧 경고를 무시하게 된다.

---

### 4-6. 함정

**조용히 실패하는 지점만 모았다. 아래는 전부 "오류 없이 0건이 되거나 잘린 데이터가 들어오는" 경우다.**

#### (1) 🔴 정렬을 명시하지 않으면 최신 리뷰가 안 들어올 수 있다 — ⚠️ 확인 필요

- **확인된 것**: `sort`는 선택 파라미터이고 허용값은 `rating`, `-rating`, `createdDate`, `-createdDate`
  네 개다(Apple 문서 실측). `-createdDate`가 최신순이다.
- **확인하지 못한 것**: **`sort`를 생략했을 때의 기본 정렬이 무엇인지 Apple 문서에 적혀 있지 않다.**
  문서에 그런 문장 자체가 없다. Apple 문서 본문이 JS로 렌더돼 사람이 브라우저로 열지 않으면
  전문을 못 보는데, 이번에 문서 데이터를 직접 받아 파라미터 스펙까지 확인했음에도 **기본값 문장은
  존재하지 않았다.**
- **위험**: 기본이 오래된 순이라면 매 실행마다 **2022년 리뷰만 200건씩** 받아 오고, 중복 판정에
  전부 걸려 저장은 0건이 된다. 화면에는 "수집 200건 / 신규 0건"이 뜬다.
  **오류가 없으므로 몇 주 동안 눈치채지 못한다.**
- **대응**: **`sort=-createdDate`를 항상 명시한다.** 기본값이 무엇이든 상관없어진다.
  그리고 [5절](#5-붙인-뒤-확인할-것)에서 첫 응답의 `createdDate`가 실제로 내림차순인지 눈으로 본다.

#### (2) 🔴 `dsaEncoding`을 빠뜨리면 401만 돌아온다

[4-2](#4-2-인증) 참고. **에러 메시지가 "서명 형식이 틀렸다"가 아니라 그냥
`NOT_AUTHORIZED / Authentication credentials are missing or invalid.`다.**
키가 잘못됐는지, Issuer ID가 틀렸는지, 서명 형식인지 구별해 주지 않는다.
서명부 길이 86자를 먼저 확인하면 이 갈래를 빠르게 잘라낼 수 있다.

#### (3) 🔴 국가 코드 형식이 다르다 — `filter[territory]=kr`은 우리 코드를 조용히 망가뜨린다

| | 형식 | 예 |
|---|---|---|
| API `filter[territory]` / `attributes.territory` | **ISO 3166-1 alpha-3 대문자** | `KOR`, `USA`, `JPN`, `FRA` |
| 우리 `RawItem.country` | **소문자 두 자** | `kr`, `us`, `jp`, `fr` |
| 우리 설정 `appstore.countries` | 소문자 두 자 | `["kr"]` |

- 설정값을 그대로 `filter[territory]`에 넣으면 허용값 목록에 없는 값이라 실패한다.
  `filter[territory]`는 **허용값이 alpha-3 대문자로 열거된 파라미터**이고(공식 스펙 실측),
  이 엔드포인트는 **400 Bad Request를 정의된 응답으로 갖는다**([4-3 오류 응답 규격](#4-3-엔드포인트와-요청)).
  ⚠️ 다만 **실제로 400으로 끊기는지, 무시되고 전 국가가 오는지는 확인하지 못했다.** 후자면 조용한 오염이다.
  → [5-4](#5-4-국가가-섞여-오는가)에서 잘못된 값을 한 번 넣어 보면 그 자리에서 갈린다.
- 반대로 응답의 `territory`(`KOR`)를 그대로 `country`에 저장하면 **화면의 국가 칩 필터가
  기존 데이터(`kr`)와 갈라져** 같은 국가가 두 개로 보인다.
- **대응**: alpha-3 → 소문자 alpha-2 변환 함수(`toAlpha2()`)를 만들고, **저장 직전에 반드시 통과시킨다.**
  `RawItem.country`와 [`url`](#url-결정-트리--조각-두-개가-다-바뀔-수-있다) **둘 다** 이 함수를 거쳐야 한다 —
  한쪽만 태우는 것이 실제로 흔한 실수다.
- **변환표에 없는 코드가 오면**: 버리지 말고 **경고를 남기고 원본을 소문자로 넣는다**(조용한 유실 방지).
  그러면 `kor`처럼 **세 글자**가 들어가는데, 이는 버그가 아니라 **일부러 남긴 신호다** —
  [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 `country !~ '^[a-z]{2}$'` 검사에
  걸려 "모르는 국가가 왔다"를 알려 준다. 그때 아래 변환표에 그 코드를 추가한다.

**변환표와 함수 — 그대로 옮겨 쓴다.**

**Node에도 `Intl`에도 alpha-2 ↔ alpha-3 변환이 없다.** `Intl.DisplayNames`는 이름만 주고
`'KOR'`을 `'kr'`로 바꿔 주지 않는다. 그래서 **표를 손으로 둔다.** 사는 곳은
[`packages/core/src/paths.ts`](../../packages/core/src/paths.ts) **359줄의 `LANG_BY_COUNTRY` 옆**이다
(같은 성격의 표가 이미 거기 있고, `paths.ts`는 `index.ts` 4줄에서 `export *` 되어 수집기가 바로 쓴다).

```ts
// packages/core/src/paths.ts (LANG_BY_COUNTRY 옆에 신설)

/**
 * 스토어 국가 코드 변환표. **표는 하나만 둔다.** 양방향을 따로 관리하면 언젠가 어긋난다.
 *
 * 담는 범위: 우리가 스토어 국가로 설정할 만한 코드들. 전 세계를 다 넣지 않는 이유는
 * 없는 코드가 와도 조용히 죽지 않게 설계돼 있기 때문이다(아래 toAlpha2 주석).
 * 애플이 표준 밖 territory를 쓰는 경우도 같은 경로로 드러난다.
 */
const ALPHA3_BY_COUNTRY: Record<string, string> = {
  kr: 'KOR', jp: 'JPN', cn: 'CHN', tw: 'TWN', hk: 'HKG', sg: 'SGP', my: 'MYS',
  th: 'THA', vn: 'VNM', id: 'IDN', ph: 'PHL', in: 'IND',
  us: 'USA', ca: 'CAN', mx: 'MEX', br: 'BRA', ar: 'ARG', cl: 'CHL',
  gb: 'GBR', de: 'DEU', fr: 'FRA', es: 'ESP', it: 'ITA', nl: 'NLD', se: 'SWE',
  no: 'NOR', dk: 'DNK', fi: 'FIN', pl: 'POL', pt: 'PRT', tr: 'TUR', ru: 'RUS',
  au: 'AUS', nz: 'NZL', ae: 'ARE', sa: 'SAU', za: 'ZAF', eg: 'EGY',
};

// 역방향은 만들지 않고 뒤집는다. 표가 하나라 두 방향이 어긋날 수 없다
const COUNTRY_BY_ALPHA3: Record<string, string> = Object.fromEntries(
  Object.entries(ALPHA3_BY_COUNTRY).map(([cc, a3]) => [a3, cc]),
);

/**
 * 'KOR' → 'kr'. 응답의 territory를 우리 표기로 바꾼다.
 *
 * 표에 없으면 undefined를 준다. **호출부가 경고를 남기고 원본을 소문자로 저장하는 것이 규칙이다**
 * — 버리면 조용한 유실이고, 세 글자로 들어가면 5-6의 country 검사에 걸려 사람이 알게 된다.
 */
export function toAlpha2(territory?: string): string | undefined {
  const key = territory?.trim().toUpperCase();
  if (!key) return undefined;
  return COUNTRY_BY_ALPHA3[key];
}

/**
 * 'kr' → 'KOR'. 설정의 국가를 filter[territory]에 넣을 때 쓴다 → 4-2 (d)의 국가 루프 분기.
 * 표에 없으면 undefined. **그 국가는 건너뛰고 사유를 남긴다** — 소문자를 그대로 넣으면
 * 400이거나(안전) 무시되고 전 국가가 오거나(조용한 오염)로 갈리는데, 어느 쪽인지 아직 모른다(5-4).
 */
export function toAlpha3(country?: string): string | undefined {
  const key = country?.trim().toLowerCase();
  if (!key) return undefined;
  return ALPHA3_BY_COUNTRY[key];
}
```

**두 자리에서 폴백이 서로 다르다. 헷갈리기 쉬우니 나란히 적어 둔다.**

| 쓰는 곳 | 변환 실패 시 | 왜 |
|---|---|---|
| `RawItem.country` | **원본을 소문자로**(`kor`) | 세 글자가 [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 신호다 |
| `url`의 국가 조각 | **`app.fallbackCountry ?? 'kr'`** → [4-4](#url-결정-트리--조각-두-개가-다-바뀔-수-있다) | 링크에 `kor`을 넣으면 없는 페이지가 된다. 링크는 사람이 열 수 있는 값이어야 한다 |
| 요청의 `filter[territory]` | **그 국가를 건너뛰고 사유를 남긴다** → [4-2 (d)](#설정과-시그니처) | 잘못된 값이 무시되면 전 국가가 조용히 섞여 들어온다 |

```ts
// 매핑에서 country를 채우는 한 줄 (4-4의 country 행)
country: toAlpha2(r.attributes.territory) ?? r.attributes.territory?.trim().toLowerCase(),
```

#### (4) 🟠 국가 루프가 더 이상 필요 없을 수 있다 — 그런데 지우면 화면이 연쇄로 바뀐다

현재 코드는 **국가마다 따로 요청한다**([../../apps/pipeline/src/daily.ts](../../apps/pipeline/src/daily.ts)
**267줄** `for (const country of storeCountries(svc.appstore))`). RSS는 국가별로 URL이 달라
그래야만 했다. 공식 API는 **응답 항목마다 `territory` 속성이 붙어 오고 `filter[territory]`는 선택**이다.

- **자연스러운 해석**: 필터를 안 걸면 전 국가 리뷰가 섞여 온다 → 앱당 1회 호출로 끝난다.
- ⚠️ **확인 필요**: **"필터가 없으면 전 국가"라고 명시한 문장을 Apple 문서에서 찾지 못했다.**
  구현 전에 실제 응답의 `territory` 분포로 확인할 것 → [5-4](#5-4-국가가-섞여-오는가).
- **전 국가가 온다면** 국가 필드의 성격이 바뀐다. 지금 `country`는 **어떤 리뷰 풀을 긁을지 정하는
  조회 파라미터**인데, 앞으로는 **응답에 붙어 오는 메타데이터**가 된다.
  현재는 한 국가만 조회 중이라(DB 실측: `appstore` 344건 전부 한 국가) 파급이 작다.
  → **지금이 이 정리를 하기 가장 싼 시점이다.** 나중에 국가가 늘어난 뒤 하면 화면 파급이 커진다.

**지우기로 했다면 같이 바뀌는 곳이 네 군데다.** 하나라도 빠지면 화면 숫자가 조용히 어긋난다.

| 바뀌는 곳 | 지금 | 지운 뒤 |
|---|---|---|
| `daily.ts` **264~275줄** (루프 자체는 267줄부터지만, 264줄 `const { appId } = svc.appstore!;`도 같이 바뀐다) | 국가마다 작업 1개 | **앱마다 작업 1개**, `country: ''` → [4-2 설정과 시그니처](#설정과-시그니처) (d) |
| 요청 URL | 국가별 URL | `filter[territory]`를 **넣지 않는다** (`opts.territories`를 비운다) |
| `RawItem.country` | 조회에 쓴 국가 | **응답 `territory`를 alpha-2로 변환한 값** → [(3)](#4-6-함정) |
| `apps/web/app/page.tsx` 611~614줄 | `storeCountries(s.appstore).length` | **`1`**. 안 고치면 총량 추산이 국가 수만큼 부풀고, 그 숫자를 보고 상한을 정한다 |

**링크(`url`)의 국가도 같이 바뀐다** → [4-4의 결정 트리](#url-결정-트리--조각-두-개가-다-바뀔-수-있다).

#### (5) 🔴 `sourceId` 체계가 달라 기존 데이터와 중복 판정이 끊긴다 — 재적재가 확정적이다

| | `sourceId` 예 |
|---|---|
| RSS (지금 DB에 쌓인 것) | `14431380242` — 숫자 문자열 |
| App Store Connect API | `00000028-b08c-0014-729e-fbd500000000` — UUID 형식 |

중복 판정은 `UNIQUE (source, source_id)`로 걸린다
([../../packages/core/src/store.ts](../../packages/core/src/store.ts)).
**두 체계 사이에 대응 관계가 없어 마이그레이션이 불가능하다.**

- **규모(DB 실측 2026-08-29)**: 기존 `appstore` 행 **344건** .
  전환 후 API가 겹치는 구간을 다시 가져오는 만큼 **중복으로 다시 쌓이고, 분류 비용도 다시 나간다.**
- **화면 영향**: 그 구간의 건수가 최대 2배로 부풀어 보인다. 급증 감지가 오작동할 수 있다.
- **착수 전에 방침을 정할 것 — 세 가지 중 하나:**

  | 방침 | 내용 | 대가 |
  |---|---|---|
  | **A. 재적재 감수** | 그냥 다시 쌓는다 | 344건 분류 비용 + 그 기간 통계 왜곡 |
  | **B. 옛 행 삭제** | `source='appstore'` 기존 행을 지우고 API로 다시 채운다 | 깨끗하다. 단 **API가 2022년까지 거슬러 올라가는지 먼저 확인해야 한다** — 안 되면 과거가 영구 유실된다 |
  | **C. 경계 날짜로 자른다** | 전환일 이전은 기존 행을 남기고, API 수집은 전환일 이후 `createdDate`만 저장 | 유실도 중복도 없다. 코드에 날짜 조건이 한 줄 붙는다 |

  **C를 권한다.** 유일하게 잃는 것이 없다.

  🔴 **단, C는 서버가 아니라 우리가 거른다.** **이 API에는 작성일로 거르는 파라미터가 없다**
  (공식 파라미터 전 목록 실측, [4-3](#4-3-엔드포인트와-요청)). `filter[createdDate]` 같은 것은
  존재하지 않는다. 그래서 C는 이렇게 구현된다.

  - **요청은 그대로 보낸다.** 경계 이전 리뷰도 응답에는 섞여 온다.
  - **`sort=-createdDate`라 경계보다 오래된 항목이 나오는 순간 이후는 전부 더 오래됐다.**
    그 자리에서 저장을 멈추고 **루프도 끊는다**(다음 쪽을 받을 이유가 없다) → [4-5](#4-5-상한쿼터페이지네이션)의 `reachedBoundary`.
  - **정렬을 생략하면 이 최적화가 통째로 무너진다.** 순서를 모르면 "오래된 것 하나"가 끝을 뜻하지
    않으므로 매번 상한까지 전부 받아 버린다 → [(1)](#4-6-함정)이 여기서 두 번째로 물린다.
  - **`total` 경고도 이때는 꺼야 한다.** 일부러 덜 받는 것이므로 `items.length < total`이 정상이다.
  - 경계 날짜(`APPSTORE_CUTOVER`)는 **전환 배포일**로 상수 하나에 박고, 그 값을 이 문서에 적어 둔다.
    나중에 "왜 이 날짜 이전이 안 들어오지"를 코드에서 되짚게 만들지 않는다.

  **상수를 어디에 두는가 — [`apps/pipeline/src/collectors/appstore.ts`](../../apps/pipeline/src/collectors/appstore.ts) 맨 위.**

  | | |
  |---|---|
  | 파일 | `apps/pipeline/src/collectors/appstore.ts` (수집기 자신이 소유한다. 경계 판정을 하는 곳이 여기다) |
  | 선언 | `export const APPSTORE_CUTOVER = '____-__-__';` → [4-2 (c)](#설정과-시그니처) |
  | 읽는 곳 | `daily.ts` **38줄** import에 이름을 더한다: `import { APPSTORE_CUTOVER, collectAppStore } from './collectors/appstore.js';` → [4-2 (d)](#설정과-시그니처) |
  | 값 | ⚠️ **아직 못 적는다.** 키 발급 전이라 전환 배포일이 정해지지 않았다(2026-08-30 기준). **추측해서 넣지 않는다** — 배포하는 날 코드와 이 표에 같은 날짜를 동시에 적고, [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 `APPSTORE_CUTOVER` 행으로 그 두 값이 맞는지 확인한다 |

  **경계를 끄고 도는 방법 — `APPSTORE_BACKFILL=1`** ([4-2 (d)](#설정과-시그니처)의 스위치)

  방침 C는 상시 수집을 경계에서 끊는다. 그래서 **경계를 안 쓰는 실행을 따로 만들어 두지 않으면
  과거를 한 번 받아 보는 것 자체가 불가능해진다.** 그 실행이 필요한 경우는 둘이다.

  - **방침 B로 갈아탈 때**: 기존 `source='appstore'` 행을 지우고 API로 전부 다시 채우는 실행.
  - **`meta.paging.total` 대조를 한 번 해 볼 때**: [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의
    그 행은 경계 날짜를 안 쓰는 실행을 전제한다. 스위치가 없으면 그 검증을 아예 돌릴 수 없다.

  🔴 **방침 C를 유지하는 동안 이 스위치를 켜면 안 된다.** 경계 이전 리뷰가 새 `sourceId`로 다시 쌓여
  방침 C가 막으려던 중복이 그대로 생긴다. **켜기 전에 기존 행을 지울지(= 방침 B로 전환) 먼저 정한다.**

#### (6) 🟠 키가 2벌인데 코드가 1벌을 가정하면 두 번째 계정에서 통째로 다시 짠다

`ascToken(key)`가 전역 상수를 읽게 짜면, 두 번째 판매자 계정 앱에서 401이 난다.
**처음부터 `service`(앱) → 자격증명 대응을 인자로 받는 구조로 만든다.**
**구체적인 타입·시그니처·호출부는 [4-2 설정과 시그니처](#설정과-시그니처)에 코드로 있다** —
`paths.ts`의 `ascKey?` 필드, `collectAppStore(app, opts, service)` 시그니처, `daily.ts`의 키 조회.
배경은 [4-1](#4-1-사전-준비-사람이-해야-하는-것) 참고.

#### (7) 🟡 토큰 20분 상한과 시계 오차

- `exp - iat > 1200`이면 거부된다. **긴 수집 중에 토큰이 만료되면 중간부터 401**이 되는데,
  앞쪽 페이지는 이미 들어왔으므로 **부분 수집으로 조용히 끝난다.**
- **대응**: 수명을 15분으로 잡고, **12분이 지나면 루프 안에서 새로 만든다**
  ([4-5](#4-5-상한쿼터페이지네이션)의 `tokenAt` 검사). Apple도 긴 작업에는 주기적 재발급을 권한다(원문:
  `consider generating a new token periodically throughout the process`).
- 로컬 시계가 앞서 있으면 `iat`가 미래가 되어 거부될 수 있다. ⚠️ **Apple이 허용하는 시계 오차 범위는
  문서에 없어 확인하지 못했다.** 문서를 다시 뒤져도 `clock`·`skew`·`UTC`라는 단어 자체가 없다
  (2026-08-29, 토큰 생성 문서 전문 검색). **판별 절차는 [5-1](#5-1-jwt가-유효한가-수집기-없이-키만-검증)에 넣었다** —
  `iat`를 뒤로 미뤄 재현되는지 보는 방법이다.

#### (8) 🟡 `scope`를 넣으면 넣은 것만 된다

`scope`는 선택이지만, 넣으면 **거기 없는 요청은 전부 거부된다**
(원문: `App Store Connect rejects a token with a scope claim if none of the scope entries match the attempted request.`).
`limit`·`cursor`·`sort`는 스코프 검사에서 무시되므로 페이지네이션은 안전하지만,
**앱을 추가했는데 스코프를 안 고치면 그 앱만 조용히 0건이 된다.**
→ **처음에는 `scope`를 넣지 않는 편을 권한다.** 키 자체를 최소 역할로 발급하는 쪽이 관리하기 쉽다.

#### (9) 🟡 지금 RSS가 이미 리뷰를 안 주고 있을 가능성

현재 코드 주석에 남아 있는 2026-08 실측 기록: HTTP 200인데 `feed.entry`가 비고
`first`/`last`/`next` 링크가 전부 빈 문자열이었다. **RSS 쪽이 이미 사실상 죽어 있을 수 있다.**
전환 후 수집량이 크게 늘어도 놀라지 말 것 — 그건 정상이다.

#### (10) 🔴 429가 뜨면 앞쪽 몇 쪽만 저장된 채 조용히 끝난다

**[(7)](#4-6-함정)의 토큰 만료와 완전히 같은 고장이다.** 페이지 루프 도중에 실패하면 앞 쪽은 이미 `items`에
들어와 있어 **수집이 "성공"으로 끝나고 건수만 적다.**

- **왜 생기나**: 쿼터는 **API 키당** 롤링 1시간이다. 키가 2벌이어도 **한 계정의 앱이 여럿이면
  같은 키를 공유**하므로, 앱이 늘거나 주기를 당기면 한 키에 몰린다.
- **재시도하지 않는다.** 롤링 1시간 창이라 몇 초 쉬어도 풀리지 않는다. Apple 문서도 즉시 재시도가
  아니라 **기록 후 나중에 다시 돌리라**고 적는다(원문:
  `Manage the HTTP 429 RATE_LIMIT_EXCEEDED error in your error-handling process. For example, log the failure and queue the job to be processed again at a later time.`).
  다음 수집 주기가 곧 그 "나중"이다.
- **반드시 남길 것 두 가지**:
  - 로그에 응답 헤더 `X-Rate-Limit`을 통째로 찍는다. `user-hour-rem`이 0인지 보면
    "쿼터를 정말 다 썼는지"와 "다른 이유로 429인지"가 갈린다.
  - **작업의 `note`에 사유를 넣는다**(`markCollectTask`의 `note`,
    [../../packages/core/src/store.ts](../../packages/core/src/store.ts) **379줄**). 화면 작업 목록에
    "HTTP 429 쿼터 초과"가 떠야 [5-7](#5-7-실패를-조용히-넘기지-않는가)의 "조용한 0건 금지"가 성립한다.

    🔴 **이건 `console.warn` 한 줄로는 안 된다. 사유가 화면까지 가는 길이 지금은 끊겨 있다.**
    `daily.ts`에서 `note`가 `markCollectTask`에 닿는 경로는 셋뿐이고(**416줄** 건너뛴 작업,
    **449~451줄** `run`이 throw, **463~465줄** 저장 실패), **부분 수집은 그 셋 중 어디에도 없다** —
    **460줄** `{ state: 'done', collected, inserted }`로 가서 "완료, 0건"이 된다.
    그래서 이 문서는 세 곳을 같이 고치라고 지시한다:
    **① 수집기가 `{ items, note }`를 돌려주고([4-2 (c)](#설정과-시그니처))
    ② `run` 래퍼가 그 `note`를 작업에 옮기고([4-2 (d)](#설정과-시그니처))
    ③ `done`이 `note`를 같이 넘긴다([4-2 (e)](#설정과-시그니처)).**
    예외를 던지는 방법(449~451줄 경로)은 쓰지 않는다 — 앞쪽 페이지에서 이미 받아 둔 것까지 버린다.
- **부분 수집 자체는 손해가 아니다.** 받은 것은 저장하고 다음 주기에 이어 받으면 된다
  (`sort=-createdDate`라 최신부터 채워진다). **위험한 것은 그 사실이 화면에 안 보이는 것뿐이다.**

---

## 5. 붙인 뒤 확인할 것

**순서대로 한다. 앞 단계가 통과하지 않으면 뒤 단계의 실패 원인을 구별할 수 없다.**

### 5-1. JWT가 유효한가 (수집기 없이, 키만 검증)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps?limit=1"
```

| 결과 | 뜻 |
|---|---|
| **200** | ✅ 키·Issuer ID·서명 형식이 모두 맞다 |
| 401 | JWT 문제. **서명부 길이 86자**부터 확인 → [4-6 (2)](#4-6-함정) |
| 403 | 서명은 맞고 **역할 권한이 부족**하다 → Admin 역할로 재발급 요청 |

**계정 수만큼의 키 각각에 대해 돌린다.** 계정마다 따로 실패할 수 있다.

**200이 아니면 본문도 같이 받아 `code`를 기록한다.** [4-3의 오류 응답 규격](#4-3-엔드포인트와-요청)에서
403·404의 `code` 문자열이 ⚠️ 확인 필요로 남아 있다. 여기서 실제 값을 보게 되므로 그때 그 표를 채운다.

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps?limit=1" \
  | grep -o '"code"[^,]*'
```

#### 401이 계속 날 때 — 시계 오차인지 가르는 법

[4-6 (7)](#4-6-함정)의 ⚠️ 확인 필요(Apple이 허용하는 시계 오차 범위)를 그대로 두는 대신, **원인인지 아닌지는
여기서 가른다.** 서명 형식([4-6 (2)](#4-6-함정), 서명부 86자)이 통과했는데도 401이면 순서대로 본다.

1. **`iat`를 60초 뒤로 미뤄** 토큰을 만들어 같은 요청을 보낸다(`iat = now - 60`, `exp`는 그대로).
   - **이때 200이 나오면 로컬 시계가 앞선 것이다.** 시간 동기화를 맞춘다.
   - 여전히 401이면 시계 문제가 아니다 → 2번.
2. **`iss`(Issuer ID)와 `kid`(Key ID)가 같은 계정 것인지** 확인한다. A 계정 Issuer ID에 B 계정 Key ID를
   섞으면 401이고, 메시지는 서명이 틀렸을 때와 똑같다.
3. 팀 키인데 `sub`를 넣었거나 개인 키인데 `iss`를 넣지 않았는지 본다 → [4-2](#4-2-인증).

> 이 순서가 중요한 이유: **401은 세 원인을 구별해 주지 않는다.** 응답 본문이 셋 다
> `NOT_AUTHORIZED / Authentication credentials are missing or invalid.`로 같다.

### 5-2. 앱 ID가 맞는가

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/customerReviews?limit=1"
```

- **200**이면 숫자 App Store ID를 그대로 써도 되는 것이다. **설정은 손댈 게 없다**(`storeId` 비워 둠).
- **404**면 `GET /v1/apps`로 목록을 받아 `data[].id`를 확인한다.
  🔴 **이 경우 링크가 같이 깨진다.** `appId`를 opaque ID로 갈아끼우고, **지금 들어 있던 숫자 값을
  설정의 `storeId`로 옮긴다** → [4-4의 `url` 결정 트리](#url-결정-트리--조각-두-개가-다-바뀔-수-있다).
  이걸 빼먹으면 수집은 정상인데 화면의 링크만 전부 없는 페이지로 간다.
- **403**이면 **그 앱이 이 키의 계정 소유가 아니다.** 다른 키를 써야 한다는 신호다
  (설정의 `ascKey` 값을 잘못 붙인 것일 수 있다 → [4-2 설정과 시그니처](#설정과-시그니처)).

**이 확인도 앱마다, 계정 수만큼의 키 각각으로 돌린다.**

### 5-3. 정렬이 실제로 최신순인가 (⚠️ 가장 중요)

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/customerReviews?limit=5&sort=-createdDate" \
  | grep -o '"createdDate"[^,]*'
```

**5줄의 날짜가 내림차순이고 맨 위가 최근 며칠 내면 정상.**
맨 위가 2022년이면 `sort`가 안 먹은 것이다 → [4-6 (1)](#4-6-함정).

**같은 요청을 `sort` 없이 한 번 더 돌려서 결과가 다른지 본다.** 이것이 Apple 문서에 없는
기본 정렬을 알아내는 유일한 방법이고, 알아내면 이 문서 [4-6 (1)](#4-6-함정)의 "확인 필요"를 지울 수 있다.

**이어서 2쪽도 본다 — `links.next`가 쿼리를 물고 가는지 여기서 갈린다**
([4-5](#4-5-상한쿼터페이지네이션)의 ⚠️). `limit=2&sort=-createdDate&fields[customerReviews]=...`로
1쪽을 받아 `links.next`를 그대로 GET한 뒤, **2쪽의 `createdDate`가 1쪽보다 오래됐는지**와
**`reviewerNickname`이 안 딸려 왔는지**를 본다. 둘 중 하나라도 어긋나면 `links.next`가
쿼리를 버린 것이므로 `cursor` 값만 뽑아 우리 쿼리에 붙이는 방식으로 바꾼다.

> **닉네임 쪽은 여기서 보는 것이 유일한 기회다.** 우리 매핑이 그 속성을 읽지 않으므로 DB에는
> 흔적이 남지 않고, [5-6](#5-6-파이프라인-한-바퀴--무엇이-몇-건-들어오면-정상인가)의 `닉네임_유입` SQL도
> 0을 낸다([4-5](#4-5-상한쿼터페이지네이션)의 ⚠️ 참고). **날짜 순서 쪽은 상시로도 감시된다** —
> 수집기의 `prevPageMin` 검사가 쪽 경계마다 같은 것을 보고 경고와 `note`를 남긴다.

### 5-4. 국가가 섞여 오는가

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/customerReviews?limit=200&sort=-createdDate" \
  | grep -o '"territory":"[A-Z]*"' | sort | uniq -c
```

- **여러 코드가 나오면** 필터 없이 전 국가가 온다는 뜻 → 국가 루프를 지울 수 있다 → [4-6 (4)](#4-6-함정)
- **하나만 나오면** 그 앱에 그 국가 리뷰만 있는 것인지, 기본 필터가 걸린 것인지 아직 모른다.
  다른 앱으로 한 번 더 확인할 것

**이 결과가 [4-2 설정과 시그니처](#설정과-시그니처) (d)의 호출부 형태를 결정한다.** 넘어가기 전에 확정할 것.

#### 잘못된 국가 코드가 400인가, 조용히 무시되는가

[4-6 (3)](#4-6-함정)의 ⚠️ 확인 필요를 여기서 지운다. **허용값에 없는 소문자 두 자를 일부러 넣어 본다.**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/customerReviews?limit=1&filter%5Bterritory%5D=kr"
```

- **400**이면 안전하다. 잘못 넣으면 그 자리에서 터지므로 조용한 오염이 없다.
- **200**이면 🔴 **무시되고 전 국가가 온다는 뜻**이다 — 설정값(`kr`)을 변환 없이 넘기는 실수가
  **오류 없이 통과**한다. 그 경우 alpha-3 변환을 요청 쪽에도 반드시 태워야 한다.
- 어느 쪽이든 결과를 [4-6 (3)](#4-6-함정)에 되적고 ⚠️ 표시를 지운다.

### 5-5. 쿼터 여유 확인

```bash
curl -sS -D - -o /dev/null -H "Authorization: Bearer $TOKEN" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/customerReviews?limit=1" \
  | grep -i "x-rate-limit"
```

`user-hour-lim` 값을 기록해 둔다. **이 문서 [4-5](#4-5-상한쿼터페이지네이션)의 `3500`은 Apple 문서의
예시 숫자이지 우리 값이 아니다.**

- **계정 수만큼의 키 각각 찍는다.** 한도는 **API 키당**이므로 계정마다 다를 수 있다.
- 받은 값을 [3-2 표](#3-2-무료-대신-무엇이-제약인가--쿼터-숫자)의 "우리 키의 실제 상한" 행에 적고
  ⚠️ 표시를 지운다. **추측으로 채우지 않는다.**
- 같이 계산해 둘 것: `user-hour-lim ÷ (앱 수 × 쪽 상한)` = 시간당 돌릴 수 있는 최대 횟수.
  이 값이 수집 주기보다 작으면 주기를 늦추거나 `appstorePages`를 줄인다.

### 5-6. 파이프라인 한 바퀴 — 무엇이 몇 건 들어오면 정상인가

한 번 수집을 돌린 뒤 아래를 본다.

| 확인 항목 | 정상 기준 | 어긋나면 |
|---|---|---|
| **수집 건수** | **최근 30일 기준 11건 이상.** 이것이 RSS 마지막 실측치다. **더 많이 들어오는 것이 정상이다**(1쪽 50건 → 200건, 그리고 [4-6 (9)](#4-6-함정)) | 11건보다 적으면 정렬·필터·페이지네이션 중 하나가 틀렸다 |
| **`meta.paging.total`과 대조** | 첫 응답의 `total`을 로그에서 찾아 적어 둔다. **`APPSTORE_BACKFILL=1`로 경계 날짜를 끄고 돌린 실행에 한해** 수집 건수가 `total`과 같아야 한다(또는 "쪽 상한 N"이 작업 `note`에 붙어 있어야 한다). 상시 수집(방침 C)은 일부러 덜 받으므로 이 대조를 하지 않는다 → [4-6 (5)](#4-6-함정) | 경고도 `note`도 없는데 `total`보다 적으면 루프가 조기 종료된 것이다 → [4-5](#4-5-상한쿼터페이지네이션) |
| **`url`** | 전부 `https://apps.apple.com/{소문자 2자}/app/id{숫자}?see-all=reviews` 꼴. **UUID나 `KOR`이 섞인 행 0건** | UUID가 있으면 `storeId`를 안 옮긴 것, `KOR`이 있으면 alpha-3 변환을 링크에 안 태운 것 → [4-4](#url-결정-트리--조각-두-개가-다-바뀔-수-있다). **둘 다 수집은 성공한 채로 링크만 깨진다** |
| **신규 저장 건수** | 첫 실행은 수집 건수와 거의 같아야 한다(식별자 체계가 바뀌어 기존과 겹치지 않으므로) | "수집 N건 / 신규 0건"이면 [4-6 (1)](#4-6-함정)이나 (5)의 방침 처리가 잘못됐다 |
| **`posted_at`** | 전부 채워져 있고 ISO 형식이며 미래 날짜가 없다 | `createdDate` 파싱 실패 |
| **`rating`** | 전부 1~5 정수. NULL 0건 | 필드명 오타 |
| **`country`** | **소문자 두 자.** 그 밖의 값이 0건 | **`KOR`처럼 대문자면** 변환을 아예 안 태운 것이고, **`kor`처럼 소문자 세 자면** 변환표에 없는 코드가 온 것이다(경고 로그가 같이 있어야 한다). 앞쪽은 버그, 뒤쪽은 변환표에 한 줄 추가 → [4-6 (3)](#4-6-함정) |
| **`content`** | 빈 문자열 0건. 제목만 있는 행이 섞여도 정상 | `title`/`body` 조합 로직 |
| **`sourceId`** | UUID 형식. 숫자만인 행이 섞이면 기존 RSS 데이터다 | (5)의 방침 확인 |
| **`author`** | **전부 비어 있다.** 닉네임이 한 건도 들어오면 안 된다 | 매핑을 되돌려 `reviewerNickname`을 읽게 만든 것이다 → [2-5](#2-5-남은-리스크). ⚠️ **이 검사는 `links.next`가 쿼리를 버렸는지는 못 잡는다** — [4-4](#4-4-응답--rawitem-매핑)의 매핑이 그 속성을 아예 읽지 않아, 응답에 닉네임이 딸려 와도 여기는 0이 나온다. 그쪽은 아래 "정렬 이어짐" 행이 본다 |
| **정렬 이어짐** | 작업 `note`와 로그에 **"정렬이 이어지지 않은 것으로 보입니다"가 0건** | `links.next`가 `sort`를 버린 것이다 → [4-5](#4-5-상한쿼터페이지네이션)의 `prevPageMin`. 🔴 이 경고가 뜨면 방침 C의 조기 종료가 멀쩡한 리뷰를 버리고 있을 수 있으니 `cursor` 방식으로 바꾸기 전까지 그 실행의 결과를 믿지 않는다 |
| **`APPSTORE_CUTOVER`** | 코드의 상수 값과 [4-6 (5)](#4-6-함정) 표에 적은 날짜가 **같다.** 그리고 새로 들어온 행의 가장 오래된 `posted_at`이 그 날짜 이후다(백필 실행은 예외) | 날짜를 한쪽에만 적은 것이다. 그대로 두면 "왜 이 날짜 이전이 안 들어오지"를 코드에서 되짚게 된다 |
| **`service`** | 앱마다 올바르게 붙는다 | 키↔앱 대응 오류 |
| **첫 실행 소요 시간** | 배포판(요청 하나·5분)에서 끝난다 | 1쪽이 50 → 200건이라 **분류 호출이 4배**다. 모자라면 `API_COLLECT_DEFAULTS`가 아니라 분류 쪽이 먼저 걸린다 → [4-5](#4-5-상한쿼터페이지네이션) |
| **2번째 앱, 2번째 계정** | 위 전부가 **두 판매자 계정 모두**에서 통과 | [4-6 (6)](#4-6-함정) |

**한 번에 보는 쿼리** (전부 0이어야 정상):

```sql
SELECT
  COUNT(*) FILTER (WHERE country !~ '^[a-z]{2}$')                    AS 국가형식_이상,
  COUNT(*) FILTER (WHERE content = '' OR content IS NULL)            AS 본문_빈행,
  COUNT(*) FILTER (WHERE rating IS NULL OR rating NOT BETWEEN 1 AND 5) AS 별점_이상,
  COUNT(*) FILTER (WHERE posted_at IS NULL)                          AS 작성일_없음,
  COUNT(*) FILTER (WHERE url !~ '^https://apps\.apple\.com/[a-z]{2}/app/id[0-9]+\?see-all=reviews$')
                                                                     AS 링크_형식이상,
  COUNT(*) FILTER (WHERE author IS NOT NULL AND author <> '')        AS 닉네임_유입
FROM items
WHERE source = 'appstore' AND collected_at >= '전환일';
```

`링크_형식이상`이 0이 아니면 그 행의 `url`을 직접 본다. **UUID가 들어 있으면 `storeId` 누락,
대문자 국가면 alpha-3 변환 누락**이다.

> `닉네임_유입`은 **응답이 아니라 우리 매핑을 보는 검사다.** 우리가 `reviewerNickname`을 읽지 않는 한
> 응답에 무엇이 오든 0이 나온다. 그러니 이 SQL로 `links.next` 유실을 판정하지 말 것 —
> 그건 위 표의 "정렬 이어짐" 행(로그·`note`)과 [5-3](#5-3-정렬이-실제로-최신순인가--가장-중요)의 2쪽 확인이 본다.

**대조용 실측 기준선 (2026-08-29 DB):**

| 값 | |
|---|---|
| 전 기간 `source='appstore'` | 344건 |
| 가장 오래된 작성일 | 첫 리뷰 시점 |
| 가장 최근 작성일 | 2026-08-16 |
| 최근 30일 | 11건 (부정 8, 심각 3) |
| 국가 | 1개 |

### 5-7. 실패를 조용히 넘기지 않는가

**일부러 깨뜨려 본다.** 이 도구의 고장 방식은 예외가 아니라 조용한 0건이다.

> 🔴 **아래 기준은 [4-2](#설정과-시그니처)의 (c)·(d)·(e)가 **다 들어가 있을 때만** 통과할 수 있다.**
> 수집기가 `{ items, note }`를 돌려주고(c), `run` 래퍼가 그 `note`를 작업에 옮기고(d),
> `done`이 `note`를 같이 넘겨야(e) 사유가 화면에 뜬다. 셋 중 하나라도 빠지면 여기 적은 401·404·429가
> 전부 "완료, 0건"으로 보이고, **이 절은 통과할 수 없는 요구가 된다.** 먼저 (e)부터 확인할 것.

- 토큰 문자열 한 글자를 바꾸고 돌린다 → **화면 작업 목록에 "HTTP 401"이 사유로 남아야 한다.**
  1쪽에서 터지므로 상태는 `done`, 건수는 0이고 **사유만 다르다** — 그래서 `note`가 없으면 구별이 안 된다
- 앱 ID를 없는 값으로 바꾼다 → 404가 사유로 남아야 한다
- 설정의 `ascKey`를 없는 이름으로 바꾼다 → **"앱스토어 키 ○○ 없음"이 건너뜀 사유로 남아야 한다**
  ([4-2 설정과 시그니처](#설정과-시그니처)의 `daily.ts` 분기). 조용히 0건이면 두 번째 계정 앱이
  안 들어와도 아무도 모른다 → [4-6 (6)](#4-6-함정)
- **429 경로도 한 번은 확인한다.** 일부러 쿼터를 태울 필요는 없다. 응답 상태를 429로 바꿔치기한
  단위 테스트든, 코드에 임시로 `res.status = 429` 분기를 태우든, **"HTTP 429 쿼터 초과"가
  `note`에 남는지**만 본다 → [4-6 (10)](#4-6-함정). 이 경로는 실제로 밟았을 때
  **앞쪽 몇 쪽은 저장된 뒤라 "성공, 건수 적음"으로 보이는 것**이 문제다
- **부분 수집을 구별할 수 있는가**: 위 429·타임아웃 케이스에서 화면이 "완료"가 아니라
  **사유가 붙은 상태**로 보여야 한다. 건수만 보고는 정상과 구별되지 않는다

현재 RSS 수집기가 `!res.ok`일 때 상태 코드를 경고로 남기고 `fetch`를 try/catch로 감싸는 이유가
이것이다([appstore.ts](../../apps/pipeline/src/collectors/appstore.ts) 22~35줄).
**새 수집기도 둘 다 반드시 유지한다** — [4-5](#4-5-상한쿼터페이지네이션)의 예시 코드가 그 형태다.
다만 **현행처럼 `console.warn` 후 `break`만 하면 이 절을 통과하지 못한다.** 로그는 사람이 서버에
들어가야 보이고, 이 절이 요구하는 것은 **화면 작업 목록의 사유**다. 그래서 새 코드는 같은 자리에서
`addNote()`를 같이 부른다.

---

## 6. 출처

**Apple 공식 문서 (전부 2026-08-29 실측)**

| 내용 | URL |
|---|---|
| 고객 리뷰 조회 엔드포인트 (파라미터·허용값·예시 응답) | <https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-customerreviews> |
| API 요청용 토큰 생성 (JWT 헤더·페이로드·수명·서명·Authorization 헤더) | <https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests> |
| API 키 생성과 .p8 다운로드 (1회 한정) | <https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api> |
| 요청 한도 (`X-Rate-Limit`, 429) | <https://developer.apple.com/documentation/appstoreconnectapi/identifying-rate-limits> |
| 페이지네이션 링크 (`links.next`) | <https://developer.apple.com/documentation/appstoreconnectapi/pageddocumentlinks> |
| 응답 래퍼 (`data` 필수 / `links` 필수 / **`meta` 선택**) | <https://developer.apple.com/documentation/appstoreconnectapi/customerreviewsresponse> |
| 오류 응답 규격 (`errors[]`의 `status`·`code`·`title`·`detail`·`id`·`source`) | <https://developer.apple.com/documentation/appstoreconnectapi/errorresponse> |
| 개발자 프로그램 가격 (3절 인용 출처, 99 USD/년) | <https://developer.apple.com/programs/enroll/> |
| 리뷰 리소스 | <https://developer.apple.com/documentation/appstoreconnectapi/customerreview> |
| 역할별 권한 (Customer Support 설명) | <https://developer.apple.com/help/app-store-connect/reference/role-permissions/> |
| API 키 폐기 | <https://developer.apple.com/documentation/appstoreconnectapi/revoking-api-keys> |

> 위 문서들은 브라우저에서 JS로 렌더된다. 스크립트로 원문을 다시 확인하려면 문서 데이터 주소를 쓴다:
> `https://developer.apple.com/tutorials/data/documentation/appstoreconnectapi/{페이지슬러그}.json`
> (이 문서의 파라미터 허용값·상한은 그 JSON에서 그대로 읽은 것이다.)

**약관 / robots.txt**

| 내용 | URL |
|---|---|
| Apple Developer Program License Agreement (§ 3.3.3(D) 인용 출처) | <https://developer.apple.com/support/terms/apple-developer-program-license-agreement/> |
| 같은 문서 PDF (조항 번호 대조용) | <https://developer.apple.com/support/downloads/terms/apple-developer-program/Apple-Developer-Program-License-Agreement-English.pdf> |
| 약관 목록 | <https://developer.apple.com/support/terms/> |
| App Store Connect 서비스 약관 (⚠️ 로그인 필요, 미확인) | <https://appstoreconnect.apple.com/WebObjects/iTunesConnect.woa/wa/termsOfService/> |
| iTunes robots.txt (2-1 인용 출처) | <https://itunes.apple.com/robots.txt> |
| API 호스트 (2-2 실측 대상) | <https://api.appstoreconnect.apple.com/robots.txt> |

**기술 참고**

| 내용 | URL |
|---|---|
| JWT 표준 | <https://www.rfc-editor.org/rfc/rfc7519> |
| robots.txt 표준 | <https://www.rfc-editor.org/rfc/rfc9309.html> |
| Node.js `crypto.createSign` / `dsaEncoding` 옵션 | <https://nodejs.org/api/crypto.html#cryptocreatesignalgorithm-options> |

**저장소 내부 문서**

- [../data-collection-compliance.md](../data-collection-compliance.md) — 전 채널 적법성 판정과 결정 기록
- [../official-api-migration.md](../official-api-migration.md) — 전환 계획, 도입 순서, 공통 부담
- [../api-costs.md](../api-costs.md) — 전 채널 비용·쿼터 원문 (3절의 상세)
