# 공식 API 비용

수집 경로를 전부 공식 API로 옮겼을 때 **실제로 얼마가 드는지**를 공식 가격 페이지 원문으로 정리한 문서다.

- **조사일: 2026-08-29**
- 금액은 **원문 통화 그대로** 적는다. 환율·부가세 처리가 제공자마다 달라 원화 환산은 하지 않는다.
- 근거 등급을 표에 그대로 드러냈다. **확인하지 못한 것은 "확인 불가"라고 적었고, 확인한 척하지 않았다.**
- 짝 문서: [전환 계획](official-api-migration.md) · [소스별 연동](../private/docs/sources/)

---

## 0. 한 줄 결론

> **전부 공식 API로 옮겨도 정기 지출이 생기는 곳은 X 하나뿐이다.**
> 나머지(네이버 검색, 앱 리뷰 2종, Threads, 카카오, YouTube)는 **호출료 0원**이고,
> 제약이 돈이 아니라 **쿼터와 정책**이다.

| 구분 | 대상 | 월 비용 |
|---|---|---|
| **돈이 든다** | X | **$1~27** (아래 계산) |
| 계정 유지비 (이미 냄) | 앱스토어, 구글플레이 | Apple 99 USD/년, Google $25 일회성 |
| 호출료 0원 | 네이버, Threads, 카카오, YouTube | 0원 |

**지금 이 순간의 실제 API 지출은 0원이다.** 켜져 있는 것이 네이버(무료) 하나뿐이다.

---

## 1. 경로별 가격

