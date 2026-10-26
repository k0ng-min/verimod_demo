/** 기존 backend POST /api/appeals에 그대로 연결한다. 현재 backend는 인증·key 확인 뒤 501 NOT_IMPLEMENTED를 돌려준다.
 * x-demo-* 헤더는 backend의 데모 principal이며 실제 사용자 인증이 아니다. */
export async function requestAppeal(receiptId: string): Promise<{ status: number; code: string | null }> {
  const response = await fetch('/api/appeals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `appeal:${receiptId}`,
      'x-demo-principal': 'verimod-browser-user',
      'x-demo-role': 'DEMO_USER',
    },
    body: JSON.stringify({ receipt_id: receiptId }),
  })
  const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null
  return { status: response.status, code: payload?.error?.code ?? null }
}
