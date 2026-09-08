# 해외 피드백 수집 후보 조사

> 후속 결정: 실제 관련 피드백의 실익이 검증되지 않아 Mastodon 채택을 보류했다. 사용자 요청으로 임시 검색 화면·API·대시보드 링크·환경변수 예시·연결 안내·전용 테스트를 제거했다. 아래 조건부 후보 평가는 당시 정책 조사 기록이며 현재 연동 추천이나 구현 상태를 뜻하지 않는다.

확인일: 2026-09-08. 범위는 해외 SNS·커뮤니티·작품 리뷰이며 별도 심사용 공개 배포 없이 접근 가능한 공식 API를 우선한다. Threads는 이번 공모전 범위에서 제외한다. 문서 조사이며 실제 서비스 검색, 계정 생성, API 실호출, 수집기 활성화는 하지 않았다. 실제 서비스명과 작품명, 계정, 운영 통계는 기록하지 않는다.

## 결과

API 존재와 현재 프로젝트의 저장·외부 AI 분석 허용은 별도 판단이다. 국가별 독자 수나 피드백 수집량은 측정하지 않았으며, 아래 언어권은 검증 대상이지 이용자 분포를 입증한 결과가 아니다.

| 후보 | 기술적 접근 | 제약 및 판단 |
|---|---|---|
| Tumblr | 공식 `/v2/tagged`로 태그 게시물 조회, 앱 등록을 통한 API 키 필요 | 보류. 현재 공식 사이트의 API 약관에서 비공개 분석·검색에 대한 명시적 추가 허용은 Firehose에 부여된다. 일반 API의 누적 저장·외부 AI 분석 허용으로 확대 해석하지 않는다. 3일 보관 후 재조회와 재배포·데이터베이스 복제 제한도 있어 현재 수집기에 바로 추가하지 않는다. |
| Misskey.io | Misskey 공식 API를 사용하는 일본어권 서버 | 무허가 수집 후보에서 제외. 2026-05-12 약관이 개인 이용 범위를 넘는 데이터 수집을 금지하고 연 500건 이상 수집 시 사전 연락을 요구한다. 500건 미만을 사업 목적 수집 허가로 해석하지 않는다. 다른 Misskey 서버에 그대로 일반화하지 않는다. |
| Mastodon / mastodon.social | 공식 검색 API 및 사용자 토큰, 공개 배포 없이 가능한 인증 방식 | 세 후보 중 조건부 우선 후보. 현행 서버 약관·운영규칙·커뮤니티 기준에서 기업 키워드 API 조회를 일괄 금지하는 조항은 확인하지 못했다. 이는 장기 저장·외부 AI 전달에 대한 포괄 허가가 아니다. 검색은 서버의 색인과 작성자 설정에 제한된다. |
| AniList | 공식 API에 작품 정보·리뷰 객체가 있음 | 작품 평가 탐색 후보이나 사업자 서비스 불만과 작품 감상은 다르다. API 약관이 데이터 대량 수집·축적을 금지한다. 현재 누적 저장형 수집기로는 추천하지 않는다. 상업 라이선스 기준과 프로젝트 적용 여부도 확인해야 한다. |
| 하테나 북마크 | 공식 엔트리 JSON API로 특정 URL의 북마크 댓글 조회 | 일본어 링크 반응 후보. 전역 키워드 검색이 아니다. API 약관 제4조 1항 14호가 상업·홍보 목적의 별도 허가를 요구하고 제4조 3항 5호에 제3자 제공 제한도 있다. 허가 없는 사업 목적 모니터링·외부 LLM 전달용으로 채택하지 않는다. |
| LINE | 공식 계정에 수신한 메시지의 webhook | 일본·태국 대상의 직접 피드백 채널로는 별도 검토 가능하나 공개 SNS 검색 수집원이 아니고 webhook 수신 환경도 필요하다. 이번 무배포 검색 후보에서는 제외. |
| TikTok Research API | 공개 콘텐츠 연구 API | 공식 FAQ가 광고주·상업 이용자의 자격을 부정하며 연구 신청·승인도 필요하다. 이번 조건에서는 제외. |
| Plurk | 공식 API 문서 확인 시도 | 브라우저의 사이트 보안 정책으로 문서 접근이 차단됐다. 제3자 라이브러리를 공식 허용 근거로 대체하지 않았으며 현재 API·약관 판단은 유보한다. |

## 기존 채널의 해외 범위

- 현재 블루스카이 수집 코드는 검색 요청에 언어 제한을 넣지 않는다. 로컬 코드 확인 결과이며 실제 수집 성능을 재측정한 것은 아니다. 현지 서비스 표기·작품명·약칭을 승인된 비공개 설정에서 관리하는 방향을 검토할 수 있다.
- App Store Connect는 권한 있는 앱의 리뷰를 지역별로 조회할 수 있다. 앱 관리 권한 확보가 필요하다. 리뷰 지역은 거주 국가를 보증하지 않는다.
- 해외 출시 앱이 서로 다른 앱 식별자로 배포된다면 허가된 앱 목록을 확인해야 한다. 언어만으로 작성자의 국가를 확정하지 않는다.

## 근거