| 제공자 | API | 과금 모델 | 금액 | 무료 한도 | 근거 등급 | 출처 |
|---|---|---|---|---|---|---|
| **네이버** | 검색 API (블로그·카페글) | 무료 + 쿼터 | **0원** (게시된 모든 구간이 0원) | 검색 카테고리 **통합** 일 25,000건 | ✅ 원문 확인 | [요금표](https://www.ncloud.com/product/applicationService/naverApiHub) |
| **X** | recent search | **종량제** | **$0.005 / 반환된 포스트 1건** | **없음** (Free·Basic·Pro 폐지) | ✅ 원문 확인 | [pricing](https://docs.x.com/x-api/getting-started/pricing) |
| **Apple** | App Store Connect API | 무료 + 계정 유지비 | 호출료 **0원** / 프로그램 **99 USD/년** | API 키당 롤링 1시간 한도 | ✅ 원문 확인 | [enroll](https://developer.apple.com/programs/enroll/) · [rate limits](https://developer.apple.com/documentation/appstoreconnectapi/identifying-rate-limits) |
| **Google** | Play Developer API | 무료 + 등록비 | 호출료 **0원** / 등록비 **US$25 일회성** | ⚠️ **문서 불일치** (아래 3절) | ✅ 원문 확인 / ⚠️ 쿼터는 불일치 | [등록비](https://support.google.com/googleplay/android-developer/answer/6112435) · [리뷰 API](https://developers.google.com/android-publisher/reply-to-reviews) |
| **Meta** | Threads keyword_search | 무료 + 쿼터 | **0원** (요금 조항 없음) | **사용자 1명당** 24시간 2,200 쿼리 | ✅ 원문 확인 (부재 근거) | [keyword-search](https://developers.facebook.com/docs/threads/keyword-search) |
| **Meta** | 앱 심사 / 비즈니스 인증 | — | **0원** | — | ✅ 원문 확인 (부재 근거) | [business verification](https://developers.facebook.com/docs/development/release/business-verification/) |
| **카카오** | Daum 카페 검색 | 무료 + 쿼터 | **0원** (유료 API 목록에 없음) | 카페 검색 일 30,000건 | ✅ 원문 확인 | [쿼터](https://developers.kakao.com/docs/ko/getting-started/quota) |
| **YouTube** | Data API v3 | 무료 + 쿼터 | **0원** | `search.list` **하루 100회 전용 버킷** | ✅ 원문 확인 (**영문판**) | [quota cost](https://developers.google.com/youtube/v3/determine_quota_cost?hl=en) |

---

## 2. 금액이 적힌 공식 문장 (원문 그대로)

### 네이버

> 검색 API │ 무료 │ 0 ~ 775,000건 │ 0원 │ 일 최대 25,000건 호출 제한

> Q. NAVER 검색 API의 호출 한도는 어떻게 되나요? A. NAVER 검색 카테고리 내 API 호출 한도는 통합 관리되며 월 최대 775,000건까지 호출할 수 있습니다.

> 한시적 무료 제공 정책은 추후 변경될 수 있습니다.

### X

> Posts: Read | $0.005 per resource

> All prices are per resource fetched (reads) or per request (writes/actions).

> **All resources are deduplicated within a 24-hour UTC day window. If you request and are charged for a resource (such as a Post), requesting the same resource again within that window will not incur an additional charge.**

> Pay-per-usage plans are capped at 3 million Post reads per monthly billing cycle. If you need higher volume, upgrade to an Enterprise plan.

> Prices are subject to change. Current rates are always available in the Developer Console and on the developer.x.com pricing page.

### Apple

> The Apple Developer Program is 99 USD per membership year. Prices may vary by region and are listed in local currency during the enrollment process.

### Google Play

> There is a US$25 one-time registration fee

> GET requests (for retrieving lists of reviews and individual reviews) – 200 per hour

### 카카오

> 카카오 API는 원활한 서비스 제공을 위해 월간 및 일간 쿼터(Quota)를 적용합니다. … 적용된 쿼터 한도를 상향하기 위해서는 협의 및 제휴가 필요하므로 별도 문의합니다.

### Threads

> 사용자는 연속 24시간 이내에 최대 2,200개의 쿼리를 전송할 수 있습니다. … 이 제한은 여러 앱에 걸쳐 한 사용자에게 적용되며 앱에 따라 구분되지 않습니다.

### YouTube

> Projects that enable the YouTube Data API have a default quota allocation of 100 search.list calls, 100 videos.insert calls, and 10,000 units per day combined for all other endpoints.

---

## 3. X 월 비용 — 유일하게 돈이 드는 곳

### 대입한 값

| 항목 | 값 | 출처 |
|---|---|---|
| **키워드 수** | **9개** | ✅ 설정 실측  |
| 회당 상한 | 키워드당 20건 | ✅ 설정 실측 (`xPosts`) |
| 단가 | $0.005 / 반환된 포스트 1건 | ✅ 공식 원문 |
| 월 일수 | 30일 | 가정 |
| 회차당 호출 | 키워드당 1회 (페이지네이션 없음) | ✅ 코드가 `next_token`을 무시한다 |

> ⚠️ **키워드가 늘면 비례해서 늘어난다.** 아래 금액은 전부 키워드 9개 기준이다.
> 키워드를 18개로 늘리면 금액도 2배다. **비용을 줄이는 가장 효과적인 손잡이는 주기가 아니라 키워드 수다.**

### 시나리오 A — 상한 (중복 제거를 신뢰하지 않음)

매 회차 상한 20건을 꽉 채워 전부 새 포스트라고 가정한다. **실제로는 이렇게 안 되지만, 예산 상한을 정할 때 쓰는 숫자다.**

```
월 비용 = 키워드 9 × (24 ÷ 주기시간) × 30일 × 20건 × $0.005
```

| 수집 주기 | 회/일 | 월 과금 건수 | **월 비용** | 코드 기본 예산 $50 소진 |
|---|---:|---:|---:|---:|
| 1시간 | 24 | 129,600 | **$648** | 2.3일 |
| 3시간 | 8 | 43,200 | **$216** | 6.9일 |
| 6시간 | 4 | 21,600 | **$108** | 13.9일 |
| 12시간 | 2 | 10,800 | **$54** | 27.8일 |
| 24시간 | 1 | 5,400 | **$27** | 55.6일 |

### 시나리오 B — 24시간 중복 제거 반영 (현실값)

**공식 페이지가 같은 UTC 하루 안의 같은 포스트 재조회를 재과금하지 않는다고 명시한다**(2절 인용).
따라서 과금은 **"그날 결과에 등장한 서로 다른 포스트 수"로 수렴하고, 폴링 횟수와 사실상 무관해진다.**

| 하루 신규 포스트 | 월 과금 건수 | **월 비용** |
|---:|---:|---:|
| 8건 (실측 수준) | 240 | **$1.20** |
| 20건 | 600 | **$3.00** |
| 50건 | 1,500 | **$7.50** |
| 100건 | 3,000 | **$15.00** |

실측은 최근 30일 235건(≈ 일 7.8건)이다. **현실적으로는 월 $1~3 수준**이고,
언급량이 10배로 튀어도 $15를 넘지 않는다.

### 그래서 어떻게 읽어야 하나

**A와 B의 차이가 100~500배다.** 어느 쪽을 믿느냐가 아니라, **둘 다 필요하다.**

- **B가 현실값이다.** 중복 제거는 공식 문서에 명시된 동작이고, 우리 수집 패턴(같은 키워드를 반복 검색)에
  정확히 유리하게 걸린다
- **A는 예산 상한을 정할 때 쓴다.** 언급량이 폭발하는 날(장애, 논란)에는 새 포스트가 쏟아져
  B가 A에 가까워진다. **그런 날이 바로 이 도구가 가장 필요한 날이다**
- 코드의 월 예산 브레이크($50 기본)는 A 기준으로 잡아 두는 것이 맞다.
  B 기준으로 잡으면 정작 필요한 날에 수집이 멈춘다

> 💡 **종량제 월 상한 300만 읽기에는 어느 주기에서도 걸리지 않는다** (1시간 주기 상한 시나리오도 129,600건).

---

## 4. 돈이 아니라 쿼터가 제약인 곳

| 제공자 | 한도 | 우리 규모에서 걸리나 |
|---|---|---|
| **네이버** | 일 25,000건 (검색 카테고리 **통합**) | 🟢 여유. 블로그+카페가 같은 한도를 공유한다는 점만 주의 |
| **앱스토어** | API 키당 롤링 1시간 한도 | 🟢 여유 |
| **구글플레이** | ⚠️ 아래 참조 | 🟢 여유로 보이나 숫자가 불확실 |
| **Threads** | **사용자 1명당** 24시간 2,200 쿼리 | 🟢 여유. 단 앱이 아니라 **사용자 단위**라 계정을 나눠도 늘지 않는다 |
| **카카오** | 카페 검색 일 30,000건 | 🟢 여유 |
| **YouTube** | `search.list` **하루 100회** 전용 버킷 | 🟠 **빡빡하다.** 키워드 9개 × 하루 11회가 상한 |

### ⚠️ 네이버: "월 775,000건"을 버스트로 쓸 수 없다

775,000 = 25,000 × 31이다. **일 한도의 산술적 누적일 뿐**이므로 며칠에 몰아 쓰는 것은 불가능하다.
**실효 한도는 일 25,000건**이고, 수집기 설계도 월이 아니라 일 기준으로 잡아야 한다.
API 키당 **50 RPS** 레이트 리밋이 별도로 있고, 월 한도 도달 시 호출이 자동 차단된다.

### ⚠️ 구글플레이: 공식 문서 두 곳의 쿼터가 다르다

| 문서 | 값 |
|---|---|
| [Reply to Reviews 가이드](https://developers.google.com/android-publisher/reply-to-reviews) (2025-12-18) | 앱당 **GET 200회/시간**, POST 2,000회/일 |
| Play Developer API quotas 페이지 (2026-04-29, **더 최신**) | 버킷당 **3,000 QPM** 기본값, Reply to Reviews가 같은 버킷 |

**어느 쪽이 실제로 걸리는지 문서만으로는 확정할 수 없다.**
보수적으로 200회/시간으로 설계하고, 실제 응답의 쿼터 헤더로 확인하는 편이 안전하다.

### ⚠️ YouTube: 한국어 문서가 낡았다

같은 URL의 한국어판은 구 모델(일 10,000 units, `search.list` = 100 units)을 보여준다.
새 버킷 모델(`search.list` 하루 100회 전용, 호출당 1 unit)은 **영문판에만** 반영돼 있다.
**직접 확인할 때 반드시 `?hl=en`을 붙여야 한다.**

---

## 5. 확인하지 못한 것

**추측으로 채우지 않고 그대로 남긴다.**

| # | 항목 | 왜 중요한가 |
|---|---|---|
| 1 | **네이버 유료 전환 후 초과 단가** | 공식 미게시. "한시적 무료"라 정책이 바뀔 수 있고, 그때 얼마가 될지 알 수 없다. **지금 유일하게 돌고 있는 유료 가능성 있는 경로다** |
| 2 | 네이버 API Gateway 별도 요금 | 요금표에 항목이 없다. "부과되지 않는다"는 명시 문장도 못 찾았다 |
| 3 | X 신규 계정 기본 지출 한도 | 개발자 콘솔 로그인이 필요해 확인 못 함. **계정 만들 때 직접 확인할 것** |
| 4 | 구글플레이 실제 쿼터 | 위 문서 불일치 |
| 5 | Play API 사용에 따른 GCP 과금 | "유료라는 문서가 없다"는 **부재 근거**다. 무료라고 명시한 문장은 못 찾았다 |
| 6 | 카카오 쿼터 증액 비용 | 공표된 구매 경로 없음. "협의 및 제휴" 문의만 안내된다 |

---

## 6. 의사결정 요약

**돈 때문에 못 할 일은 없다.** 전부 공식 API로 가도 월 $30을 넘기 어렵다.

| 대상 | 비용 | 실제 장벽 |
|---|---|---|
| 앱스토어 | **0원 추가** (연회비는 이미 냄) | 판매자 계정마다의 키 발급 |
| 구글플레이 | **0원 추가** (등록비는 이미 냄) | 개발자 계정마다의 권한 승인 |
| 네이버 | **0원** | 없음 (이미 돌고 있음) |
| Threads | **0원** | **비즈니스 인증 + 앱 심사** |
| X | **월 $1~27** | 결제수단 등록 |
| 카카오 | 0원 | 🔴 약관 저장 조항 (법무 판단 전) |
| YouTube | 0원 | `search.list` 하루 100회 |

**결론: 공식 API 전환을 막는 것은 비용이 아니라 절차다.** 계정 권한, 앱 심사, 법무 판단이
전부 개발 손 밖에 있고, 비용은 그에 비하면 무시할 만한 크기다.
그러니 **"돈이 얼마나 드나"보다 "절차를 언제 걸었나"가 일정을 결정한다.**

> 다만 **네이버의 "한시적 무료"는 지켜봐야 한다.** 지금 0원인 유일한 실운영 경로인데,
> 유료 전환 시 단가가 공표돼 있지 않다. 요금 정책 변경 공지를 받을 수 있게 해 두는 편이 좋다.
