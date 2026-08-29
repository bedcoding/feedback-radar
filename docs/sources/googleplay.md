# 구글플레이 리뷰

> 이 문서는 법률 자문이 아니다.

> **한 줄 요약**: 지금 경로(비공식 스크래퍼)는 robots.txt 두 줄을 정면으로 위반해 **껐다**.
> 공식 Play Developer API로 옮기면 **돈은 안 들지만**, 개발자 계정마다 관리자의 **'리뷰 답글' 권한 계정 수만큼의 승인**이
> 선행이고, **최근 7일치만 받을 수 있으며**, 국가 파라미터가 사라져 **화면 여러 곳이 연쇄로 바뀐다.**

---

## 1. 현황

| 항목 | 값 |
|---|---|
| 현재 상태 | **꺼짐.** 2026-08-29 결정으로 운영 설정에 `sources.googleplay = false`를 명시적으로 박았다. 이유: 현재 경로가 robots.txt 위반 ([../data-collection-compliance.md](../data-collection-compliance.md) 10절) |
| 적법성 판정 | 🟠 **현재 경로는 위반, 공식 API로 대체 가능.** 다만 API로 옮기면 robots.txt 층위는 사라지는 대신 **API 약관의 영구 저장 금지 조항이 새로 걸린다** (→ [2절](#2-적법성-근거)) |
| 비용 | **호출료 0원.** 등록비 US$25는 일회성이고 이미 냈다. 제약은 돈이 아니라 **앱당 GET 200회/시간**과 **7일 창**이다 (→ [3절](#3-비용)) |
| 연동 난이도 | **중.** 코드 자체는 어렵지 않다(REST + OAuth2 JWT). 난이도를 올리는 것은 ① 개발자 계정마다 관리자의 계정 수만큼의 승인(일정을 개발이 통제 못 함) ② 페이지네이션 루프 신설 ③ **국가 루프 제거가 코드·화면 11곳으로 번지는 것** (→ [4-6 함정 6번](#4-6-함정)) |
| 고쳐야 하는 파일 | **6개.** `apps/pipeline/src/collectors/googleplay.ts`(교체) · `apps/pipeline/src/collectors/googleplay-auth.ts`(신설) · `apps/pipeline/src/daily.ts`(국가 루프·호출부) · `packages/core/src/collect-limits.ts`(상한·안내 문구) · `packages/core/src/paths.ts`(설정 주석·자리표시자 기본값) · `apps/web/app/page.tsx`(총량 추산). 줄 번호까지 [4-6 함정 6번](#4-6-함정)의 표에 있다 |
| 30일 수집량 | **33건** (부정 약 19건, 심각 7건) ⚠️ |

⚠️ 30일 수집량 주석: 총 33건과 심각(high/critical) 7건은 [../data-collection-compliance.md](../data-collection-compliance.md)의
실측 표에서 온 값이다. **부정 건수는 그 문서에 건수로 적혀 있지 않다.** 위 19건은
[../official-api-migration.md](../official-api-migration.md) 5절의 "부정 58%"를 33건에 곱한 **환산값**이고,
직접 실측하지 않았다. 정확한 건수가 필요하면 DB에서 다시 세야 한다.

**이 소스는 30일 33건으로 전체의 3%지만, 심각 이슈는 7건으로 잃은 심각 31건 중 23%다.**
건수 대비 심각 밀도가 가장 높은 축이라 전환 우선순위가 1순위다.

---

## 2. 적법성 근거

### 2-1. robots.txt 실측

| 항목 | 값 |
|---|---|
| URL | `https://play.google.com/robots.txt` |
| HTTP 상태 | **200** |
| 실측일 | 2026-08-29 |

**원문 인용 (발췌, [../data-collection-compliance.md](../data-collection-compliance.md) 4-8 실측분):**

```
User-Agent: *
...
Disallow: /store/getreviews
...
Disallow: /_
```

**우리 경로가 걸리는가 — 걸린다. 두 줄 모두.**

현재 수집기는 `google-play-scraper` v10.1.3을 쓰고, 이 라이브러리가 내부적으로 때리는 주소는
(`node_modules/google-play-scraper/lib/reviews.js:144`):

```
https://play.google.com/_/PlayStoreUi/data/batchexecute?rpcids=qnKhOb&...
```

| 규칙 | 우리 경로 | 매칭 |
|---|---|---|
| `Disallow: /_` | `/_/PlayStoreUi/data/batchexecute` | ✅ 걸린다 |
| `Disallow: /store/getreviews` | 리뷰 조회 경로를 이름으로 지목 | ✅ 취지상 정면으로 걸린다 |

즉 **리뷰 자동 수집을 이름으로 지목해 막아 둔 상태**다. "널리 쓰이는 라이브러리"인 것과
"허용된 경로"인 것은 다른 문제다.

### 2-2. 이용약관

#### (1) 플랫폼 약관 — 현재 경로에 걸린다

- URL: <https://policies.google.com/terms> ("Don't abuse our services")
- **원문 인용:**

> using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling, training, or other activities)

**robots.txt 위반이 곧 약관 위반으로 연결되도록 문장이 짜여 있다.** 층위 1(robots.txt)과
층위 2(약관)가 여기서는 분리되지 않는다.

#### (2) API 약관 — 공식 API로 옮겼을 때 새로 걸리는 것 🔴

- URL: <https://developers.google.com/android-publisher/terms>
- **원문 인용:**

> By using this API, you consent to be bound by these terms in addition to the Google APIs Terms of Service ("API ToS")

즉 Play Developer API는 **Google APIs 약관에 종속**된다. 그 약관의 해당 조항은:

- URL: <https://developers.google.com/terms> — 제5조 e항 (Prohibitions on Content)
- **원문 인용:**

> Unless expressly permitted by the content owner or by applicable law, you will not, and will not permit your end users or others acting on your behalf to, do the following with content returned from the APIs:
>
> i. Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header

같은 약관의 접근 방식 조항도 함께 본다 (제2조 c항):

> You will only access (or attempt to access) an API by the means described in the documentation of that API.

**이 도구는 수집물을 `items` 표에 영구 적재하고 갱신하지 않는다**
(`ON CONFLICT ... DO NOTHING`, [../../packages/core/src/store.ts](../../packages/core/src/store.ts)).
문언상 5조 e항 i호의 "create permanent copies" / "build databases"에 정면으로 닿는다.

> 🔴 **이것은 다음 카페에서 카카오 운영정책 제5조 20호를 발견한 것과 같은 구조의 문제다**
> ([../official-api-migration.md](../official-api-migration.md) 2-5절).
> **"공식 API로 옮기면 안전해진다"가 여기서도 자동으로 성립하지 않는다.**
> 다만 다음 카페와 결정적으로 다른 점이 하나 있다 — 이 API가 돌려주는 리뷰는
> **우리 앱에 달린 리뷰**이고, 조항에 "Unless expressly permitted by the content owner"라는
> 예외가 붙어 있다. 그 예외가 이 경우에 성립하는지는 **법무 판단 사항이다.**
> ⚠️ **확인 필요 — 이 문서에서 확정하지 않는다.**

### 2-3. 판정

| 경로 | 판정 | 근거 |
|---|---|---|
| 현재(`google-play-scraper`) | 🔴 **쓰면 안 된다** | robots.txt 2줄 위반 + 플랫폼 약관의 robots.txt 준수 조항 위반. **이미 껐다** |
| 공식 Play Developer API | 🟡 **robots.txt 층위는 해소, 약관 층위 1건 미결** | 정문이고 인증된 호출이다. 다만 위 5조 e항 i호에 대한 법무 판단이 남는다 |

**실무 결론: 전환은 진행한다.** robots.txt 명시적 위반(현재)과 약관 해석 여지(전환 후) 중
후자가 명백히 낫고, 후자는 [../official-api-migration.md](../official-api-migration.md)에서
이미 열려 있는 같은 성격의 질문(카카오·네이버)과 함께 법무에 올리면 된다.

### 2-4. 남은 리스크

| 층위 | 리스크 | 상태 |
|---|---|---|
| **민사 / 계약** | Google APIs 약관 5조 e항 i호(영구 복제·DB 구축 금지)에 이 도구의 영구 적재가 걸리는가. 걸린다면 **보유기간 정책 + 만료 삭제**가 필요하고, 이는 코드에 아직 없다 (**나이 기준으로 지우는 코드 0건.** [store.ts](../../packages/core/src/store.ts):267의 `deleteItems(ids)`는 화면에서 고른 id를 지우는 수동 삭제라 해당하지 않는다) | ⚠️ **확인 필요 (법무)** |
| **민사 / 계약** | 계약 위반 시 실질 제재는 손해배상보다 **서비스 계정 접근 차단**일 가능성이 높다. 차단되면 이 채널이 통째로 죽는다 | ⚠️ 확인 필요 |
| **개인정보** | 응답의 `authorName`(작성자 이름)을 저장한다. 공개 리뷰라도 개인정보에 해당할 수 있다. **분류·집계에 실제로 쓰이지 않으면 저장 단계에서 버리는 편이 낫다** ([../data-collection-compliance.md](../data-collection-compliance.md) 6절, 7-4절) | 미조치 |
| **개인정보** | 보관 기간이 **무기한**이다. 위 계약 리스크와 같은 조치(보유기간 + 삭제)로 함께 해소된다 | 미조치 |
| **개인정보** | 본문이 분류를 위해 LLM에 전달된다. 제공자와의 데이터 처리 조건 확인이 열려 있다 | ⚠️ 확인 필요 |

---

## 3. 비용

> **결론: 이 API를 호출하는 데 드는 돈은 0원이다.** 등록비 US$25는 일회성이고 **이미 냈다**(앱을 이미 배포 중이므로).
> 전환으로 **새로 나가는 돈은 없다.** 상세와 다른 소스와의 비교는 [../api-costs.md](../api-costs.md).

### 금액이 적힌 공식 문장 (원문 그대로)

등록비 —

> There is a US$25 one-time registration fee

— <https://support.google.com/googleplay/android-developer/answer/6112435>

**리뷰 API 자체에는 가격 조항이 없다.** 공식 문서가 이 경로를 두고 숫자로 적어 둔 것은 요금이 아니라 쿼터다:

> GET requests (for retrieving lists of reviews and individual reviews) – 200 per hour

> POST requests (for replying to reviews) – 2000 per day

— <https://developers.google.com/android-publisher/reply-to-reviews>

### 무료 대신 무엇이 제약인가 — 숫자

| 제약 | 숫자 | 대상 앱 규모에서 |
|---|---|---|
| **GET 쿼터** | **앱당 시간당 200회.** *"enforced separately on a per-app basis"* — 앱마다 따로 센다 | 🟢 실행 1회당 앱당 **1~3회**(상한 300 기준, 1쪽=100건). **여유 98%** |
| **POST 쿼터** | 하루 2,000회 | 🟢 답글을 쓰지 않으므로 **0회** |
| **수집 창** | **최근 7일** | 🔴 **이것이 진짜 상한이다.** 쿼터를 다 써도 8일 전 리뷰는 못 받는다 (→ [4-5](#4-5-상한쿼터페이지네이션)) |
| **트랙** | 프로덕션만 | 🟠 베타·내부 테스트 리뷰는 0건 (→ [4-6 함정 4번](#4-6-함정)) |
| **댓글 없는 별점** | 응답에 오지 않음 | 🟠 별점만 준 리뷰는 세지 않는다 (→ [4-6 함정 3번](#4-6-함정)) |
| 등록비 | US$25 일회성 | ✅ 이미 냄 |

**즉 이 경로에서 "값을 키우면 돈이 든다"는 손잡이는 없다.** 상한(`googlePlayReviewCount`)을 올려도
늘어나는 것은 GET 호출 수와 분류 대기열뿐이고, 둘 다 청구되지 않는다.
X와 정반대다(X는 상한이 곧 청구액 — [../api-costs.md](../api-costs.md) 3절).

### ⚠️ 확인 필요

| # | 항목 | 상태 | 판별 절차 |
|---|---|---|---|
| 1 | **쿼터 숫자 자체가 공식 문서 두 곳에서 다르다.** Reply to Reviews 가이드는 앱당 GET 200회/시간, 더 최신인 Play Developer API quotas 페이지는 버킷당 3,000 QPM 기본값을 적는다 ([../api-costs.md](../api-costs.md) 4절) | ⚠️ **확인 필요.** 보수적으로 **200회/시간**으로 설계한다 | [5절 #12](#5-붙인-뒤-확인할-것) |
| 2 | **Play API 호출에 GCP 과금이 붙는가.** "유료라는 문서가 없다"는 **부재 근거**일 뿐이고, 무료라고 명시한 문장은 찾지 못했다 ([../api-costs.md](../api-costs.md) 5절 #5) | ⚠️ **확인 필요** | [5절 #13](#5-붙인-뒤-확인할-것) |
| 3 | **수집 이후 LLM 분류 비용.** 수집은 0원이지만 들어온 본문은 분류 호출로 이어진다. [../api-costs.md](../api-costs.md)는 수집 API만 다루고 분류 단가 항목이 없다 | ⚠️ **확인 필요 (이 문서 범위 밖)** | 전환으로 건수가 크게 늘지는 않는다(7일 창이 오히려 줄인다). 다만 상한을 올릴 때는 분류 쪽 증가를 같이 본다 |

---

## 4. 연동 방법

> 📌 **이 절의 인용 규칙: 필드 설명은 마침표에서 자르지 않고 문단 전체를 옮긴다.**
> 이 문서의 이전 판이 `text`와 `originalText`의 뒷문장을 잘랐다가 처방과 검증 기준이 둘 다 틀렸다
> (→ [4-4](#4-4-응답--rawitem-매핑), [4-6 함정 7·11번](#4-6-함정)). 잘린 뒷문장에 **구현이 갈리는 조건**이 들어 있었다.
> 인용을 줄이고 싶으면 자르지 말고 인용 자체를 빼라.

### 4-1. 사전 준비 (사람이 해야 하는 것)

**여기가 이 전환의 병목이다. 코드보다 이쪽이 오래 걸린다.**

| # | 단계 | 누가 | 산출물 | 비고 |
|---|---|---|---|---|
| 1 | Google Cloud 프로젝트 생성 | 개발 | 프로젝트 ID | ✅ 원문: *"Create a Google Cloud Project"* |
| 2 | 해당 프로젝트에서 Google Play Developer API 사용 설정 | 개발 | — | ✅ 원문: *"Enable the Google Play Developer API for your Google Cloud Project"* |
| 3 | 서비스 계정 생성 + **JSON 키 다운로드** | 개발 | `client_email`, `private_key`가 든 JSON 1개 | 이 JSON이 자격증명 전부다 |
| 4 | **개발자 계정마다 각각의 Play Console에서 서비스 계정 이메일을 사용자로 초대** | 각 개발자 계정 **관리자 3명** | 초대 계정 수만큼의 승인 | ✅ 원문: *"Put an email address for your service account in the email address field and grant the necessary rights to perform actions."* |
| 5 | 각 초대에 **'리뷰 답글' 권한** 부여 | 위와 동일 | 권한 3건 | ✅ 원문: *"enable the 'Reply to reviews' permission within this account."* |
| 6 | 대상 앱 범위 지정 (계정 전체 or 앱 단위) | 위와 동일 | — | 대상 앱이 3개 계정에 나뉘어 있다 |

#### 반드시 짚어야 하는 세 가지

**(1) 🔴 필요한 권한 이름은 '리뷰 답글'(Reply to reviews)이다. '앱 정보 보기'가 아니다.**

Play Console 권한 목록의 원문 표기:

> **Reply to reviews** — *"Reply to reviews on Google Play. Change the contact information used in suggested replies."*

읽기만 할 건데 '답글' 권한을 달라는 것이 어색해 보여서, 관리자에게 "앱 접근 권한 주세요" 같은
뭉뚱그린 요청을 보내면 **'앱 정보 보기'만 받고 403이 난다.** 참고로 그 권한의 원문은:

> **View app information (read-only)** — *"Read-only access to all app information, including any associated Google Play games services projects but not financial data"*

**이 권한만으로는 리뷰 API가 열리지 않는다.** 요청 메일에 권한 이름을 그대로 적어야 한다.

**(2) ✅ 자격증명은 3벌이 아니라 1벌이다.**

서비스 계정 **하나**를 만들고, 그 이메일을 개발자 계정마다에 각각 초대한다.
필요한 것은 **키 3벌이 아니라 권한 부여 3건**이다.
따라서 설정에 "어느 계정 자격증명으로 읽는지" 필드를 넣거나 환경변수에 계정별 접미사를 붙이는
작업은 **불필요하다** (앱스토어 쪽은 키가 2벌이라 사정이 다르다 — 혼동하지 말 것).

> ⚠️ 단, "서비스 계정 하나를 여러 개발자 계정에 초대할 수 있다"는 것을 **공식 문서가 명시적으로
> 문장으로 적어 둔 곳은 찾지 못했다.** Play Console이 임의의 Google 계정 이메일을 사용자로
> 초대하는 구조라는 점에서 성립한다고 보고 있다. **첫 계정 초대 시점에 실제로 확인할 것.**

**(3) ✅ GCP 프로젝트를 개발자 계정에 연결(link)할 필요는 없다.**

원문:

> "You no longer need to link your developer account to a Google Cloud Project in order to access the Google Play Developer API."

과거 조사에서 "소유자 권한이 필요한 프로젝트 연결"을 병목으로 들었는데,
**현재 공식 문서 기준으로는 그 단계가 없다.** 선행조건이 생각보다 가볍다.

### 4-2. 인증

**서비스 계정 JSON → 자체 서명 JWT → 액세스 토큰 → Bearer 헤더.** 외부 라이브러리 없이
`node:crypto`만으로 된다 (앱스토어의 ES256 유틸과 같은 접근, 알고리즘만 다르다).

아래 코드는 신설 파일 `apps/pipeline/src/collectors/googleplay-auth.ts` 하나에 다 들어간다.

#### 자격증명을 어디에 두는가

**결정: 루트 `.env`의 `GOOGLE_PLAY_SA_JSON` 하나에 서비스 계정 JSON을 통째로 넣는다.**
이 저장소는 비밀값을 DB 설정이 아니라 루트 `.env` → `process.env`로 나른다
(`NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET`은 [../../apps/pipeline/src/collectors/naver.ts](../../apps/pipeline/src/collectors/naver.ts):59-60,
`X_BEARER_TOKEN`은 [../../apps/pipeline/src/collectors/x.ts](../../apps/pipeline/src/collectors/x.ts):92).
**DB 설정(`config` 키)에는 넣지 않는다** — 거기 든 값은 대시보드 화면에서 읽고 쓰는 값이다.

```
# .env — 한 줄로 넣는다. 4-1 3단계에서 받은 JSON 파일 내용 전체
GOOGLE_PLAY_SA_JSON={"type":"service_account","project_id":"...","client_email":"...@....iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n", ...}
```

```ts
// apps/pipeline/src/collectors/googleplay-auth.ts
import crypto from 'node:crypto';

interface ServiceAccount { client_email: string; private_key: string }

/** 키가 없으면 undefined. 조용히 스킵하는 것은 naver.ts와 같은 패턴이다 */
function serviceAccount(): ServiceAccount | undefined {
  const raw = process.env.GOOGLE_PLAY_SA_JSON?.trim();
  if (!raw) return undefined;
  try {
    const sa = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!sa.client_email || !sa.private_key) {
      console.warn('GOOGLE_PLAY_SA_JSON에 client_email 또는 private_key가 없다');
      return undefined;
    }
    return sa as ServiceAccount;
  } catch (e) {
    console.warn(`GOOGLE_PLAY_SA_JSON 파싱 실패: ${(e as Error).message}`);
    return undefined;
  }
}
```

> 🔴 **JSON을 통째로 넣는 것이 핵심이다.** `private_key` 안의 줄바꿈은 `.env` 파일에
> `\` + `n` 두 글자로 들어 있고, **`JSON.parse`가 그걸 진짜 줄바꿈으로 되돌린다.**
> 키만 따로 떼서 `GOOGLE_PLAY_PRIVATE_KEY` 같은 변수로 나르면 그 복원이 일어나지 않아
> 서명이 그 자리에서 던진다 (→ [4-6 함정 11번](#4-6-함정)).

#### JWT 만들기

헤더 (✅ 원문: *"Algorithm is mandatory, and has only one value: `"alg": "RS256"`."* / *"Format is mandatory, and has only one value: `"typ": "JWT"`."*):

```json
{ "alg": "RS256", "typ": "JWT" }
```

클레임:

| 클레임 | 값 | 제약 |
|---|---|---|
| `iss` | 서비스 계정 이메일 (JSON의 `client_email`) | ✅ *"The email address of the service account"* |
| `scope` | `https://www.googleapis.com/auth/androidpublisher` | 여러 개면 **공백**으로 구분(쉼표 아님) |
| `aud` | `https://oauth2.googleapis.com/token` | 고정 |
| `iat` | 현재 시각(초) | Unix epoch 초 |
| `exp` | `iat + 3600` 이하 | ✅ *"Maximum of 1 hour after the issued time"* |
| `sub` | 🔴 **넣지 않는다** | 공식 페이지의 클레임 표에 함께 실려 있지만 **도메인 전체 위임 전용**이다. ✅ 원문: *"The email address of the user for which the application is requesting delegated access."* 우리는 위임이 아니라 서비스 계정 단독 호출이므로, 이 줄을 따라 넣으면 토큰 교환이 `unauthorized_client`로 떨어진다 |

서명 알고리즘은 RS256이다. ✅ 원문: *"Service accounts rely on the RSA SHA-256 algorithm and the JWT token format."*

**서명 대상 문자열** — ✅ 원문:

> The base string for the signature is as follows:
>
> `{Base64url encoded header}.{Base64url encoded claim set}`

그리고 조립 — ✅ 원문:

> The header, claim set, and signature are concatenated together with a period (`.`) character. The result is the JWT.

**base64url은 일반 base64와 다르다:** 패딩 `=`을 떼고 `+`→`-`, `/`→`_`로 치환한 것이다.
Node의 `'base64url'` 인코딩이 이미 그렇게 해 준다(Node 15 이상). 직접 만들면
`.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')`다.

```ts
const b64url = (x: string | Buffer) => Buffer.from(x).toString('base64url');

function signJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    // sub는 넣지 않는다 (도메인 전체 위임 전용)
  };
  // 서명 대상은 '점으로 이은 두 조각'이지 JSON 원문이 아니다
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = crypto.createSign('RSA-SHA256').update(signingInput).end().sign(sa.private_key);
  return `${signingInput}.${b64url(sig)}`;
}
```

> `crypto.createSign('RSA-SHA256')`이 곧 RS256이다. 앱스토어 쪽 유틸이 쓰는 ES256과 달리
> `dsaEncoding` 같은 추가 옵션이 필요 없다 — **RSA는 서명 인코딩이 하나뿐이다.**

#### 토큰 교환

```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion={JWT}
```

```ts
let cached: { token: string; expiresAt: number } | undefined;

/** 액세스 토큰. 만료 60초 전이면 새로 받는다. 실패하면 undefined(수집을 건너뛴다) */
export async function accessToken(): Promise<string | undefined> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  const sa = serviceAccount();
  if (!sa) return undefined;
  // URLSearchParams가 grant_type의 콜론을 알아서 %3A로 인코딩한다
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signJwt(sa),
  });
  let res: Response;
  try {
    // 타임아웃이 없으면 응답이 지연될 때 수집 전체가 멈춘 것처럼 보인다 (naver.ts와 같은 이유)
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn(`구글 토큰 요청 실패: ${(e as Error).message}`);
    return undefined;
  }
  if (!res.ok) {
    // 본문에 사유가 그대로 들어온다. 아래 실패 표와 대조할 수 있게 반드시 찍는다
    const text = await res.text().catch(() => '');
    console.warn(`구글 토큰 발급 실패: HTTP ${res.status} ${text.slice(0, 200)}`);
    return undefined;
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cached.token;
}
```

성공 응답:

```json
{ "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

**실패 응답** — HTTP 400에 아래 모양이 온다. `error`는 짧고 `error_description`이 진짜 사유다:

```json
{ "error": "invalid_grant", "error_description": "Invalid JWT Signature." }
```

| `error` | `error_description` | 실제 원인 |
|---|---|---|
| `unauthorized_client` | ✅ 원문 *"Unauthorized client or scope in request."* | `sub`를 넣었거나 `scope` 문자열이 틀렸다. 위 클레임 표의 `sub` 행을 보라 |
| `invalid_grant` | ✅ 원문 *"Invalid JWT Signature."* | `private_key`가 틀렸거나 **줄바꿈이 리터럴 `\n`으로 들어왔다** (→ [4-6 함정 11번](#4-6-함정)). 키가 삭제·비활성화된 경우도 같은 메시지다 |
| `invalid_grant` | (기타) | 서버 시계가 크게 어긋나 `iat`/`exp`가 거부된 경우. ⚠️ **정확한 문구는 확인하지 못했다.** `error_description`을 그대로 로그에 찍어 두면 실제로 만났을 때 판별된다 |

> 🟠 이 실패들은 **HTTP 400**이지 401이 아니다. 4-3의 오류 표(리뷰 API 쪽)와 상태 코드 체계가 다르다.
> 토큰 엔드포인트는 OAuth 규격(`{error, error_description}`)이고 리뷰 API는 Google API 규격(`{error:{code,message,status}}`)이다.

#### 호출 헤더

```
Authorization: Bearer {access_token}
```

#### 토큰 수명과 갱신

| 항목 | 값 |
|---|---|
| 수명 | **3600초 (1시간)** |
| 갱신 | 리프레시 토큰이 없다. **JWT를 다시 만들어 토큰 교환을 다시 하면 된다** |
| 저장 | **DB에 저장할 필요가 없다.** 프로세스 메모리에 만료 시각과 함께 들고 있다가, 만료 60초 전이면 새로 받는다 |

> 이 점이 Threads(60일 회전 토큰, 저장·갱신 설계 신설 필요)와 결정적으로 다르다.
> 이쪽은 **키가 정적이고 토큰은 그때그때 새로 만드는 것**이라 회전 자격증명 설계가 필요 없다.
> [../official-api-migration.md](../official-api-migration.md) 3절이 "구글플레이는 1시간 토큰"이라
> 적어 둔 것을 "회전 자격증명"으로 오해하지 말 것.

### 4-3. 엔드포인트와 요청

✅ **원문 확인 (공식 레퍼런스):**

```
GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/reviews
```

**경로 파라미터**

| 이름 | 타입 | 원문 설명 | 필수 |
|---|---|---|---|
| `packageName` | string | *"Package name of the app."* | ✅ 필수 |

`packageName`은 현재 설정의 `googlePlay.appId`와 같은 값이다 (예: `com.example.app` 형태).

**쿼리 파라미터** — ✅ 전부 원문 확인. **이 넷이 전부다.**

| 이름 | 타입 | 원문 설명 | 우리가 쓰나 |
|---|---|---|---|
| `maxResults` | uint32 | *"How many results the list operation should return."* | ✅ **100으로 고정** |
| `token` | string | *"Pagination token. If empty, list starts at the first review."* | ✅ 2쪽부터 |
| `startIndex` | uint32 | *"The index of the first element to return."* | ❌ 안 쓴다 (`token` 방식으로 통일) |
| `translationLanguage` | string | *"Language localization code."* | 🔴 **넣지 마라** (→ [4-6 함정 7번](#4-6-함정)) |

> 🔴 **`country` 파라미터가 없다.** 목록에 없는 것이 아니라 **존재하지 않는다.**
> 지금 코드는 국가를 조회 파라미터로 쓰고 있는데, 그 축이 API에는 아예 없다.
> 이것이 이 전환에서 화면 파급이 가장 넓은 항목이다 (→ [4-6 함정 6번](#4-6-함정)).

**예시 요청 (1쪽)**

```
GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/reviews?maxResults=100
Authorization: Bearer ya29.a0Af...
```

**예시 요청 (2쪽 이후)**

```
GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/reviews?maxResults=100&token=CgkI...
```

**응답 본문 구조** (✅ 원문 확인)

```json
{
  "reviews": [ { "reviewId": "...", "authorName": "...", "comments": [ ... ] } ],
  "tokenPagination": { "nextPageToken": "..." },
  "pageInfo": { "totalResults": 0, "resultPerPage": 0, "startIndex": 0 }
}
```

> 🔴 **리뷰가 0건이면 `reviews` 키가 아예 오지 않는다. 빈 배열이 아니라 키 자체가 없다.**
> 이 API는 protobuf 기반이고 그 JSON 매핑 규칙이 기본값을 생략한다 —
> ✅ 원문: *"Fields that don't support presence and that have their default value are omitted by default in JSON output"*
> (<https://protobuf.dev/programming-guides/json/>). 빈 배열은 반복 필드의 기본값이다.
> **7일 창 + 대상 앱이면 0건 응답은 드문 일이 아니다.** 받는 쪽에서 반드시 `?? []`로 받는다
> (→ [4-5 루프](#4-5-상한쿼터페이지네이션)).
> ⚠️ 같은 이유로 `tokenPagination`, `pageInfo`도 통째로 없을 수 있다. `?.`로 읽는다.

**Review 하나의 구조** (✅ 원문 확인)

```json
{
  "reviewId": "string",
  "authorName": "string",
  "comments": [
    {
      "userComment": {
        "text": "string",
        "lastModified": { "seconds": "string", "nanos": 0 },
        "starRating": 0,
        "reviewerLanguage": "string",
        "device": "string",
        "androidOsVersion": 0,
        "appVersionCode": 0,
        "appVersionName": "string",
        "thumbsUpCount": 0,
        "thumbsDownCount": 0,
        "deviceMetadata": { },
        "originalText": "string"
      },
      "developerComment": {
        "text": "string",
        "lastModified": { "seconds": "string", "nanos": 0 }
      }
    }
  ]
}
```

> `comments`는 배열이고 **사용자 리뷰와 개발자 답글이 같은 배열에 섞여 들어온다.**
> 원문: `userComment` = *"A comment from a user."*, `developerComment` = *"A comment from a developer."*
> 우리가 필요한 것은 `userComment`가 있는 항목뿐이다. **`comments[0]`을 무조건 집으면 안 되고,
> `userComment`가 있는 첫 항목을 골라야 한다.**

#### 오류 응답

**Play Developer API는 Google API 공통 오류 규격을 쓴다.** 본문 모양은 상태 코드와 무관하게 하나다
(✅ 원문 예시, <https://google.aip.dev/193>):

```json
{
  "error": {
    "code": 429,
    "message": "...",
    "status": "RESOURCE_EXHAUSTED",
    "details": [ { "@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "...", "domain": "...", "metadata": { } } ]
  }
}
```

`error.code`는 HTTP 상태와 같은 값이고, `error.status`가 사람이 읽는 사유다.
**`details`는 없을 수도 있다.**

| HTTP | `error.status` | 뜻 | 재시도 정책 |
|---|---|---|---|
| **401** | `UNAUTHENTICATED` 🟠 | 액세스 토큰 만료·무효 | **토큰을 버리고 1회 재발급 후 재시도 1회.** 그래도 401이면 그 앱을 실패로 기록하고 중단 (→ [4-6 함정 9번](#4-6-함정)) |
| **403** | `PERMISSION_DENIED` ⚠️ | 서비스 계정이 그 앱의 개발자 계정에 초대되지 않았거나 '리뷰 답글' 권한이 없다 | **재시도하지 않는다.** 권한 문제는 재시도로 풀리지 않는다. 그 앱만 실패로 표시하고 `CollectTask.note`에 `HTTP 403 / status / message`를 그대로 남긴다 |
| **429** | `RESOURCE_EXHAUSTED` ✅ | **앱당 시간당 200회 GET을 넘겼다** (→ [3절](#3-비용)) | 백오프 재시도 **최대 2회**(5초 → 20초). 그래도 429면 중단하고 note에 남긴다. 다음 실행 때 자연히 풀린다 |
| **5xx** | — | 일시 장애 | 재시도 2회(2초 → 8초) |
| 그 외 `!res.ok` | — | — | 재시도 없이 중단 + note |

- ✅ **429 = `RESOURCE_EXHAUSTED`는 공식 매핑 표에 있다** (위 AIP-193). 403 = `PERMISSION_DENIED`도 같은 문서에 나온다.
- 🟠 **401 = `UNAUTHENTICATED`은 그 표에 명시돼 있지 않다.** OAuth 표준 동작이라 그렇게 볼 뿐이다.
- ⚠️ **권한이 없을 때 실제로 403이 오는지, `error.status`·`details[].reason`이 무엇인지는 확인하지 못했다.**
  이 값을 모르면 "권한 문제"와 "리뷰 0건"을 코드가 못 가른다 — [5절 #0](#5-붙인-뒤-확인할-것)이 착수 전에 이걸 실측하는 절차다.

> 🔴 **어떤 오류도 "0건"으로 흘리지 마라.** `!res.ok`인데 빈 배열을 돌려주면
> 화면에는 "수집됨, 0건"으로 찍히고 아무도 모른다. 오류는 반드시 `CollectTask`를
> `failed`로 만들고 `note`에 상태 코드를 남긴다 (→ [4-6 함정 5번](#4-6-함정)).

### 4-4. 응답 → RawItem 매핑

RawItem 정의: [../../packages/core/src/types.ts](../../packages/core/src/types.ts)

아래 표에서 `uc` = `comments[]` 중 `userComment`가 있는 첫 항목의 `userComment`.

| RawItem 필드 | 이 API의 응답 필드 | 비고 |
|---|---|---|
| `source` | — | 고정 문자열 `'googleplay'`. `SOURCE_KEYS`의 값과 반드시 같아야 한다 |
| `sourceId` | `reviewId` | ✅ 원문: *"Unique identifier for this review."* ⚠️ **현재 스크래퍼가 저장한 `r.id`와 같은 값 체계인지는 확인 못 했다** (→ [5절](#5-붙인-뒤-확인할-것)) |
| `url` | ❌ **API가 주지 않는다** | 조립한다. 🔴 **결정: `hl`을 뺀다.** → `https://play.google.com/store/apps/details?id={packageName}&reviewId={reviewId}` 지금 `hl`에 들어가는 `lang`의 **유일한 공급원**은 [daily.ts](../../apps/pipeline/src/daily.ts):287의 `langFor(country)`인데, 국가 루프를 지우면 그 줄 자체가 사라진다 ([4-6 함정 6번](#4-6-함정)). "서비스 기본 언어 한 값으로 고정"도 가능했지만, `hl`은 **스토어 페이지의 표시 언어일 뿐 리뷰를 특정하지 않으므로** 빼는 쪽이 근거 없는 값을 만들어 넣지 않는다. ⚠️ **이 주소가 실제로 그 리뷰를 열어 주는지는 여전히 검증된 적이 없다** → [5절 #14](#5-붙인-뒤-확인할-것)에서 실제로 눌러 본다 |
| `author` | `authorName` | ✅ 원문: *"The name of the user who wrote the review."* 🟠 개인정보 최소화 관점에서 **저장하지 않는 선택지를 먼저 검토할 것** ([2-4](#2-4-남은-리스크)) |
| `content` | `uc.originalText \|\| uc.text` (탭 치환 후) | ✅ **원문 전문**: *"The content of the comment, i.e. review body. In some cases users have been able to write a review with separate title and body; in those cases the title and body are concatenated and separated by a tab character."* → **제목과 본문이 탭 한 글자로 이어져 온다** ([4-6 함정 12번](#4-6-함정)). `originalText`를 먼저 보는 이유와 **`??`가 아니라 `\|\|`인 이유**는 [4-6 함정 7번](#4-6-함정). 다듬은 뒤 빈 문자열이면 **그 리뷰는 버린다** |
| `rating` | `uc.starRating` | ✅ 원문: *"The star rating associated with the review, from 1 to 5."* 그대로 1~5 |
| `postedAt` | `uc.lastModified` | 🔴 **이름 그대로 '작성일'이 아니라 '마지막 수정일'이다.** ✅ 원문: *"The last time at which this comment was updated."* Timestamp 객체(`{seconds, nanos}`)라 `Number(seconds) * 1000`으로 ms를 만든 뒤 기존 `normalizeInstant()`에 넘긴다 (UTC 그대로 쓰면 KST 오전 리뷰가 전날로 기록된다) |
| `keyword` | ❌ **못 채운다** | 앱 리뷰는 키워드 검색이 아니라 앱 단위 조회다. 현재도 비어 있다. 정상 |
| `service` | ❌ API 밖 | 설정(`services[].name`)에서 주입한다 |
| `country` | 🔴 **못 채운다. API에 국가 개념 자체가 없다** | 조회 파라미터에도 없고 응답 필드에도 없다. `uc.reviewerLanguage`(✅ *"Language code for the reviewer."*)는 **언어이지 국가가 아니다** — 대체재로 쓰면 안 된다 (`TagResult.lang`과 축이 겹치고, `RawItem.country` 주석이 정의한 '스토어 국가'와 뜻이 다르다). → [4-6 함정 6번](#4-6-함정) |

#### 본문 만들기 — 이 세 줄이 매핑의 전부다

세 가지가 한 자리에서 걸린다: **번역본 회피 / 탭 / 빈 본문**.

```ts
// 1) 개발자 답글이 아니라 사용자 리뷰를 고른다 (함정 8)
const uc = review.comments?.find((c) => c.userComment)?.userComment;
if (!uc) continue;

// 2) 번역이 일어난 리뷰만 originalText가 채워진다. 안 채워지면 ''이므로 ??가 아니라 || (함정 7)
//    3) 제목·본문이 탭으로 이어져 온다. 줄바꿈으로 바꿔 경계를 남긴다 (함정 12)
const raw = uc.originalText || uc.text || '';
if (raw.includes('\t')) tabbed += 1;            // 로그로 건수를 남긴다 (5절 #5)
const content = raw.replace(/\t/g, '\n').trim();

// 4) 다듬은 뒤 비면 버린다 (5절 #7의 '빈 본문 0건'과 짝을 이룬다)
if (!content) continue;
```

> **탭을 줄바꿈으로 바꾸는 이유**: 그대로 두면 제목이 본문 첫 문장에 눌어붙은 채로 LLM에 들어가고,
> 화면에서는 탭이 보이지 않아 아무도 눈치채지 못한다. 마침표로 바꾸면 제목이 문장인 척하게 된다.
> 줄바꿈은 경계를 보존하면서 화면과 프롬프트 양쪽에서 자연스럽다.

**RawItem에 자리가 없어 버려지는 필드** (참고용, 필요해지면 스키마 확장 사안):
`device`, `androidOsVersion`, `appVersionCode`, `appVersionName`, `thumbsUpCount`, `thumbsDownCount`,
`deviceMetadata`, `originalText`, `developerComment`.

> `appVersionName`은 "특정 버전 배포 후 불만 급증"을 보는 데 쓸 수 있는 값이라
> **지금 버리는 것 중 가장 아까운 것**이다. 스크래퍼 경로에서는 못 얻던 값이기도 하다.
> 이번 전환 범위에 넣을지는 별도 판단.

### 4-5. 상한·쿼터·페이지네이션

#### 페이지네이션 (✅ 원문 확인)

| 항목 | 값 | 원문 |
|---|---|---|
| 기본 건수 | **10건** | *"By default, 10 reviews appear on each page."* |
| 최대 건수 | **100건** | *"You can display up to 100 reviews per page by setting the `maxResults` parameter in your request."* |
| 다음 쪽 | `token` 파라미터 | *"When requesting the next page of reviews, include the `token` element. Set this element's value to the `nextPageToken` value, which appears in the original response."* |

**루프 형태:**

```ts
let token: string | undefined;
let pages = 0;
const collected: Review[] = [];

while (collected.length < max) {
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${packageName}/reviews?maxResults=100` + (token ? `&token=${encodeURIComponent(token)}` : '');
  const json = await get(url);            // 오류는 4-3 '오류 응답' 표대로 처리하고 던지거나 중단
  pages += 1;

  // 🔴 리뷰가 0건이면 reviews 키 자체가 없다 (4-3). ?? []가 없으면 여기서 터진다
  const page = json.reviews ?? [];
  collected.push(...page);

  token = json.tokenPagination?.nextPageToken;

  // 종료 조건은 셋이다. 하나라도 빠지면 조용히 틀린다
  if (!token) break;              // (1) 다음 쪽이 없다 — 정상 종료
  if (page.length === 0) break;   // (2) 빈 쪽이 왔다 — token이 남아 있어도 더 볼 것이 없다(무한루프 방지)
}
// (3) while 조건이 상한 도달을 막는다

// 페이지 수를 반드시 남긴다. 항상 1이면 루프가 안 도는 것이다 (함정 1, 5절 #2)
note = `${pages}쪽, ${collected.length}건`;
```

> **(2)를 빼면 안 되는 이유**: `nextPageToken`이 계속 오는데 `reviews`가 빈 응답이 이어지면
> `while`은 `collected.length < max`라 절대 안 끝나고 루프가 돈다. 쿼터만 태우고 결과는 0건이다.
> 상한 300에 1쪽=100건이므로 정상이면 **최대 3쪽**에서 끝난다.

#### 쿼터 (✅ 원문 확인)

| 종류 | 한도 | 원문 |
|---|---|---|
| GET (리뷰 목록·개별 조회) | **앱당 시간당 200회** | *"GET requests (for retrieving lists of reviews and individual reviews) – 200 per hour"* |
| POST (답글) | **하루 2,000회** | *"POST requests (for replying to reviews) – 2000 per day"* |

- 쿼터는 *"enforced separately on a per-app basis"* — **앱마다 따로 센다.** 대상 앱이면 서로 갉아먹지 않는다
- 증액은 별도 신청 가능

**여유 계산:** 앱당 시간당 200회 × 100건 = 이론상 시간당 20,000건. 7일 창 안에 그만큼 쌓일 일이 없으므로
**대상 앱 규모에서는 쿼터가 제약이 아니다.** 다만 상한을 크게 올리거나 앱이 늘어나면 계산에 넣어야 한다.

#### 실질 상한은 쿼터가 아니라 7일 창이다

✅ **원문 확인:**

> "You can retrieve only the reviews that users have created or modified within the last week."

즉 `maxResults`를 100으로 두고 끝까지 넘겨도 **받을 수 있는 전부는 "최근 7일 안에 작성되거나
수정된, 댓글이 있는, 프로덕션 리뷰"** 다.

#### 현재 설정과의 충돌

고칠 자리는 [../../packages/core/src/collect-limits.ts](../../packages/core/src/collect-limits.ts):106
한 줄이다 (`key: 'googlePlayReviewCount'`).

| 항목 | 현재 값 | **바꿀 값** | 근거 |
|---|---|---|---|
| `min` | 10 | **100** | 1쪽이 100건이다. 10으로 두면 100건을 받아 90건을 버린다. 100 미만은 의미가 없다 |
| `def` | 200 | **300** | 7일 창 실측 기대치는 약 8건(30일 33건). 300은 그 **37배 여유**이고 호출은 앱당 최대 3회 — 시간당 200회 쿼터의 1.5% |
| `max` | 1000 | **1000 (유지)** | 앱당 10회 호출 = 쿼터의 5%. 언급량이 폭발한 날에도 7일치를 놓치지 않게 여유를 남긴다 |
| `perUnit` | 1 | **1 (유지)** | 단위가 '건'이라 바뀌지 않는다 |
| `unit` | `'건 (앱당)'` | **`'건 (앱당, 최근 7일)'`** | X 필드가 `'건 (키워드당, 최근 7일)'`로 같은 표기를 쓴다 (같은 파일 113행) |
| `effect` | `OLDER` 상수 | **새 상수** (아래) | 🔴 **`OLDER`를 고치면 안 된다.** 같은 파일 105행의 앱스토어가 그 상수를 공유하고 있고, 앱스토어에는 7일 창이 없다 |

**`effect` 새 상수 — 문장 전문:**

```ts
/**
 * 구글플레이 공식 API는 최근 7일 안에 작성·수정된 리뷰만 돌려준다.
 * 값을 키워도 창 밖으로 나가지 않으므로 OLDER(앱스토어와 공유)를 쓰면 화면이 거짓말을 한다.
 */
const WITHIN_7D = '최근 7일 리뷰만 들어옵니다. 값을 키우면 그 7일 안에서 더 많이 받습니다';
```

```ts
// 106행 — 바뀐 뒤
{ key: 'googlePlayReviewCount', configKey: 'googleplay', label: '구글플레이', unit: '건 (앱당, 최근 7일)', min: 100, max: 1000, def: 300, perUnit: 1, scope: 'googleplay', effect: WITHIN_7D, sources: ['googleplay'], defaultOn: true },
```

> ⚠️ [../../packages/core/src/paths.ts](../../packages/core/src/paths.ts):269의 자리표시자 설정도
> `googlePlayReviewCount: 200`을 들고 있다. **300으로 같이 올린다.** 안 그러면 설정이 없는 첫 실행만
> 다른 상한으로 돈다.

→ 전환 시 **상한 필드의 최소·기본값과 설명 문구를 함께 고쳐야 한다.** 안 고치면 화면이 거짓말을 한다.

### 4-6. 함정

**전부 "에러 없이 조용히 틀린 결과가 들어오는" 지점이다.**

#### 1. 🔴 페이지 토큰 루프가 없으면 100건에서 조용히 끊긴다

**가장 걸리기 쉬운 함정이다.** 설정 상한을 200으로 두고, `maxResults=100`으로 한 번만 호출하면
**오류도 경고도 없이 100건만 들어온다.** `tokenPagination.nextPageToken`을 보지 않으면
"리뷰가 100건뿐이었나 보다"로 읽히고, 화면의 수집 건수도 그럴듯하게 100으로 찍힌다.

더 나쁜 경우: `maxResults`를 아예 안 넣으면 **기본값 10건**이다. 상한 200으로 설정해 두고
매번 10건씩 들어오는데 아무도 모른다.

- **방어**: `maxResults`를 명시적으로 100으로 박고, 루프를 돈 **페이지 수를 수집 로그(`CollectTask.note`)에 남긴다.**
  페이지가 항상 1이면 루프가 안 도는 것이다.

#### 2. 🔴 7일 창 — 스케줄러가 멈춘 구간은 영구 유실

현재 스크래퍼는 최신순 정렬에 건수 상한만 있어 7일보다 오래된 리뷰도 받아 온다.
전환하면 **8일 이상 파이프라인이 멈춘 구간은 다시는 못 가져온다.** 그리고 그 실패는
**오류가 아니라 "그날 0건"으로 나타난다.**

- **완화책 (✅ 공식 문서에 있다)**:

  > "If you want to retrieve all reviews for your app since the beginning of time, you can download your reviews as a CSV file using the Google Play Console."

  **최초 1회 과거분은 Play Console에서 CSV로 내려받아 채우고, 그 이후를 API로 잇는다.**
  ⚠️ CSV의 컬럼 구성과 리뷰 ID 체계가 API의 `reviewId`와 같은지는 **확인하지 못했다.**
  다르면 CSV 적재분과 API 적재분이 중복으로 쌓인다. **CSV를 실제로 한 번 내려받아 컬럼을 보고 판단할 것.**
- **정책 필요**: 수집 주기 하한(최소 주 1회 이상)과 **"N일 이상 실행 없음" 알림 기준**을 정해야 한다.
  이건 코드가 아니라 운영 정책이다.

#### 3. 별점만 준 리뷰는 아예 안 온다

✅ 원문:

> "the API shows only the reviews that include comments. If a user rates your app but does not provide a comment, their feedback is not accessible from the API."

이 도구는 텍스트를 분류하므로 실질 손실은 작다. 다만 **"리뷰 수가 줄었다"로 오독하기 쉽다.**
스크래퍼 시절 숫자와 직접 비교하면 안 된다.

#### 4. 프로덕션 트랙만 온다

✅ 원문:

> "The Reply to Reviews API allows you to access feedback only for _production_ versions of your app."

베타·내부 테스트 트랙 리뷰는 **오류 없이 0건**이다. 지금 그 트랙을 보고 있지 않다면 손실 0이지만,
"신규 기능 베타 반응 보기" 같은 요구가 나오면 **이 경로에는 답이 없다**는 것을 미리 못박아 둘 것.

#### 5. 권한이 부분적으로만 들어오면 앱별로 갈린다

개발자 계정마다 중 2곳만 초대가 승인되면, **그 계정의 앱만 실패하고 나머지는 정상 동작한다.**
전체 실패가 아니라 **부분 실패**라 화면에서는 "수집됐다"로 보인다.

- **방어**: 앱 단위로 성공/실패를 `CollectTask`에 따로 기록하고, 실패 사유를 `note`에 남긴다
  (지금도 `skipReason` 패턴이 있다 — 같은 자리에 붙이면 된다)
- ⚠️ **권한 부족 시 실제로 어떤 HTTP 상태·에러 코드가 오는지는 확인하지 못했다.**
  Google API 공통 규격상 **403 / `PERMISSION_DENIED`**로 예상되고 [4-3 오류 응답](#4-3-엔드포인트와-요청)에
  그렇게 적어 두었지만, **이 API에서 실측한 값이 아니다.**
  → **[5절 #0](#5-붙인-뒤-확인할-것)이 착수 0단계다.** 일부러 권한 없는 앱을 한 번 찔러 보고
  상태 코드와 본문을 기록해 4-3 표에 되적는다. 이 값을 알아야 "권한 문제"와 "리뷰가 없음"을 코드가 구분한다

#### 6. 🔴 국가 파라미터가 사라지면 화면 여러 곳이 연쇄로 바뀐다

**이것이 이 전환에서 파급이 가장 넓은 항목이다.** 그리고 "라벨 하나 빠지는 일"이 아니다.

**지금 국가는 메타데이터가 아니라 조회 파라미터다.**
[../../apps/pipeline/src/daily.ts](../../apps/pipeline/src/daily.ts)가
`for (const country of storeCountries(svc.googlePlay))`로 **국가마다 따로 조회**하고,
그 국가 값을 결과에 라벨로 붙인다. 같은 앱도 스토어 국가를 바꾸면 리뷰 풀이 통째로 달라지기 때문이다.

**API에는 그 축이 없다.** 한 번 조회하면 전역 풀이 온다. 따라서 **11곳이 바뀐다.**
아래 표는 "달라진다"가 아니라 **바꿔 넣을 값**이다.

| # | 바뀌는 곳 (파일:줄) | 지금 | **바꿀 값** |
|---|---|---|---|
| 1 | [collectors/googleplay.ts](../../apps/pipeline/src/collectors/googleplay.ts):8-14 시그니처 | `collectGooglePlay(appId, lang='ko', country='kr', num=200, service?)` | `collectGooglePlay(packageName: string, max = 300, service?: string)` — **인자 5개 → 3개** (아래 코드) |
| 2 | [daily.ts](../../apps/pipeline/src/daily.ts):285-296 국가 루프 | `for (const country of storeCountries(svc.googlePlay))` + 작업 이름 `…(${country})` + `country` 라벨 | **루프 삭제.** 앱당 작업 1개, 이름은 `label(svc.name,'googleplay')`, `country: ''` (`CollectTask.country` 주석이 "국가 개념이 없는 소스는 빈 문자열" — [types.ts](../../packages/core/src/types.ts):339). **수집 작업 9개 → 4개** |
| 3 | [daily.ts](../../apps/pipeline/src/daily.ts):286-287 + import 13행 | `const lang = langFor(country)` | **삭제.** 🔴 **287행이 `daily.ts` 안의 유일한 `langFor` 사용처다.** 13행 import도 같이 지운다(안 지우면 미사용 import). `storeCountries`(21행)는 앱스토어가 계속 쓰므로 **남긴다** |
| 4 | [daily.ts](../../apps/pipeline/src/daily.ts):294 호출부 | `collectGooglePlay(appId, lang, country, limits.googlePlayReviewCount, svc.name)` | `collectGooglePlay(appId, limits.googlePlayReviewCount, svc.name)` |
| 5 | [collect-limits.ts](../../packages/core/src/collect-limits.ts):106 상한 정의 | `min:10, max:1000, def:200, effect:OLDER` | `min:100, max:1000, def:300, effect:WITHIN_7D` — 값과 문구 전문은 [4-5](#4-5-상한쿼터페이지네이션) |
| 6 | [page.tsx](../../apps/web/app/page.tsx):615-618 + [collect-limits.ts](../../packages/core/src/collect-limits.ts):255-263 주석 | `(s) => n + (s.googlePlay?.appId ? storeCountries(s.googlePlay).length : 0)` / 주석 "앱 소스는 조회 횟수로 센다" | `(s) => n + (s.googlePlay?.appId ? 1 : 0)`. 주석은 **"앱스토어만 조회 횟수, 구글플레이는 앱 수"**로 정정. 안 고치면 추산이 국가 수만큼 부풀고 **그 숫자를 보고 상한을 정한다** |
| 7 | [paths.ts](../../packages/core/src/paths.ts):269 자리표시자 기본값 | `googlePlayReviewCount: 200` | `300` (5번과 같은 값) |
| 8 | [paths.ts](../../packages/core/src/paths.ts):82 설정 타입 | `googlePlay?: { appId; lang?; country?; countries? }` | 🟢 **타입은 그대로 둔다 + 주석만 단다.** 이유는 아래 |
| 9 | `RawItem.country` 값 | `'kr'`, `'us'` … | **빈 문자열** |
| 10 | 대시보드 **국가 칩** (`countryChips`, [page.tsx](../../apps/web/app/page.tsx):902 / [DashboardView.tsx](../../apps/web/app/_dashboard/DashboardView.tsx):1799) · 서비스 카드 **국기** (`svc-flags`, 같은 파일 920행) | 국가별 건수·부정 건수 / 추적 국가 국기 | **코드 변경 없음.** 구글플레이가 통째로 "국가 없음" 칩으로 이동한다. 국기는 앱스토어 기준으로만 뜻이 남는다 — **의도한 결과인지 [5절 #9](#5-붙인-뒤-확인할-것)에서 눈으로 확인한다** |
| 11 | **채널 요약** (`ChannelSummary.country`, [types.ts](../../packages/core/src/types.ts):312) · **트렌드 셀** (`TrendCell.country`, 328) · `ItemQuery.country` 필터 (243-258) | `${source}\|${country}` 단위로 쪼개짐 / 구글플레이 글이 걸림 | **코드 변경 없음.** 구글플레이 카드가 국가별 여러 장 → **한 장으로 합쳐진다.** 국가 필터에는 **안 걸린다** |

**새 수집기 시그니처 (1번):**

```ts
// apps/pipeline/src/collectors/googleplay.ts
import { accessToken } from './googleplay-auth.js';   // 4-2

/**
 * 구글플레이 공식 리뷰 API.
 * 국가 인자가 없는 것은 실수가 아니다 — 이 API에 국가 축 자체가 없다(문서 4-3).
 * max는 '최근 7일 창 안에서 최대 몇 건까지 받을지'다. 7일보다 오래된 것은 값을 키워도 안 온다.
 */
export async function collectGooglePlay(
  packageName: string,
  max = 300,
  service?: string,
): Promise<RawItem[]> { /* 4-5의 루프 + 4-4의 매핑 */ }
```

**새 작업 생성 (2·4번) — [daily.ts](../../apps/pipeline/src/daily.ts):283-297 자리:**

```ts
      } else {
        const { appId } = svc.googlePlay!;
        // 공식 API에는 국가 축이 없다. 앱 하나당 조회 1회이고 전역 풀이 온다
        tasks.push({
          name: label(svc.name, 'googleplay'),
          service: svc.name,
          source: 'googleplay',
          country: '',
          run: () => collectGooglePlay(appId, limits.googlePlayReviewCount, svc.name),
        });
      }
```

**설정을 왜 안 지우는가 (8번):**

`googlePlay.countries`를 타입에서 지우고 싶어지지만, **지우면 안 된다.**
설정 화면의 국가 입력은 하나이고 [paths.ts](../../packages/core/src/paths.ts):595의 `normalizeCountries(input.countries)`가
만든 **같은 목록을 앱스토어와 구글플레이 양쪽에 써 넣는다**(604-612행, 658-665행).
구글플레이 쪽만 지우면 설정 마이그레이션 + 폼 분기 + 구버전 설정 호환이 한꺼번에 딸려 온다.
**앱스토어는 그 국가 목록이 여전히 필요하다.**

→ **결정: 필드는 남기고, 읽지 않는다.** 82행에 주석 한 줄을 박는다:

```ts
  /**
   * ⚠ 구글플레이 공식 API에는 국가 축이 없다(docs/sources/googleplay.md 4-3).
   * country/countries/lang은 앱스토어와 국가 입력을 공유하느라 남아 있을 뿐,
   * 구글플레이 수집 경로는 읽지 않는다. 새로 읽는 코드를 넣지 말 것.
   */
  googlePlay?: { appId: string; lang?: string; country?: string; countries?: string[] };
```

> `lang`은 이 전환으로 **읽는 곳이 아예 없어진다**(daily.ts:287이 유일했고, `url`에서도 뺐다 — [4-4](#4-4-응답--rawitem-매핑)).
> 그래도 지우지 않는 이유는 같다: [paths.ts](../../packages/core/src/paths.ts):608·661이 값을 계속 써 넣고 있고,
> 그 두 줄을 건드리면 구버전 설정 호환까지 손대야 한다. **미사용 필드로 두는 편이 전환 범위를 좁힌다.**

**조용한 실패 지점은 두 가지다.**

- **(a) 기존 데이터와 새 데이터가 같은 화면에서 갈린다.** 이미 저장된 구글플레이 33건에는
  `country`가 `'kr'`, `'us'` 등으로 들어 있고 새로 들어오는 것은 빈 문자열이다.
  **국가 칩으로 필터하면 새 데이터가 통째로 사라지고, "국가 없음"을 누르면 옛 데이터가 빠진다.**
  건수가 어디로 갔는지 화면만 봐서는 알 수 없다.
- **(b) 총량 추산이 조용히 부풀거나 줄어든다.** `googlePlayQueries` 계산을 안 고치면
  화면의 "이번 실행 최대 수집량"이 국가 수배로 틀리고, **그 숫자를 보고 상한을 정한다.**

**착수 전에 실측해야 할 것 (✅ [../official-api-migration.md](../official-api-migration.md)가 지목한 항목):**
**"지금 국가 루프가 잡던 리뷰가 API의 전역 풀에 실제로 다 포함되는지"** 한 번 확인할 것.
포함되면 순손실이 없고, 포함되지 않으면 국가 축을 잃는 동시에 수집량도 준다.
⚠️ **아직 확인하지 못했다.**

#### 7. 🔴 `translationLanguage`를 넣으면 본문이 번역문으로 바뀐다

`uc.originalText`의 **정의 전문**이 이 함정의 전부다 — ✅ 원문:

> **originalText** — *"Untranslated text of the review, where the review was translated. If the review was not translated this is left blank."*

**두 문장이 각각 다른 것을 결정한다.**

- 앞 문장: **원문 필드가 따로 있다는 것은 `text`가 번역본일 수 있다는 뜻이다.**
  이 본문은 그대로 LLM 분류·요약 입력이 된다. **번역문을 분류하면 표기 문제가 아니라 판정이 달라진다.**
  그리고 이 사고는 **에러 없이** 일어난다.
- 뒷 문장: **번역되지 않은 리뷰에서는 `originalText`가 빈 값이다.** 정상 데이터에서 대부분의 행이 그렇다.

**방어 (두 줄):**

1. `translationLanguage`를 **넣지 않는다.**
2. 본문은 **`uc.originalText || uc.text`** 로 만든다.

> 🔴 **`??`가 아니라 `||`다.** `??`는 `null`/`undefined`만 막고 **빈 문자열은 그대로 통과시킨다.**
> 번역되지 않은 리뷰의 `originalText`는 위 원문대로 **빈 값**이므로,
> `originalText ?? text`로 쓰면 **번역 안 된 정상 리뷰의 본문이 통째로 빈 문자열이 된다.**
> 그리고 빈 본문은 버려지므로(→ [4-4](#4-4-응답--rawitem-매핑)) **리뷰가 조용히 사라진다.**
> 이 문서의 이전 판이 `??`를 처방하고 있었다.

- ✅ **여기까지는 공식 정의로 확정된다.** "`originalText`가 채워졌다 = 그 리뷰는 번역본을 받았다"이다.
- ⚠️ **남은 확인은 하나뿐이다: `translationLanguage`를 넣지 않아도 번역이 일어나는 경우가 있는가.**
  → [5절 #4](#5-붙인-뒤-확인할-것)에서 `originalText`가 비어 있지 않은 행을 세어 판별한다.
  **0건이면 번역이 전혀 안 일어난 것이고, 1건이라도 나오면 우리가 안 시켜도 번역이 붙는다는 뜻이다.**

#### 8. `comments[0]`을 무조건 집으면 개발자 답글이 본문으로 들어간다

`comments` 배열에는 사용자 리뷰(`userComment`)와 **개발자 답글(`developerComment`)이 섞여 있다.**
답글이 달린 리뷰에서 배열 순서를 가정하고 첫 항목을 집으면 **우리가 쓴 답글이 고객 목소리로 저장된다.**
분류 결과까지 오염되고, 오류는 나지 않는다.

- **방어**: `userComment`가 있는 첫 항목만 고른다. 없으면 그 리뷰는 버린다.

#### 9. 액세스 토큰이 실행 도중 만료된다

토큰 수명은 3600초다. 대상 앱을 순회하며 페이지를 넘기는 중에 1시간을 넘기면 **중간부터 401**이 난다.

- **방어**: 매 요청 직전에 만료 시각을 보고 60초 이내면 새로 발급한다. 401이 오면 1회 재발급 후 재시도.

#### 10. `postedAt`이 수정일이라 "수정된 리뷰"의 새 본문이 영영 안 들어온다

`lastModified`는 *"The last time at which this comment was updated."* 다.
사용자가 리뷰를 고치면 **같은 `reviewId`로 다시 7일 창에 등장한다.**

그런데 저장은 `ON CONFLICT ... DO NOTHING`이다
([../../packages/core/src/store.ts](../../packages/core/src/store.ts)).
**`sourceId`가 같으므로 새 본문이 그냥 버려진다.** "별 5개 → 별 1개로 고치고 불만을 적은" 리뷰가
**우리 DB에는 옛날 칭찬 본문으로 남는다.** 오류는 없다.

- 이건 이번 전환에서 새로 생기는 문제가 아니라 **원래 있던 문제가 이 API에서 눈에 띄게 되는 것**이다
  (7일 창 때문에 수정본이 반드시 다시 온다)
- **판단 필요**: 그대로 둘지, `sourceId` 충돌 시 `lastModified`가 더 최신이면 갱신할지.
  **후자를 택하면 저장 계층을 건드려야 하고 다른 소스에도 영향이 간다.** 전환 범위에 넣을지 먼저 결정할 것

#### 11. 🔴 `private_key`를 환경변수로 나르면 줄바꿈이 리터럴 `\n`으로 들어와 서명이 던진다

**첫 실행에서 가장 밟기 쉬운 함정이다.** PEM 키는 여러 줄인데 `.env`는 한 줄짜리 형식이라,
JSON 안의 `"private_key"` 값에는 줄바꿈이 **`\` + `n` 두 글자**로 들어 있다.

- ✅ **JSON을 통째로 넣고 `JSON.parse`로 읽으면 정상이다.** `JSON.parse`가 `\n`을 진짜 줄바꿈으로 되돌린다.
  → [4-2](#4-2-인증)가 `GOOGLE_PLAY_SA_JSON` 하나로 정한 이유가 이것이다.
- 🔴 **키만 따로 떼서 `GOOGLE_PLAY_PRIVATE_KEY` 같은 변수로 나르면** 그 복원이 일어나지 않는다.
  `crypto.createSign().sign(key)`가 그 자리에서 던진다. 굳이 그렇게 나를 거라면
  `key.replace(/\\n/g, '\n')`이 **반드시** 필요하다.

이 함정은 다른 함정들과 달리 **조용하지 않다 — 던진다.** 다만 증상이 "서명 실패"가 아니라
`error:1E08010C:DECODER routines::unsupported` 같은 OpenSSL 메시지로 나와 원인을 짐작하기 어렵다.
토큰 교환까지 갔다면 [4-2의 실패 표](#4-2-인증)에서 `invalid_grant` / *"Invalid JWT Signature."*로 나타난다.

#### 12. 🔴 제목과 본문이 **탭 한 글자**로 이어져 온다

✅ 원문 (`text` 정의의 뒷문장):

> "In some cases users have been able to write a review with separate title and body; in those cases the title and body are concatenated and separated by a tab character."

**탭은 화면에서 보이지 않는다.** 그대로 두면 제목이 본문 첫 문장에 눌어붙은 채 LLM 분류·요약으로 들어가고,
목록에서도 그냥 한 줄로 보인다. 오류는 나지 않는다.

- **방어**: 저장 전에 `\t` → `\n`으로 바꾼다. 코드는 [4-4 '본문 만들기'](#4-4-응답--rawitem-매핑).
- **탭이 든 원본 건수를 로그에 남긴다.** 몇 건이나 되는지 알아야 이 처리가 필요한지 판단이 선다
  (→ [5절 #5](#5-붙인-뒤-확인할-것)).

---

## 5. 붙인 뒤 확인할 것

**"돌았다"가 아니라 "제대로 돌았다"를 판별하는 방법이다. 위에서부터 순서대로 한다.**

> 🔴 **#0은 "붙인 뒤"가 아니라 "붙이기 전"이다.** 이 문서가 채우지 못한 값 하나가
> 코드 분기 하나를 막고 있어서, 먼저 실측해 이 문서에 되적어야 한다.

| # | 확인할 것 | 정상 판정 기준 / 절차 | 어긋나면 |
|---|---|---|---|
| **0** | 🔴 **착수 0단계 — 권한 없는 앱을 일부러 한 번 호출한다** | 아직 초대가 승인되지 않은 개발자 계정의 앱(또는 '리뷰 답글' 권한을 빼고 초대한 앱) 패키지명으로 `reviews.list`를 한 번 부르고, **HTTP 상태 · `error.status` · `error.details[].reason`을 그대로 [4-3 오류 응답 표](#4-3-엔드포인트와-요청)에 되적는다** | **이 값이 없으면 [4-6 함정 5번](#4-6-함정)의 방어를 코드로 쓸 수 없다.** "권한 문제"와 "리뷰 0건"을 가르는 분기가 [#1](#5-붙인-뒤-확인할-것)의 전제인데, 그 분기의 조건을 모르는 상태다 |
| 1 | **대상 앱이 각각 1건 이상** 들어왔는가 | 4종 모두 `CollectTask`가 `done`이고 `collected > 0` | 특정 계정의 초대·권한이 안 들어온 것 ([4-6 함정 5번](#4-6-함정)). **전체 건수만 보면 절대 못 잡는다** |
| 2 | **페이지 루프가 실제로 돌았는가** | 리뷰가 100건을 넘는 앱에서 `CollectTask.note`의 페이지 수가 **2 이상** | 100건에서 조용히 끊긴 것 ([4-6 함정 1번](#4-6-함정)). 페이지 수가 항상 1이면 `nextPageToken`을 안 보고 있다 |
| 3 | **7일 창이 맞는가** | 새로 들어온 `postedAt`의 **최솟값이 실행 시각 −7일 이내** | 8일 넘는 것이 있으면 창에 대한 이해가 틀린 것. 반대로 3일치밖에 없으면 페이지 루프나 쿼터를 의심 |
| 4 | **번역본이 들어오는가** ⚠️ | 🔴 **기준이 뒤집혔다.** `uc.originalText`가 **비어 있지 않은 행이 0건**이어야 정상이다. 수집기에 `if (uc.originalText) translated += 1` 카운터를 넣고 로그에 찍는다 | 0이 아니면 **`translationLanguage`를 안 넣어도 번역이 붙는다**는 뜻이다 ([4-6 함정 7번](#4-6-함정)). `originalText \|\| text`가 이미 그 경우를 막지만, **몇 건이나 되는지는 알아야 한다.** ⚠️ 옛 기준("`text`와 `originalText`가 다른 행 0건")은 **정상 데이터에서 반드시 실패한다** — 번역 안 된 리뷰는 `originalText`가 비어 있어 사실상 모든 행이 "다르다"로 잡힌다 |
| 5 | **탭이 처리됐는가** | ① 수집기 로그의 "탭 포함 N건" 카운터로 **원본에 탭이 몇 건 있었는지** 본다 ② DB에서 `content`에 탭이 남은 행 **0건**: `SELECT count(*) FROM items WHERE source='googleplay' AND content LIKE '%' \|\| chr(9) \|\| '%'` | ①이 0이면 이 앱들에는 제목·본문 분리 리뷰가 없다는 뜻(처리는 그대로 둔다). ②가 0이 아니면 치환이 안 걸린 것 ([4-6 함정 12번](#4-6-함정)) |
| 6 | **개발자 답글이 섞이지 않았는가** | 본문에 우리 답글 상투구(고객센터 안내 문구 등)가 들어간 행 **0건** | `comments[0]`을 집고 있다 ([4-6 함정 8번](#4-6-함정)) |
| 7 | **빈 본문이 없는가** | `content`가 빈 문자열인 행 0건 | 필터가 빠졌거나, `originalText ?? text`를 쓰고 있다 ([4-6 함정 7번](#4-6-함정)) |
| 8 | **별점이 정상 범위인가** | `rating`이 전부 1~5, `null` 0건, 분포에 1점과 5점이 모두 존재 | `starRating` 매핑 실수 |
| 9 | **국가 축이 의도한 대로 보이는가** | `country`가 빈 문자열로 들어오고, **국가 칩·요약 카드·트렌드를 눈으로 열어** 그 상태가 의도한 모습인지 본다 | 옛 데이터와 갈려 보인다 ([4-6 함정 6번](#4-6-함정) (a)). 이건 버그가 아니라 **결정 사항**이다 — 갈려 보이는 것을 받아들일지 옛 데이터의 `country`를 비울지 정한다 |
| 10 | **총량 추산이 맞는가** | 화면의 "이번 실행 최대 수집량"이 실제 수집 상한과 같은 자릿수인가 | `googlePlayQueries` 계산을 안 고쳤다 ([4-6 함정 6번](#4-6-함정) (b), 표 6번) |
| 11 | **중복 판정이 이어지는가** ⚠️ | 스크래퍼 시절 마지막 며칠과 겹치는 기간을 한 번 수집해 보고, **같은 리뷰가 두 벌로 쌓이지 않는지** | 쌓이면 `reviewId`와 옛 `r.id`가 다른 체계라는 뜻 → **재적재 / 1회 마이그레이션 / 새 계열 시작 중 하나를 골라야 한다.** [../official-api-migration.md](../official-api-migration.md) 3절이 "구글플레이는 미확인"으로 남겨 둔 항목이다 |
| 12 | **쿼터에 여유가 있는가 + 쿼터 문서 불일치 판별** ⚠️ | ① 실행 1회당 **앱당 GET 호출 수**를 로그로 남기고 200/시간 대비 비율 확인 ② **첫 응답의 헤더를 통째로 덤프해** 쿼터 잔량 헤더가 있는지 본다 | 헤더가 있으면 그 값이 [3절](#3-비용)의 문서 불일치(200/시간 vs 3,000 QPM)를 바로 닫는다. **없으면 우리가 직접 세는 수밖에 없고**, 어느 쪽이 실제로 걸리는지는 429를 실제로 받아 봐야 확정된다. ⚠️ **헤더 유무는 확인하지 못했다** |
| 13 | **GCP 과금이 붙는가** ⚠️ | 전환 한 달 뒤 GCP 콘솔 → 결제 → 비용 분류(서비스별)에 `androidpublisher.googleapis.com` 항목이 잡히는지 본다 | 0원이면 [../api-costs.md](../api-costs.md) 5절 #5(부재 근거)를 닫을 수 있다. 잡히면 [3절](#3-비용)을 다시 쓴다 |
| 14 | **`url`이 실제로 그 리뷰를 여는가** ⚠️ | 새로 들어온 행에서 `url` 하나를 **실제로 브라우저에서 연다.** 그 리뷰가 보이면 통과 | 안 열리면 이 API는 리뷰 퍼머링크를 주지 않으므로 **선택지는 둘뿐이다: 앱 스토어 페이지로만 링크(`&reviewId=` 제거)하거나 `url`을 비운다.** 억지로 만들어 두면 화면의 링크가 조용히 아무 데도 안 간다 ([4-4](#4-4-응답--rawitem-매핑)) |

**수집량 기대치**: 전환 직후 30일 기준으로 **33건 근처**가 나오면 정상이다.
다만 성격이 바뀌므로 단순 비교하면 안 된다.

| 방향 | 이유 |
|---|---|
| **늘어날 요인** | 페이지네이션으로 국가 구분 없이 전역 풀을 100건씩 훑는다 |
| **줄어들 요인** | 7일 창, 댓글 없는 리뷰 제외, 프로덕션 트랙만 |

→ **두 방향이 상쇄되므로 "몇 건이면 정상"을 단일 숫자로 못 박을 수 없다.**
대신 **위 1~3번(앱별 도착 / 페이지 루프 / 7일 창)이 전부 통과했는지**로 판정한다.

---

## 6. 출처

**API 레퍼런스**

- 리뷰 목록 조회: <https://developers.google.com/android-publisher/api-ref/rest/v3/reviews/list>
- Review 리소스 스키마: <https://developers.google.com/android-publisher/api-ref/rest/v3/reviews>
- 리뷰 답글 API 가이드 (7일 창·CSV·페이지네이션·쿼터의 출처): <https://developers.google.com/android-publisher/reply-to-reviews>
- API 시작하기 (서비스 계정, GCP 연결 불필요): <https://developers.google.com/android-publisher/getting_started>

**응답·오류 규격**

- Google API 공통 오류 규격 (`{error:{code,message,status,details}}`, 429=`RESOURCE_EXHAUSTED`): <https://google.aip.dev/193>
- ProtoJSON 매핑 (**기본값 필드는 생략된다** → 0건일 때 `reviews` 키가 없는 근거): <https://protobuf.dev/programming-guides/json/>

**인증**

- 서비스 계정 OAuth 2.0 (JWT 클레임, `sub`, 서명 대상 문자열, RS256, 토큰 엔드포인트, 실패 응답): <https://developers.google.com/identity/protocols/oauth2/service-account>

**권한**

- Play Console 사용자·권한 목록 ('리뷰 답글' 권한 원문): <https://support.google.com/googleplay/android-developer/answer/9844686>

**비용**

- 개발자 등록비 US$25 일회성: <https://support.google.com/googleplay/android-developer/answer/6112435>
- 쿼터 숫자(GET 200/시간, POST 2,000/일): 위 '리뷰 답글 API 가이드'와 같은 페이지
- 소스 전체 비용 비교와 미확인 항목: [../api-costs.md](../api-costs.md)

**약관·robots.txt**

- 플랫폼 이용약관 (robots.txt 준수 조항): <https://policies.google.com/terms>
- Google APIs 이용약관 (제2조 c항, 제5조 e항): <https://developers.google.com/terms>
- Play Developer API 약관 (API ToS 종속 명시): <https://developers.google.com/android-publisher/terms>
- robots.txt 실측 대상: <https://play.google.com/robots.txt>

**이 저장소 문서**

- [../data-collection-compliance.md](../data-collection-compliance.md) — robots.txt 실측 원문, 판정, 결정 기록
- [../official-api-migration.md](../official-api-migration.md) — 전환 조사, 정정 사항, 도입 순서

**코드** (전환에서 손대는 6개 파일은 [4-6 함정 6번](#4-6-함정)의 표에 줄 번호까지 있다)

- 현재 수집기(교체 대상): [../../apps/pipeline/src/collectors/googleplay.ts](../../apps/pipeline/src/collectors/googleplay.ts):8-31
- 인증 유틸 **신설 위치**: `apps/pipeline/src/collectors/googleplay-auth.ts` (→ [4-2](#4-2-인증))
- 작업 생성(국가 루프): [../../apps/pipeline/src/daily.ts](../../apps/pipeline/src/daily.ts):278-298, `langFor` import 13행
- 상한 정의: [../../packages/core/src/collect-limits.ts](../../packages/core/src/collect-limits.ts):106, 총량 추산 255-281
- 설정 타입·자리표시자 기본값: [../../packages/core/src/paths.ts](../../packages/core/src/paths.ts):82, 269
- 총량 추산(화면): [../../apps/web/app/page.tsx](../../apps/web/app/page.tsx):606-622
- RawItem·CollectTask·ItemQuery·ChannelSummary·TrendCell 정의: [../../packages/core/src/types.ts](../../packages/core/src/types.ts):4, 335, 243, 301, 324
- 저장(`ON CONFLICT (source, source_id) DO NOTHING`): [../../packages/core/src/store.ts](../../packages/core/src/store.ts):236
- 시각 정규화(`normalizeInstant`): [../../packages/core/src/time.ts](../../packages/core/src/time.ts):39
- 비밀값을 `.env`로 나르는 기존 패턴: [../../apps/pipeline/src/collectors/naver.ts](../../apps/pipeline/src/collectors/naver.ts):56-80
