/**
 * 사내 메신저 알림. Slack incoming webhook 호환({"text": ...} POST)을 기본으로 하고,
 * 다른 사내 메신저는 이 모듈에 어댑터를 추가한다.
 */
export async function sendWebhook(text: string, url = process.env.WEBHOOK_URL): Promise<boolean> {
  if (!url) return false;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.warn(`웹훅 전송 실패: HTTP ${res.status}`);
    return false;
  }
  return true;
}