- Tumblr API: https://github.com/tumblr/docs/blob/master/api.md
- Tumblr API 약관: https://github.com/tumblr/policy/blob/master/api-license-agreement.txt
- Tumblr 현재 공식 사이트 API 약관: https://www.tumblr.com/docs/en/api_agreement
- Misskey.io 현재 서버 약관: https://support.misskey.io/ja/articles/14193143-利用規約
- Mastodon.social 현재 서버 약관: https://mastodon.social/terms-of-service
- Mastodon.social 서버 규칙: https://mastodon.social/about
- Mastodon.social / .online 커뮤니티 기준: https://help.joinmastodon.org/article/12-community-standards
- Mastodon 앱 등록 및 비배포 인증: https://docs.joinmastodon.org/client/token/
- Misskey API: https://misskey-hub.net/en/docs/for-developers/api/
- Misskey 토큰: https://misskey-hub.net/en/docs/for-developers/api/token/
- Misskey 검색: https://misskey-hub.net/en/docs/for-admin/features/search/
- Mastodon 검색: https://docs.joinmastodon.org/methods/search/
- Mastodon 검색 색인 설정: https://docs.joinmastodon.org/spec/activitypub/
- AniList 이용약관: https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use
- AniList 작품 객체: https://anilist.gitbook.io/anilist-apiv2-docs/docs/reference/object/media
- 하테나 댓글 API: https://developer.hatena.ne.jp/ja/documents/bookmark/apis/getinfo/
- 하테나 API 약관: https://developer.hatena.ne.jp/license/
- LINE 수신 메시지: https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- TikTok 연구 자격 FAQ: https://developers.tiktok.com/docs/en/research-api-faq
- Apple 리뷰: https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews

## 후속 확인 결과와 채택 판단

### Tumblr: 현재 구조에는 보류

공식 사이트가 현재 제공하는 API 약관의 표시 수정일은 2018-09-12이다. 제2.c의 비공개 분석·검색 추가 권한은 Firehose에 명시되어 있고 별도 계약이 적용될 수 있다. 일반 API에서 모든 분석이 불법이라는 결론은 아니지만, 이 조항을 무료 태그 API의 VOC 분석 허가로 사용할 수 없다. 제3.f 재배포 제한, 제3.l 데이터베이스 복제·재포장 제한, 제3.r 수정 제한을 함께 검토해야 한다. 제7.c는 콘텐츠 보관 후 3일을 넘기려면 재조회를 요구하고, 제7.b의 24시간은 변경 통지를 받은 경우의 반영 기한이다. AI 추론과 모델 학습을 동일시하지 않으며 외부 처리 허용을 확인한 것은 아니다.

개발자 페이지는 접근했지만 실제 앱 등록·키 발급은 수행하지 않았다. 따라서 현재 등록 심사나 공개 배포 요구가 없다고 확정하지 않는다. 등록이 가능하더라도 데이터 이용 범위가 해결되지 않아 즉시 채택할 후보는 아니다.

### Misskey.io: 사전 협의 없이는 제외

개별 서버의 명시적 데이터 수집 제한이 확인됐다. API가 공개되어 있다는 이유로 사업 목적 수집기를 가동하지 않는다. 사전 연락 요구가 곧 승인 보장을 의미하지도 않는다. 다른 일본어 서버까지 모두 금지라는 결론은 아니다.

### Mastodon.social: 제한된 조회 후보로 남김

2026-08-31 갱신 표시의 현행 약관, 펼쳐진 서버 규칙, 2026-02-26 갱신 커뮤니티 기준을 읽었다. 현행 문서에서는 일반적인 API 키워드 조회·기업 분석을 일괄 금지한다는 조항을 발견하지 못했다. 약관은 외부 RSS·검색엔진·데이터베이스를 통한 접근 가능성을 설명하지만, 이를 제3자 분석 사업자에게 주는 포괄 라이선스로 보지 않는다. 과거 초안이나 기사에 나온 스크래핑·AI 금지 표현을 현재 약관으로 인용하지 않는다.

공식 문서에 앱 등록 API와 수동 코드 전달 인증 방식이 있어 심사용 공개 웹사이트 배포가 기술적 전제는 아니다. 게시물 본문 검색에는 사용자 인증과 서버의 검색 백엔드가 필요하며 앱 토큰만으로 충분하다고 보지 않는다. 실제 서버 계정 생성·토큰 발급·검색 실행은 하지 않았으므로 현재 계정 승인 여부와 실제 검색량은 미검증이다.

추가한다면 먼저 검색 결과와 원문 링크를 확인하는 제한된 조회 기능을 후보로 삼는다. 장기 원문 보관·외부 AI 전송·사용자 프로파일링까지 한 번에 허용된 것으로 처리하지 않는다. 해당 서버가 보유한 연합 데이터만 검색되므로 전 세계 게시물 전수 수집이나 특정 국가 대표성은 보장되지 않는다.

이번 정책 조사의 결론은 Mastodon.social의 제한된 조회를 조건부 우선 후보로 남기고, Tumblr는 별도 이용범위 확인 전 보류, Misskey.io는 사전 협의 없는 수집 대상에서 제외하는 것이다. 소송 가능성이나 법적 안전성을 보증하는 법률 의견서는 아니다.
