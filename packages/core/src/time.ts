/**
 * 파이프라인의 '하루'는 실행 머신의 로컬 하루다.
 *
 * `new Date().toISOString()`(UTC)을 쓰면 KST(UTC+9) 기준 00:00~09:00에 실행된 수집이
 * 전날 날짜로 기록돼 리포트 파일이 덮어써지거나 그날 수집분이 어떤 리포트에도 안 실린다.
 * 저장 시각은 오프셋을 포함한 ISO-8601로 남기므로 `substr(1,10)`·문자열 범위 비교가
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
