import type { Action } from '../shared/types'

/** 기존 VeriMod backend(POST /api/decisions)를 바꾸지 않고 그대로 호출한다.
 * 요청 본문은 계약대로 정확히 { text }만 보낸다. 수집 메타데이터(댓글 id, URL 등)는 보내지 않는다.
 * x-demo-principal/x-demo-role은 backend의 데모 헤더이며 실제 사용자 인증이 아니다. */

export interface IssuedDecision {
  receipt_id: string
  receipt_hash: string
  recorded_at: string
  action: Action
  reason_codes: string[]
  triggered_rule_ids: string[]
  scores_ppm: { hate: number; offensive: number }
  input_status: 'FULL' | 'TRUNCATED'
  model_manifest_hash: string
  policy_manifest_hash: string
  private_package: { receipt_id: string; content_commitment: string; content_salt: string }
}

export class BackendIssueError extends Error {
  constructor(readonly code: string, readonly retryable: boolean, readonly status: number | null) {
    super(code)
    this.name = 'BackendIssueError'
  }
}

type Json = Record<string, unknown>
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : {})
const HEX32 = /^0x[0-9a-f]{64}$/

export function parseDecisionCreated(data: unknown): IssuedDecision {
  const record = obj(data)
  const bundle = obj(record.bundle)
  const body = obj(bundle.receipt_body)
  const payload = obj(body.payload)
  const inference = obj(payload.inference)
  const policy = obj(payload.policy)
  const scores = obj(inference.scores_ppm)
  const material = obj(record.private_package)
  const ok = typeof body.receipt_id === 'string' && typeof bundle.receipt_hash === 'string' && HEX32.test(bundle.receipt_hash)
    && bundle.proof === null && bundle.anchor === null && record.state === 'PENDING_ANCHOR'
    && body.event_kind === 'DECISION' && typeof body.recorded_at === 'string'
    && ['ALLOW', 'HUMAN_REVIEW', 'RESTRICT'].includes(policy.action as string)
    && Number.isSafeInteger(scores.hate) && Number.isSafeInteger(scores.offensive)
    && material.receipt_id === body.receipt_id && material.content_commitment === body.content_commitment
    && typeof material.content_salt === 'string' && /^[0-9a-f]{64}$/.test(material.content_salt)
  if (!ok) throw new BackendIssueError('INVALID_BACKEND_RESPONSE', false, null)
  return {
    receipt_id: body.receipt_id as string,
    receipt_hash: bundle.receipt_hash as string,
    recorded_at: body.recorded_at as string,
    action: policy.action as Action,
    reason_codes: (policy.reason_codes as string[]) ?? [],
    triggered_rule_ids: (policy.triggered_rule_ids as string[]) ?? [],
    scores_ppm: { hate: scores.hate as number, offensive: scores.offensive as number },
    input_status: inference.input_status as 'FULL' | 'TRUNCATED',
    model_manifest_hash: inference.model_manifest_hash as string,
    policy_manifest_hash: policy.policy_manifest_hash as string,
    private_package: material as IssuedDecision['private_package'],
  }
}

export interface BackendClient {
  health(): Promise<{ reachable: boolean; detail: string }>
  issue(input: { text: string; idempotencyKey: string; principal: string }): Promise<IssuedDecision>
}

export function createBackendClient(options: { baseUrl: string; timeoutMs: number; fetcher?: typeof fetch }): BackendClient {
  const fetcher = options.fetcher ?? fetch
  const withTimeout = async (path: string, init: RequestInit, timeoutMs: number) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetcher(`${options.baseUrl}${path}`, { ...init, signal: controller.signal, redirect: 'error' })
    } finally {
      clearTimeout(timer)
    }
  }
  return {
    async health() {
      try {
        const response = await withTimeout('/api/health', { method: 'GET' }, 2_000)
        const body = obj(await response.json())
        return response.ok && body.status === 'ok'
          ? { reachable: true, detail: 'VeriMod backend 응답 정상' }
          : { reachable: false, detail: `VeriMod backend 상태 이상(HTTP ${response.status})` }
      } catch {
        return { reachable: false, detail: 'VeriMod backend(127.0.0.1:3001)에 연결하지 못했습니다' }
      }
    },
    async issue({ text, idempotencyKey, principal }) {
      let response: Response
      try {
        response = await withTimeout('/api/decisions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'x-demo-principal': principal,
            'x-demo-role': 'DEMO_USER',
          },
          body: JSON.stringify({ text }),
        }, options.timeoutMs)
      } catch {
        throw new BackendIssueError('BACKEND_UNREACHABLE', true, null)
      }
      let payload: Json = {}
      try { payload = obj(await response.json()) } catch { throw new BackendIssueError('INVALID_BACKEND_RESPONSE', true, response.status) }
      if (!response.ok || payload.ok !== true) {
        const error = obj(payload.error)
        throw new BackendIssueError(typeof error.code === 'string' ? error.code : `HTTP_${response.status}`, error.retryable === true, response.status)
      }
      return parseDecisionCreated(payload.data)
    },
  }
}
