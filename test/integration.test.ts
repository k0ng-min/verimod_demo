/**
 * 기존 VeriMod backend의 실제 createApp(라우트·검증·발급·idempotency·SQLite)을 그대로 띄우고,
 * 이 앱의 서비스가 그 위에서 세션→개별 영수증으로 매핑되는지 확인한다.
 *
 * 추론은 backend 자체 테스트(w4-manifest-boundary.test.ts)와 같은 방식의 "테스트 전용 고정 출력 adapter"다.
 * 실제 모델 추론이 아니며, 이 adapter는 테스트 밖 실행 경로에 연결되지 않는다.
 */
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../upstream/backend/src/app.ts'
import { openDatabase } from '../upstream/backend/src/database.ts'
import {
  createThresholdPolicyEvaluator, unavailableInferenceAdapter, W4_PROVISIONAL_POLICY_HASH, W4_R01_MODEL_HASH,
  type InferenceAdapter,
} from '../upstream/backend/src/inference.ts'
import { validateBundle } from '@verimod/protocol/schema'
import { receiptHash } from '@verimod/protocol/receipt'
import { verifyReceipt } from '@vm-domain/verify'
import { pickPackage } from '../src/verify/verifier'
import { createServiceApp } from '../server/app'
import { createBackendClient } from '../server/backendClient'
import { openServiceDatabase } from '../server/db'
import { createYouTubeProvider } from '../server/providers/youtube'
import { createGeminiSemanticFilter } from '../server/semantic'

const model = JSON.parse(readFileSync(new URL('../upstream/backend/config/w4-r01.model_manifest.json', import.meta.url), 'utf8'))
const policyManifest = JSON.parse(readFileSync(new URL('../upstream/backend/config/w4-provisional.policy_manifest.json', import.meta.url), 'utf8'))

/** 테스트 전용: 문장에 "막말"이 있으면 offensive 점수를 높게 준다. */
function fixtureInference(log: string[]): InferenceAdapter {
  return {
    async infer({ text, contentCommitment }) {
      log.push(text)
      return {
        output_version: 'inference/1', inference_id: crypto.randomUUID(), content_commitment: contentCommitment,
        model_manifest_hash: W4_R01_MODEL_HASH, taxonomy_id: 'verimod-ko-beep-hate', taxonomy_version: '1',
        scores_ppm: { hate: 1000, offensive: text.includes('막말') ? 700000 : text.includes('짜증') ? 200000 : 1000 },
        score_semantics: 'UNCALIBRATED', input_status: 'FULL', evidence: [], inferred_at: '2026-10-26T00:00:00.000Z',
      }
    },
  }
}

const listen = (app: { listen: (port: number, host: string, cb: () => void) => Server }) =>
  new Promise<{ server: Server; url: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }))
  })

let servers: Server[] = []
let backendDb: ReturnType<typeof openDatabase>
let inferred: string[]

async function boot(options: { aiAvailable: boolean }) {
  inferred = []
  backendDb = openDatabase()
  const backend = createApp({
    database: backendDb,
    modelManifest: structuredClone(model),
    inference: options.aiAvailable ? fixtureInference(inferred) : unavailableInferenceAdapter,
    policy: createThresholdPolicyEvaluator({
      policyManifestHash: W4_PROVISIONAL_POLICY_HASH, policyManifest: structuredClone(policyManifest), localW4E2E: true,
      hate: { review: 24495, restrict: 216950 }, offensive: { review: 180483, restrict: 646501 },
    }),
  })
  const b = await listen(backend)
  const svc = createServiceApp({
    db: openServiceDatabase(':memory:'),
    config: { stopAfterUnavailable: 3 },
    youtube: createYouTubeProvider({ apiKey: null, timeoutMs: 100 }),
    semantic: createGeminiSemanticFilter({ apiKey: null, model: 'x', timeoutMs: 100 }),
    backend: createBackendClient({ baseUrl: b.url, timeoutMs: 5000 }),
  })
  const s = await listen(svc.app)
  servers = [b.server, s.server]
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${s.url}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-vmr-csrf': '1', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() as any, headers: response.headers }
  }
  return { call, runner: svc.runner, backendUrl: b.url }
}

const count = (table: string) => Number((backendDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)

beforeEach(() => { servers = [] })
afterEach(async () => { await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))) })

