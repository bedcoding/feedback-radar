# X (트위터)

> 이 문서는 법률 자문이 아니다.

> **한 줄 요약**: 지금 쓰는 두 경로 중 `web`(Playwright + 로그인 쿠키)은 robots.txt와 이용약관을
> 정면으로 위반하므로 **되살리면 안 되고 코드째 지우는 것이 맞다.** `api`(공식 검색 API)는 약관 안이지만
> **읽는 것 자체가 유료**(포스트 1건 $0.005, 현실값 월 $1~3)이고,
> **개발자 정책의 저장물 최신성 유지 의무를 이 도구의 저장 방식이 지금 못 지킨다.**
> 붙이려면 결제수단이 달린 개발자 계정과 Bearer 토큰 하나면 되고, 코드는 이미 있다.
> **막는 것은 비용이 아니라 저장물 갱신 정책 결정이다.**

- **실측일: 2026-08-29** (robots.txt·약관·API 문서 모두 이 날짜에 직접 받아 확인했다)
- 관련 코드: [x.ts](../../apps/pipeline/src/collectors/x.ts) (api) / [x-web.ts](../../apps/pipeline/src/collectors/x-web.ts) (web)
- 상위 문서: [수집 채널 적법성 근거](../data-collection-compliance.md) · [공식 API 전환 계획](../official-api-migration.md)

---

## 1. 현황

