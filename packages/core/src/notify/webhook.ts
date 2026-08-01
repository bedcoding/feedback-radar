/**
 * 사내 메신저 알림. Slack incoming webhook 호환({"text": ...} POST)을 기본으로 하고,
 * 다른 사내 메신저는 이 모듈에 어댑터를 추가한다.
 */
export async function sendWebhook(text: string, url = process.env.WEBHOOK_URL): Promise<boolean> {
  if (!url) return false;
  // 알림은 파이프라인의 마지막 단계다. 웹훅 서버 장애로 수집·태깅·리포트까지
  // 실패 처리되면 안 되므로 네트워크 예외를 여기서 흡수한다.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`웹훅 전송 실패: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`웹훅 전송 실패: ${(e as Error).message}`);
    return false;
  }
}