describe('collection session → existing backend receipts', () => {
  it('sends exactly the server-validated selection, one receipt per comment, no duplicates on retry', async () => {
    const { call, runner } = await boot({ aiAvailable: true })
    const created = await call('POST', '/svc/sessions', { kind: 'MANUAL', text: '좋은 소식이네요\n이건 막말이다\n공사가 짜증\n관계없는 글' })
    expect(created.status).toBe(201)
    const { owner_token: owner, session } = created.body.data
    const auth = { 'x-vmr-owner': owner }
    const ids = session.comments.map((comment: { id: string }) => comment.id)

    // 필터와 맞지 않는 댓글을 섞으면 서버가 거부한다(UI와 서버 선택 불일치 차단).
    const filter = { mode: 'ANY', keywords: ['막말', '짜증'], exclude: [] }
    const mismatch = await call('POST', `/svc/sessions/${session.id}/selection`, { filter, comment_ids: [ids[0], ids[1]] }, auth)
    expect(mismatch.body.error.code).toBe('SELECTION_MISMATCH')
    // 다른 사람(토큰 없음)은 접근할 수 없다.
    expect((await call('GET', `/svc/sessions/${session.id}`)).status).toBe(403)

    const selected = await call('POST', `/svc/sessions/${session.id}/selection`, { filter, comment_ids: [ids[2], ids[1]] }, auth)
    expect(selected.status).toBe(200)
    await call('POST', `/svc/sessions/${session.id}/analyze`, {}, auth)
    await runner.settle(session.id)
    expect(inferred).toEqual(['이건 막말이다', '공사가 짜증'])

    const view = (await call('GET', `/svc/sessions/${session.id}`, undefined, auth)).body.data.session
    expect(view.phase).toBe('DONE')
    expect(view.items.map((item: { status: string; action: string }) => [item.status, item.action])).toEqual([['ISSUED', 'RESTRICT'], ['ISSUED', 'HUMAN_REVIEW']])
    expect(count('receipts')).toBe(2)

    // 같은 세션을 다시 분석해도 발급 건수는 늘지 않는다.
    await call('POST', `/svc/sessions/${session.id}/analyze`, {}, auth)
    await runner.settle(session.id)
    expect(count('receipts')).toBe(2)

    // 공개 링크에는 영수증 참조만, 원문은 설정을 켜야만, salt는 절대 없다.
    const pub = await call('GET', `/svc/public/sessions/${view.public_id}`)
    expect(pub.body.data.session.items).toHaveLength(2)
    expect(pub.body.data.session.items.every((item: { text: unknown }) => item.text === null)).toBe(true)
    expect(JSON.stringify(pub.body)).not.toMatch(/content_salt|막말/)
    await call('PATCH', `/svc/sessions/${session.id}/settings`, { publicText: true }, auth)
    expect(JSON.stringify((await call('GET', `/svc/public/sessions/${view.public_id}`)).body)).toContain('막말')

    // private package는 소유자만 받는다.
    expect((await call('GET', `/svc/sessions/${session.id}/private-package`)).status).toBe(403)
    const pkg = await call('GET', `/svc/sessions/${session.id}/private-package`, undefined, auth)
    expect(pkg.body.data.packages).toHaveLength(2)
    expect(Object.keys(pkg.body.data.packages[0]).sort()).toEqual(['content_commitment', 'content_salt', 'original_text', 'package_version', 'receipt_id'])
    expect(pkg.body.data.packages[0].package_version).toBe('verimod-private/1')
    expect(pkg.body.data.packages[0].content_salt).toMatch(/^[0-9a-f]{64}$/)
  })

  it('AI unavailable: no receipt is created, stops after 3, retry keeps idempotency keys', async () => {
    const { call, runner } = await boot({ aiAvailable: false })
    const created = await call('POST', '/svc/sessions', { kind: 'MANUAL', text: ['하나', '둘', '셋', '넷', '다섯'].join('\n') })
    const { owner_token: owner, session } = created.body.data
    const auth = { 'x-vmr-owner': owner }
    await call('POST', `/svc/sessions/${session.id}/selection`, { filter: { mode: 'ANY', keywords: [], exclude: [] }, comment_ids: session.comments.map((c: { id: string }) => c.id) }, auth)
    await call('POST', `/svc/sessions/${session.id}/analyze`, {}, auth)
    await runner.settle(session.id)
    const view = (await call('GET', `/svc/sessions/${session.id}`, undefined, auth)).body.data.session
    expect(view.phase).toBe('STOPPED')
    expect(view.stop_reason).toBe('INFERENCE_UNAVAILABLE')
    expect(view.items.map((item: { status: string }) => item.status)).toEqual(['FAILED', 'FAILED', 'FAILED', 'SELECTED', 'SELECTED'])
    expect(view.items.every((item: { receipt_id: unknown }) => item.receipt_id === null)).toBe(true)
    expect(count('receipts')).toBe(0)
    expect(count('content_store')).toBe(0)
  })
})