| 항목 | 값 |
|---|---|
| **현재 상태** | ⬜ **꺼짐.** 2026-08-29 결정으로 운영 설정에 `x: false`를 명시적으로 박았다. 끈 이유는 기본 경로(`web`)가 위반이고, 대체 경로(`api`)는 결제수단·토큰이 아직 없어서다 |
| **적법성 판정** | `web` 🔴 **위반** — robots.txt `Disallow: /` + 이용약관의 crawling/scraping 금지 + 로그인 벽 우회<br>`api` 🟡 **경로는 적법, 저장 방식이 걸린다** — 개발자 정책 "Content compliance"가 오프라인 저장물의 최신성 유지를 요구하는데 이 도구는 갱신하지 않는다 |
| **비용** | `web` 0원 / `api` **유료 종량제.** 포스트 읽기 **1건 $0.005**, 사용자 읽기 **1건 $0.010** (공식 가격표 원문). 청구는 읽은 건수 기준이고 저장 건수와 무관하다. 단 **같은 UTC 하루 안의 같은 포스트 재조회는 재과금되지 않는다.** 현실값 **월 $1~3**, 상한 시나리오 **월 $27~648**(수집 주기에 따라). 계산과 원문은 [3절](#3-비용) |
| **연동 난이도** | **중.** 호출 자체는 `fetch` 한 번이고 코드가 이미 있어서 '하'에 가깝다. '중'인 이유는 코드가 아니라 딸린 결정들이다 — 결제수단 확보, 상한 기본값을 꺼짐으로 내리기, 긴 글 본문 필드 추가, 저장물 갱신 정책 수립<br>**(가) `api`를 붙이려고 고칠 파일은 5개다** — ① `apps/pipeline/src/collectors/x.ts`(필드·본문·정렬: [67](../../apps/pipeline/src/collectors/x.ts)·[25-30](../../apps/pipeline/src/collectors/x.ts)·[170](../../apps/pipeline/src/collectors/x.ts)줄) ② `packages/core/src/collect-limits.ts`(`xPosts`의 `defaultOn` [113줄](../../packages/core/src/collect-limits.ts), [100줄 주석](../../packages/core/src/collect-limits.ts), [287줄 주석 정정](../../packages/core/src/collect-limits.ts), 예산 소진 사유를 담을 설정 키) ③ `apps/pipeline/src/daily.ts`(예산이 소진되면 그 키에 사유를 저장: [197-201줄](../../apps/pipeline/src/daily.ts)) ④ `apps/web/app/page.tsx`(그 키를 읽어 화면으로 내려보내기: [646줄](../../apps/web/app/page.tsx) 옆) ⑤ `apps/web/app/_dashboard/DashboardView.tsx`(배너 렌더: [675-678줄](../../apps/web/app/_dashboard/DashboardView.tsx)의 `web` 조건을 떼어 재사용)<br>**④⑤를 빼면 [함정 8](#4-6-함정)의 처방이 성립하지 않는다.** `daily.ts`가 설정에 사유를 남겨도 **읽어서 띄우는 쪽이 없으면 화면은 그대로 조용하다** — 이 문서가 잡겠다고 선언한 실패가 그대로 남는다<br>**(나) `web`을 지우는 쪽은 파일 12개**다. ②③④⑤와 겹치므로 **둘을 합치면 13개 파일.** 파일별 줄 번호와 확인용 `grep`은 [5-7](#5-7-끄기-확인-web-경로가-정말-안-도는가)에 있다. **수집기 두 개(`x-web.ts`·`x-session.ts`) 삭제로 끝나지 않는다** — `x-login.ts`, npm 스크립트 2곳, 재export 1줄, README, 그리고 화면의 경로 선택 UI와 쿠키 입력칸까지 걸린다 |
| **30일 수집량** | **235건** (부정 **34건**, 심각 **6건**) |

> 30일 수집량은 2026-08-29에 운영 DB를 직접 조회한 값이다(작성일 기준 최근 30일, `source='x'`).
> 부정 34건은 `sentiment='negative'`, 심각 6건은 `severity IN ('high','critical')`이다.
> 이 6건은 [적법성 문서 10절](../data-collection-compliance.md#10-결정-기록-2026-08-29)에서
> "X를 끄면서 잃은 심각 이슈"로 센 것과 같은 숫자다.

### 두 경로를 헷갈리면 안 된다

| | `web` | `api` |
|---|---|---|
| 설정값 | `x.mode = web` (**현재 기본값**) | `x.mode = api` |
| 요청 대상 | `x.com/search?q=...&f=live` | `api.x.com/2/tweets/search/recent` |
| 인증 | 사람이 로그인해 저장한 `auth_token` 쿠키 | Bearer 토큰 |
| 필요 도구 | Playwright(시스템 Chromium) | 없음 (`fetch`) |
| 비용 | 0 | 읽기 건수 종량제 |
| 기간 | 검색이 주는 만큼 (7일 제한 없음) | **최근 7일** |
| 적법성 | 🔴 위반 | 🟡 (2절) |
| 배포판 | 쓸 수 없다 (Chromium 없음) | 강제로 이 경로로 돈다 |

**배포판은 `xMode`를 `api`로 못 박는다** ([daily.ts:175](../../apps/pipeline/src/daily.ts)).
따라서 배포 환경에서 X 채널이 켜져 있으면 경로 선택과 무관하게 과금 경로가 돈다.

---

## 2. 적법성 근거

### 2-1. robots.txt 실측

| 항목 | 값 |
|---|---|
| URL | `https://x.com/robots.txt` |
| HTTP 상태 | **200** (2026-08-29 직접 확인) |
| 우리 경로가 걸리는가 | **걸린다.** `web` 경로(`/search`)와 그 밖 모든 경로 |

> 📌 **줄 번호로 가리키지 않는다.** 이 파일은 자주 바뀌고 총 줄 수도 조회 시점마다 달랐다
> (같은 날 받은 것이 91줄과 111줄로 갈렸다). 아래는 **`User-agent: *` 그룹**을 내용으로 가리킨 것이다.

`User-agent: *` 그룹 원문 (파일 뒷부분에 있다):

```
# Every bot that might possibly read and respect this file
# ========================================================
User-agent: *
Disallow: /


# WHAT-4882 - Keep notification-email links (/i/u) out of search results.
# Named crawlers stay un-blocked on purpose: they must crawl /i/u to see its
# X-Robots-Tag noindex (the robots.txt Noindex directive died in 2019).
Disallow: /i/u

# Wait 1 second between successive requests. See ONBOARD-2698 for details.
Crawl-delay: 1

# Independent of user agent. Links in the sitemap are full URLs using https://
# and need to match the protocol of the sitemap.
Sitemap: https://x.com/sitemap.xml
```

참고로 이름이 지정된 크롤러(Googlebot, Bingbot) 그룹은 다음과 같다 (발췌):

```
User-agent: Googlebot
User-agent: Bingbot

Allow: /*?s=
Allow: /*?t=
Allow: /*?ref_src=
Allow: /hashtag/*?src=
Allow: /search?q=%23
Allow: /i/api/
# Same length as the /*/likes and /*/media rules; RFC 9309 breaks the tie in
# favor of Allow, so /i/api/ fetches stay crawlable.
Allow: /i/api/*
Disallow: /*?lang=en-ss
Allow: /*?lang=
Disallow: /search/realtime
Disallow: /search/users
Disallow: /search/*/grid
```

**우리는 이름이 지정된 크롤러가 아니므로 `User-agent: *` 그룹이 적용된다.**

그 그룹에 든 규칙은 **세 줄**이다 — `Disallow: /`, `Disallow: /i/u`, `Crawl-delay: 1`.
위 인용에서 셋 사이에 빈 줄과 주석이 끼어 있지만 **그 사이에 `User-agent:` 줄이 없으므로 RFC 9309 문법상 같은 그룹**이다
(§2.1 `group = startgroupline *(startgroupline / emptyline) *(rule / emptyline)` — 빈 줄과 주석은 그룹을 끊지 않는다).
**셋 중 `Allow:`는 하나도 없다. 그래서 예외가 없고, 위반 판정은 `Disallow: /` 한 줄로 끝난다.**
나머지 두 줄은 판정을 바꾸지 않는다 — `Disallow: /i/u`는 `Disallow: /`의 부분집합이고,
`Crawl-delay`는 접근 허용 여부가 아니라 요청 간격을 말한다.

> 📌 이 문서의 이전 판은 같은 자리에서 **"그 그룹의 규칙은 `Disallow: /` 한 줄이다"**라고 적어
> 바로 위 인용 블록과 어긋나 있었다. 인용 쪽이 맞다(2026-08-30 재조회에서도 `*` 그룹은 위 세 줄 그대로였다).
> **판정은 그대로지만, 서술이 자기 인용과 다르면 다음 사람이 인용을 의심하게 된다.**

> ⚠️ **이 문서의 이전 판은 여기에 틀린 보조 논거를 달고 있었다. 지워서 정정한다.**
> `Disallow: /search/realtime`은 **경로 세그먼트** `/search/realtime`을 가리키고,
> `web` 수집기가 치는 것은 `/search?q=...&f=live`(경로는 `/search`, `f=live`는 쿼리스트링)다.
> **서로 다른 URL이고 이 규칙은 우리 경로에 매칭되지 않는다.** 또 파일에 `Disallow: /search?q=`가
> 있긴 하지만 그것은 `facebookexternalhit` 그룹 소속이라 역시 우리에게 적용되지 않는다.
> 두 규칙 모두 이름이 지정된 그룹의 것이고, 우리에게 적용되는 그룹은 `*` 하나뿐이다.

`api` 경로(`api.x.com`)는 robots.txt 적용 대상이 아니다. 인증된 API 호출이지 크롤링이 아니다.

### 2-2. 이용약관 (일반 이용자용)

| 항목 | 값 |
|---|---|
| URL | <https://x.com/en/tos> |
| HTTP 상태 | 200 (2026-08-29 확인) |
| 해당 절 | "Misuse of the Services" |
| ⚠️ **재대조 상태** | **재대조 실패.** 같은 날 다시 열었을 때 이 URL이 **HTTP 402**를 돌려줘 원문 대조를 못 했다. 아래 인용은 최초 확인 시점의 것이며, **법무에 넘기기 전 사람이 브라우저로 한 번 더 열어 확인할 것** → [5-8](#5-8-미확인-항목을-판별하는-절차) |

원문:

> You may not do any of the following while accessing or using the Services: (i) access, tamper with, or use non-public areas of the Services, our computer systems, or the technical delivery systems of our providers; (ii) probe, scan, or test the vulnerability of any system or network or breach or circumvent any security or authentication measures; (iii) access or search or attempt to access or search the Services by any means (automated or otherwise) other than through our currently available, published interfaces that are provided by us (and only pursuant to the applicable terms and conditions), unless you have been specifically allowed to do so in a separate agreement with us (NOTE: crawling or scraping the Services in any form, for any purpose without our prior written consent is expressly prohibited)

같은 문서의 요약 조항 원문:

> You may not access the Services in any way other than through the currently available, published interfaces that we provide. For example, this means that you cannot scrape the Services without X’s express written permission, try to work around any technical limitations we impose, or otherwise attempt to disrupt the operation of the Services.

**(ii)의 "circumvent any security or authentication measures"와 (iii)의 crawling/scraping 금지가
`web` 경로에 그대로 걸린다.** X는 비로그인 검색을 막아 뒀고, 우리는 저장한 로그인 쿠키로 그 벽을 넘는다.

### 2-3. 개발자 약관 (`api` 경로용)

| 항목 | 값 |
|---|---|
| URL | <https://developer.x.com/en/developer-terms/agreement> |
| 버전 | **Last Updated: April 27, 2026** (문서에 명시) |
| 부속 문서 | [Developer Policy](https://developer.x.com/en/developer-terms/policy), [Restricted uses of the X API](https://docs.x.com/developer-terms/restricted-use-cases) |
| ⚠️ **재대조 상태** | `developer.x.com/en/developer-terms/*` 세 페이지는 재대조 시 **HTTP 402**로 막혀 원문을 다시 못 읽었다. 아래 (1)~(3)은 최초 확인 시점의 인용이고 **조문 번호는 미검증**이다. (4)는 `docs.x.com` 사본으로 **재대조 성공** |

이 도구에 직접 걸리는 조항 네 개를 원문 그대로 옮긴다.

**(1) Developer Policy — "Content compliance"** 🔴 **이게 가장 중요하다**

> If you store X Content offline, you must keep it up to date with the current state of that content on X. Specifically, you must delete or modify any content you have if it is deleted or modified on X. This must be done as soon as reasonably possible, or within 24 hours after receiving a request to do so by X or the applicable X account owner, or as otherwise required by your agreement with X or applicable law.

같은 절이 "modified"의 범위를 열거한다:

> Content that has been made private or gained protected status
> Content that has been suspended from the platform
> Content that has had geotags removed from it
> Content that has been withheld or removed from X

**Developer Agreement IV.B (Removals)에 같은 의무가 계약 조항으로도 들어 있다:**

> B. Removals. If X Content is deleted, gains protected status, or is otherwise suspended, withheld, modified, or removed from the X Applications (including removal of location information), you will make all reasonable efforts to delete or modify that X Content (as applicable) as soon as possible, and in any case within twenty four (24) hours after a written request to do so by X or by an X user with regard to its X Content unless prohibited by law or regulation and with the express written permission of X.

**이 도구는 수집물을 `items` 표에 영구 적재하고 갱신하지 않는다**
(`ON CONFLICT (source, source_id) DO NOTHING`, [store.ts:236](../../packages/core/src/store.ts)).
원글이 지워져도 우리 DB에는 남는다. **조항에 정면으로 걸린다.**

> 📌 이것은 [다음 카페 항목에서 카카오 운영정책 제5조 20호로 발견된 것과 똑같은 구조의 문제다](../official-api-migration.md#2-5-다음-카페---api-전환이-리스크를-없애는-게-아니라-새로-만든다).
> 그때 얻은 교훈("공식 API를 쓰면 안전하다는 통념이 항상 맞지는 않다")이 X에도 그대로 적용된다.
> 다만 카카오와 다른 점이 있다 — **X는 캐시 목적 자체를 제한하지 않고 최신성 유지만 요구한다.**
> 즉 저장을 포기할 필요는 없고, **삭제·비공개된 글을 지우는 경로를 만들면 해소된다**(→ [2-5](#2-5-남은-리스크)).

**(2) Developer Agreement III.A — 금지 행위**

> (d) sell, rent, lease, sublicense, distribute, redistribute, syndicate, create derivative works of, assign, or otherwise transfer or provide access to, in whole or in part, the Licensed Material to any third party except as expressly permitted in this Agreement; … (k) use the X API or X Content to fine-tune or train a foundation or frontier model

- **(k)**: 이 도구는 수집한 글을 LLM에 넣어 **분류**한다(추론이지 학습이 아니다). 문언상 "fine-tune or train"에
  해당하지 않는다는 것이 우리 입장이다.
- **(d)**: 다만 분류를 위해 X 본문을 외부 LLM 제공자에게 보낸다. 그것이 "provide access to … to any third party"에
  해당하는지는 **⚠️ 확인 필요**다. LLM 제공자의 데이터 보존·학습 정책과 함께 봐야 판단이 선다.
  [적법성 문서 9절 미결 7번](../data-collection-compliance.md#9-미결-항목-법무-검토-요청)과 같은 질문이고,
  **개발이 닫을 수 없는 항목이다**(→ [부록 5번](#부록-확인하지-못한-것)).

**(3) Developer Agreement III.B — 상업적 이용 구분**

> B. Commercial Use Restrictions. If your Services are designated as ‘non-commercial,’ you shall not make Commercial Use (as defined below) of the Licensed Material. Commercial Use restrictions may not apply to officially registered non-profits or NGOs. “Commercial Use” means any use of the Licensed Material or access to the X API: (a) by or for a business (i.e. an entity whose primary purpose is to earn revenue through a product or service), or (b) as part of a product or service that is monetized

**VOC 모니터링은 (a) "by or for a business"에 해당한다.** 앱 등록 시 용도를 non-commercial로
신고하면 안 된다. → [4-1](#4-1-사전-준비-사람이-해야-하는-것)

**(4) Restricted uses of the X API — Off-X matching** ✅ **2026-08-29 재대조 성공**

출처를 <https://docs.x.com/developer-terms/restricted-use-cases>로 못박는다.
(`developer.x.com/en/developer-terms/more-on-restricted-use-cases`는 402로 막혔고, `docs.x.com` 쪽이 열린다.)

> Off-X matching involves associating X content, including a X username or user ID, with a person, household, device, browser, or other off-X identifier. One example would be associating a X username with a business's customer records (i.e. "John Doe" in your customer record is matched to @johndoe on X).

> We want people to feel comfortable to create a separate and, if they choose, pseudonymous identity on X. If you intend to associate any information about a X user with an off-X identifier, we require that you get express, opt-in consent from the user before making the association.

같은 문서에 이런 안내도 있다:

> Aggregate analysis of X content that does not store any personal data (for example, user IDs, usernames, and other identifiers) is permitted, provided that the analysis also complies with applicable laws and all parts of the Developer Agreement and Policy.

> ⚠️ **이 문서의 이전 판은 이 인용에서 맨 앞 `Aggregate`를 빠뜨렸다. 정정한다.**
> 한 단어 차이가 아니다. 허용되는 것은 **집계 분석**이고, 이 도구가 하는 건별 저장·건별 표시는
> 그 문언에 바로 얹히지 않는다. **이 문장을 "핸들만 빼면 다 된다"의 근거로 쓰면 안 된다.**
> 실제 근거는 아래 한 줄이다 — 개인 식별자를 저장하지 않으면 off-X matching 논쟁의 전제가 사라진다.

**이 도구는 `author`에 X 핸들을 저장한다**([x.ts:169](../../apps/pipeline/src/collectors/x.ts)).
고객 기록과 대조하지 않으므로 off-X matching 자체는 안 하지만,
**핸들을 저장하지 않으면 이 조항 논쟁이 통째로 사라진다.** 화면에서 핸들을 쓰지 않는다면 빼는 것이 가장 싼 조치다.
(URL에 핸들이 들어가는 문제는 남는다 → [4-4](#4-4-응답--rawitem-매핑))

### 2-4. 판정과 근거

| 경로 | 판정 | 근거 |
|---|---|---|
| `web` | 🔴 **위반. 되살리면 안 된다** | (1) robots.txt `User-agent: *` → `Disallow: /` (2) 이용약관이 crawling/scraping을 명시적 금지 (3) 로그인 벽을 저장 쿠키로 넘는다 — [적법성 문서 2절 층위 3](../data-collection-compliance.md#2-무엇을-기준으로-판단했나)에 해당 |
| `api` | 🟡 **경로는 적법, 저장 방식이 미해결** | 공식 API를 키 받아 약관 안에서 호출한다. robots.txt 적용 대상이 아니다. 다만 개발자 정책의 최신성 유지 의무를 지금 구조가 못 지킨다 |

> ⚠️ **[적법성 문서](../data-collection-compliance.md)는 `api`를 🟢로 적고 있다.**
> 그 판정은 "공식 API를 키 받아 쓴다"는 층위(층위 1·3)만 본 것이고, **개발자 정책의 저장물 조항(층위 2·4)은
> 이번 조사에서 처음 원문을 확인했다.** 상위 문서의 🟢를 🟡로 내리고, 미결 항목에 한 줄 추가할 것을 제안한다.

**층위별로 다시 정리하면:**

| 층위 | `web` | `api` |
|---|---|---|
| 1. robots.txt | ❌ `Disallow: /` | 해당 없음 |
| 2. 약관 | ❌ 이용약관 명시적 금지 | 🟡 개발자 약관 안이지만 IV.B / Content compliance 미준수 |
| 3. 기술적 보호조치 우회 | ❌ 로그인 벽 우회 | ✅ 없음 |
| 4. 수집 후 이용 형태 | (2·3이 이미 걸려 논의 무의미) | 🟡 외부 미공개·원문 링크 병기·키워드 한정이라 판례형 리스크는 낮으나, 삭제 반영이 없다 |

### 2-5. 남은 리스크

**민사**

| 항목 | 상태 |
|---|---|
| 원문 재게시 | 하지 않는다. 외부 미공개이고 모든 인용에 원문 링크를 병기한다 |
| 원문 DB 대체 | 하지 않는다. 자사 서비스 언급 글만 키워드로 걸러 가져온다 |
| 상업적 재판매 | 하지 않는다 |
| 🔴 **삭제·비공개 글의 잔존** | **미해결.** 24시간 내 삭제·수정 반영 의무를 지킬 코드가 없다. 원글이 지워져도 우리 DB에 남고, 그 상태로 분류·요약·브리핑에 계속 쓰인다 |
| 🟠 Compliance Audit | Developer Agreement의 **감사 조항**(VIII절 Compliance Audit). X가 준수 여부를 점검할 권한이다 |
| 🟠 계약 종료 시 영구 삭제 | **다른 조항이다.** "permanently delete all Licensed Material … and copies thereof"와 **삭제 증빙 제출**은 감사 조항이 아니라 **종료 조항**(VII.I Termination)에 있다. 소스별로 골라 지우는 기능이 없으면 대응할 수 없다 |

> ⚠️ **위 두 줄은 이전 판에서 한 칸에 섞여 있었다. 조문 번호가 다르므로 쪼갠다.**
> 다만 **VIII / VII.I이라는 번호 자체는 재대조하지 못했다**(`developer.x.com` 402).
> 법무에 넘길 때 조문 번호를 그대로 인용하지 말고, **사람이 계약서 원본에서 번호를 다시 확인할 것**
> → [5-8](#5-8-미확인-항목을-판별하는-절차). 의무의 내용(감사 / 종료 시 영구 삭제 + 증빙)은 두 개가 서로 다른 의무라는 점만 확실하다.

→ **해소 방안 (셋 중 하나)**

1. **주기적 재확인**: 저장된 X 글의 ID를 모아 `GET /2/tweets?ids=...`로 존재 여부를 확인하고,
   사라진 것은 본문을 지운다. **이 조회도 과금된다.** 공식 가격표가 "per resource fetched"라고
   명시하므로 **반환된 포스트 1건당 $0.005**다([3절](#3-비용)). 저장분 1,000건을 훑으면 회당 $5.
   ⚠️ **삭제되어 `data`가 아니라 `errors`로만 오는 건이 과금되는지는 확인하지 못했다**
   (→ [5-8](#5-8-미확인-항목을-판별하는-절차)). 이 방안은 **저장 건수가 곧 반복 비용이 되는 구조**라
   보유기간 상한(2번)과 반드시 같이 봐야 한다.
2. **보유기간 상한**: X 글만 N일 후 본문을 지우고 집계 수치만 남긴다.
   [적법성 문서 7-4](../data-collection-compliance.md#7-4-저장-범위를-최소화한다)의 미구현 항목과 같은 작업이다
3. **공식 배치 Compliance 작업 사용**: 저장해 둔 포스트 ID 목록을 올리면 그중 삭제·정지·비공개된 것을
   돌려주는 기능이 있다. **엔드포인트는 확인했다**
   (2026-08-30, <https://docs.x.com/x-api/compliance/batch-compliance/introduction>):
   `POST /2/compliance/jobs`(작업 생성) · `GET /2/compliance/jobs/{id}`(상태 조회) · `GET /2/compliance/jobs`(목록).
   작업 종류는 `tweets`와 `users` 둘이고, 포스트 쪽이 돌려주는 사유는
   `deleted` `bounced` `protected` `suspended` `scrub_geo`다 —
   **위 (1)이 열거한 "modified"의 범위와 그대로 겹친다.** 이 방안이 의무에 정확히 대응한다는 뜻이다.
   ⚠️ **남은 미확인은 둘이다 — 필요한 접근 등급과 과금 여부.** 공식 문서는 전제로
   "승인된 개발자 계정과 App의 Bearer 토큰"만 적고 등급을 말하지 않으며,
   **가격표에는 compliance 줄이 아예 없다**(2026-08-30 확인). 줄이 없다는 것이 무료라는 뜻인지
   종량제 표에 안 실린 것뿐인지는 그것만으로 갈리지 않는다 → [5-8 #7](#5-8-미확인-항목을-판별하는-절차)

**개인정보**

| 항목 | 상태 |
|---|---|
| 저장하는 개인 식별자 | **X 핸들(`author`)과 URL 안의 핸들.** 실명·연락처는 수집하지 않는다 |
| 보관 기간 | **무기한.** 정책 없음 |
| 외부 전송 | 분류를 위해 본문이 LLM에 전달된다 |
| 국내법 | 공개 게시물의 닉네임도 개인정보에 해당할 수 있다 → [적법성 문서 6절](../data-collection-compliance.md#6-개인정보-측면) |
| X 약관 | 위 (4) Off-X matching. **핸들을 저장하지 않으면 이 축의 리스크가 크게 줄어든다** |

---

## 3. 비용

**이 소스는 무료가 아니다. 우리가 쓰는 경로 중 유일하게 읽는 것 자체에 돈이 붙는다.**
상세 계산과 다른 소스와의 비교는 [../api-costs.md](../api-costs.md)에 있다. 여기에는 이 소스 몫만 옮긴다.

### 3-1. 공식 가격 원문

출처: <https://docs.x.com/x-api/getting-started/pricing> (2026-08-29 직접 확인)

> Posts: Read | $0.005 per resource

> User: Read | $0.010 per resource

> All prices are per resource fetched (reads) or per request (writes/actions).

> All resources are deduplicated within a 24-hour UTC day window. If you request and are charged for a resource (such as a Post), requesting the same resource again within that window will not incur an additional charge.

> Pay-per-usage plans are capped at 3 million Post reads per monthly billing cycle. If you need higher volume, upgrade to an Enterprise plan.

> Prices are subject to change. Current rates are always available in the Developer Console and on the developer.x.com pricing page.

> 📌 **`User: Read | $0.010 per resource`는 [../api-costs.md](../api-costs.md) 2절에 아직 없다.**
> 그 문서는 포스트 읽기 단가만 옮겼다. 같은 가격 페이지에서 이번에 직접 확인한 줄이므로
> **두 문서를 맞출 때 api-costs.md 쪽에 이 한 줄을 추가해야 한다.**

### 3-2. 숫자로 정리

| 항목 | 값 | 근거 |
|---|---|---|
| 포스트 읽기 단가 | **$0.005 / 반환된 포스트 1건** | ✅ 공식 원문 |
| 사용자 읽기 단가 | **$0.010 / 반환된 사용자 1건** | ✅ 공식 원문 |
| 무료 한도 | **없다.** Free·Basic·Pro 등급이 폐지돼 2026-02부터 신규 발급은 종량제뿐이다 | ✅ [api-costs.md 1절](../api-costs.md#1-경로별-가격) |
| 24시간 중복 제거 | 같은 **UTC 하루** 안의 같은 리소스 재조회는 **재과금 없음** | ✅ 공식 원문 |
| 월 상한 | **300만 포스트 읽기 / 청구 주기** (초과하려면 Enterprise) | ✅ 공식 원문 |
| 돈이 아닌 제약 | **450회 / 15분** (앱 단위 Bearer). 초과 시 429 → [4-5](#4-5-상한쿼터페이지네이션) | ✅ 공식 원문 |
| 코드의 단가 상수 | `X_READ_COST_USD = 0.005` ([collect-limits.ts:133](../../packages/core/src/collect-limits.ts)) | ✅ 코드 실측 |
| 기본 월 예산 | `X_BUDGET_DEFAULT = 50` → **$50 ÷ $0.005 = 읽기 10,000건** ([collect-limits.ts:508, 541](../../packages/core/src/collect-limits.ts)) | ✅ 코드 실측 |
| 회당 최대 지출 | 키워드 9개 × `xPosts` 20건 = **180건 = $0.90** | ✅ 설정 실측 |

> **코드 상수와 공식 단가가 같은 값($0.005)인지 확인하는 것이 이 표의 목적이다.**
> 어긋나면 화면의 "환산 $x"와 실제 청구가 갈라진다. 가격은 바뀔 수 있다고 공식 문장이 명시하므로
> ([위 인용](#3-1-공식-가격-원문)), **가격 변경 공지를 받을 수 있게 해 두고 바뀌면 상수부터 고친다.**

### 3-3. 월 비용 — 두 가지로 읽어야 한다

키워드 9개, 키워드당 20건 기준이다. 계산 근거는 [api-costs.md 3절](../api-costs.md#3-x-월-비용--유일하게-돈이-드는-곳).

**A. 상한 시나리오** (중복 제거를 신뢰하지 않음. **예산을 정할 때 쓰는 숫자**)

| 수집 주기 | 월 과금 건수 | 월 비용 | 기본 예산 $50 소진 |
|---|---:|---:|---:|
| 1시간 | 129,600 | **$648** | 2.3일 |
| 6시간 | 21,600 | **$108** | 13.9일 |
| 12시간 | 10,800 | **$54** | 27.8일 |
| 24시간 | 5,400 | **$27** | 55.6일 |

**B. 24시간 중복 제거 반영** (**현실값**)

같은 UTC 하루 안의 재조회가 재과금되지 않으므로, 과금은 **"그날 결과에 등장한 서로 다른 포스트 수"로
수렴하고 폴링 횟수와 사실상 무관해진다.** 실측이 30일 235건(≈ 일 7.8건)이므로:

| 하루 신규 포스트 | 월 비용 |
|---:|---:|
| 8건 (실측 수준) | **$1.20** |
| 20건 | **$3.00** |
| 100건 | **$15.00** |

**B가 현실값이고, A는 예산 상한을 정할 때 쓴다.** 언급량이 터지는 날(장애·논란)에는 새 포스트가
쏟아져 B가 A에 가까워지는데, **그런 날이 바로 이 도구가 가장 필요한 날이다.**
그래서 코드의 월 예산 브레이크는 A 기준으로 잡는 것이 맞다.

> 💡 월 상한 300만 읽기에는 **어느 주기에서도 걸리지 않는다** (1시간 주기 상한 시나리오도 129,600건).

### 3-4. 확인 필요 — 추측하지 않는다

| # | 항목 | 왜 중요한가 | 판별 절차 |
|---|---|---|---|
| 1 | **`expansions=author_id` + `user.fields=username`으로 딸려 오는 사용자 객체가 `User: Read $0.010`로 별도 과금되는가** | 걸린다면 회당 비용이 최대 2배가 되고, `meta.result_count` 기준의 예산 브레이크가 실제 청구를 과소 반영한다 | [5-8](#5-8-미확인-항목을-판별하는-절차) #1 |
| 2 | **삭제된 포스트를 `GET /2/tweets?ids=`로 조회해 `errors`만 왔을 때 과금되는가** | [2-5](#2-5-남은-리스크) 해소 방안 1의 비용이 여기서 갈린다 | [5-8](#5-8-미확인-항목을-판별하는-절차) #2 |
| 3 | **신규 계정의 개발자 콘솔 기본 지출 한도** | 코드 브레이크가 뚫렸을 때의 최종 방어선 | 콘솔 로그인이 필요해 문서로는 확인 불가. **계정 개설 후 사람이 직접** ([api-costs.md 5절 #3](../api-costs.md#5-확인하지-못한-것)) |

**위 셋은 확인 전까지 금액을 적지 않는다.** 특히 1번이 미확인인 동안에는
**실제 청구가 이 문서의 계산보다 클 수 있다고 보고 예산을 잡는 편이 안전하다.**

---

## 4. 연동 방법

**아래는 전부 `api` 경로 기준이다. `web` 경로는 [2-4](#2-4-판정과-근거)에 따라 되살리지 않는다.**

### 4-1. 사전 준비 (사람이 해야 하는 것)

| # | 할 일 | 누가 | 비고 |
|---|---|---|---|
| 1 | X 계정 준비 + **전화번호 인증** | 개발 | 개발자 구독 조건에 전화번호 인증이 명시돼 있다 (Developer Agreement 서두) |
| 2 | 개발자 콘솔에서 App 생성 | 개발 | <https://console.x.com> → **New App** ([4-2-1](#4-2-1-토큰을-어떻게-만드나--경로-두-가지)) |
| 3 | **용도를 상업적(commercial)으로 신고** | 개발 + 법무 확인 | VOC 모니터링은 III.B의 "by or for a business"에 해당한다. non-commercial로 신고하면 약관 위반이 된다. **App 생성 화면의 용도 입력이 이것이다** |
| 4 | **유료 등급 구독 + 결제수단 등록** | 🔴 **재무/구매 승인 필요** | 2026-02부터 무료 등급이 없어 신규 발급은 종량제뿐이다. **포스트 읽기 1건 $0.005, 현실값 월 $1~3, 상한 시나리오 월 최대 $648** → [3절](#3-비용) |
| 5 | **콘솔의 청구 주기당 지출 한도 설정** | 개발 + 재무 | 코드의 월 예산($50 = 읽기 10,000건)은 그 앞단 브레이크일 뿐이다. 콘솔 쪽도 반드시 걸어 둘 것. 기본값은 미확인 → [5-8 #6](#5-8-미확인-항목을-판별하는-절차) |
| 6 | App에서 **Bearer Token** 발급 **+ API Key & Secret 같이 보관** | 개발 | **자격증명은 한 번만 보인다.** 절차는 [4-2-1](#4-2-1-토큰을-어떻게-만드나--경로-두-가지).<br>정기 수집은 Bearer 하나로 돌지만, **API Key & Secret을 같이 챙겨야 [경로 B](#4-2-1-토큰을-어떻게-만드나--경로-두-가지)로 토큰을 다시 만들 수 있다.** 보관 위치는 [4-2-2](#4-2-2-이-도구에서의-취급) |
| 7 | 저장물 갱신 정책 결정 | 🔴 **법무 + 개발** | [2-5](#2-5-남은-리스크)의 세 방안 중 택일. **이걸 정하지 않고 켜면 안 된다** |

**개발이 통제할 수 없는 항목은 4·5·7이다.** 4번(결제수단)이 이 전환의 실질적 리드타임이다.

### 4-2. 인증

앱 단위(App-only) OAuth 2.0 Bearer 토큰 하나면 된다. 사용자 토큰(OAuth 2.0 user context)은 필요 없다.
공개 글 검색이라 사용자 컨텍스트가 필요하지 않기 때문이다.

```
Authorization: Bearer {X_BEARER_TOKEN}
```

**먼저 못박아 둘 것 — 이 토큰에는 서명이 없다.**

| | |
|---|---|
| 서명 알고리즘 | **없다.** 앱스토어(ES256 JWT)나 구글플레이(RS256 JWT)와 다르다 |
| 토큰 형식 | **불투명 문자열이다. JWT가 아니다.** 점으로 나뉘지 않고 디코딩할 내용도 없다 |
| 따라서 필요 없는 코드 | JWT 조립, 서명, 만료 파싱, 회전 스케줄러 — **한 줄도 필요 없다** |
| 실제로 필요한 코드 | 환경변수에서 문자열을 읽어 `Authorization` 헤더에 붙이는 것뿐 |

#### 4-2-1. 토큰을 어떻게 만드나 — 경로 두 가지

**경로 A: 포털에서 받는다 (한 번만 하면 되는 쪽. 이걸 권한다)**

1. <https://console.x.com> 에 X 계정으로 로그인한다
2. Developer Agreement에 동의하고 프로필을 채운다
3. Developer Console 대시보드에서 **New App**을 만든다 (이름·설명·용도 입력 → [4-1](#4-1-사전-준비-사람이-해야-하는-것) 3번의 **commercial** 신고가 여기다)
4. 앱을 만들면 자격증명이 한 화면에 뜬다 — **API Key & Secret**, **Bearer Token**, Access Token & Secret, Client ID & Secret
5. 정기 수집이 쓰는 것은 **Bearer Token** 하나다. Access Token & Secret, Client ID & Secret은 이 도구에 필요 없다.
   **다만 API Key & Secret은 버리지 말고 같이 보관한다** — 아래 경로 B가 그 둘로 Bearer 토큰을 다시 만든다.
   화면을 닫아 토큰을 놓쳤을 때 포털을 다시 뒤지지 않고 되찾는 수단이 그것뿐이다 (보관 위치 → [4-2-2](#4-2-2-이-도구에서의-취급))

> 🔴 **자격증명은 한 번만 보여준다** (공식 문구: "Credentials are only displayed once").
> 그 화면을 닫으면 다시 못 본다. **재발급(regenerate)해야 하고, 재발급하면 이전 토큰이 즉시 죽는다.**
> 받는 즉시 안전한 곳에 옮길 것.
>
> ⚠️ 포털 화면 이름은 개편으로 바뀐다. 예전 안내는 `developer.x.com → Projects & Apps → 해당 App →
> Keys and tokens`였고, 2026-08-29 공식 문서 기준은 위의 `console.x.com → New App`이다.
> **화면 이름이 다르면 아래 경로 B로 만들면 된다. 그쪽은 바뀌지 않는다.**

**경로 B: API로 발급한다 (포털 화면이 바뀌었거나 자동화가 필요할 때)**

API Key와 Secret만 있으면 Bearer 토큰을 직접 받을 수 있다.

```bash
curl -u "$X_API_KEY:$X_API_SECRET" \
  -X POST 'https://api.x.com/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded;charset=UTF-8' \
  -d 'grant_type=client_credentials'
```

응답:

```json
{
  "token_type": "bearer",
  "access_token": "AAAAAAAAAAAAAAAAAAAA%2FAAAAAAAAAAAAAAAAAAAA%3DAAAAAAAAAAAAAAAAAAAAA"
}
```

`access_token`이 곧 `X_BEARER_TOKEN`이다. **`token_type`이 `"bearer"`인지 확인하고 쓴다.**

`-u`가 하는 일을 코드로 직접 쓴다면 이렇게 된다. **HTTP Basic이고, 그게 전부다.**

```ts
// 0) 두 값의 출처. 이 도구에서는 환경변수로만 받는다 (→ 4-2-2). 셸 변수 $X_API_KEY와 같은 값이다
const apiKey = process.env.X_API_KEY?.trim();
const apiSecret = process.env.X_API_SECRET?.trim();
if (!apiKey || !apiSecret) throw new Error('X_API_KEY / X_API_SECRET 미설정');

// 1) 공식 문서가 요구하는 순서: RFC 1738 URL 인코딩 → 콜론으로 잇기 → base64
const basic = Buffer.from(
  `${encodeURIComponent(apiKey)}:${encodeURIComponent(apiSecret)}`,
).toString('base64');

const res = await fetch('https://api.x.com/oauth2/token', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  },
  body: 'grant_type=client_credentials',
  signal: AbortSignal.timeout(15_000),
});
const { token_type, access_token } = await res.json();
if (token_type !== 'bearer') throw new Error(`예상 못 한 token_type: ${token_type}`);
```

URL 인코딩 단계는 공식 문서가 명시적으로 요구한다:

> URL encode the consumer key and consumer secret according to RFC 1738. Note that at the time of writing, this will not actually change the consumer key and secret, but this step should still be performed in case the format of those values changes in the future.

> 📌 **같은 자격증명으로 다시 부르면 같은 토큰이 온다.** 공식 문구: "one App only Access Token is valid
> for an application at a time. Issuing another request with the same credentials to `/oauth2/token`
> will return the same token until it is invalidated." **즉 이 호출은 멱등이라 매번 불러도 토큰이 늘지 않는다.**
> 무효화는 `POST /oauth2/invalidate_token`에 토큰을 실어 보낸다.

#### 4-2-2. 이 도구에서의 취급

| 항목 | 값 |
|---|---|
| 저장 위치 | 환경변수 `X_BEARER_TOKEN`. 코드가 읽는 자리는 [x.ts:92](../../apps/pipeline/src/collectors/x.ts)(`process.env.X_BEARER_TOKEN?.trim()`), 선언된 자리는 [.env.example:52](../../.env.example) |
| **경로 B의 두 값** | 환경변수 **`X_API_KEY` / `X_API_SECRET`**. [4-2-1 경로 B](#4-2-1-토큰을-어떻게-만드나--경로-두-가지)의 `curl`에 나오는 셸 변수와 같은 이름이다. **정기 수집은 이 둘을 읽지 않는다** — Bearer 토큰을 만들 때만 쓴다 |
| 경로 B를 코드로 쓸 때 읽는 곳 | `process.env.X_API_KEY` / `process.env.X_API_SECRET` — [경로 B 스니펫의 0)번 블록](#4-2-1-토큰을-어떻게-만드나--경로-두-가지) |
| ⚠️ **저장소에 아직 없다** | `grep -rn "X_API_KEY\|X_API_SECRET" apps/ packages/`가 **0건**이고 `.env.example`에도 없다(2026-08-30 실측). **경로 A로 한 번 받아 쓸 것이면 안 만들어도 되고**, 경로 B를 코드로 자동화할 때 `.env.example`에 두 줄을 새로 추가한다 |
| 헤더 조립 | [x.ts:124](../../apps/pipeline/src/collectors/x.ts) — `Authorization` 헤더에 `Bearer ` + 토큰 문자열 |
| 토큰이 없을 때 | 조용히 건너뛴다 (`X: X_BEARER_TOKEN 미설정, 스킵`, [x.ts:93-96](../../apps/pipeline/src/collectors/x.ts)). 키를 안 넣은 사람에게 비용이 0이어야 하기 때문 |
| 수명 | **만료 없음.** 사람이 재발급하거나 무효화해야 바뀐다 |
| 갱신 코드 | **불필요.** Threads(60일 회전)나 구글플레이(1시간 토큰)와 달리 회전 자격증명 설계가 필요 없다 |
| 무효화 | 재발급·무효화하면 이전 토큰이 즉시 죽는다. 환경변수를 같이 바꿔야 한다 |
| 줄바꿈 문제 | **없다.** PEM이 아니라 한 줄 문자열이라 `\n` 치환이 필요 없다 |

#### 4-2-3. 오류 규격 — HTTP 상태와 본문 모양

**본문 모양이 두 가지다.** 코드가 둘 다 읽는다 ([x.ts:32-40, 80-84](../../apps/pipeline/src/collectors/x.ts)).

| 상태 | 언제 | 본문 모양 | 이 도구의 동작 |
|---|---|---|---|
| **200** | 정상 | `{ data, includes, meta }` | 진행 |
| **400** | 파라미터 이름·값 문제 (`post.fields` vs `tweet.fields`, 미지원 필드) | `{ "title": "...", "detail": "...", "errors": [...] }` | **다음 필드 이름으로 재시도** ([x.ts:143](../../apps/pipeline/src/collectors/x.ts)) → [4-6 함정 3번](#4-6-함정) |
| **401** | 토큰이 틀렸거나 무효화됨 | `{ "title": "Unauthorized", "detail": "Unauthorized", "type": "about:blank", "status": 401 }` — **`title`과 `detail`이 똑같이 옵니다(실측).** 그대로 이으면 같은 말이 두 번 찍혀서 코드가 중복을 걷는다 | 경고 후 그 키워드 포기 |
| **403** | 등급·용도 문제 (구독 없음, non-commercial 신고) | 위와 같은 problem-detail 형태 | 경고 후 그 키워드 포기 |
| **429** | 레이트 리밋 초과 | `{ "errors": [ { "code": 88, "message": "Rate limit exceeded" } ] }` (공식 문서 예시) + `x-rate-limit-reset` 헤더 | **경고만 찍고 그 키워드 건너뜀. 재시도·백오프 없음** ([x.ts:139-142](../../apps/pipeline/src/collectors/x.ts)) → [4-6 함정 9번](#4-6-함정) |
| (없음) | 타임아웃·네트워크 | 예외로 던져진다 | `catch`에서 `X 요청 실패 (...)` 로그 후 그 키워드 포기 ([x.ts:127-130](../../apps/pipeline/src/collectors/x.ts)) |

**사유 문자열을 뽑는 규칙**은 `reasonOf()`에 있다 ([x.ts:80-84](../../apps/pipeline/src/collectors/x.ts)):
`title`, `detail`, `errors[].message ?? errors[].title`을 모아 **중복을 걷고** 이어 붙이며,
하나도 못 건지면 `HTTP {status}`를 쓴다.

> 앱 단위 토큰은 **레이트 리밋도 앱 단위(450회/15분)**로 잡히고, 사용자 토큰(300회/15분)보다 넉넉하다.
> → [4-5](#4-5-상한쿼터페이지네이션)

### 4-3. 엔드포인트와 요청

```
GET https://api.x.com/2/tweets/search/recent
```

**파라미터** (2026-08-29 <https://docs.x.com/x-api/posts/recent-search> 스키마 실측)

| 파라미터 | 필수 | 값 | 이 도구가 쓰는 값 |
|---|---|---|---|
| `query` | ✅ | 길이 1–4096 (스키마). **최근 검색 등급의 실제 상한은 512자** | `"{키워드}" -is:retweet` |
| `max_results` | | 기본 10, **10 ≤ x ≤ 100** | `limits.xPosts` (기본 20, 화면 최대 100) |
| `post.fields` | | 콤마 구분 목록 | **`created_at,note_post,display_text_range`로 바꿔야 한다** (현재는 `created_at,lang`, [x.ts:67](../../apps/pipeline/src/collectors/x.ts)). 세 값이 각각 필수·[함정 1번](#4-6-함정)(긴 글 본문)·[함정 11번](#4-6-함정)(잘림 조기 감지)의 처방이다. **`lang`은 뺀다** → [4-4](#4-4-응답--rawitem-매핑) |
| `expansions` | | `author_id` 등 | `author_id` — ⚠️ **별도 과금 여부 미확인** → [3-4](#3-4-확인-필요--추측하지-않는다) |
| `user.fields` | | `username` 등 | `username` — 위와 같음 |
| `next_token` | | base32hex 페이지 토큰 | **일부러 안 쓴다** (비용 상한의 근거) |
| `pagination_token` | | base32hex 페이지 토큰. **`next_token`과 같은 기능이고 스키마가 둘 다 받는다** | **안 쓴다** (위와 같은 이유) |
| `start_time` / `end_time` | | **`start_time`은 최근 7일 이내여야 한다** | 안 쓴다 |
| `since_id` / `until_id` | | 포스트 ID 기준, 1–19자리 숫자 | 안 쓴다 |
| `sort_order` | | `recency` \| `relevancy` | 안 쓴다 → ⚠️ [4-6 함정 6번](#4-6-함정) |

> 📌 **동시에 못 쓰는 조합이 스키마에 명시돼 있다** (2026-08-29 실측):
> "At most one of `start_time`, `since_id` may be provided. At most one of `end_time`, `until_id`
> may be provided. **At most one of `pagination_token`, `next_token` may be provided.**"
> 우리는 넷 다 안 쓰므로 걸릴 일이 없지만, 페이지네이션을 넣게 되면 **두 토큰 중 하나만** 보내야 한다.

**쿼리 문법**

```
"{키워드}" -is:retweet
```

- **따옴표가 곧 정확 구문 검색이다.** 없으면 단어가 쪼개져 토큰 AND로 매칭되고, 무관한 글이 크게 늘며
  **그 글들도 읽은 건수로 과금된다.** 따옴표를 붙인 것은 비용 통제 결정이다.
- `-is:retweet`은 리트윗을 뺀다. 리트윗은 본문이 원글과 같아 중복 판정에서 원글로 합쳐지는데,
  읽기 비용은 이미 나간 뒤다. 같은 돈으로 서로 다른 글을 더 본다.
- 코드는 조립 후 512자로 자른다 (`MAX_QUERY_CHARS = 512`, [x.ts:20, 114](../../apps/pipeline/src/collectors/x.ts)).

**요청 타임아웃 — 반드시 건다**

현행 코드는 `AbortSignal.timeout(15_000)`을 건다 ([x.ts:125](../../apps/pipeline/src/collectors/x.ts)).
**이 문서만 보고 새로 구현하면 빠뜨리기 쉬운데, 빠지면 응답이 지연될 때 키워드마다 매달려
수집 전체가 멈춘 것처럼 보인다.** → [4-6 함정 12번](#4-6-함정)

**예시 요청**

```bash
curl -s --max-time 15 -G "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  --data-urlencode 'query="자사 서비스 별칭" -is:retweet' \
  --data-urlencode 'max_results=20' \
  --data-urlencode 'post.fields=created_at,note_post,display_text_range' \
  --data-urlencode 'sort_order=recency' \
  --data-urlencode 'expansions=author_id' \
  --data-urlencode 'user.fields=username'
```

> `sort_order=recency`와 `display_text_range`는 **현재 코드에 없고 넣어야 하는 것**이다.
> 각각 [4-6 함정 6번](#4-6-함정)과 [11번](#4-6-함정)의 처방이다.

**예시 응답 (구조만)**

```json
{
  "data": [
    {
      "id": "1234567890123456789",
      "text": "짧은 글은 여기에 전부 들어온다",
      "created_at": "2026-08-20T07:24:25.000Z",
      "author_id": "111111111"
    },
    {
      "id": "1234567890123456790",
      "text": "긴 글은 여기가 잘려서 온다… https://t.co/xxxx",
      "created_at": "2026-08-20T08:00:00.000Z",
      "author_id": "222222222",
      "display_text_range": [0, 275],
      "note_post": { "text": "긴 글의 전체 본문이 여기에 있다. (중략)" }
    }
  ],
  "includes": { "users": [{ "id": "111111111", "username": "someone" }] },
  "meta": { "result_count": 2, "newest_id": "...", "oldest_id": "...", "next_token": "..." }
}
```

**`note_post`의 하위 키** ✅ **2026-08-29 확인**

| 키 | 타입 | 필수 |
|---|---|---|
| `text` | string | ✅ 필수 |
| `entities` | object (`hashtags` `cashtags` `mentions` `urls`) | 선택 |

> 📌 **이 하위 키 이름은 엔드포인트 응답 스키마에서 확인한 것이다**
> (<https://docs.x.com/x-api/posts/recent-search>). **data dictionary 페이지에는 하위 키가 열거돼 있지
> 않으므로** 거기만 보면 확인이 안 된다. 이 문서의 이전 판은 근거 없이 `note_post.text`를 단정했는데,
> 지금은 근거가 있다. 다만 실제 토큰으로 한 번 받아 보기 전까지는 **응답에 `note_post`가 있는데
> `text`를 못 꺼내면 경고를 찍는 방어**를 반드시 넣는다 → [4-6 함정 1번](#4-6-함정).

### 4-4. 응답 → RawItem 매핑

| RawItem 필드 | 이 API의 응답 필드 | 비고 |
|---|---|---|
| `source` | — | 코드가 `'x'` 고정으로 박는다 |
| `sourceId` | `data[].id` | 포스트 ID. 문자열로 온다(19자리라 숫자로 다루면 정밀도가 깨진다) |
| `url` | — (조합) | **API는 URL을 주지 않는다.** `https://x.com/{username}/status/{id}`로 만든다. username을 못 받았으면 `i`를 넣는다(그래도 열린다). [x.ts:168](../../apps/pipeline/src/collectors/x.ts) |
| `author` | `includes.users[].username` | `data[].author_id`로 조인한다. `expansions=author_id` + `user.fields=username`을 둘 다 보내야 온다. **핸들이라 개인 식별자다** → [2-3 (4)](#2-3-개발자-약관-api-경로용). [x.ts:169](../../apps/pipeline/src/collectors/x.ts) |
| `content` | `data[].note_post?.text`, 없으면 `data[].text`. **단 폴백식 한 줄로 쓰지 않는다** | 🔴 **현재 코드는 `text`만 쓴다** ([x.ts:170](../../apps/pipeline/src/collectors/x.ts)). 긴 글이 잘린다 → [4-6 함정 1번](#4-6-함정)<br>⛔ **`p.note_post?.text ?? p.text` 같은 한 줄 폴백은 금지다.** 하위 키 이름이 틀려도 아무 일이 안 일어나고 짧은 본문이 조용히 들어온다 — **이 문서가 막겠다고 선언한 실패가 정확히 그것이다.**<br>✅ **[함정 1번의 코드 블록을 그대로 옮겨 쓴다.](#4-6-함정)** `note` 객체는 왔는데 `text`를 못 꺼내면 `console.warn`으로 `Object.keys(note)`까지 찍는다. **이 경고가 매핑의 일부이지 선택 사항이 아니다.**<br>(그 코드가 `??` 대신 `\|\|`꼴로 판정하는 이유: `note.text`가 빈 문자열이면 값으로 치지 않고 `text`로 떨어져야 한다. `??`는 빈 문자열을 통과시켜 본문을 통째로 비운다) |
| `rating` | — | **못 채운다.** 별점 개념이 없는 소스다 |
| `postedAt` | `data[].created_at` | UTC로 온다. `normalizeInstant()`로 변환하지 않으면 다른 소스와 사전순 비교가 어긋난다. `post.fields`에 `created_at`을 안 넣으면 **오지 않는다** |
| `keyword` | — | API 응답에 없다. 요청에 쓴 키워드를 코드가 넣는다 |
| `service` | — | API 응답에 없다. 호출부가 넘긴 값을 그대로 넣는다 |
| `country` | — | **못 채운다.** 스토어 국가 개념이 없는 소스다. 빈 값으로 둔다 |

**채울 수 있는데 안 쓰고 있는 것**

| 필드 | 상태 |
|---|---|
| `lang` (`post.fields=lang`) | **요청은 보내는데 응답을 안 읽는다.** 요청은 [x.ts:67](../../apps/pipeline/src/collectors/x.ts)에서 `'created_at,lang'`으로 나가는데 `XPost` 인터페이스([x.ts:25-30](../../apps/pipeline/src/collectors/x.ts))에 `lang`이 없다. 지금 화면의 언어 값은 LLM이 채우는 `TagResult.lang`이다.<br>**→ 결정: 요청에서 뺀다.** [4-3](#4-3-엔드포인트와-요청)이 처방한 `created_at,note_post,display_text_range`에 `lang`이 없는 것이 이 결정이고, **두 절은 같은 말을 한다.** 근거는 `RawItem`에 `lang` 자리가 아예 없다는 것이다([types.ts:4-22](../../packages/core/src/types.ts)) — 읽어도 담을 곳이 없다.<br>나중에 LLM 대신 API의 `lang`을 쓰기로 하면 **세 곳을 같이 고쳐야 한다**: `post.fields`에 `lang` 되넣기, `XPost`에 `lang?: string` 추가, `RawItem`과 저장 스키마에 칸 만들기. **한 곳만 고치면 지금과 똑같은 상태(보내고 안 읽음)로 돌아온다** |
| `display_text_range` | 요청하지 않는다. **넣으면 본문이 잘렸는지 응답만 보고 판정할 수 있다** → [4-6 함정 11번](#4-6-함정) |
| `public_metrics` | 요청하지 않는다. 반응 수로 심각도를 보정할 여지는 있으나 현재 스키마에 담을 자리가 없다 |

### 4-5. 상한·쿼터·페이지네이션

**숫자** (2026-08-29 <https://docs.x.com/x-api/fundamentals/rate-limits> 실측)

| 항목 | 값 |
|---|---|
| 레이트 리밋 (앱 단위 Bearer) | **450회 / 15분** |
| 레이트 리밋 (사용자 토큰) | 300회 / 15분 |
| `max_results` | 기본 10, **최대 100** |
| `query` 길이 | **512자** (최근 검색). 전체 아카이브 검색은 1,024자 |
| 검색 가능 기간 | **최근 7일** |
| 초과 시 | HTTP 429, 본문 `{ "errors": [ { "code": 88, "message": "Rate limit exceeded" } ] }` |
| **월 읽기 상한** | **300만 포스트 읽기 / 청구 주기** (종량제 요금제. 초과하려면 Enterprise) → [3절](#3-비용) |

레이트 리밋 표 원문:

```
Method  Endpoint                        Per App     Per User    Notes
GET     /2/tweets/search/recent         450/15min   300/15min   10 default, 100 max results; 512 query length
```

**응답 헤더로 잔량을 알 수 있다.** 헤더 이름은 이 셋이다.

| 헤더 | 뜻 |
|---|---|
| `x-rate-limit-limit` | 이 창에서 허용된 최대 요청 수 |
| `x-rate-limit-remaining` | 남은 요청 수 |
| `x-rate-limit-reset` | 창이 리셋되는 Unix 타임스탬프 |

> ⚠️ **공식 문서의 예시 값(`x-rate-limit-limit: 900`)을 이 엔드포인트의 값으로 읽지 말 것.**
> 공식 레이트 리밋 페이지는 예시 블록에 `900`을 쓰는데, **같은 페이지의 표가 이 엔드포인트를
> 450/15분이라고 적는다.** 900은 v1.1 시절 숫자다. 두 값이 어긋난 채 문서에 같이 있으므로,
> **예시 값이 아니라 실제 응답 헤더를 읽어야 한다.** 이 문서의 이전 판은 예시 값을 그대로 옮겨
> 같은 절에서 450과 900이 충돌했다. 값을 빼고 이름만 남기는 것으로 정정한다.

⚠️ **이 코드는 이 헤더를 읽지 않는다.** 429가 오면 그 키워드만 건너뛰고 다음으로 넘어간다
([x.ts:139-142](../../apps/pipeline/src/collectors/x.ts)). 백오프도 재시도도 없다.

**페이지네이션 — 일부러 안 한다**

응답 `meta.next_token`을 요청의 `next_token`으로 넘기면 다음 쪽이 온다. **이 도구는 따라가지 않는다.**

> 페이지를 넘기면 상한이 사라져 청구액도 사라진다. 키워드마다 딱 한 번 부르고, 그 한 번이 최대
> `max_results`건이다. **이게 회당 비용 상한의 근거다.**

따라서 **회당 최대 읽기 = 키워드 수 × `max_results`**로 확정된다.

**월 예산 브레이크 — 코드에 이미 있다**

회당 상한만으로는 총액이 정해지지 않는다(상한 × 실행 횟수). 그래서 누적 기준 브레이크가 따로 있다.
[collect-limits.ts](../../packages/core/src/collect-limits.ts)와 [daily.ts](../../apps/pipeline/src/daily.ts)에 구현돼 있다.

| 구성요소 | 값 / 위치 |
|---|---|
| 설정 키 | `x.monthlyBudgetUsd` (`X_BUDGET_KEY`, [collect-limits.ts:505](../../packages/core/src/collect-limits.ts)) |
| 기본값 | **$50** (`X_BUDGET_DEFAULT`, [collect-limits.ts:508](../../packages/core/src/collect-limits.ts)), 범위 0–1000. **$50 = 읽기 10,000건** ([3-2](#3-2-숫자로-정리)) |
| **0의 의미** | **"제한 없음"이 아니라 "쓰지 않음"이다.** 무제한을 기본값으로 두면 안전장치가 아니기 때문 |
| 누적 저장 | `x.reads.{YYYY-MM}` ([collect-limits.ts:514](../../packages/core/src/collect-limits.ts)) — **달이 바뀌면 키가 바뀌어 저절로 리셋**된다 |
| 잔량 계산 | `xRemainingReads(budgetUsd, readsSoFar)` = `floor(예산 ÷ 0.005) − 이미 읽은 건수` ([collect-limits.ts:541-542](../../packages/core/src/collect-limits.ts)) |
| 실행 전 검사 | [daily.ts:197-201](../../apps/pipeline/src/daily.ts) — 잔량 ≤ 0이면 `sources.x = false`로 내리고 이번 실행에서 통째로 건너뛴다 |
| 키워드마다 검사 | [x.ts:108-111](../../apps/pipeline/src/collectors/x.ts) — `budget.remaining() < limit`이면 **남은 키워드를 전부 포기**하고 루프를 끊는다 |
| 차감 기준 | `meta.result_count` ([x.ts:151](../../apps/pipeline/src/collectors/x.ts)). **이것은 포스트 읽기 건수만 센다.** 아래 경고 참조 |
| 정확도 | 하드 상한이 아니라 **브레이크**다. 이미 떠 있는 요청은 끝까지 가므로 마지막 한 번은 조금 넘길 수 있다 |
| 배포판 | 설정 키에 `vercel.` 접두사가 붙어 로컬과 예산이 분리된다 ([daily.ts:186-188](../../apps/pipeline/src/daily.ts)) |

> 🔴 **차감 기준이 청구를 과소 반영할 수 있다 — 두 방향으로 어긋난다.**
>
> 1. **위로 어긋남(청구가 더 클 수 있다).** `meta.result_count`는 **포스트 읽기 건수**다.
>    이 도구는 `expansions=author_id` + `user.fields=username`으로 **사용자 객체도 함께 받는데**,
>    공식 가격표에는 `User: Read | $0.010 per resource`가 따로 있다.
>    **이것이 별도 과금인지는 확인하지 못했다** ([3-4](#3-4-확인-필요--추측하지-않는다) #1).
>    걸린다면 회당 실제 비용이 이 브레이크의 계산보다 크다.
> 2. **아래로 어긋남(청구가 더 작다).** 같은 UTC 하루 안의 같은 포스트 재조회는 재과금되지 않는데
>    ([3-1](#3-1-공식-가격-원문)), `result_count`는 그것도 그대로 센다.
>    **즉 이 브레이크는 하루에 여러 번 도는 설정에서 실제보다 빨리 닳는다.**
>
> **둘 다 "브레이크가 보수적으로 걸린다"는 뜻은 아니다.** 1번은 반대 방향이다.
> 그래서 [5-5](#5-5-읽은-건수와-청구가-맞는가)에서 포털 사용량과 반드시 대조해야 한다.

> **이 브레이크는 이미 돌아간다. 새로 만들 것이 아니다.** 붙일 때 할 일은 값을 정하는 것과,
> 브레이크가 걸렸을 때 그 사실이 화면에 뜨게 하는 것이다 → [4-6 함정 8번](#4-6-함정)

### 4-6. 함정

**조용히 실패하는 지점들이다. 에러 없이 0건이 되거나, 잘린 데이터가 그대로 들어온다.**

**1. 🔴 긴 글 본문이 잘려서 들어온다 — 전체 본문은 별도 필드를 명시 요청해야 온다**

X는 일정 길이를 넘는 글의 `text`를 **잘라서** 준다(말미에 `… https://t.co/…` 형태의 꼬리가 붙는다).
전체 본문은 **`note_post` 필드를 `post.fields`에 명시적으로 넣어야만** 온다.

| | |
|---|---|
| 잘못된 요청 | `post.fields=created_at,lang` ← **현재 코드** ([x.ts:67](../../apps/pipeline/src/collectors/x.ts)) |
| 올바른 요청 | `post.fields=created_at,note_post,display_text_range` |
| 읽을 곳 | `data[].note_post?.text` (없으면 `data[].text`). 하위 키는 ✅ 확인됨 → [4-3](#4-3-엔드포인트와-요청) |
| 연산자 | **`??`가 아니라 `\|\|`.** `note_post.text`가 빈 문자열이면 `??`는 그것을 통과시켜 본문이 통째로 빈다 |
| 레거시 이름 | `tweet.fields` 파라미터를 쓸 때는 필드 이름이 `note_tweet`이다 → 3번 함정과 얽힌다 |

**방어적으로 읽되, 조용히 넘어가면 안 된다.**

```ts
// ❌ 이렇게 쓰면 안 된다 — 키 이름이 틀려도 아무 일도 안 일어나고 짧은 본문이 그대로 들어온다
const content = p.note_post?.text ?? p.note_tweet?.text ?? p.text;

// ✅ 못 꺼내면 반드시 눈에 띄게 남긴다
let content = p.text;
const note = p.note_post ?? p.note_tweet;
if (note) {
  if (typeof note.text === 'string' && note.text) content = note.text;
  else console.warn(`  X: note 필드는 왔는데 본문을 못 꺼냈습니다 (id=${p.id}, 키=${Object.keys(note)})`);
}
```

**폴백 체인을 늘리는 것이 해결이 아니다.** 이 문서가 막으려는 실패가 정확히
"조용히 짧은 본문으로 떨어지는 것"이므로, **못 꺼내면 경고를 찍어 사람이 알게 한다.**
`Object.keys(note)`를 같이 찍으면 실제 키 이름이 바로 드러나 한 번에 고칠 수 있다.

**오류가 나지 않는다.** 200이 오고 데이터도 온다. **그냥 본문이 짧다.**
그리고 이 본문이 그대로 LLM 분류·요약 입력이라 **표시 문제가 아니라 판정 품질 문제다.**

실측(2026-08-29, DB): 저장된 X 글 330건 중 **270자 이상이 44건(13%)**, 평균 155자.
`web` 경로는 500자에서 자르고, 실제로 500자에 닿은 행이 1건 있다.
**즉 긴 글이 유의미하게 존재하고, 지금 코드로 전환하면 그 13%에서 `web`보다 본문이 짧아진다.**

> ⚠️ 접근 등급에 따라 `note_post`를 요청하면 400이 날 수 있다. **기존 필드 파라미터 폴백과 같은 방식으로
> 빼고 재시도하는 경로가 필요하다.** 폴백 없이 넣으면 400 → 조용한 0건이 된다.

**2. 🔴 정확 구문 검색이라 `web`보다 적게 잡힌다 — 공백 들어간 키워드에서 특히**

| 경로 | 던지는 것 | 동작 |
|---|---|---|
| `web` | 키워드 원문 그대로 | 토큰 AND (단어들이 다 들어 있으면 걸린다) |
| `api` | `"키워드"` (따옴표) | **정확 구문** (그 순서 그대로 붙어 있어야 걸린다) |

**공백이 들어간 키워드**(두 단어 별칭, 서비스명 + 기능명 조합)에서 API 쪽이 **구조적으로 더 적게 잡는다.**
`"A B"`는 "A ... B"처럼 떨어져 쓰인 글을 못 잡지만 `web`은 잡았다.

**따옴표를 빼면 안 된다.** 무관한 글이 늘고 그것도 전부 과금된다.
대신 이렇게 다룬다:

- 공백 키워드는 `("A B" OR "B A")`처럼 변형을 명시하거나, 실제 표기에 맞춰 붙여 쓴 형태를 추가한다
- 전환 직후 **키워드별 수집 건수를 `web` 시절과 나란히 비교**한다. 특정 키워드만 0에 가까우면 이 문제다
- 7일 창·리트윗 제외에 이어 **세 번째 수집량 감소 요인**이다. 셋을 합치면 체감 감소가 크다

**3. 필드 파라미터 이름이 두 가지다 — 틀리면 400 → 조용한 0건**

리브랜딩으로 이름이 바뀌었다. 문서 기준은 **`post.fields`**, 예전 이름은 **`tweet.fields`**다.
어느 쪽을 받는지는 접근 등급에 따라 다를 수 있고, **틀린 이름을 보내면 400이 떨어져 수집이 0건이 된다.**

코드는 첫 호출에서 `post.fields` → `tweet.fields` 순으로 시도하고, 성공한 이름을 뒤 키워드에서 재사용한다
(`FIELD_PARAM_NAMES`). 400일 때만 다음 이름을 시도하고, 401·429는 이름을 바꿔도 같으므로 거기서 끝낸다.

⚠️ **1번 함정과 얽힌다.** `tweet.fields`로 폴백되면 필드 이름도 `note_tweet`으로 바뀌어야 한다.
`post.fields`에서만 `note_post`가 맞다. 폴백 경로에서 이름을 안 바꾸면 **폴백된 순간부터 조용히 짧은 본문이 들어온다.**

**4. 🔴 7일 창 — 스케줄러가 멈춘 구간은 영구 유실**

`start_time`은 최근 7일 이내만 허용된다. **과거 백필이 불가능하고**, 파이프라인이 일주일 넘게 멈추면
그 구간은 되찾을 방법이 없다. 조용한 실패다 — 다시 켜도 오류가 아니라 그냥 최근 것만 들어온다.

→ **수집 주기 하한과 장애 알림 기준을 정책으로 정해야 한다.** 구글플레이와 같은 문제다
([전환 계획 2-3](../official-api-migration.md#2-3-구글플레이--7일-창이-가장-큰-손실)).
X는 구글플레이의 Play Console CSV 같은 **과거분 대체 수단이 없다.**

**5. 🔴 상한 기본값이 켜짐이라, 저장된 설정이 없는 새 환경에서 곧장 과금된다**

| 값 | 현재 | 문제 |
|---|---|---|
| `xPosts` 필드의 `defaultOn` | **`true`** | 채널이 기본으로 켜져 있다 |
| `X_MODE_DEFAULT` | `'web'` | 경로 기본값은 무료 |
| 배포판의 `xMode` | **`'api'` 강제** | Chromium이 없어 web을 못 쓴다 |

지금 `defaultOn: true`가 안전한 이유는 **"경로 기본값이 무료"라는 전제** 하나뿐이다.
코드에도 그 경고가 그대로 적혀 있다 ([collect-limits.ts](../../packages/core/src/collect-limits.ts)):

> ⚠ X_MODE_DEFAULT 를 'api' 로 바꾸려면 이 기본값도 같이 다시 판단할 것.

**`web`을 지우면 그 전제가 깨진다.** 유료 API만 남는 순간, 저장된 설정이 없는 새 환경(새 배포, 새 머신,
프리셋에 `x` 키가 없는 경우)은 **X가 켜진 채 시작해 첫 실행부터 과금된다.**

→ **`web` 삭제와 `defaultOn: false` 변경은 같은 커밋에 들어가야 한다.** 나중으로 미루면
"켠 적 없는데 청구서가 나왔다"가 된다. 월 예산 브레이크($50)가 막아 주긴 하지만, 그건 최후 방어선이지
의도한 동작이 아니다.

**6. `sort_order`를 명시하지 않는다 — 기본값을 확인하지 못했다**

API 문서에 `recency`와 `relevancy` 두 값이 있다고만 적혀 있고, **`max_results`와 달리 기본값 표기가 없다**
(2026-08-29 스키마 재확인. `max_results`에는 `기본 10`이 있는데 `sort_order`에는 그 자리가 비어 있다).
현재 코드는 이 파라미터를 보내지 않는다.

⚠️ **확인 필요 — 판별 절차는 [5-8 #3](#5-8-미확인-항목을-판별하는-절차).**
기본이 `relevancy`라면 최신 글이 빠지고 오래된 인기 글이 들어온다.
Threads가 인기순 정렬 때문에 "30일 수집 265건 대 30일 작성 47건"이 됐던 것과 같은 왜곡이다
([전환 계획 2-2](../official-api-migration.md#2-2-threads--심사가-병목-코드는-그-다음)).
앱스토어 전환에서도 같은 지적이 나왔다([전환 계획 2-4](../official-api-migration.md#2-4-앱스토어--가장-깨끗한-교체)).

→ **`sort_order=recency`를 명시적으로 넣어라.** 기본값이 무엇이든 의도가 코드에 남는다.

**7. 저장이 0건이어도 돈은 나간다 — 단, "다시 읽으면 또 나간다"는 하루 단위로만 참이다**

청구는 저장 건수가 아니라 **읽은 건수**로 결정된다.

- 도배 제거(`dropFlooding`, [x.ts:183](../../apps/pipeline/src/collectors/x.ts))도 읽은 뒤에 돈다. 분류 호출은 아끼지만 읽기 비용은 이미 나갔다
- `ON CONFLICT DO NOTHING`([store.ts:236](../../packages/core/src/store.ts))으로 전부 걸러져 **저장 0건이어도 청구는 발생한다**
- 코드는 그래서 실제 읽은 건수를 로그에 따로 남긴다: `X: {n}건 읽음 (환산 ${x}, 저장 전 기준)` ([x.ts:178-181](../../apps/pipeline/src/collectors/x.ts))

**화면의 "수집 n건"과 청구액은 다른 숫자다.** 둘을 같은 것으로 읽으면 비용 감각이 틀어진다.

> 🔴 **이 문서의 이전 판과 코드 주석은 여기서 한 걸음 더 나가 틀렸다. 정정한다.**
>
> "이미 본 글을 다시 읽어도 값은 그대로 나간다"는 **공식 가격 문서와 어긋난다.**
> 공식 문장은 같은 **UTC 하루** 안의 같은 리소스 재조회를 재과금하지 않는다고 명시한다
> ([3-1](#3-1-공식-가격-원문)). 즉 **하루 안에서는 재과금되지 않고, 날이 바뀌면 다시 과금된다.**
>
> **같은 문장이 코드 주석에도 있다** —
> [collect-limits.ts:287](../../packages/core/src/collect-limits.ts)의
> `**이미 본 글을 다시 읽어도 값은 그대로 나간다**`. **이 주석도 같이 고쳐야 한다.**
> 안 고치면 다음 사람이 이 문서 말고 주석을 읽고 같은 오해를 반복한다.
>
> 실무적으로 이 차이가 중요한 이유: **폴링 주기를 줄여도 비용이 비례해서 늘지 않는다.**
> 하루 안에서는 새로 등장한 포스트 수로 수렴한다([3-3 B](#3-3-월-비용--두-가지로-읽어야-한다)).
> 다만 **`meta.result_count` 기반 예산 브레이크는 이 감면을 모르므로**, 자주 돌리면
> 실제 청구보다 브레이크가 먼저 걸린다 → [4-5](#4-5-상한쿼터페이지네이션)

**8. 예산 브레이크가 걸려도 화면에 안 뜬다**

예산이 소진되면 `daily.ts`가 `sources.x = false`로 내린다. 그 결과:

- **X 태스크가 아예 만들어지지 않는다.** 진행 화면에 X 줄이 없다
- 사유는 **콘솔 경고에만** 남는다
- 화면에서는 "언급이 없어서 0건"과 구별되지 않는다

`web` 경로에는 이 문제를 막는 장치가 있다 — 막힌 사유를 `x.webBlocked` 설정에 저장해 화면이 배너로 띄운다
(`X_WEB_BLOCKED_KEY`). **`api` 경로에는 그에 해당하는 것이 없다.**

→ **예산 소진 사유도 같은 방식으로 설정에 남기고 배너를 띄워야 한다.** 안 그러면
"수집이 왜 안 되지"를 콘솔 로그를 뒤져야 알 수 있고, 그 로그는 배포 환경에서 잘 안 본다.

**`daily.ts` 한 파일로는 안 된다. 그 장치는 네 자리에 걸쳐 있다** — 이미 있는 `web` 쪽 배선을 그대로 따라간다.

| 자리 | 파일 | 지금(`web`) | 할 일 |
|---|---|---|---|
| 설정 키 | [collect-limits.ts:501-503](../../packages/core/src/collect-limits.ts) | `X_WEB_BLOCKED_KEY = 'x.webBlocked'` | **이름에서 `web`을 뗀다**(`x.blocked`). 두 경로가 같은 배너를 쓰므로 `web` 이름이 남으면 [5-7](#5-7-끄기-확인-web-경로가-정말-안-도는가)의 grep이 영영 0이 안 된다 |
| 사유 기록 | [daily.ts:197-201](../../apps/pipeline/src/daily.ts) | 콘솔 경고만 찍고 `sources.x = false` | 같은 자리에서 그 키에 사유를 저장한다. 배선 예시는 바로 아래 [daily.ts:486-490](../../apps/pipeline/src/daily.ts)의 `web` 블록 |
| 읽기 | [page.tsx:646](../../apps/web/app/page.tsx) | `settings[X_WEB_BLOCKED_KEY]` → `xBlocked` | 키 이름만 바꾼다. 이미 `DashboardView`로 내려가고 있다 |
| 렌더 | [DashboardView.tsx:675-678](../../apps/web/app/_dashboard/DashboardView.tsx) | `{xMode === 'web' && xBlocked && …}` | **`xMode === 'web' &&` 조건을 뗀다.** 이 한 조건 때문에 `api`에서는 사유가 있어도 안 뜬다 |

**뒤 두 줄(읽기·렌더)을 빼면 앞 두 줄은 아무 효과가 없다.** 설정에 사유가 쌓이기만 하고
화면은 똑같이 조용하다 — 지금과 구별이 안 된다. → [1절 (가) ④⑤](#1-현황)

**9. 429가 오면 그 키워드를 통째로 버린다**

`res.status === 429`면 경고만 찍고 그 키워드를 건너뛴다. 재시도도, 백오프도, `x-rate-limit-reset`
확인도 없다. 키워드가 많고 주기가 짧으면 **일부 키워드만 조용히 계속 빠질 수 있다.**

앱 단위 450회/15분은 키워드 9개 규모에서는 여유가 크지만, 키워드를 늘리거나 페이지네이션을 넣으면
계산에 들어가야 한다.

**10. 삭제된 글이 계속 살아 있다**

[2-5](#2-5-남은-리스크)의 계약 리스크이자 **데이터 품질 문제**다.
원글이 지워지거나 비공개로 바뀌어도 우리 DB에는 남고, 그 글이 계속 집계·브리핑에 들어간다.
링크를 눌러도 열리지 않는다. **조용히 틀린 숫자가 쌓인다.**

**11. 본문이 잘렸는지 응답만 보고 알 수 있는데, 지금은 사후 SQL로만 안다**

`post.fields`에 **`display_text_range`**를 넣으면 응답이 **표시 구간의 시작·끝 인덱스**를 배열로 준다
(공식 정의: 텍스트의 어느 부분이 기본적으로 표시되는지에 대한 시작 및 종료 인덱스).

| | |
|---|---|
| 무엇에 쓰나 | `display_text_range[1]`이 `text`의 길이와 같은 자리에서 딱 멈추면 **잘린 본문**이라는 신호다 |
| 왜 필요한가 | 1번 함정의 `note_post` 폴백이 조용히 실패했을 때, **지금은 [5-3](#5-3-긴-글-본문이-실제로-채워지는가--가장-중요한-확인)의 사후 SQL 말고는 감지할 방법이 없다** |
| 처방 | 요청에 `display_text_range`를 넣고, `note_post`가 없는데 표시 구간이 상한에 닿으면 **수집 시점에 경고를 찍는다** |

**사후 SQL은 이미 잘린 데이터가 쌓인 뒤에야 알려준다.** 이건 첫 건에서 알려주는 수단이다.

**12. 요청 타임아웃이 없으면 수집이 멈춘 것처럼 보인다**

현행 코드는 `AbortSignal.timeout(15_000)`을 건다 ([x.ts:125](../../apps/pipeline/src/collectors/x.ts)).
**이 문서만 보고 새로 구현하면 빠뜨리기 쉽다.**

- 없으면 응답이 지연될 때 **키워드마다 수 분씩 매달린다.** 오류도 안 나고 로그도 안 늘어난다
- 타임아웃은 `res.ok` 분기가 아니라 **예외로 빠진다.** 그래서 `try/catch`가 없으면 수집기 밖으로 튄다
- 현행 코드는 `catch`에서 `X 요청 실패 (...)`를 찍고 그 키워드만 포기한다 ([x.ts:127-130](../../apps/pipeline/src/collectors/x.ts)). **새로 쓸 때도 이 구조를 그대로 유지할 것**

---

## 5. 붙인 뒤 확인할 것

**순서대로 확인한다. 앞 단계가 안 되면 뒤는 볼 필요가 없다.**

### 5-1. 토큰이 살아 있는가 (수집 실행 전)

```bash
curl -s --max-time 15 -o /dev/null -w "%{http_code}\n" -G "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  --data-urlencode 'query="a" -is:retweet' --data-urlencode 'max_results=10'
```

| 결과 | 뜻 | 본문 |
|---|---|---|
| **200** | 정상 | `{ data, includes, meta }` |
| 401 | 토큰이 틀렸거나 재발급·무효화됐다 | `{"title":"Unauthorized","detail":"Unauthorized","type":"about:blank","status":401}` |
| 403 | 등급·용도 문제. 구독 상태와 commercial 신고를 확인 | problem-detail 형태 (`title`/`detail`) |
| 429 | 레이트 리밋. 15분 뒤 다시 | `{"errors":[{"code":88,"message":"Rate limit exceeded"}]}` |

⚠️ **이 확인 요청도 읽기로 과금된다.** 최대 10건이 반환되므로 **한 번에 최대 $0.05**다
(10 × $0.005). 한 번만 하고 `max_results`를 최소(10)로 둔다.
같은 UTC 하루 안에 반복하면 같은 포스트는 재과금되지 않는다([3-1](#3-1-공식-가격-원문)).

### 5-2. 필드 파라미터 이름이 어느 쪽으로 붙었는가

첫 실행 로그에 `X 실패 (...): ...`가 **없어야** 한다.
400 폴백이 일어났다면 `tweet.fields`로 붙은 것이고, 그때는 **`note_post`가 아니라 `note_tweet`이어야 한다**
([4-6 함정 3번](#4-6-함정)).

### 5-3. 긴 글 본문이 실제로 채워지는가 — 가장 중요한 확인

**임계값은 270자다.** 기준선([4-6 함정 1번](#4-6-함정)의 실측)이 "270자 이상 13%"이므로
쿼리도 270으로 맞춘다. 이전 판은 SQL만 280이라 기준선과 직접 비교가 안 됐다.

```sql
SELECT
  COUNT(*)                                      AS 전체,
  COUNT(*) FILTER (WHERE LENGTH(content) > 270) AS 긴글,
  ROUND(100.0 * COUNT(*) FILTER (WHERE LENGTH(content) > 270) / NULLIF(COUNT(*), 0), 1) AS 긴글비율,
  MAX(LENGTH(content))                          AS 최장
FROM items
WHERE source = 'x' AND collected_at >= '{전환한 날}';
```

| 결과 | 판정 |
|---|---|
| **긴글비율이 13% 언저리, 최장 > 300** | ✅ `note_post`가 붙었다 |
| **긴글 = 0, 최장이 280 언저리에서 딱 멈춤** | 🔴 `note_post`가 안 온다. 요청 파라미터를 다시 볼 것 |
| 본문 말미에 `… https://t.co/` 꼬리 | 🔴 잘린 본문이다. 같은 문제 |
| 수집 로그에 `note 필드는 왔는데 본문을 못 꺼냈습니다` | 🔴 하위 키 이름이 다르다. 경고에 찍힌 키 목록을 보고 고친다 ([4-6 함정 1번](#4-6-함정)) |

기존 `web` 데이터 330건 중 270자 이상이 44건(13%)이었다. **비슷한 비율이 안 나오면 잘리고 있는 것이다.**

### 5-4. 키워드별로 몇 건씩 들어왔는가 — 정확 구문 검색 확인

```sql
SELECT keyword, COUNT(*) AS 건수
FROM items
WHERE source = 'x' AND collected_at >= '{전환한 날}'
GROUP BY keyword ORDER BY 건수;
```

| 결과 | 판정 |
|---|---|
| 모든 키워드에 고르게 들어옴 | ✅ 정상 |
| **공백이 든 키워드만 0에 가까움** | 🟠 [4-6 함정 2번](#4-6-함정). 키워드 표기를 손봐야 한다 |
| 전부 0 | 🔴 토큰·파라미터 문제. 5-1, 5-2로 돌아간다 |

### 5-5. 읽은 건수와 청구가 맞는가

실행 로그에 이 두 줄이 나와야 한다.

```
X: {n}건 읽음 (환산 ${x}, 저장 전 기준)
X 누적: {YYYY-MM} {total}건 (환산 ${y} / 예산 ${budget})
```

| 확인 | 기대값 |
|---|---|
| 회당 읽기 | **키워드 수 × `xPosts` 이하.** 키워드 9개 × 20이면 **180건 = $0.90**. 넘으면 페이지네이션이 어딘가에서 돌고 있는 것이다 |
| 누적 | 실행할 때마다 단조 증가. **달이 바뀌면 0부터** |
| 포털 청구 | 개발자 콘솔의 사용량과 위 누적을 대조한다. **어긋나는 방향으로 원인이 갈린다** ↓ |

**어긋났을 때 어느 쪽인지 읽는 법** — [4-5](#4-5-상한쿼터페이지네이션)의 두 방향과 짝이다.

| 어긋남 | 유력한 원인 | 다음 행동 |
|---|---|---|
| **포털 청구 > 코드 누적** | `expansions`로 딸려 온 **사용자 객체가 `User: Read $0.010`로 따로 잡히는 것**일 수 있다 ([3-4](#3-4-확인-필요--추측하지-않는다) #1) | 콘솔 사용량 화면에서 Post read와 User read가 나뉘어 나오는지 본다. 나뉘면 확정이다. 그러면 예산 계산식에 사용자 읽기를 더해야 한다 |
| **포털 청구 < 코드 누적** | **24시간 중복 제거**가 걸린 것이다([3-1](#3-1-공식-가격-원문)). 하루에 여러 번 도는 설정이면 정상이다 | 이상이 아니다. 다만 **브레이크가 실제보다 빨리 닳으므로** 예산을 그만큼 여유 있게 잡는다 |
| 자릿수가 다르다 | 페이지네이션이 돌거나, 다른 환경(로컬/배포판)의 사용량이 섞였다 | 배포판은 설정 키에 `vercel.` 접두사가 붙어 예산이 분리되지만 **청구 계정은 하나**다. 두 환경 누적을 더해서 비교할 것 |

### 5-6. 정상이라면 이 정도가 들어온다

기존 `web` 경로 실측(30일 235건, 부정 34, 심각 6)을 기준선으로 삼되, **API는 세 가지 이유로 더 적게 들어온다.**

| 감소 요인 | 영향 |
|---|---|
| 7일 창 | 웹은 7일보다 오래된 글도 잡았다 |
| 리트윗 제외 | 원글로 합쳐지던 것이 애초에 안 들어온다 |
| 정확 구문 검색 | 공백 키워드에서 축소 |

**감소 자체는 정상이다. 판단 기준은 "얼마나 줄었나"가 아니라 "어느 키워드가 줄었나"다.**

| 상황 | 판정 |
|---|---|
| 30일 100~200건 규모, 키워드별로 고르게 분포 | ✅ 정상 |
| 전체가 절반 이하인데 **특정 키워드만** 0 | 🟠 함정 2번 |
| **0건인데 로그에 오류가 없다** | 🔴 가장 나쁜 경우. 5-1부터 다시. 예산 브레이크가 걸렸을 수도 있다(함정 8번) |
| 건수는 맞는데 본문이 다 짧다 | 🔴 함정 1번 |

### 5-7. 끄기 확인 (`web` 경로가 정말 안 도는가)

전환의 목적이 위반 경로 제거이므로, **`web`이 안 도는 것까지 확인해야 끝난다.**

**지워야 하는 자리 — 파일 12개** (2026-08-30 실측). **수집기 두 개로 끝나지 않는다.**

| # | 파일 | 자리 |
|---|---|---|
| ① | `apps/pipeline/src/collectors/x-web.ts` | **파일째 삭제** |
| ② | `packages/core/src/x-session.ts` | **파일째 삭제** (세션 파일 읽기·쓰기 전용) |
| ③ | `apps/pipeline/src/x-login.ts` | **파일째 삭제** (로그인 창·쿠키 붙여넣기 전용) |
| ④ | `packages/core/src/index.ts` | 7줄 `export * from './x-session.js';` |
| ⑤ | `apps/pipeline/package.json` | 14줄 `"x-login"` 스크립트 |
| ⑥ | `package.json` (루트) | 26줄 `"x-login"` 스크립트 |
| ⑦ | `apps/pipeline/src/daily.ts` | 175줄(`xMode` 결정) · 177줄(`resolveXPace`) · 349줄(`needBrowser` 조건) · 360-363줄(`collectXWeb` 동적 import) · 384-402줄(web 태스크) · 486-490줄(막힘 사유 저장) |
| ⑧ | `apps/web/app/actions.ts` | 18-22·34줄(import) · 163-176줄(`clearXSession`) · 235-238줄(`X_MODE_KEY` 저장) · 260-275줄(쿠키 저장) |
| ⑨ | `apps/web/app/page.tsx` | 11·13·14·49줄(import) · 629줄(`xMode`) · 651줄(`readXSessionInfo`) · 657줄(`describeXPace`) · 765·767-769줄(props) |
| ⑩ | `apps/web/app/_dashboard/DashboardView.tsx` | 646-674줄(경로 선택 UI) · 681-767줄(세션 쿠키 입력 + 요청 간격) · 865줄(예상 소요 표시) · 20-31줄(import) |
| ⑪ | `packages/core/src/collect-limits.ts` | 333-345줄(`X_MODE_*`·`resolveXMode`) · 358-368줄(`X_GAP_*`) · 392줄(`resolveXPace`) · 470줄(`describeXPace`) · 501-503줄(`X_WEB_BLOCKED_KEY`, ↓ 주의) |
| ⑫ | `README.md` | 110-121줄(세션 넣는 법) · 574-575줄(명령어 표) |

> ⚠️ **두 자리는 지우는 게 아니라 고쳐 쓰는 자리다.**
> - **⑩의 675-678줄 배너**(`{xMode === 'web' && xBlocked && …}`)는 **남기고 조건만 뗀다.**
>   [함정 8](#4-6-함정)의 처방이 이 배너를 `api`의 예산 소진 사유에 재사용하는 것이다.
> - **⑪의 `X_WEB_BLOCKED_KEY`도 지우지 말고 이름을 바꾼다.** `x.webBlocked` → `x.blocked`처럼
>   **이름에서 `web`을 떼야** 아래 grep이 0건에 닿는다. 그대로 두면 이 패턴 하나만 영영 남아
>   "다 지웠는데 왜 0이 안 되지"가 된다.

**확인용 grep** — 코드 한 번, 스크립트·문서 한 번. 두 번 돈다.

```bash
# 1) 코드
grep -rnE "collectXWeb|x-web|x-session|X_SESSION_PATH|XSession|writeXSession|removeXSession|clearXSession|X_AUTH_COOKIE|X_CSRF_COOKIE|X_MODE|[xX]Mode|X_WEB_BLOCKED|WebBlocked|X_GAP|X_LONG_BREAK|[xX]Pace" \
  apps/ packages/ --include=*.ts --include=*.tsx --exclude-dir=node_modules

# 2) 스크립트와 문서 — 코드만 지우고 여기를 두면 없는 명령을 안내하게 된다
grep -rnE "x-login|x-session|x\.mode" README.md package.json apps/*/package.json
```

> 📌 **이전 판의 `grep -rn "collectXWeb\|x-web\|X_SESSION_PATH"`는 자기가 판정하겠다는 범위를 못 덮었다.**
> 그 세 패턴은 위 12개 중 **①③⑦만** 잡고 **웹앱(⑧⑨⑩)·재export(④)·npm 스크립트(⑤⑥)·문서(⑫)를 하나도 못 잡는다.**
> 그대로 쓰면 **화면에 경로 선택 UI와 쿠키 입력칸이 살아 있는 채로 "0건, 끝났다"가 된다.**
> 실측(2026-08-30): 옛 패턴은 3개 파일, 위 패턴은 **9개 파일 187곳**을 잡는다.
> `--exclude-dir=node_modules`가 붙은 이유도 있다 — `xMode`가 의존성의 `duplexMode`·`BoxModel`에 걸려 8건이 섞인다.

- 코드를 지웠다면 **1)·2) 모두 0건**이 나와야 한다. (`X_WEB_BLOCKED`/`WebBlocked`는 위 주의대로 **개명한** 경우다. 이름을 그대로 뒀다면 그 패턴만 남는 것이 정상이고, 나머지가 0인지를 본다)
- 남겨 뒀다면 `x.mode` 설정이 `api`로 고정돼 있고, 그 값을 화면에서 되돌릴 수 없어야 한다 — **⑩의 경로 선택 UI가 먼저 빠져야 이 조건이 성립한다**
- `private/x-session.json`이 남아 있다면 지운다. **파일 내용이 곧 계정 접근권이다**

### 5-8. 미확인 항목을 판별하는 절차

**이 문서가 끝내 확인하지 못한 것들이다. 추측으로 채우지 않았으니, 붙이는 사람이 여기서 닫는다.**
확인한 값은 부록 표와 해당 절에 되적고 ⚠️를 떼는 것까지가 한 항목이다.

**#1. `expansions`로 딸려 오는 사용자 객체가 별도 과금인가** ([3-4](#3-4-확인-필요--추측하지-않는다) #1)

토큰을 받은 직후, 아직 정기 수집을 켜지 않은 상태에서 한다. **깨끗한 하루가 필요하다.**

```bash
# (1) expansions 없이 한 번 — 포스트만 읽는다
curl -s --max-time 15 -G "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  --data-urlencode 'query="a" -is:retweet' --data-urlencode 'max_results=10' \
  | grep -o '"result_count":[0-9]*'

# (2) 다음 UTC 날짜에, expansions를 붙여 같은 건수를 읽는다
curl -s --max-time 15 -G "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  --data-urlencode 'query="a" -is:retweet' --data-urlencode 'max_results=10' \
  --data-urlencode 'expansions=author_id' --data-urlencode 'user.fields=username' \
  | grep -o '"result_count":[0-9]*'
```

| 콘솔 사용량 화면 | 판정 |
|---|---|
| (2)에서 **User read가 별도 항목으로 잡힌다** | 🔴 별도 과금이다. 예산 계산식에 `사용자 수 × $0.010`을 더한다. `author`를 안 쓰기로 했다면([2-3 (4)](#2-3-개발자-약관-api-경로용)) **`expansions`를 빼는 것이 비용까지 같이 줄인다** |
| Post read만 늘고 User read가 0이다 | ✅ 별도 과금이 아니다. 현재 계산식이 맞다 |
| 화면이 Post/User를 나눠 보여주지 않는다 | 🟠 판별 불가. **금액 총계로 역산한다** — (2)의 증가분이 `건수 × $0.005`면 아니고, `× $0.015`면 별도 과금이다 |

> **날짜를 나누는 이유**: 같은 UTC 하루 안에서는 재조회가 재과금되지 않아([3-1](#3-1-공식-가격-원문))
> 두 호출을 같은 날 하면 (2)의 포스트 읽기가 0으로 잡혀 비교가 안 된다.

**#2. 삭제된 포스트 조회가 과금되는가** ([3-4](#3-4-확인-필요--추측하지-않는다) #2)

```bash
# 살아 있는 ID 하나 + 확실히 삭제된 ID 하나를 섞어 부른다
curl -s --max-time 15 -G "https://api.x.com/2/tweets" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  --data-urlencode 'ids={살아있는ID},{삭제된ID}'
```

응답에서 살아 있는 것은 `data`에, 삭제된 것은 `errors`에 들어온다.
**콘솔 사용량이 1건 늘면 `errors`는 무과금, 2건 늘면 과금이다.**
이 값이 [2-5](#2-5-남은-리스크) 해소 방안 1의 반복 비용을 정한다.

**#3. `sort_order` 기본값** ([4-6 함정 6번](#4-6-함정))

```bash
# 파라미터 없이 한 번, recency로 한 번. data[0].created_at을 비교한다
for s in "" "sort_order=recency"; do
  curl -s --max-time 15 -G "https://api.x.com/2/tweets/search/recent" \
    -H "Authorization: Bearer $X_BEARER_TOKEN" \
    --data-urlencode 'query="자사 서비스 별칭" -is:retweet' \
    --data-urlencode 'max_results=10' --data-urlencode 'post.fields=created_at' \
    ${s:+--data-urlencode "$s"} | grep -o '"created_at":"[^"]*"' | head -1
done
```

첫 줄이 둘째 줄보다 오래된 날짜면 **기본값이 `relevancy`다.**
**어느 쪽이 나오든 `sort_order=recency`는 명시한다.** 기본값에 의존하지 않기 위해서다.

**#4. `note_post` 요청 시 접근 등급별 400 여부** ([4-6 함정 1번](#4-6-함정))

```bash
curl -s --max-time 15 -o /dev/null -w "%{http_code}\n" -G "https://api.x.com/2/tweets/search/recent" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  --data-urlencode 'query="a" -is:retweet' --data-urlencode 'max_results=10' \
  --data-urlencode 'post.fields=created_at,note_post,display_text_range'
```

**200이면 폴백이 필요 없고, 400이면 필드를 빼고 재시도하는 경로를 반드시 넣는다.**
400 본문의 `detail`에 어느 필드가 거부됐는지 나온다 — `note_post`인지 `display_text_range`인지 갈라 본다.

**#5. 402로 막힌 약관 원문 세 개**

`x.com/en/tos`, `developer.x.com/en/developer-terms/agreement`, `.../policy`가
**자동 조회에서 HTTP 402를 돌려준다.** 프로그램으로는 대조가 안 된다.

| 확인해야 할 것 | 어디서 |
|---|---|
| 이용약관 "Misuse of the Services" 원문과 **개정일** (부록 7번) | 사람이 브라우저로 <https://x.com/en/tos> |
| Developer Agreement **VII.I(Termination)** 조문 번호와 영구 삭제 문장 ([2-5](#2-5-남은-리스크)) | 계약서 원본 또는 로그인 상태의 개발자 포털 |
| Developer Agreement **VIII(Compliance Audit)** 조문 번호 | 위와 같음 |
| Developer Policy "Content compliance" 원문 ([2-3 (1)](#2-3-개발자-약관-api-경로용)) | 위와 같음 |

**법무에 넘기기 전에 조문 번호를 사람이 확인한다.** 번호가 틀린 채로 나가면 검토가 헛돈다.
반면 **Restricted uses**는 `docs.x.com` 사본이 열려 이미 대조했다([2-3 (4)](#2-3-개발자-약관-api-경로용)) —
막힌 페이지도 `docs.x.com` 쪽에 사본이 있는지 먼저 찾아볼 것.

**#6. 콘솔의 청구 주기당 지출 한도 기본값** ([4-1](#4-1-사전-준비-사람이-해야-하는-것) 5번)

로그인이 필요해 문서로 확인이 안 된다. **계정을 만든 직후 콘솔에서 직접 보고 이 문서에 되적는다.**
코드의 월 예산 브레이크가 뚫렸을 때의 **최종 방어선**이라, 값을 모르면 방어선이 없는 것과 같다.

**#7. 방안 3(배치 compliance)을 쓸 수 있는가 — 접근 등급과 과금** ([2-5](#2-5-남은-리스크) 해소 방안 3)

**[4-1](#4-1-사전-준비-사람이-해야-하는-것) 7번이 "이걸 정하지 않고 켜면 안 된다"고 못박은 유일한 착수 차단 조건이
이 항목에 걸려 있다.** 그래서 절차를 여기에 둔다. 토큰을 받은 직후, 정기 수집을 켜기 전에 한다.

```bash
# (1) 목록 조회부터 친다. 권한이 없으면 여기서 막힌다
curl -s --max-time 15 -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  'https://api.x.com/2/compliance/jobs?type=tweets'

# (2) 200이면 작업을 하나 만들어 본다. 실제 ID를 올리기 전 단계까지만 간다
curl -s --max-time 15 -X POST 'https://api.x.com/2/compliance/jobs' \
  -H "Authorization: Bearer $X_BEARER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"tweets","name":"probe"}'
```

| 결과 | 판정 | 다음 |
|---|---|---|
| (1)·(2) 모두 **200** | ✅ 등급 요건은 통과다 | 과금은 아래 대조로 가른다 |
| **403** | 🔴 **이 등급에서는 방안 3을 못 쓴다.** 본문 `detail`에 필요한 등급이 나온다 | 아래 폴백으로 결정을 닫는다 |
| **404** | 🟠 경로가 바뀌었다 | `docs.x.com`의 batch-compliance 문서를 다시 본다 |

**과금 여부는 (2) 다음 날 콘솔 사용량에서 본다.** compliance 항목이 새로 생겼으면 과금이고,
Post read만 그대로면 무과금이다. **가격표에 줄이 없다는 것만으로 무료라고 단정하지 않는다.**

> 🔴 **이 #7이 닫히지 않아도 [4-1](#4-1-사전-준비-사람이-해야-하는-것) 7번은 닫을 수 있다.**
> [2-5](#2-5-남은-리스크)의 세 방안은 **택일**이고, **방안 1·2는 이 도구 코드 안에서 끝나 X의 등급·과금과 무관하다.**
> 방안 3이 403으로 막히면 **방안 2(보유기간 상한)를 채택하고 그것으로 7번을 닫는다** —
> 저장 건수가 곧 반복 비용이 되는 방안 1과 달리 추가 읽기가 0건이기 때문이다.
> **"방안 3을 확인 못 해서 착수 결정을 못 한다"는 성립하지 않는다.** 방안 3은 더 나은 선택지이지 전제가 아니다.

---

## 6. 출처

**robots.txt·약관** (2026-08-29)

| 문서 | URL | 상태 |
|---|---|---|
| robots.txt | <https://x.com/robots.txt> | ✅ HTTP 200, 대조 성공 |
| 제한 용도 (Off-X matching 등) | <https://docs.x.com/developer-terms/restricted-use-cases> | ✅ 대조 성공. **`developer.x.com/.../more-on-restricted-use-cases`는 402라 이쪽을 쓴다** |
| 이용약관 | <https://x.com/en/tos> | ⚠️ **HTTP 402** — 재대조 실패 → [5-8 #5](#5-8-미확인-항목을-판별하는-절차) |
| 개발자 약관 | <https://developer.x.com/en/developer-terms/agreement> (Last Updated: April 27, 2026) | ⚠️ **HTTP 402** — 재대조 실패 |
| 개발자 정책 | <https://developer.x.com/en/developer-terms/policy> | ⚠️ **HTTP 402** — 재대조 실패 |

**API 문서** (2026-08-29 직접 확인)

- 최근 검색 엔드포인트: <https://docs.x.com/x-api/posts/recent-search> — 파라미터 전체, `note_post` 하위 키
- 레이트 리밋: <https://docs.x.com/x-api/fundamentals/rate-limits> — 450/15분, 응답 헤더 이름, 429 본문
- **가격**: <https://docs.x.com/x-api/getting-started/pricing> — [3절](#3-비용)의 모든 인용
- **App-only OAuth 2.0**: <https://docs.x.com/fundamentals/authentication/oauth-2-0/application-only> — [4-2](#4-2-인증)의 토큰 발급
- 접근 얻기: <https://docs.x.com/x-api/getting-started/getting-access> — 포털 절차
- 개발자 콘솔: <https://console.x.com>

**이 저장소**

- 수집기(api): [apps/pipeline/src/collectors/x.ts](../../apps/pipeline/src/collectors/x.ts)
- 수집기(web, 제거 대상): [apps/pipeline/src/collectors/x-web.ts](../../apps/pipeline/src/collectors/x-web.ts)
- 세션 파일 관리(제거 대상): [packages/core/src/x-session.ts](../../packages/core/src/x-session.ts)
- 로그인 세션 발급 CLI(제거 대상): [apps/pipeline/src/x-login.ts](../../apps/pipeline/src/x-login.ts)
- 상한·예산·경로 설정: [packages/core/src/collect-limits.ts](../../packages/core/src/collect-limits.ts)
- 실행 흐름·예산 누적: [apps/pipeline/src/daily.ts](../../apps/pipeline/src/daily.ts)
- 화면 — 설정 저장: [apps/web/app/actions.ts](../../apps/web/app/actions.ts) · 데이터 조립: [apps/web/app/page.tsx](../../apps/web/app/page.tsx) · 렌더: [apps/web/app/_dashboard/DashboardView.tsx](../../apps/web/app/_dashboard/DashboardView.tsx)
- **`web` 제거 대상 전체(파일 12개)와 줄 번호는 [5-7](#5-7-끄기-확인-web-경로가-정말-안-도는가)에 있다**
- `RawItem` 정의: [packages/core/src/types.ts](../../packages/core/src/types.ts)
- 저장(`ON CONFLICT DO NOTHING`): [packages/core/src/store.ts](../../packages/core/src/store.ts)

**짝 문서**

- [수집 채널 적법성 근거](../data-collection-compliance.md)
- [공식 API 전환 계획](../official-api-migration.md)

---

## 부록. 확인하지 못한 것

**"어딘가에 있다"로 넘기지 않기 위해 따로 모았다. 아래는 이 문서가 확인하지 못한 것이다.**
**5번을 뺀 전부는 절차가 [5-8](#5-8-미확인-항목을-판별하는-절차)에 있다.** 확인하면 여기서 지우고 본문의 ⚠️도 같이 뗀다.
**5번만 5-8에 없다** — 개발이 닫을 수 없는 법무 검토 항목이라고 [2-3 (2)](#2-3-개발자-약관-api-경로용)에 적어 둔 그것이다.
절차를 쓸 수 없어서가 아니라 **개발이 실행할 절차가 없어서** 비어 있다.

| # | 항목 | 왜 중요한가 | 어떻게 확인하나 |
|---|---|---|---|
| 1 | **`sort_order` 기본값** | 기본이 `relevancy`면 최신 글이 빠진다 | [5-8 #3](#5-8-미확인-항목을-판별하는-절차). 어차피 명시하는 게 맞다 |
| 2 | **`note_post` 요청 시 접근 등급별 400 여부** | 400이면 조용한 0건이 된다 | [5-8 #4](#5-8-미확인-항목을-판별하는-절차) |
| 3 | **배치 compliance의 접근 등급과 과금 여부** | [2-5](#2-5-남은-리스크) 해소 방안 3을 쓸 수 있는지가 여기서 갈린다. **[4-1](#4-1-사전-준비-사람이-해야-하는-것) 7번(유일한 착수 차단 조건)이 걸린 항목** | [5-8 #7](#5-8-미확인-항목을-판별하는-절차). **엔드포인트 자체는 2026-08-30에 확인해 닫았다**(`POST /2/compliance/jobs` 외 2개 → [2-5](#2-5-남은-리스크)). **막혀도 방안 2로 7번을 닫을 수 있다** |
| 4 | **삭제된 포스트를 `GET /2/tweets?ids=`로 조회할 때 `errors` 건이 과금되는가** | 해소 방안 1번의 반복 비용이 정해진다. **단가 자체는 확인됐다**(반환된 포스트 1건당 $0.005 → [3절](#3-비용)) | [5-8 #2](#5-8-미확인-항목을-판별하는-절차) |
| 5 | **LLM 제공자 전송이 III.A(d)에 걸리는가** | 걸리면 분류 파이프라인 자체를 다시 봐야 한다 | 🔴 **법무 검토.** LLM 제공자의 보존·학습 정책과 함께 |
| 6 | **콘솔의 청구 주기당 지출 한도 기본값** | 코드 브레이크가 뚫렸을 때의 최종 방어선 | [5-8 #6](#5-8-미확인-항목을-판별하는-절차) |
| 7 | **이용약관 개정일 + 402로 막힌 약관 원문 3종** | 인용의 버전 고정, 조문 번호 정확성 | [5-8 #5](#5-8-미확인-항목을-판별하는-절차). 개발자 약관은 2026-04-27로 명시돼 있다 |
| 8 | **`expansions`로 딸려 오는 사용자 객체가 `User: Read $0.010`로 별도 과금되는가** | 걸리면 회당 비용이 최대 2배가 되고 예산 브레이크가 실제 청구를 과소 반영한다 | [5-8 #1](#5-8-미확인-항목을-판별하는-절차) |
| 9 | **Developer Agreement의 조문 번호(VII.I / VIII)** | 법무에 넘길 때 번호가 틀리면 검토가 헛돈다 | [5-8 #5](#5-8-미확인-항목을-판별하는-절차) |

**이번에 닫힌 항목** (이전 판의 "확인 못 함"에서 뺀다)

| 항목 | 결과 |
|---|---|
| **비용 전반** | ✅ 공식 가격 페이지 원문으로 [3절](#3-비용)을 채웠다. 남은 것은 위 8번 하나다 |
| **`note_post` 하위 키 이름** | ✅ 엔드포인트 응답 스키마에서 `text`(필수) / `entities`(선택) 확인 → [4-3](#4-3-엔드포인트와-요청) |
| **Bearer 토큰 발급 절차** | ✅ 포털 경로와 `POST /oauth2/token` 양쪽 확인 → [4-2](#4-2-인증) |
| **Off-X matching·집계 분석 인용** | ✅ `docs.x.com` 사본으로 대조. 인용의 누락 단어(`Aggregate`)까지 정정 → [2-3 (4)](#2-3-개발자-약관-api-경로용) |
| **`pagination_token` 존재** | ✅ 스키마 확인. `next_token`과 배타 → [4-3](#4-3-엔드포인트와-요청) |
| **배치 compliance 엔드포인트** | ✅ 2026-08-30 확인. `POST /2/compliance/jobs` 외 2개, 작업 종류 `tweets`/`users`, 반환 사유 5종 → [2-5](#2-5-남은-리스크) 방안 3. **남은 것은 등급·과금뿐이고 절차는 [5-8 #7](#5-8-미확인-항목을-판별하는-절차)에 있다** |
| **`web` 제거 범위** | ✅ 2026-08-30 실측. 파일 12개와 줄 번호를 [5-7](#5-7-끄기-확인-web-경로가-정말-안-도는가)에 적었다. 이전 판은 "파일 4개"라 적고 웹앱을 통째로 빠뜨렸다 |
