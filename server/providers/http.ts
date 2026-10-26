import { ProviderError } from '../errors'

export const MAX_UPSTREAM_BYTES = 2_000_000

/** 고정된 공식 API 주소만 호출한다. redirect를 따르지 않고, 크기·시간을 제한한다. */
export async function fetchJson(
  url: URL,
  init: RequestInit & { timeoutMs: number; allowedHosts: readonly string[]; fetcher?: typeof fetch },
): Promise<{ status: number; body: unknown }> {
  if (url.protocol !== 'https:' || !init.allowedHosts.includes(url.hostname)) {
    throw new ProviderError('UPSTREAM_FAILED', '허용되지 않은 외부 주소입니다')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs)
  const fetcher = init.fetcher ?? fetch
  try {
    const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal })
    const length = Number(response.headers.get('content-length') ?? '0')
    if (length > MAX_UPSTREAM_BYTES) throw new ProviderError('UPSTREAM_FAILED', '외부 응답이 너무 큽니다')
    const text = await response.text()
    if (text.length > MAX_UPSTREAM_BYTES) throw new ProviderError('UPSTREAM_FAILED', '외부 응답이 너무 큽니다')
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { throw new ProviderError('UPSTREAM_FAILED', '외부 응답이 JSON이 아닙니다') }
    return { status: response.status, body }
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if (controller.signal.aborted) throw new ProviderError('TIMEOUT', '외부 서비스 응답 시간이 초과됐습니다')
    throw new ProviderError('UPSTREAM_FAILED', '외부 서비스에 연결하지 못했습니다')
  } finally {
    clearTimeout(timer)
  }
}
