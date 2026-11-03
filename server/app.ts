import type { DatabaseSync } from 'node:sqlite'
import express, { type NextFunction, type Request, type Response } from 'express'
import { MAX_CHOICES, type Capabilities, type CollectOptions, type MaxComments } from '../shared/types'
import { parseContentUrl } from '../shared/url'
import type { BackendClient } from './backendClient'
import type { ServiceConfig } from './config'
import { ProviderError, ServiceError } from './errors'
import { collectDemo, demoCapabilities, demoSource } from './providers/demo'
import { collectManual, manualCapabilities } from './providers/manual'
import type { CommentProvider } from './providers/types'
import type { YouTubeRef } from './providers/youtube'
import { createRateLimiter } from './rateLimit'
import type { SemanticFilter } from './semantic'
import { AnalysisRunner, SessionStore, type Requester } from './sessions'

export interface ServiceDeps {
  db: DatabaseSync
  config: Pick<ServiceConfig, 'stopAfterUnavailable'>
  youtube: CommentProvider<YouTubeRef>
  semantic: SemanticFilter
  backend: BackendClient
  now?: () => Date
}

const NEWS_REASON = '뉴스 댓글은 공개된 공식 수집 API가 없어 지원하지 않습니다(네이버·다음 등). 댓글을 복사해 "직접 입력"으로 넣을 수 있습니다'

function collectOptions(value: unknown): CollectOptions {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const max = Number(record.max)
  if (!MAX_CHOICES.includes(max as MaxComments)) throw new ServiceError('INVALID_INPUT', 400, '최대 개수는 20·50·100·200·500 중 하나입니다')
  if (record.order !== 'time' && record.order !== 'relevance') throw new ServiceError('INVALID_INPUT', 400, '정렬은 최신순 또는 인기순입니다')
  if (typeof record.includeReplies !== 'boolean') throw new ServiceError('INVALID_INPUT', 400, '답글 포함 여부가 필요합니다')
  return { max: max as MaxComments, order: record.order, includeReplies: record.includeReplies }
}

