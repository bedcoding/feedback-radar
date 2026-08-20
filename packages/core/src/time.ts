/**
 * 파이프라인의 '하루'는 실행 머신의 로컬 하루다.
 *
 * `new Date().toISOString()`(UTC)을 쓰면 KST(UTC+9) 기준 00:00~09:00에 실행된 수집이
 * 전날 날짜로 기록돼 리포트 파일이 덮어써지거나 그날 수집분이 어떤 리포트에도 안 실린다.
 * 저장 시각은 오프셋을 포함한 ISO-8601로 남기므로 `substr(1,10)`, 문자열 범위 비교가
 * 그대로 로컬 날짜 기준이 되고, 구버전 UTC(`...Z`) 행과도 사전순 비교가 깨지지 않는다.
 */

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** 로컬 기준 YYYY-MM-DD */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 로컬 기준 ISO-8601 (예: 2026-08-01T14:23:11.000+09:00) */
export function localIso(d = new Date()): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  return `${localDate(d)}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * 소스가 준 작성 시각을 **로컬 오프셋 ISO 하나로** 맞춘다.
 *
 * 소스마다 표기가 다르다: 애플 RSS는 미국 태평양 오프셋(`...-07:00`), 구글플레이, Threads는
 * UTC(`...Z`), 디시는 점 구분 KST 문자열이다. 이걸 그대로 저장하면 목록 정렬과 기간 필터가
 * 어긋난다. 둘 다 `posted_at`의 **사전순 비교**에 의존하는데, 같은 시각이라도 오프셋이
 * 다르면 문자열이 달라지기 때문이다. 예를 들어 UTC로 적힌 KST 오전 8시는 전날 23시가 되어
 * '오늘' 필터에서 빠진다(time.ts 맨 위 경고와 같은 함정).
 *
 * 파싱 못 하는 값은 undefined다. 틀린 날짜를 넣는 것보다 '작성일 미확인'이 낫다.
 */
export function normalizeInstant(input?: string | number | Date | null): string | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? undefined : localIso(d);
}

/**
 * 디시인사이드 표기(`2026.08.04 13:38` 또는 `2026.08.04`)를 로컬 ISO로.
 *
 * 점 구분 형식은 `new Date()`가 환경에 따라 다르게 읽거나 실패하므로 직접 뜯는다.
 * 시각이 없으면 00:00으로 두되, 날짜만이라도 남기는 편이 미확인보다 낫다.
 */
/**
 * 목록에 시각만 적히는 게시판의 표기를 로컬 ISO로.
 *
 * 두 형식이 섞인다. **오늘 글은 `14:19`, 이전 글은 `24.02.16`** 처럼 나온다(더쿠 실측).
 * 연도가 두 자리라 `fromDottedDateTime`으로는 못 읽는다.
 *
 * 시각만 있는 경우는 '오늘'로 본다. 목록 첫 페이지가 그 상태라서 이 가정이 성립하는데,
 * 자정을 막 넘긴 시점에는 어제 글을 오늘로 볼 수 있다. 날짜를 못 얻는 것보다는 낫다고 판단했다.
 */
export function fromShortDateOrTime(s?: string, now = new Date()): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const d = new Date(now);
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return localIso(d);
  }
  const ymd = t.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);
  if (ymd) {
    // 두 자리 연도는 2000년대로 읽는다. 이 게시판들은 2000년 이전 글이 없다
    const d = new Date(2000 + Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(d.getTime()) ? undefined : localIso(d);
  }
  // 월.일만 오는 경우(연도 생략). 올해로 본다
  const md = t.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (md) {
    const d = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    return Number.isNaN(d.getTime()) ? undefined : localIso(d);
  }
  return undefined;
}

export function fromDottedDateTime(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, hh, mm] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0));
  return Number.isNaN(dt.getTime()) ? undefined : localIso(dt);
}
