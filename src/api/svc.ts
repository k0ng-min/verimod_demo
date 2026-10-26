import type { Capabilities, CollectOptions, ContentSource, FilterSpec, PublicSessionView, SessionSettings, SessionView } from '../../shared/types'

/** 이 앱 전용 수집·세션 서비스(/svc → 127.0.0.1:3101, Vite proxy). 비밀 키는 서버에만 있다. */

/** 원래 설계(docs/spec/screen-requirements.md §4)의 Private Receipt Package 필드 그대로. */
export interface PrivatePackage {
  package_version: 'verimod-private/1'
  receipt_id: string
  original_text: string
  content_salt: string
  content_commitment: string
}

export class SvcError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly retryable: boolean) {
    super(message)
    this.name = 'SvcError'
  }
}

async function call<T>(method: string, path: string, options: { body?: unknown; owner?: string | null; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'x-vmr-csrf': '1' } : {}),
        ...(options.owner ? { 'x-vmr-owner': options.owner } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    if (controller.signal.aborted) throw new SvcError('TIMEOUT', '응답 시간이 초과됐습니다', 0, true)
    throw new SvcError('SERVICE_UNREACHABLE', '수집 서비스(127.0.0.1:3101)에 연결하지 못했습니다. 서비스 실행 여부를 확인하세요', 0, true)
  } finally {
    window.clearTimeout(timer)
  }
  let payload: { ok?: boolean; data?: T; error?: { code?: string; message?: string; retryable?: boolean } } = {}
  try { payload = await response.json() } catch {
    throw new SvcError(response.status === 502 || response.status === 504 ? 'SERVICE_UNREACHABLE' : 'INVALID_RESPONSE',
      response.status === 502 || response.status === 504 ? '수집 서비스가 실행 중이 아닙니다(127.0.0.1:3101)' : '서비스 응답 형식이 올바르지 않습니다', response.status, true)
  }
  if (!response.ok || payload.ok !== true) {
    throw new SvcError(payload.error?.code ?? `HTTP_${response.status}`, payload.error?.message ?? `요청 실패(HTTP ${response.status})`, response.status, payload.error?.retryable ?? false)
  }
  return payload.data as T
}

export const svc = {
  capabilities: () => call<Capabilities>('GET', '/svc/capabilities'),
  resolve: (url: string) => call<{ source: ContentSource }>('POST', '/svc/resolve', { body: { url } }),
  createSession: (body: { kind: 'URL'; url: string; options: CollectOptions } | { kind: 'MANUAL'; text: string } | { kind: 'DEMO'; options: CollectOptions }) =>
    call<{ owner_token: string; session: SessionView }>('POST', '/svc/sessions', { body, timeoutMs: 60_000 }),
  session: (id: string, owner: string | null) => call<{ session: SessionView; running: boolean }>('GET', `/svc/sessions/${encodeURIComponent(id)}`, { owner }),
  semantic: (id: string, owner: string | null, query: string) => call<{ query: string; ids: string[] }>('POST', `/svc/sessions/${encodeURIComponent(id)}/semantic`, { owner, body: { query }, timeoutMs: 40_000 }),
  select: (id: string, owner: string | null, filter: FilterSpec, commentIds: string[]) =>
    call<{ session: SessionView }>('POST', `/svc/sessions/${encodeURIComponent(id)}/selection`, { owner, body: { filter, comment_ids: commentIds } }),
  settings: (id: string, owner: string | null, settings: SessionSettings) => call<{ session: SessionView }>('PATCH', `/svc/sessions/${encodeURIComponent(id)}/settings`, { owner, body: settings }),
  analyze: (id: string, owner: string | null) => call<{ session: SessionView; running: boolean }>('POST', `/svc/sessions/${encodeURIComponent(id)}/analyze`, { owner, body: {} }),
  cancel: (id: string, owner: string | null) => call<{ cancelling: boolean }>('POST', `/svc/sessions/${encodeURIComponent(id)}/cancel`, { owner, body: {} }),
  privatePackages: (id: string, owner: string | null) => call<{ packages: PrivatePackage[] }>('GET', `/svc/sessions/${encodeURIComponent(id)}/private-package`, { owner }),
  publicSession: (publicId: string) => call<{ session: PublicSessionView }>('GET', `/svc/public/sessions/${encodeURIComponent(publicId)}`),
}