export function createServiceApp(deps: ServiceDeps) {
  const now = deps.now ?? (() => new Date())
  const store = new SessionStore(deps.db, now)
  const runner = new AnalysisRunner(store, deps.backend, deps.config.stopAfterUnavailable)
  const limit = createRateLimiter(now)
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '512kb' }))
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // 상태를 바꾸는 요청은 사용자 지정 헤더를 요구한다(다른 origin 폼 제출·CSRF 차단, CORS는 열지 않는다).
    if (!['GET', 'HEAD'].includes(req.method) && req.header('x-vmr-csrf') !== '1') {
      return void res.status(403).json({ ok: false, error: { code: 'CSRF_REQUIRED', message: '요청 헤더가 올바르지 않습니다', retryable: false } })
    }
    next()
  })

  const who = (req: Request): Requester => ({ ownerToken: req.header('x-vmr-owner')?.trim() || null })
  const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ ok: true, data })
  const route = (handler: (req: Request, res: Response) => Promise<unknown> | unknown) =>
    (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next) }

  app.get('/svc/capabilities', route(async (_req, res) => {
    const semantic = await deps.semantic.probe()
    const data: Capabilities = {
      providers: {
        YOUTUBE: deps.youtube.capabilities(),
        NEWS: { platform: 'NEWS', available: false, reason: NEWS_REASON, orders: [], replies: 'NONE', maxChoices: [] },
        MANUAL: manualCapabilities(),
        DEMO: demoCapabilities(),
      },
      semantic: { available: semantic.ok, reason: semantic.reason, provider: 'GEMINI' },
      backend: await deps.backend.health(),
    }
    ok(res, data)
  }))

  app.post('/svc/resolve', limit('collect', 30), route(async (req, res) => {
    const parsed = parseContentUrl(String(req.body?.url ?? ''))
    if (parsed.kind === 'INVALID') throw new ProviderError('INVALID_URL', parsed.reason)
    if (parsed.kind === 'NEWS') throw new ProviderError('NEWS_NOT_SUPPORTED', `${parsed.site}: ${NEWS_REASON}`)
    if (parsed.kind === 'UNSUPPORTED') throw new ProviderError('UNSUPPORTED_SITE', `${parsed.host}은(는) 지원하지 않는 사이트입니다. 지금은 YouTube 영상 주소만 받습니다`)
    ok(res, { source: await deps.youtube.resolve(parsed) })
  }))

  app.post('/svc/sessions', limit('collect', 20), route(async (req, res) => {
    const kind = req.body?.kind
    let created
    if (kind === 'URL') {
      const parsed = parseContentUrl(String(req.body?.url ?? ''))
      if (parsed.kind !== 'YOUTUBE') throw new ProviderError(parsed.kind === 'NEWS' ? 'NEWS_NOT_SUPPORTED' : parsed.kind === 'INVALID' ? 'INVALID_URL' : 'UNSUPPORTED_SITE', '지원하는 YouTube 영상 주소가 아닙니다')
      const options = collectOptions(req.body?.options)
      const source = await deps.youtube.resolve(parsed)
      const result = await deps.youtube.collect(parsed, source, options)
      created = store.create({ isDemo: false, source, options, notices: result.notices, comments: result.comments })
    } else if (kind === 'MANUAL') {
      const { source, result } = collectManual(String(req.body?.text ?? ''), now())
      created = store.create({ isDemo: false, source, options: { max: 100, order: 'time', includeReplies: false }, notices: result.notices, comments: result.comments })
    } else if (kind === 'DEMO') {
      const options = collectOptions(req.body?.options)
      const result = collectDemo(options, now())
      created = store.create({ isDemo: true, source: demoSource(now()), options, notices: result.notices, comments: result.comments })
    } else {
      throw new ServiceError('INVALID_INPUT', 400, '수집 방식이 올바르지 않습니다')
    }
    ok(res, { owner_token: created.ownerToken, session: store.view(created.sessionId, { ownerToken: created.ownerToken }) }, 201)
  }))

  app.get('/svc/sessions/:id', route((req, res) => ok(res, { session: store.view(String(req.params.id), who(req)), running: runner.isRunning(String(req.params.id)) })))

  app.post('/svc/sessions/:id/semantic', limit('semantic', 10), route(async (req, res) => {
    const id = String(req.params.id)
    const requester = who(req)
    store.authorize(id, requester)
    const query = String(req.body?.query ?? '')
    const ids = await deps.semantic.relatedIds(query, store.comments(id))
    store.saveSemantic(id, requester, query, ids)
    ok(res, { query, ids })
  }))

  app.post('/svc/sessions/:id/selection', route((req, res) => {
    const ids = req.body?.comment_ids
    if (!Array.isArray(ids) || ids.some((value: unknown) => typeof value !== 'string')) throw new ServiceError('INVALID_INPUT', 400, '댓글 id 목록이 필요합니다')
    ok(res, { session: store.select(String(req.params.id), who(req), req.body?.filter, ids) })
  }))

  app.patch('/svc/sessions/:id/settings', route((req, res) => ok(res, { session: store.updateSettings(String(req.params.id), who(req), req.body) })))

  app.post('/svc/sessions/:id/analyze', limit('analyze', 30), route((req, res) => {
    runner.start(String(req.params.id), who(req))
    ok(res, { session: store.view(String(req.params.id), who(req)), running: runner.isRunning(String(req.params.id)) }, 202)
  }))

  app.post('/svc/sessions/:id/cancel', route((req, res) => {
    runner.cancel(String(req.params.id), who(req))
    ok(res, { cancelling: true }, 202)
  }))

  app.get('/svc/sessions/:id/private-package', route((req, res) => {
    const id = String(req.params.id)
    res.setHeader('Content-Disposition', `attachment; filename="verimod-private-${id.slice(0, 8)}.json"`)
    ok(res, { packages: store.privatePackages(id, who(req)) })
  }))

  app.get('/svc/public/sessions/:publicId', route((req, res) => ok(res, { session: store.publicView(String(req.params.publicId)) })))

  app.use('/svc', (_req: Request, res: Response) => void res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '없는 경로입니다', retryable: false } }))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ServiceError) {
      return void res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message, retryable: error.retryable } })
    }
    if (error instanceof SyntaxError) return void res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'JSON 형식이 올바르지 않습니다', retryable: false } })
    console.error('[svc] unexpected error', error instanceof Error ? error.message : 'unknown')
    res.status(500).json({ ok: false, error: { code: 'INTERNAL_ERROR', message: '서버 내부 오류', retryable: true } })
  })

  return { app, store, runner }
}
