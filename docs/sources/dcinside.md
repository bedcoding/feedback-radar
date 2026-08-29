# 디시인사이드

> 이 문서는 법률 자문이 아니다.

> **한 줄 요약**: 지금 켜져 있는 **유일한 커뮤니티 채널**이고 공식 API가 없어 직접 파싱으로만 가져올 수 있다.
> robots.txt는 우리를 명시적으로 허용하지만 **이용약관 제16조는 사전 서면 동의 없는 크롤링을 명시적으로 금지한다**(2026-08-29 신규 발견).
> 돈은 들지 않는다. 붙이는 데 필요한 것은 키도 승인도 아니고 **Chromium 하나와 CSS 셀렉터**뿐이며,
> 대신 **차단 갤러리 필터·HTTP 상태 확인·요청 간격 정비 세 가지를 코드에 넣는 것이 이 소스를 유지하는 조건**이다.

- **실측일: 2026-08-29** (robots.txt·약관은 예고 없이 바뀐다. [2-5 재확인 방법](#2-5-재확인-방법) 참고)
- 대상 코드: [dcinside.ts](../../apps/pipeline/src/collectors/dcinside.ts)
- 짝 문서: [수집 채널 적법성 근거](../data-collection-compliance.md) · [공식 API 전환 계획](../official-api-migration.md)

---

## 1. 현황

| 항목 | 값 |
|---|---|
| **현재 상태** | **켜짐.** 운영 설정(`settings` 표의 `config.sources`)에 `dcinside: true`로 들어 있다 (2026-08-29 DB 실측). 다만 **배포판에서는 강제로 꺼진다** — Vercel 함수에 Chromium이 없다 ([daily.ts:163](../../apps/pipeline/src/daily.ts)) |
| **적법성 판정** | 🟠 **층위가 갈린다.** robots.txt는 `User-agent: *` → `Allow: /`로 허용, **이용약관 제16조는 사전 서면 동의 없는 크롤링을 명시적으로 금지**. 대체 경로가 없어 끄면 커뮤니티 채널이 0이 된다 → [2절](#2-적법성-근거) |
| **비용** | **호출료 0원 — 과금할 공식 API 자체가 없다.** 계정·키·승인 비용도 0원. 대신 **Chromium 구동 자원, 차단당해도 모르는 리스크, DOM 셀렉터 유지보수, 법무 절차**가 실제 비용이다. **사이트가 정한 쿼터는 하나도 없다**(`Crawl-delay` 없음, 일일 상한 없음) — 상한은 전부 우리 코드가 건 것(페이지당 25건 × 최대 20페이지). LLM 분류 단가·실행 환경 요금은 ⚠️ 확인 필요 → [3절](#3-비용) |
| **연동 난이도** | **하.** 계정·키·승인 절차가 전혀 없다. 비로그인 공개 페이지를 읽는 것이 전부다. 대신 **DOM 셀렉터에만 의존**해 사이트 개편에 그대로 노출된다 |
| **30일 수집량** | **530건** (부정 58건, 심각 4건). 관련 판정만 보면 92건 (부정 26건, 심각 3건). 작성일 기준, 2026-08-29 DB 실측 |

### 1-1. 이 소스의 위치

| | |
|---|---|
| 전체 수집량에서의 비중 | **45%** — 단일 채널 중 최대 ([전환 계획 0절](../official-api-migration.md#0-결론-전면-교체는-불가능하다)) |
| 공식 API | **없다.** 공개된 개발자 API가 존재하지 않는다 |
| 대체 경로 | **없다.** 이 소스를 끄면 커뮤니티 채널이 0이 되고, 도구가 앱 리뷰 + 블로그 모니터로 축소된다 |
| 관련성 | 30일 530건 중 **무관 판정 438건(83%)**. 동음이의어 노이즈가 매우 크다 → [5절](#5-붙인-뒤-확인할-것) |

> ⚠️ **이 문서에서 판정이 바뀌었다.** [적법성 문서](../data-collection-compliance.md)는 디시를 🟡로 두면서
> 근거를 "확인된 약관 페이지 없음"이라고 적었다. **이번 실측에서 이용약관을 찾았고, 크롤링 금지 조항이 있었다.**
> 그 문서의 3절 표와 4-4절을 갱신해야 한다. 자세한 것은 [2-2](#2-2-이용약관--크롤링-금지-조항이-있다-신규-발견).

---

## 2. 적법성 근거

### 2-1. robots.txt 실측 (2026-08-29)

우리가 **실제로 요청하는 호스트는 `search.dcinside.com` 하나**다. 저장되는 링크는 `gall.dcinside.com`을 가리키지만
**본 갤러리 페이지는 요청하지 않는다**(검색 결과 목록만 읽는다). 그래도 세 호스트를 모두 실측한다.

| 호스트 | HTTP | Content-Type | 우리 경로가 걸리는가 |
|---|---|---|---|
| `search.dcinside.com` | **404** | text/html; charset=iso-8859-1 | **robots.txt가 없다.** RFC 9309상 제한 없음 |
| `gall.dcinside.com` | 200 | text/plain | `User-agent: *` → `Allow: /`. 저장하는 링크가 이 호스트다 |
| `www.dcinside.com` | 200 | text/plain | `User-agent: *` → `Allow: /`. 요청하지 않는다 |

#### (1) `https://search.dcinside.com/robots.txt` — HTTP 404, 원문:

```
<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL /robots.txt was not found on this server.</p>
</body></html>
```

**우리가 요청하는 호스트에는 robots.txt가 없다.** 즉 이 호스트에 대해 명시된 제한이 없다.

#### (2) `https://gall.dcinside.com/robots.txt` — HTTP 200, 원문(전문):

```
# ============================================
# robots.txt for gall.dcinside.com (PC Web Gallery)
# Version: 2.1.2
# ============================================
# ----- AI 학습 크롤러 차단 -----
User-agent: GPTBot
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: anthropic-ai
Disallow: /
User-agent: Claude-Web
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: Applebot-Extended
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: Bytespider
Disallow: /
User-agent: Amazonbot
Disallow: /
User-agent: Meta-ExternalAgent
Disallow: /
User-agent: cohere-ai
Disallow: /
User-agent: PerplexityBot
Disallow: /
# 바이두 봇 차단
User-agent: Baiduspider
Disallow: /
User-agent: Baiduspider-video
Disallow: /
User-agent: Baiduspider-image
Disallow: /
# ----- 그 외 모든 봇 (검색봇 + AI 검색봇 포함) -----
User-agent: *
Allow: /
# 시스템 경로
Disallow: /kcaptcha/image_v3/
# ----- 갤러리 단위 차단 (lists + view + comment_view 통일) -----
# 47
Disallow: /board/lists/?id=47
Disallow: /board/view/?id=47
Disallow: /board/comment_view/?id=47
# cat
Disallow: /board/lists/?id=cat
Disallow: /board/view/?id=cat
Disallow: /board/comment_view/?id=cat
# dog
Disallow: /board/lists/?id=dog
Disallow: /board/view/?id=dog
Disallow: /board/comment_view/?id=dog
# stock_new
Disallow: /board/lists/?id=stock_new
Disallow: /board/view/?id=stock_new
Disallow: /board/comment_view/?id=stock_new
# stock_new2
Disallow: /board/lists/?id=stock_new2
Disallow: /board/view/?id=stock_new2
Disallow: /board/comment_view/?id=stock_new2
# baseball_new8
Disallow: /board/lists/?id=baseball_new8
Disallow: /board/view/?id=baseball_new8
Disallow: /board/comment_view/?id=baseball_new8
# m_entertainer1
Disallow: /board/lists/?id=m_entertainer1
Disallow: /board/view/?id=m_entertainer1
Disallow: /board/comment_view/?id=m_entertainer1
# ib_new
Disallow: /board/lists/?id=ib_new
Disallow: /board/view/?id=ib_new
Disallow: /board/comment_view/?id=ib_new
# d_fighter_new1
Disallow: /board/lists/?id=d_fighter_new1
Disallow: /board/view/?id=d_fighter_new1
Disallow: /board/comment_view/?id=d_fighter_new1
# produce48
Disallow: /board/lists/?id=produce48
Disallow: /board/view/?id=produce48
Disallow: /board/comment_view/?id=produce48
# sportsseoul
Disallow: /board/lists/?id=sportsseoul
Disallow: /board/view/?id=sportsseoul
Disallow: /board/comment_view/?id=sportsseoul
# metakr
Disallow: /board/lists/?id=metakr
Disallow: /board/view/?id=metakr
Disallow: /board/comment_view/?id=metakr
# salgoonews
Disallow: /board/lists/?id=salgoonews
Disallow: /board/view/?id=salgoonews
Disallow: /board/comment_view/?id=salgoonews
# singo
Disallow: /board/lists/?id=singo
# rezero (마이너 갤러리)
Disallow: /mgallery/board/lists/?id=rezero
# ----- 개별 게시물 차단 -----
# hajungwoo
Disallow: /board/view/?id=hajungwoo&no=12995
Disallow: /board/view/?id=hajungwoo&no=14441
Disallow: /board/view/?id=hajungwoo&no=14508
Disallow: /board/view/?id=hajungwoo&no=14977
# dongbang
Disallow: /board/view/?id=dongbang&no=43265
Disallow: /board/view/?id=dongbang&no=48008
# arbeit
Disallow: /board/view/?id=arbeit&no=1781137
Disallow: /board/view/?id=arbeit&no=1854264
Disallow: /board/view/?id=arbeit&no=1902701
Disallow: /board/comment_view/?id=arbeit&no=1827137
# immovables
Disallow: /board/view/?id=immovables&no=827440
Disallow: /board/view/?id=immovables&no=1045608
# government
Disallow: /board/view/?id=government&no=3795641
Disallow: /board/view/?id=government&no=3795657
Disallow: /board/view/?id=government&no=3795663
Disallow: /board/view/?id=government&no=3795664
Disallow: /board/view/?id=government&no=3795665
Disallow: /board/view/?id=government&no=3795671
# etc.
Disallow: /board/view/?id=starcraft&no=5179138
Disallow: /board/view/?id=comedy_new&no=3182480
Disallow: /board/view/?id=plastic_s&no=118703
Disallow: /board/view/?id=aion&no=231406
Disallow: /board/view/?id=aoa&no=455310
Disallow: /board/view/?id=kimmyungmin&no=57241
Disallow: /board/view/?id=etc_entertainment1&no=1462322
Disallow: /board/view/?id=bigbang&no=107916
Disallow: /board/view/?id=exam_new&no=3441270
Disallow: /board/view/?id=theaterM&no=1062240
Disallow: /board/view/?id=admission&no=1591805
# Sitemap
Sitemap: https://gall.dcinside.com/_seo/main_gall.xml
Sitemap: https://gall.dcinside.com/_seo/mgall_gall1.xml
Sitemap: https://gall.dcinside.com/_seo/mgall_gall2.xml
Sitemap: https://gall.dcinside.com/_seo/migall_gall.xml
```

**이 원문에서 코드로 옮겨야 할 것 세 가지.**

| # | 사실 | 코드에 미치는 영향 |
|---|---|---|
| 1 | `User-agent: *` → `Allow: /` | 우리는 명명된 크롤러가 아니므로 이 그룹이 적용된다. **일반 봇에게 열려 있다** |
| 2 | 갤러리 단위 Disallow가 15개 | 통합 검색 결과에 이 갤러리 글이 섞여 들어올 수 있다 → [4-7-1](#4-7-1-차단-갤러리-필터-우선순위-1) |
| 3 | 개별 게시물 Disallow가 29개 | **URL 형태가 우리가 저장하는 것과 정확히 같다**(`/board/view/?id=X&no=N`). 문자열 비교만으로 걸러진다 |

**주의해서 읽어야 할 두 줄.**

- `singo`는 **`/board/lists/`만** 차단이고 `/board/view/`는 차단 목록에 없다.
- `rezero`는 **`/mgallery/board/lists/`만** 차단이고 `/mgallery/board/view/`는 없다.

즉 **갤러리 ID만 보고 거르면 robots.txt가 실제로 막지 않은 것까지 막는다.** 그게 더 안전한 선택일 수는 있지만,
**"robots.txt를 지킨다"와 "우리가 더 보수적으로 뺀다"는 다른 말이므로 코드 주석에 구분해 적어야 한다.**
정확히 지키려면 **(경로, id) 쌍**으로 비교해야 한다.

**AI 학습 크롤러 차단 목록이 파일 맨 앞에 있다.** 이 도구는 수집한 글을 LLM에 넣어 **분류**한다(학습이 아니라 추론)는 것이
우리 입장이지만, **디시가 AI 관련 자동 수집에 부정적이라는 의사를 문서로 표시했다는 사실은 남는다.**
게다가 아래 [2-2](#2-2-이용약관--크롤링-금지-조항이-있다-신규-발견)의 약관 제16조 ②는 그 의사를 자연어로 다시 못 박는다.

#### (3) `https://www.dcinside.com/robots.txt` — HTTP 200, 원문(전문):

```
# ============================================
# robots.txt for www.dcinside.com (PC Web)
# Version: 2.1.2
# ============================================
# ----- AI 학습 크롤러 차단 -----
User-agent: GPTBot
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: anthropic-ai
Disallow: /
User-agent: Claude-Web
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: Applebot-Extended
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: Bytespider
Disallow: /
User-agent: Amazonbot
Disallow: /
User-agent: Meta-ExternalAgent
Disallow: /
User-agent: cohere-ai
Disallow: /
User-agent: PerplexityBot
Disallow: /
# 바이두 봇 차단
User-agent: Baiduspider
Disallow: /
User-agent: Baiduspider-video
Disallow: /
User-agent: Baiduspider-image
Disallow: /
# ----- 그 외 모든 봇 (검색봇 + AI 검색봇 포함) -----
User-agent: *
Allow: /
# Sitemap
Sitemap: https://www.dcinside.com/_seo/main_gall.xml
Sitemap: https://www.dcinside.com/_seo/mgall_gall1.xml
Sitemap: https://www.dcinside.com/_seo/mgall_gall2.xml
Sitemap: https://www.dcinside.com/_seo/migall_gall.xml
Sitemap: https://www.dcinside.com/_seo/prgall_gall.xml
```

**세 호스트 어디에도 `Crawl-delay`가 없다.** 사이트가 정한 간격이 없다는 뜻이므로,
요청 간격은 전적으로 우리가 정해야 한다 → [4-7-3](#4-7-3-요청-간격-정비-우선순위-3).

---

### 2-2. 이용약관 — 크롤링 금지 조항이 있다 (신규 발견)

**[적법성 문서](../data-collection-compliance.md)는 "확인된 약관 페이지 없음"이라고 적었지만, 약관은 존재한다.**
`https://www.dcinside.com/` 하단 푸터의 `이용약관` 링크를 따라가면 나온다.

| 항목 | 값 |
|---|---|
| URL | <https://nstatic.dcinside.com/dc/w/policy/policy_index.html> |
| HTTP | 200 (text/html; charset=UTF-8) |
| 문서명 | 디시인사이드 이용약관 |
| 공고일자 | 2026년 07월 14일 |
| **시행일자** | **2026년 07월 21일** |

> 참고로 `www.dcinside.com/terms`, `/rule`, `/policy`, `/agreement`는 전부 **404**다.
> `gall.dcinside.com/terms`는 301로 `board/lists/?id=terms`(같은 이름의 갤러리)로 넘어갈 뿐 약관이 아니다.
> **경로를 추측해서는 못 찾는다. 푸터 링크로만 도달한다.**

#### 제16조 (크롤링 및 인공지능 학습) — 원문

> ① 회사는 robots.txt에 적용한 일부 사이트에만 크롤링을 허용하고 있습니다. 당사의 사전 서면 동의 없이 어떤 형태로든 어떤 목적으로든 본 서비스를 크롤링하는 행위는 명시적으로 금지됩니다.
>
> ② 회사의 콘텐츠를 인공지능 학습용 데이터(머신러닝, 딥러닝 등 인공지능 모델 학습을 위해 활용되는 모든 데이터) 등에 활용할 때 반드시 회사와 사전 합의해야 합니다. 공익 및 비영리 목적인 경우에도 회사의 동의를 받아야 합니다. 그렇지 않을 경우, 민형사상 책임을 물을 수 있습니다.

#### 제11조 (이용자의 의무) ① 13) — 원문

> 13) 자동화된 수단을 이용하여 서비스에 게재된 콘텐츠를 비롯한 기타 정보(고정닉, 닉네임, 비회원의 일부 IP 등)를 수집하거나 인공지능(AI) 학습을 목적으로 수집, 이용하는 행위

#### 제14조 (저작권의 귀속 및 콘텐츠의 이용) ② — 원문

> ② 이용자는 회사가 제공하는 서비스를 이용함으로써 얻은 정보를 회사의 사전 승낙 없이 복제, 전송, 출판, 배포, 방송, 기타 방법에 따라 영리목적으로 이용하거나 제3자에게 이용하게 하여서는 안 됩니다.

#### 제2조 (이용자의 정의) ① — 원문

> ① '이용자'란 본 약관에 동의하고 회사가 제공하는 서비스를 이용하는 '고정닉, 비고정닉 이용자'(이하 '고정닉 이용자')와 '비회원 이용자'(일명 '유동닉')를 통칭합니다.

---

### 2-3. 판정과 근거

**🟠 — 층위 1(robots.txt)과 층위 2(약관)가 서로 반대 방향을 가리킨다.**

| 층위 | 결과 | 근거 |
|---|---|---|
| 1. robots.txt | 🟢 **허용** | 요청 호스트에 robots.txt 없음(404). 링크 대상 호스트는 `User-agent: *` → `Allow: /` |
| 2. 이용약관 | 🔴 **명시적 금지** | 제16조 ① "사전 서면 동의 없이 … 크롤링하는 행위는 명시적으로 금지" |
| 3. 기술적 보호조치 우회 | 🟢 **해당 없음** | 비로그인. 로그인 벽·캡차·IP 차단을 우회하지 않는다. 세션도 싣지 않는다 ([dcinside.ts:131](../../apps/pipeline/src/collectors/dcinside.ts)의 `newPage(browser)`는 `storageStatePath`를 넘기지 않는다) |
| 4. 수집 후 이용 형태 | 🟡 **판단 필요** | 외부 미공개·원문 링크 병기·키워드 한정이지만, 제14조 ②의 "영리목적으로 이용"에 VOC 모니터링이 해당하는지 미확정 |

#### 두 층위가 충돌하는 지점을 정확히 짚으면

제16조 ①의 첫 문장은 **"robots.txt에 적용한 일부 사이트에만 크롤링을 허용"** 이라고 스스로 말한다.
즉 디시 본인의 설명으로는 **robots.txt가 허가의 통로**다. 그렇게 읽으면 `gall`·`www`의 `Allow: /`는 허가에 해당한다.

**그런데 우리가 실제로 때리는 호스트는 `search.dcinside.com`이고, 거기에는 robots.txt가 없다.**

| 읽는 방식 | 결론 |
|---|---|
| RFC 9309 (robots.txt 없음 = 제한 없음) | 허용 |
| 제16조 ① (robots.txt에 적용한 사이트에만 허용) | **허용 목록에 없음 → 금지** |

**같은 사실이 정반대 결론을 낸다.** 이것이 이 소스의 핵심 리스크이고, 실무자가 코드로 해소할 수 있는 종류가 아니다.

#### 추가로 기록해 둘 것

- **약관이 비회원에게도 미치는지**는 확정하지 않는다. 제2조 ①은 '이용자'를 "본 약관에 동의하고 … 이용하는" 자로 정의하고
  비회원 이용자를 포함시킨다. 반면 제16조 ①은 이용자 의무가 아니라 **일반적 금지 선언 형태**다.
  가입하지 않은 방문자에게 이런 브라우즈랩 약관이 계약으로서 구속력을 갖는지는 **⚠️ 법무 판단이 필요하다.**
- **제11조 ① 13)이 열거한 수집 대상은 "고정닉, 닉네임, 비회원의 일부 IP"다.** 우리는 이 셋을 저장하지 않는다
  (저장하는 `author`는 **갤러리명**이다 → [4-4](#4-4-응답--rawitem-매핑)). 조항의 후단 "콘텐츠를 비롯한 기타 정보"에는 걸린다.
- **제16조 ②의 "인공지능 학습용 데이터"에 우리가 해당하는지**는 다투어 볼 여지가 있다.
  우리는 학습(fine-tuning)을 하지 않고 추론 입력으로만 쓴다. 다만 조항이 "등"으로 열어 두었고,
  robots.txt의 AI 크롤러 차단 목록과 합쳐 읽으면 **디시의 의사는 명확히 부정적이다.**

---

### 2-4. 남은 리스크

#### 민사

| 항목 | 우리 상태 | 남는 위험 |
|---|---|---|
| 원문 재게시 | **안 한다.** 외부 미공개 | 낮음 |
| 원문 DB 대체 | **안 한다.** 모든 인용에 원문 링크 병기 | 낮음 |
| 전수 수집 | **안 한다.** 자사 서비스 언급 키워드로만 검색 | 낮음 |
| 본문 저장 | **발췌만.** 코드 상한 800자, 실측 평균 92자·최대 227자(729건 기준) | 🟡 "인용의 정당한 범위" 판단은 법무 몫 |
| 약관 제14조 ② | VOC 모니터링이 "영리목적 이용"인지 | 🟠 **미확정** |
| 약관 제16조 ① | 사전 서면 동의 없음 | 🟠 **미확정.** 계약 위반 주장의 근거가 될 수 있다 |

- 참고 판례(상세는 [적법성 문서 2절](../data-collection-compliance.md#국내-판례가-그은-선)):
  형사는 **대법원 2022. 5. 12. 선고 2021도1533** 무죄, 민사는 같은 사건에서 **10억원 배상**.
  **형사 무죄가 민사 면책이 아니다.**
- **차단당했을 때 뚫으면 성격이 바뀐다.** 잡코리아 사건에서 IP 차단 우회가 불리하게 작용했다.
  그래서 [4-7-2](#4-7-2-http-상태-확인-우선순위-2)의 상태 코드 확인이 준수 조치인 동시에 **자기 방어**다.
  지금은 403을 받아도 우회하지 않지만, **403을 받았다는 사실 자체를 알지 못한다.**

#### 개인정보

| 항목 | 현재 | 판단 |
|---|---|---|
| 작성자 닉네임 | **저장하지 않는다.** 검색 결과 목록에 닉네임이 없다 | 🟢 다른 소스보다 낫다 |
| `author` 필드 | **갤러리명**이 들어간다 (예: 취미·장르 갤러리 이름). 실측 729건 중 171건은 비어 있다 | 🟢 개인 식별자가 아니다 |
| 유동닉 IP 일부 | 수집하지 않는다 | 🟢 |
| 본문 속 제3자 정보 | **가능성 있음.** 발췌 본문에 제3자 언급이 섞일 수 있다 | 🟡 최소화 외에 통제 수단 없음 |
| 보관 기간 | **무기한.** 삭제 로직이 없다 | 🟠 보유기간 정책 필요 ([적법성 문서 6절](../data-collection-compliance.md#6-개인정보-측면)) |
| LLM 전송 | 분류를 위해 본문이 외부 LLM에 전달된다 | 🟠 데이터 처리 조건 확인 필요 |

---

### 2-5. 재확인 방법

**6개월마다, 그리고 수집이 갑자기 0건이 될 때** 아래를 돌리고 이 절의 인용문과 실측일을 갱신한다.

```bash
for u in https://search.dcinside.com/robots.txt https://gall.dcinside.com/robots.txt https://www.dcinside.com/robots.txt; do
  echo "=== $u ==="
  curl -s -m 20 -w "\n[HTTP %{http_code}] [CT %{content_type}]\n" -A "Mozilla/5.0" "$u"
done
# 약관은 푸터 링크로만 도달한다. 링크 자체가 바뀌었는지부터 본다
curl -s -m 20 -A "Mozilla/5.0" https://www.dcinside.com/ | grep -oE '<a[^>]+href="[^"]*"[^>]*>이용약관</a>'
curl -s -m 20 -A "Mozilla/5.0" https://nstatic.dcinside.com/dc/w/policy/policy_index.html | grep -c "크롤링"
```

**확인 순서:**

1. `search` 호스트가 여전히 404인가 (200으로 바뀌었으면 내용을 즉시 본다)
2. `gall`의 `User-agent: *` 그룹이 여전히 `Allow: /`인가
3. **갤러리 단위·개별 게시물 Disallow 목록이 늘었는가** → 늘었으면 [4-7-1](#4-7-1-차단-갤러리-필터-우선순위-1)의 상수를 갱신한다
4. `Crawl-delay`가 새로 생겼는가
5. 약관 **시행일자**가 2026년 07월 21일에서 바뀌었는가, 제16조 문구가 바뀌었는가

---

## 3. 비용

**공식 API가 없으므로 "API 호출료"라는 항목 자체가 존재하지 않는다. 그렇다고 공짜가 아니다.**
상세·다른 경로와의 비교는 [공식 API 비용](../api-costs.md).

> ⚠️ **[api-costs.md](../api-costs.md)의 경로별 가격표(1절)와 금액 원문(2절)에 디시 항목은 없다.**
> 가격 페이지도, 개발자 포털도 존재하지 않아 **인용할 공식 금액 문장이 없다.** 아래 인용은 외부 공식 문서가 아니라 이 저장소 문서다.

이 저장소 문서 [api-costs.md](../api-costs.md) 0절 원문:

> 지금 이 순간의 실제 API 지출은 0원이다. 켜져 있는 것이 디시(공식 API 없음)와 네이버(무료)뿐이다.

### 3-1. 돈으로 나가는 것

| 항목 | 금액 | 근거 |
|---|---|---|
| 호출료 | **0원.** 과금 주체가 없다 | 공식 API 부재 → [6절](#6-출처) |
| 계정·키 발급비 | **0원.** 계정도 키도 승인 절차도 없다 | [4-1](#4-1-사전-준비-사람이-해야-하는-것) |
| 사전 서면 동의(제16조 ①) 신청 비용 | ⚠️ **확인 필요.** 유상인지 무상인지 공표된 것이 없고, 신청 창구도 확인하지 못했다 | [2-2](#2-2-이용약관--크롤링-금지-조항이-있다-신규-발견) |
| 수집한 글의 LLM 분류 비용 | ⚠️ **확인 필요.** `api-costs.md`는 **수집 API 가격만** 다루며 분류 LLM 단가는 그 문서 범위 밖이다 | — |
| Chromium을 상시 돌릴 실행 환경 요금 | ⚠️ **확인 필요.** 산정한 적이 없다 | [4-1](#4-1-사전-준비-사람이-해야-하는-것) |

**추측하지 않는다.** 위 세 개의 ⚠️는 "0원"이 아니라 "모른다"는 뜻이다.

### 3-2. 무료의 대가 — 쿼터가 **없다는 것**이 제약이다

**사이트가 정한 한도가 하나도 없다.** 아래 숫자는 전부 **우리 코드가 스스로 건 상한**이다([4-5](#4-5-상한쿼터페이지네이션)).

| 항목 | 값 | 누가 정했나 |
|---|---|---|
| `Crawl-delay` | **없다** (세 호스트 모두) | 사이트가 정하지 않음 → [2-1](#2-1-robotstxt-실측-2026-08-29) |
| 일일 누적 상한 | **없다** | 사이트가 정하지 않음 |
| 페이지당 결과 | **25건** (실측) | 사이트 |
| 키워드당 최대 페이지 | **20** (`MAX_PAGES`) | 우리 코드 |
| 키워드당 수집 상한 | 기본 **50건**, 범위 10~200 | 우리 설정 |
| 배포판(Vercel) 기본값 | **10건** | 우리 설정 |
| 이론상 키워드당 최대 | 20 × 25 = **500건** | 우리 코드 |
| 사이트 쪽 페이지 상한 | 실측 키워드에서 마지막 페이징 링크 `p/120` (≈ **3,000건**) | 사이트 (키워드마다 다름) |
| 요청 간격 | **고정 3.000초** — 유일한 브레이크 | 우리 코드 → [4-7-3](#4-7-3-요청-간격-정비-우선순위-3) |

> 🟠 **쿼터가 없다는 것은 마음껏 써도 된다는 뜻이 아니다.** 429·503을 받아도
> 지금 코드는 상태 코드를 한 줄도 읽지 않는다([4-6](#4-6-함정) 함정 1).
> **한도를 넘었는지 알려 줄 계기판이 사이트 쪽에도 우리 쪽에도 없다.**

### 3-3. 돈 대신 내는 것

**이 소스의 실제 비용은 전부 여기에 있다.**

| 항목 | 무엇이 드는가 | 크기 |
|---|---|---|
| **브라우저 구동 자원** | Chromium 프로세스를 띄워야 한다(`npx playwright install chromium`). **Vercel 함수에는 Chromium이 없어 배포판에서 강제로 꺼진다** — 이 소스를 살리려면 로컬 또는 별도 서버 실행이 전제다 | [1절](#1-현황) · [4-6](#4-6-함정) 함정 10. 단, [4-3](#4-3-엔드포인트와-요청) 실측상 **`curl` 한 번으로 25건이 다 오므로 이 비용은 없앨 수 있다** |
| **차단 리스크** | 403·429를 받아도 "글이 없음"과 구별되지 않아 **조용히 0건으로 끝난다.** 막힌 사실을 사람이 모른다 | 🔴 실물 사례 있음 — **8일간 신규 저장 0건**, 원인 미상 → [5-4](#5-4-지금-상태에-대한-실측-메모) |
| **법적 리스크** | 약관 제16조 ①이 사전 서면 동의 없는 크롤링을 명시적으로 금지한다. 참고 판례는 형사 무죄(대법원 2022. 5. 12. 선고 2021도1533)이나 **민사는 같은 사건에서 10억원 배상** | 🟠 **이 소스에서 가장 큰 비용 항목은 금액이 아니라 이것이다** → [2-3](#2-3-판정과-근거) · [2-4](#2-4-남은-리스크) |
| **사람 손 유지보수** | ① **DOM 셀렉터에만 의존** — 사이트가 개편되면 폴백이 조용히 켜지고 품질만 떨어진다 ② robots.txt 차단 목록(갤러리 15개·게시물 29개)을 **손으로 상수에 반영·갱신** ③ **6개월마다** robots.txt와 약관 재확인 | [4-6](#4-6-함정) 함정 3·4 · [4-7-1](#4-7-1-차단-갤러리-필터-우선순위-1) · [2-5](#2-5-재확인-방법) |
| **법무·승인 절차** | 제16조 대응은 **(A)** 사전 서면 동의 요청 또는 **(B)** 브라우즈랩 약관 구속력에 대한 법무 판단 중 하나다. **어느 쪽도 개발이 단독으로 끝낼 수 없다** — 사람의 시간과 결재가 비용이다 | [4-1](#4-1-사전-준비-사람이-해야-하는-것) |

> **무료라는 것이 써도 된다는 뜻이 아니다.** 이 소스는 **돈이 0원이면서 동시에 약관상 금지 조항에 걸려 있다.**
> 비용 절에서 이것을 빼면 판단을 그르친다.

### 3-4. 눈에 잘 안 보이는 낭비

| 항목 | 실측 | 의미 |
|---|---|---|
| 무관 판정 비율 | 30일 530건 중 **438건(83%)** | 분류 호출의 83%가 버려진다. **이 소스의 정상 상태이므로 줄이려면 키워드를 손봐야 한다** → [5-2](#5-2-데이터가-쌓인-뒤-며칠한-달) |
| 사이드바 위젯 오염 | 앵커 단위로 훑으면 한 페이지 링크 81개 중 **56개(69%)가 위젯** | `li` 단위로 파싱하지 않으면 분류 호출이 3배 이상 낭비된다 → [4-3](#4-3-엔드포인트와-요청) |

### 3-5. 다른 경로와 비교하면

[api-costs.md](../api-costs.md)의 결론은 **정기 지출이 생기는 곳은 X 하나뿐(월 $1~27)** 이고 나머지는 호출료 0원이라는 것이다.
같은 문서 6절은 이렇게 맺는다.

> **결론: 공식 API 전환을 막는 것은 비용이 아니라 절차다.**

**디시는 그 문장의 극단 사례다.** 갈아탈 공식 API가 아예 없어 **절차와 리스크만 남는다.**

---

## 4. 연동 방법

**이 소스에는 공식 API가 없다. 아래는 API 연동법이 아니라 "직접 파싱을 적법하게 유지하는 법"이다.**

### 4-1. 사전 준비 (사람이 해야 하는 것)

**계정도, 키도, 승인 절차도 없다.** 이 소스에서 사람이 해야 할 일은 세 가지뿐이다.

| # | 할 일 | 누가 | 비고 |
|---|---|---|---|
| 1 | **Chromium 계열 브라우저 확보** | 개발자 | [browser.ts](../../apps/pipeline/src/browser.ts)가 `msedge` → `chrome` → 번들 순으로 시도한다. 서버에서는 `npx playwright install chromium` |
| 2 | **검색 키워드 확정** | 기획/운영 | 설정의 서비스별 `keywords`. 동음이의어가 많은 키워드는 무관 판정 비율을 크게 올린다 ([5절](#5-붙인-뒤-확인할-것)) |
| 3 | **소스 켜기** | 운영 | `settings` 표 `config.sources.dcinside = true` |

> ❌ **하면 안 되는 것**: 계정을 만들어 로그인 세션으로 긁는 것. 그 순간 층위 3(기술적 보호조치)에 걸리고,
> 지금 이 소스가 가진 가장 강한 방어 논거(비로그인 공개 페이지)를 스스로 버리게 된다.

> 🟠 **법무 절차를 함께 걸어야 한다.** [2-2](#2-2-이용약관--크롤링-금지-조항이-있다-신규-발견)의 제16조 때문이다.
> 선택지는 두 가지다. **(A)** 사전 서면 동의를 요청한다 — 조항이 명시적으로 그 경로를 열어 두었다.
> **(B)** 브라우즈랩 약관의 구속력에 대한 법무 판단을 받는다. 어느 쪽도 개발이 단독으로 끝낼 수 없다.

### 4-2. 인증

**없다. 비로그인이다.**

| 항목 | 값 | 출처 |
|---|---|---|
| 쿠키/세션 | **싣지 않는다** | [dcinside.ts:131](../../apps/pipeline/src/collectors/dcinside.ts) — `newPage(browser)`, 두 번째 인자 없음 |
| User-Agent | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36` | [browser.ts:3-4](../../apps/pipeline/src/browser.ts) |
| Locale | `ko-KR` | [browser.ts:24](../../apps/pipeline/src/browser.ts) |
| Viewport | 1280 × 900 | [browser.ts:25](../../apps/pipeline/src/browser.ts) |
| 토큰 수명·갱신 | **해당 없음** | — |

> 🟡 **UA는 실제 브라우저를 그대로 흉내 낸다.** 신원을 밝히지 않는다.
> [적법성 문서 7-3](../data-collection-compliance.md#7-3-user-agent에-신원을-밝힌다)은 식별자를 덧붙일 것을 제안한다
> (예: 기존 UA 뒤에 ` FeedbackRadar/1.0 (+연락처)`). **디시가 UA로 화면을 분기한다는 근거는 확인하지 못했으므로,
> 붙여 보고 결과 건수가 유지되는지 실측한 뒤 결정할 것.** ⚠️ 미실측.

### 4-3. 엔드포인트와 요청

| 항목 | 값 |
|---|---|
| **URL (코드가 쓰는 형태)** | `https://search.dcinside.com/post/q/{keyword}/p/{page}` |
| URL (사이트 자체 페이징 링크 형태) | `https://search.dcinside.com/post/p/{page}/q/{keyword}` |
| 메서드 | GET |
| `{keyword}` | `encodeURIComponent(kw)`. 한글은 퍼센트 인코딩된다 |
| `{page}` | 1부터. 1페이지도 `/p/1`을 붙인다 |
| 쿼리 파라미터 | **없다.** 정렬·기간 파라미터를 지정하지 않는다 |
| 응답 | **서버 렌더링 HTML.** JS 없이도 결과 25건이 그대로 들어 있다 |

**실측(2026-08-29, 키워드 `웹툰`):**

| 요청 | HTTP | 크기 | 결과 수 | 첫 글 시각 |
|---|---|---|---|---|
| `/post/q/웹툰/p/1` | 200 | 62,160 B | 25 | 2026.08.29 23:00 |
| `/post/q/웹툰/p/2` | 200 | — | 25 | 2026.08.29 22:36 |

- **페이지 이동이 실제로 먹는다.** p/2의 시각이 p/1보다 뒤(과거)다.
- **최신순으로 보인다.** 다만 정렬 파라미터를 명시하지 않으므로, 사이트 기본 정렬이 바뀌면 조용히 성격이 바뀐다.
  ⚠️ **기본 정렬이 "최신순"이라고 문서화된 근거는 확인하지 못했다.** 위는 관측이지 명세가 아니다.
- **`/combine/`(통합검색)은 쓰면 안 된다.** `/p/2`를 붙여도 1페이지와 같은 20건을 준다
  (근거: [dcinside.ts:8-11](../../apps/pipeline/src/collectors/dcinside.ts)의 2026-08 실측 주석. 이번에 재실측하지는 않았다).

#### 예시 요청

```bash
curl -s \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" \
  "https://search.dcinside.com/post/q/$(python -c 'import urllib.parse;print(urllib.parse.quote("웹툰"))')/p/1"
```

#### 파싱 대상 (2026-08 실측 구조)

**결과는 `.sch_result ul.sch_result_list > li` 안에만 있다.**

```html
<li>
  <a class="tit_txt" href="…/view/?id=<갤러리>&no=<번호>">제목</a>
  <p class="link_dsc_txt">본문 요약</p>
  <p class="link_dsc_txt dsc_sub">
    <a class="sub_txt">&lt;갤러리명&gt; 갤러리</a>
    <span class="date_time">2026.08.04 13:38</span>
  </p>
</li>
```

> ⚠️ **페이지를 앵커 단위로 통째로 훑으면 안 된다.** 우측 `section.right_content`의 실시간베스트(`id=dcbest`)·추천글 위젯이 함께 걸린다.
> **2026-08-29 실측: 한 페이지의 `gall.dcinside.com/...no=` 링크 81개 중 검색 결과는 25개뿐이고, 나머지 56개(69%)가 위젯이다.**
> 그 글들은 검색어와 무관해 LLM이 전부 '무관'으로 걸러내므로 분류 호출만 낭비된다.

#### Playwright가 꼭 필요한가

**아니다.** 위 실측에서 **평범한 `curl` 한 번에 결과 25건이 전부 HTML로 왔다.** JS 실행이 필요 없다.

| | Playwright (현행) | fetch + HTML 파서 |
|---|---|---|
| 결과 획득 | 됨 | **됨 (실측 확인)** |
| HTTP 상태 확인 | `page.goto()`의 반환값을 써야 함 (**지금 안 쓴다**) | `res.status`로 자명 |
| 비용 | Chromium 기동, 배포판에서 사용 불가 | 없음. **배포판에서도 돈다** |
| 리스크 | — | 브라우저가 아닌 요청을 사이트가 다르게 취급할 수 있음 ⚠️ **반복 요청 시 차단·레이트리밋 여부는 미실측** |

**지금 이걸 바꾸라는 뜻은 아니다.** 다만 **재구현하는 사람은 브라우저 없이 시작해도 된다**는 사실과,
그 경우 [4-7-2](#4-7-2-http-상태-확인-우선순위-2)가 저절로 해결된다는 점은 알고 시작해야 한다.

### 4-4. 응답 → RawItem 매핑

`RawItem` 정의는 [types.ts](../../packages/core/src/types.ts) 참고.

| RawItem 필드 | 이 소스의 값 | 비고 |
|---|---|---|
| `source` | `'dcinside'` 고정 | — |
| `sourceId` | `a.tit_txt`의 `href` (절대 URL) | 예: `https://gall.dcinside.com/mgallery/board/view/?id=<갤러리>&no=<번호>`. 저장 시 `ON CONFLICT (source, source_id) DO NOTHING`으로 중복 제거 ([store.ts:236](../../packages/core/src/store.ts)) |
| `url` | `sourceId`와 **같은 값** | 원문 링크 병기의 근거. 비워선 안 된다 |
| `author` | **갤러리명** (`a.sub_txt` 텍스트에서 `갤러리` 접미사 제거) | ⚠️ **작성자가 아니다.** 실측 729건 중 171건은 비어 있다(폴백 경로·구조 이탈). **작성자 닉네임은 못 채운다** — 검색 결과 목록에 없다 |
| `content` | `제목 + '\n' + 본문요약`, **800자 절단** | 실측 평균 92자, 최대 227자 → **800자 상한에 닿은 행은 0건**. 상한은 사실상 놀고 있다 |
| `rating` | **못 채운다** | 앱 리뷰 전용 필드. 커뮤니티에는 별점 개념이 없다 |
| `postedAt` | `span.date_time` (`YYYY.MM.DD HH:MM`) → `fromDottedDateTime()` → 로컬 오프셋 ISO | [time.ts:84](../../packages/core/src/time.ts). **분 단위까지 있다.** 실측 729건 중 날짜 없는 행 0건 |
| `keyword` | 루프의 검색 키워드 | 그대로 |
| `service` | 호출부가 넘긴 서비스명 (`svc.name`) | [daily.ts:372](../../apps/pipeline/src/daily.ts) |
| `country` | **채우지 않는다** | 커뮤니티에는 스토어 국가 개념이 없다. `types.ts`가 그렇게 규정한다 |

**본문(`content`)을 만들 때 갤러리명과 날짜를 섞지 말 것.** `li.textContent`를 통째로 쓰면 둘이 본문에 들어가
분류 품질이 떨어진다. 반대로 정규식으로 날짜만 뽑으면 **시각을 버리게 되고**, 그러면 같은 날짜 안에서
수집 순서로 정렬돼 한 소스가 목록 상단을 점거한다.

### 4-5. 상한·쿼터·페이지네이션

**공식 쿼터가 없다.** 상한은 전부 우리 코드가 정한 것이다.

| 항목 | 값 | 위치 |
|---|---|---|
| 페이지당 결과 | **25건** (실측 확인) | `PER_PAGE` — [dcinside.ts:39](../../apps/pipeline/src/collectors/dcinside.ts) |
| 키워드당 최대 페이지 | **20** | `MAX_PAGES` — [dcinside.ts:44](../../apps/pipeline/src/collectors/dcinside.ts) |
| 키워드당 수집 상한 | 기본 **50건**, 범위 10~200 | `dcinsidePosts` — [collect-limits.ts:111](../../packages/core/src/collect-limits.ts) |
| 배포판(Vercel) 기본값 | **10건** | [collect-limits.ts:148](../../packages/core/src/collect-limits.ts) |
| 이론상 키워드당 최대 | 20 × 25 = **500건** | `MAX_PAGES`가 먼저 걸린다 |
| 사이트 쪽 페이지 상한 | 실측 키워드에서 마지막 페이징 링크가 `p/120` (≈3,000건) | 키워드마다 다르다 |
| `Crawl-delay` | **없다** (세 호스트 모두) | [2-1](#2-1-robotstxt-실측-2026-08-29) |
| 일일 누적 상한 | **없다** | 회당 상한만 있다 |

#### 페이지 넘기는 방법

```
p = 1
while p <= MAX_PAGES and collected < limit:
    URL = https://search.dcinside.com/post/q/{kw}/p/{p}
    posts = 파싱(URL)
    if posts.length == 0: break          # 결과 없음
    fresh = posts 중 이 키워드에서 아직 못 본 href
    if fresh.length == 0: break          # 페이지 이동이 안 먹는다
    저장(fresh, limit까지)
    p += 1
```

- **중복 제거는 두 겹이다.** `evaluate` 안의 `Set`은 **한 페이지 안**만 본다.
  키워드 단위 `seenHrefs`가 페이지를 가로질러 본다 ([dcinside.ts:137](../../apps/pipeline/src/collectors/dcinside.ts)).
- **`fresh.length === 0`이면 즉시 끊는다.** 통합검색이 그랬듯 페이지 이동이 안 먹는 상황을 무한 루프로 만들지 않기 위해서다.

### 4-6. 함정

**전부 "에러 없이 조용히 틀리는" 종류다.**

| # | 함정 | 증상 | 방어 |
|---|---|---|---|
| **1** | **HTTP 상태를 아무도 안 본다** | 403·429·503을 받아도 `posts.length === 0` → `break` → **정상 종료.** "차단당한 것"과 "글이 없는 것"이 구별되지 않는다 | [4-7-2](#4-7-2-http-상태-확인-우선순위-2) — **이 소스 최대의 구멍** |
| **2** | **`page.evaluate` 안에서 함수를 선언하면 수집이 통째로 죽는다** | `__name is not defined` | tsx(esbuild)가 이름 보존용 `__name` 호출을 끼워 넣는데 브라우저에 그 헬퍼가 없다. **판정은 조건을 그 자리에 풀어 쓴다** ([dcinside.ts:64-67](../../apps/pipeline/src/collectors/dcinside.ts)) |
| **3** | **DOM이 바뀌면 폴백이 조용히 켜진다** | 결과 수는 나오는데 사이드바 위젯이 섞여 들어와 무관 판정이 폭증 | 폴백 사용 시 `console.warn`이 뜬다 ([dcinside.ts:178-182](../../apps/pipeline/src/collectors/dcinside.ts)). **로그를 안 보면 모른다.** 화면 `CollectTask.note`로 올리는 편이 낫다 |
| **4** | **폴백 경로는 `author`와 본문 품질을 잃는다** | `gallery: ''` → `author` 없음, 본문이 `li.textContent` 500자(갤러리명·날짜 오염) | 실측 729건 중 `author` 없는 171건이 이 흔적일 가능성 |
| **5** | **`tit_txt`와 `sub_txt`의 href가 같다** | 앵커 기준으로 모으면 같은 글을 두 번 만난다 | `li` 단위로 순회하고 `tit_txt`만 본다 |
| **6** | **`fromDottedDateTime`은 실행 머신의 로컬 타임존을 쓴다** | 디시 시각은 KST인데, KST가 아닌 머신에서 돌리면 `postedAt`이 통째로 어긋난다. **오류는 안 난다** | [time.ts:84-91](../../packages/core/src/time.ts). ⚠️ 비-KST 환경 실측 미확인 |
| **7** | **도배 제거가 원문을 지울 수 있다** | 같은 본문 3건 이상이면 첫 건만 남긴다 ([dedupe.ts:46](../../packages/core/src/dedupe.ts)) | 크로스포스팅 대응이라 의도된 동작이지만, **여러 갤러리의 반응 강도를 세는 용도로는 쓰면 안 된다** |
| **8** | **`MAX_PAGES`가 `limit`보다 먼저 걸린다** | 상한을 200으로 올려도 500건에서 멈춘다. 경고가 없다 | 상한을 올릴 때 `MAX_PAGES`를 함께 본다 |
| **9** | **정렬 파라미터를 지정하지 않는다** | 사이트 기본 정렬이 관련도순으로 바뀌면 과거 글이 섞여 들어오고, 최근 이슈 감지가 늦어진다. **오류는 안 난다** | ⚠️ 기본 정렬 명세 미확인 → [4-3](#4-3-엔드포인트와-요청) |
| **10** | **배포판에서는 이 소스가 강제로 꺼진다** | 화면에 0건인데 원인은 "글이 없어서"가 아니라 "Chromium이 없어서" | [daily.ts:163](../../apps/pipeline/src/daily.ts). 로컬/서버 실행에서만 돈다 |

---

### 4-7. 반드시 추가해야 할 준수 조치

**세 건 모두 자격증명도 외부 승인도 필요 없다. [전환 계획 4절](../official-api-migration.md#4-교체-불가로-남는-구간--코드로-할-수-있는-완화-조치)이
"공식 API 교체 어느 것보다도 투입 대비 효과가 크다"고 판정한 항목이다.**

#### 4-7-1. 차단 갤러리 필터 (우선순위 1)

**무엇**: `gall.dcinside.com/robots.txt`가 Disallow한 갤러리·게시물이 검색 결과에 섞여 들어오면 그대로 저장된다.
지금은 거르는 코드가 없다.

**어디에**: [dcinside.ts](../../apps/pipeline/src/collectors/dcinside.ts) `collectDcinside`의
`for (const post of fresh)` 루프(**현재 152~170행**), `seenHrefs.add(post.href)` 직후 `continue`한다.

> **`page.evaluate` 안에 넣지 말 것.** 함수 선언이 금지된 구역이고([4-6](#4-6-함정) 함정 2),
> 밖에서 거르면 **몇 건을 걸렀는지 세어 로그로 남길 수 있다.** 조용히 사라지면 안 된다.

**어떻게**: 상수를 모듈 상단(현재 `MAX_PAGES` 아래, 44행 부근)에 둔다.

```ts
/**
 * gall.dcinside.com/robots.txt가 Disallow한 대상 (2026-08-29 실측).
 * robots.txt가 바뀌면 여기도 바꾼다 → docs/sources/dcinside.md 2-5절
 */
const BLOCKED_MAIN_VIEW = new Set([
  '47', 'cat', 'dog', 'stock_new', 'stock_new2', 'baseball_new8',
  'm_entertainer1', 'ib_new', 'd_fighter_new1', 'produce48',
  'sportsseoul', 'metakr', 'salgoonews',
]);
// 개별 게시물 차단. URL 형태가 우리가 저장하는 것과 정확히 같아 문자열 비교로 끝난다
const BLOCKED_POSTS = new Set([
  'hajungwoo:12995', 'hajungwoo:14441', 'hajungwoo:14508', 'hajungwoo:14977',
  'dongbang:43265', 'dongbang:48008',
  'arbeit:1781137', 'arbeit:1854264', 'arbeit:1902701',
  'immovables:827440', 'immovables:1045608',
  'government:3795641', 'government:3795657', 'government:3795663',
  'government:3795664', 'government:3795665', 'government:3795671',
  'starcraft:5179138', 'comedy_new:3182480', 'plastic_s:118703',
  'aion:231406', 'aoa:455310', 'kimmyungmin:57241',
  'etc_entertainment1:1462322', 'bigbang:107916', 'exam_new:3441270',
  'theaterM:1062240', 'admission:1591805',
]);
```

**판정 규칙 — 경로와 id를 함께 본다.**

| 우리가 저장하는 URL 형태 | 실측 분포(729건) | 판정 |
|---|---|---|
| `/board/view/?id=X&no=N` (본 갤러리) | 114건 | `X ∈ BLOCKED_MAIN_VIEW`면 제외. `X:N ∈ BLOCKED_POSTS`면 제외 |
| `/mgallery/board/view/?id=X&no=N` (마이너 갤러리) | **525건** | robots.txt의 마이너 갤러리 차단은 `rezero`의 **`lists`뿐**이다. **`view`는 하나도 차단돼 있지 않다** |
| `/mini/board/view/?id=X&no=N` (미니 갤러리) | 90건 | 차단 목록에 없다 |

> ⚠️ **`singo`와 `rezero`는 `lists`만 차단돼 있고 `view`는 차단 목록에 없다.**
> 위 `BLOCKED_MAIN_VIEW`에 둘을 넣지 않은 이유다. **더 보수적으로 빼고 싶다면 넣어도 되지만,
> 그건 "robots.txt 준수"가 아니라 "우리 재량"이므로 주석으로 구분해 적을 것.**

**실측 결과**: 저장된 729건에 위 차단 대상은 **0건**이었다.
**지금 문제가 없다는 뜻이지, 앞으로도 안 걸린다는 뜻이 아니다.** 검색 결과는 키워드에 따라 달라지고,
차단 목록은 디시가 언제든 늘린다. **비용이 거의 0인 예방 조치라 지금 넣는 것이 맞다.**

#### 4-7-2. HTTP 상태 확인 (우선순위 2)

**무엇**: 지금 이 수집기에 **상태 코드를 보는 코드가 한 줄도 없다.**
403·429를 받아도 결과가 0건이 되고 그대로 정상 종료한다. **막힌 것과 글이 없는 것을 구별하지 못한다.**
준수 조치인 동시에 기능 결함이다.

**어디에 — 3단계로 이어져야 한다.**

| 단계 | 파일·위치 | 변경 |
|---|---|---|
| 1 | [dcinside.ts:61](../../apps/pipeline/src/collectors/dcinside.ts) `scrapePage` | `await page.goto(...)` → `const res = await page.goto(...)`. `res?.status()`를 읽는다 |
| 2 | [dcinside.ts:54-57](../../apps/pipeline/src/collectors/dcinside.ts) `PageResult` | `status?: number`를 추가해 밖으로 들고 나온다 |
| 3 | [dcinside.ts:141-143](../../apps/pipeline/src/collectors/dcinside.ts) 페이지 루프 | 200이 아니면 **그 키워드를 즉시 중단**하고 사유를 기록. 다음 키워드로 넘어가되 사유를 누적 |

**화면까지 올리는 방법**: `collectDcinside`가 지금은 `RawItem[]`만 돌려준다.
**이미 있는 선례를 그대로 따르면 된다** — [x-web.ts](../../apps/pipeline/src/collectors/x-web.ts)는
`{ items, blocked, note }`를 돌려주고, [daily.ts:389-398](../../apps/pipeline/src/daily.ts)이 그 `note`를
`CollectTask.note`([types.ts:346](../../packages/core/src/types.ts))에 실어 화면에 띄운다.
**`note`는 "왜 0건인지를 화면에서 알 수 있어야 한다"는 목적으로 이미 존재하는 필드다.**

**함께 넣을 것 — 429/503 백오프.**

| 상태 | 의미 | 대응 |
|---|---|---|
| 200 | 정상 | 계속 |
| **403** | **거부 의사** | **그 키워드 중단. 재시도하지 않는다.** 우회는 절대 하지 않는다 → [2-4 민사](#민사) |
| **429 / 503** | 속도 초과 | 1회 백오프 후 재시도, 또 나오면 중단하고 `note` 기록 |
| 5xx 기타 | 서버 오류 | 중단, `note` 기록 |

> ❌ **403을 받고 UA를 바꾸거나 IP를 돌려 다시 시도하는 코드는 넣지 않는다.**
> 잡코리아 사건에서 차단 우회가 불리하게 작용했다. **차단은 존중하고, 대신 사람이 알아채게 만든다.**

#### 4-7-3. 요청 간격 정비 (우선순위 3)

**무엇**: 지금은 페이지마다 **고정 3초**가 전부다.
무작위 간격도 없고, 키워드를 넘어갈 때 추가로 쉬지도 않는다. 고정 간격은 자동화 티가 가장 잘 나는 패턴이다.

**현재 상태**:

| 위치 | 코드 | 문제 |
|---|---|---|
| [dcinside.ts:62](../../apps/pipeline/src/collectors/dcinside.ts) | `await page.waitForTimeout(3_000);` | **정확히 3.000초 고정** |
| [dcinside.ts:141-171](../../apps/pipeline/src/collectors/dcinside.ts) 키워드 루프 | 없음 | 키워드 전환 시 쉬지 않는다 |

**어떻게 — 이미 있는 것을 옮겨 온다.**
[theqoo.ts:44-47](../../apps/pipeline/src/collectors/theqoo.ts)에 `pause(minMs, maxMs)`가 **이미 `export`돼 있다.**

```ts
export function pause(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() ** 1.8 * (maxMs - minMs);
  return new Promise((r) => setTimeout(r, ms));
}
```

지수를 준 난수라 **짧은 쪽에 몰리면서도 가끔 길게 쉰다.** 균등 난수보다 자연스럽다
(설계 의도는 [x-web.ts:73-91](../../apps/pipeline/src/collectors/x-web.ts) 주석에 있다).

| 넣을 자리 | 값 | 같은 자리의 선례 |
|---|---|---|
| [dcinside.ts:62](../../apps/pipeline/src/collectors/dcinside.ts) 페이지 대기 | `await pause(1_200, 3_000)` | [theqoo.ts:176](../../apps/pipeline/src/collectors/theqoo.ts) |
| [dcinside.ts:171](../../apps/pipeline/src/collectors/dcinside.ts) 키워드 루프 끝 | `await pause(2_500, 6_000)` | [theqoo.ts:194](../../apps/pipeline/src/collectors/theqoo.ts) |

> ⚠️ **62행의 3초 대기는 "예의"가 아니라 "렌더 대기"를 겸하고 있을 수 있다.**
> `waitUntil: 'domcontentloaded'` 뒤의 고정 대기이므로, 하한을 3초보다 낮추면 결과가 덜 잡힐 가능성이 있다.
> 다만 [4-3](#4-3-엔드포인트와-요청) 실측에서 **JS 없이도 결과 25건이 HTML에 다 들어 있었다** —
> 렌더 대기는 사실상 불필요할 가능성이 높다. **바꾼 뒤 [5절](#5-붙인-뒤-확인할-것)의 25건 기준으로 반드시 확인할 것.**

**두 파일이 공유한다면 `pause`를 `packages/core`나 파이프라인 공용 유틸로 옮기는 편이 낫다.**
수집기끼리 직접 import하면 더쿠를 지울 때 디시가 깨진다.

**`Crawl-delay`가 없다는 점을 기억할 것.** 사이트가 정한 간격이 없으므로 **우리 간격이 유일한 브레이크**다.

---

## 5. 붙인 뒤 확인할 것

### 5-1. 즉시 판별 (한 번 돌려보고 5분 안에)

| 확인 | 정상 | 비정상이면 |
|---|---|---|
| **한 페이지 결과 수** | **25건** | 25보다 훨씬 적으면 셀렉터가 어긋났거나 폴백이 켜졌다 |
| **키워드당 수집 건수** | 상한(기본 50) 또는 그 근처 → 페이지 2쪽 | 0건이면 [4-7-2](#4-7-2-http-상태-확인-우선순위-2)의 상태 코드부터 본다 |
| **폴백 경고** | **뜨지 않아야 한다** | `디시: 검색 결과 목록(.sch_result_list)을 못 찾아 …` 가 뜨면 DOM이 바뀐 것이다 |
| **`postedAt`** | **전 건 채워짐, 분 단위까지** (실측 729건 중 빈 값 0건) | 비면 `span.date_time`을 못 읽은 것 |
| **`url`** | 전 건 `gall.dcinside.com` + `no=` 포함 | — |
| **`author`** | 갤러리명. 일부 빈 값은 정상 | **전부 비어 있으면 폴백 경로다** |
| **`content` 길이** | 평균 90자 안팎, 최대 230자 안팎 | **평균이 400자를 넘으면 `li.textContent`를 통째로 담고 있다**(폴백) |

### 5-2. 데이터가 쌓인 뒤 (며칠~한 달)

**아래는 2026-08-29 DB 실측값이다. 재구현 결과가 이 근처면 정상이다.**

| 지표 | 실측 기준선 | 읽는 법 |
|---|---|---|
| 30일 수집(작성일 기준) | **530건** | 키워드 구성이 같을 때. 절반 이하면 무언가 막혔다 |
| 30일 부정 | **58건** | — |
| 30일 심각(high/critical) | **4건** | — |
| **30일 무관 판정** | **438건 (83%)** | **이 소스의 정상 상태다.** 동음이의어 노이즈가 원래 크다. 90%를 넘으면 키워드를 손봐야 한다 |
| 30일 관련 판정 | 92건 (부정 26, 심각 3) | 화면에 실제로 노출되는 양 |
| 경로 분포(전체 729건) | 마이너 **525** / 본 **114** / 미니 **90** | **마이너 갤러리가 72%다.** 본 갤러리만 상정한 필터는 대부분을 놓친다 |
| 저장 본문 | 평균 92자, 최대 227자, **800자 상한 도달 0건** | 상한을 800→400으로 낮춰도 지금은 손실이 없다 ([적법성 문서 7-4](../data-collection-compliance.md#7-4-저장-범위를-최소화한다)) |
| 작성일 없는 행 | **0건** | — |

### 5-3. 준수 조치가 실제로 도는지

| 조치 | 확인 방법 | 정상 |
|---|---|---|
| 차단 갤러리 필터 | 걸러낸 건수를 로그로 남긴다 | 대개 0건. **0건이라도 필터가 실행됐다는 로그는 나와야 한다** |
| HTTP 상태 확인 | 존재하지 않는 경로로 한 번 돌려본다 | 200이 아닌 응답에서 **`note`가 화면에 뜨고**, 그 키워드가 중단되어야 한다 |
| 요청 간격 | 로그 타임스탬프 간격 | **매번 정확히 3.0초면 안 바뀐 것이다.** 1.2~3.0초 사이에 흩어져야 한다 |

### 5-4. 지금 상태에 대한 실측 메모

⚠️ **`collected_at` 최댓값이 2026-08-21 10:52 (KST)다.** 오늘이 2026-08-29이므로 **8일간 새로 저장된 글이 0건**이다.
30일 530건(하루 약 18건) 페이스와 맞지 않는다. 다음 둘 중 하나인데, **지금 코드로는 구별할 방법이 없다.**

1. 스케줄러가 그동안 돌지 않았다
2. 돌았지만 막혔고(403 등), **[4-6](#4-6-함정) 함정 1 때문에 조용히 0건으로 끝났다**

**이것이 [4-7-2](#4-7-2-http-상태-확인-우선순위-2)가 필요한 이유의 실물 사례다.**
먼저 스케줄러 실행 이력을 확인하고, 이력이 있는데도 0건이면 즉시 상태 코드 확인을 넣어야 한다.

---

## 6. 출처

| 문서 | URL | 실측 |
|---|---|---|
| robots.txt (검색 호스트) | <https://search.dcinside.com/robots.txt> | 2026-08-29, **HTTP 404** |
| robots.txt (갤러리 호스트) | <https://gall.dcinside.com/robots.txt> | 2026-08-29, HTTP 200 |
| robots.txt (메인 호스트) | <https://www.dcinside.com/robots.txt> | 2026-08-29, HTTP 200 |
| **디시인사이드 이용약관** | <https://nstatic.dcinside.com/dc/w/policy/policy_index.html> | 2026-08-29, HTTP 200. 시행일자 2026-07-21 |
| 개인정보처리방침 | <https://nstatic.dcinside.com/dc/w/policy/policy_index.html> 상단 탭 | ⚠️ **본문 미검토** |
| 청소년보호정책 | <https://nstatic.dcinside.com/dc/w/policy/youth_policy.html> | ⚠️ **미검토** |
| RFC 9309 (Robots Exclusion Protocol) | <https://www.rfc-editor.org/rfc/rfc9309.html> | — |
| 저작권법 | <https://www.law.go.kr/법령/저작권법> | — |
| 개인정보보호법 | <https://www.law.go.kr/법령/개인정보보호법> | — |

**이 저장소 문서**

- [수집 채널 적법성 근거](../data-collection-compliance.md) — 판례, 판정 기준 4층위, 채널별 비교
- [공식 API 전환 계획](../official-api-migration.md) — 이 소스가 "교체 불가로 남는 구간"인 이유와 완화 조치 우선순위

**공식 API는 존재하지 않는다.** 개발자 포털·API 문서를 찾지 못했다.
⚠️ "없다"는 것은 **찾지 못했다는 뜻**이다. 비공개 제휴 경로가 있는지는 확인하지 못했다.

---

## 부록. 이 문서에서 확인하지 못한 것

**"확인한 척하지 않는다"는 원칙에 따라 남긴다.**

| # | 항목 | 왜 못 했나 |
|---|---|---|
| 1 | **브라우즈랩 약관(제16조)이 비회원에게 계약으로 구속력을 갖는지** | 법무 판단 영역 |
| 2 | **제16조 ②의 "인공지능 학습용 데이터"에 LLM 추론 입력이 포함되는지** | 조항이 "등"으로 열려 있어 문언만으로 확정 불가 |
| 3 | **제14조 ②의 "영리목적 이용"에 VOC 모니터링이 해당하는지** | 법무 판단 영역 |
| 4 | 검색 결과의 **기본 정렬 명세** | 관측상 최신순이나 문서화된 근거를 못 찾음 |
| 5 | **UA에 식별자를 덧붙여도 결과가 유지되는지** | 실측하지 않음 |
| 6 | **브라우저 아닌 요청(fetch)을 반복했을 때 차단·레이트리밋 여부** | 1회 요청만 해 봄 |
| 7 | **비-KST 타임존 머신에서 `postedAt`이 어긋나는지** | 실측 환경이 KST뿐 |
| 8 | `/combine/`(통합검색)의 페이지 이동 미작동 | 코드 주석의 2026-08 실측을 인용. 이번에 재실측하지 않음 |
| 9 | 개인정보처리방침·청소년보호정책 본문 | 이용약관만 검토 |
| 10 | 8일간 수집 0건의 원인 | [5-4](#5-4-지금-상태에-대한-실측-메모) |