describe('no accounts, owner token only', () => {
  it('has no login/sign-up endpoints and keeps sessions owner-token protected', async () => {
    const { call } = await boot({ aiAvailable: true })
    for (const path of ['/svc/auth/register', '/svc/auth/login', '/svc/auth/logout']) expect((await call('POST', path, {})).status).toBe(404)
    expect((await call('GET', '/svc/auth/me')).status).toBe(404)
    expect((await call('GET', '/svc/me/sessions')).status).toBe(404)
    const created = await call('POST', '/svc/sessions', { kind: 'MANUAL', text: '소유 토큰 확인' })
    expect(JSON.stringify(created.body)).not.toMatch(/account/)
    const id = created.body.data.session.id
    expect((await call('GET', `/svc/sessions/${id}`)).status).toBe(403)
    expect((await call('GET', `/svc/sessions/${id}`, undefined, { 'x-vmr-owner': created.body.data.owner_token })).status).toBe(200)
  })

  it('rejects state changes without the CSRF header', async () => {
    const { call } = await boot({ aiAvailable: true })
    const response = await call('POST', '/svc/sessions', { kind: 'DEMO', options: { max: 20, order: 'time', includeReplies: true } }, { 'x-vmr-csrf': '0' })
    expect(response.status).toBe(403)
  })
})

describe('issued receipt is a real backend bundle', () => {
  it('bundle passes the shared schema and hash recomputation', async () => {
    const { call, runner, backendUrl } = await boot({ aiAvailable: true })
    const created = await call('POST', '/svc/sessions', { kind: 'MANUAL', text: '영수증 확인용 문장' })
    const { owner_token: owner, session } = created.body.data
    const auth = { 'x-vmr-owner': owner }
    await call('POST', `/svc/sessions/${session.id}/selection`, { filter: { mode: 'ANY', keywords: [], exclude: [] }, comment_ids: [session.comments[0].id] }, auth)
    await call('POST', `/svc/sessions/${session.id}/analyze`, {}, auth)
    await runner.settle(session.id)
    const item = (await call('GET', `/svc/sessions/${session.id}`, undefined, auth)).body.data.session.items[0]
    const bundle = (await (await fetch(`${backendUrl}/api/receipts/${item.receipt_id}/bundle`)).json() as any).data
    const parsed = validateBundle(bundle)
    expect(parsed.ok).toBe(true)
    expect(bundle.proof).toBeNull()
    expect(bundle.anchor).toBeNull()
    expect(await receiptHash(bundle.receipt_body)).toBe(item.receipt_hash)
    expect(JSON.stringify(bundle)).not.toContain('영수증 확인용')
  })

  it('Private Package content side-check remains NOT_CHECKED until an anchor is core VALID', async () => {
    const { call, runner, backendUrl } = await boot({ aiAvailable: true })
    const created = await call('POST', '/svc/sessions', { kind: 'MANUAL', text: '패키지 확인 문장' })
    const { owner_token: owner, session } = created.body.data
    const auth = { 'x-vmr-owner': owner }
    await call('POST', `/svc/sessions/${session.id}/selection`, { filter: { mode: 'ANY', keywords: [], exclude: [] }, comment_ids: [session.comments[0].id] }, auth)
    await call('POST', `/svc/sessions/${session.id}/analyze`, {}, auth)
    await runner.settle(session.id)
    const item = (await call('GET', `/svc/sessions/${session.id}`, undefined, auth)).body.data.session.items[0]
    const bundle = (await (await fetch(`${backendUrl}/api/receipts/${item.receipt_id}/bundle`)).json() as any).data
    const packages = (await call('GET', `/svc/sessions/${session.id}/private-package`, undefined, auth)).body.data.packages
    const pkg = pickPackage(packages, item.receipt_id)
    const ctx = (p: typeof pkg) => ({
      trust: { chain_id: '1', contract_address: '0x0', issuer_id: 'x', publisher: '0x0', protocol_version: 1 },
      ledger: { getEpoch: async () => null, blockNumber: async () => 0 },
      manifests: { model: '0x' as never, policy: '0x' as never, review: '0x' as never },
      findBundle: () => null,
      findPrivateContent: () => ({ salt: `0x${p.content_salt}` as never, text: p.original_text }),
    })
    const ok = await verifyReceipt(bundle, ctx(pkg))
    expect(ok.code).toBe('PENDING_ANCHOR')
    // 최신 main 검증기는 미앵커 Receipt의 원문 검증을 "통과"로 보이지 않는다.
    // proof·anchor·finality가 VALID가 된 뒤에만 Private Package side-check를 수행한다.
    expect(ok.content.state).toBe('NOT_CHECKED')
    const bad = await verifyReceipt(bundle, ctx({ ...pkg, original_text: pkg.original_text.replace('패', '팩') }))
    expect(bad.content.state).toBe('NOT_CHECKED')
    expect(() => pickPackage(packages, '00000000-0000-4000-8000-000000000000')).toThrow()
    expect(() => pickPackage([{ ...packages[0], extra: 1 }], item.receipt_id)).toThrow(/형식/)
  })
})
