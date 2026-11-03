import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { applyFilter, cleanKeywords } from '../shared/filter'
import type {
  CollectNotice, CollectOptions, ContentSource, FilterSpec, NormalizedComment, PublicSessionView,
  SessionItem, SessionPhase, SessionSettings, SessionView,
} from '../shared/types'
import { BackendIssueError, type BackendClient } from './backendClient'
import { tx } from './db'
import { ServiceError } from './errors'
import { demoJudge } from './providers/demo'

/** 원댓글 수집 설정의 두 배(답글 포함)까지 허용하되, 한 세션의 절대 상한은 1,000개다. */
export const MAX_SELECTED = 1_000
export const SELECTED_PER_TOP_LEVEL = 2

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

interface SessionRow {
  session_id: string
  public_id: string
  owner_token_hash: string
  is_demo: number
  phase: SessionPhase
  source_json: string
  options_json: string
  notices_json: string
  filter_json: string | null
  semantic_json: string | null
  settings_json: string
  stop_reason: string | null
  created_at: string
}

interface ItemRow {
  comment_id: string
  status: SessionItem['status']
  receipt_id: string | null
  receipt_hash: string | null
  summary_json: string | null
  private_json: string | null
  error_code: string | null
  attempts: number
  idempotency_key: string
}

/** 세션 소유자 = 세션을 만들 때 받은 owner token을 가진 브라우저. 계정·로그인은 없다. */
export interface Requester { ownerToken: string | null }

export class SessionStore {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date = () => new Date()) {}

  create(input: {
    isDemo: boolean; source: ContentSource; options: CollectOptions; notices: CollectNotice[]; comments: NormalizedComment[]
  }): { sessionId: string; publicId: string; ownerToken: string } {
    const sessionId = randomUUID()
    const publicId = randomBytes(12).toString('base64url')
    const ownerToken = randomBytes(32).toString('base64url')
    const at = this.now().toISOString()
    tx(this.db, () => {
      this.db.prepare(`INSERT INTO analysis_sessions (session_id, public_id, owner_token_hash, is_demo, phase, source_json, options_json,
        notices_json, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'COLLECTED', ?, ?, ?, ?, ?, ?)`).run(
        sessionId, publicId, sha256(ownerToken), input.isDemo ? 1 : 0, JSON.stringify(input.source),
        JSON.stringify(input.options), JSON.stringify(input.notices), JSON.stringify({ publicText: false } satisfies SessionSettings), at, at,
      )
      const insert = this.db.prepare('INSERT INTO collected_comments (session_id, comment_id, ordinal, comment_json) VALUES (?, ?, ?, ?)')
      input.comments.forEach((comment, index) => insert.run(sessionId, comment.id, index, JSON.stringify(comment)))
    })
    return { sessionId, publicId, ownerToken }
  }

  private row(sessionId: string): SessionRow {
    const row = this.db.prepare('SELECT * FROM analysis_sessions WHERE session_id = ?').get(sessionId) as SessionRow | undefined
    if (!row) throw new ServiceError('NOT_FOUND', 404, '분석 세션을 찾을 수 없습니다')
    return row
  }

  authorize(sessionId: string, who: Requester): SessionRow {
    const row = this.row(sessionId)
    const tokenOk = who.ownerToken !== null && timingSafeEqual(Buffer.from(sha256(who.ownerToken)), Buffer.from(row.owner_token_hash))
    if (!tokenOk) throw new ServiceError('FORBIDDEN', 403, '이 세션에 접근할 권한이 없습니다')
    return row
  }

  comments(sessionId: string): NormalizedComment[] {
    return (this.db.prepare('SELECT comment_json FROM collected_comments WHERE session_id = ? ORDER BY ordinal').all(sessionId) as Array<{ comment_json: string }>)
      .map((row) => JSON.parse(row.comment_json) as NormalizedComment)
  }

  private items(sessionId: string): ItemRow[] {
    return this.db.prepare('SELECT * FROM session_items WHERE session_id = ? ORDER BY ordinal').all(sessionId) as unknown as ItemRow[]
  }

  view(sessionId: string, who: Requester): SessionView {
    const row = this.authorize(sessionId, who)
    return {
      id: row.session_id,
      public_id: row.public_id,
      is_demo: row.is_demo === 1,
      phase: row.phase,
      source: JSON.parse(row.source_json),
      options: JSON.parse(row.options_json),
      notices: JSON.parse(row.notices_json),
      comments: this.comments(sessionId),
      items: this.items(sessionId).map(toItem),
      settings: JSON.parse(row.settings_json),
      filter: row.filter_json ? JSON.parse(row.filter_json) : null,
      stop_reason: row.stop_reason,
      created_at: row.created_at,
    }
  }

  saveSemantic(sessionId: string, who: Requester, query: string, ids: string[]): void {
    this.authorize(sessionId, who)
    this.db.prepare('UPDATE analysis_sessions SET semantic_json = ?, updated_at = ? WHERE session_id = ?')
      .run(JSON.stringify({ query: cleanKeywords([query])[0] ?? '', ids }), this.now().toISOString(), sessionId)
  }

  /** 화면에서 고른 댓글이 실제 판정 입력과 같도록, 서버가 필터를 다시 계산해 부분집합인지 확인한다. */
  select(sessionId: string, who: Requester, filter: FilterSpec, commentIds: string[]): SessionView {
    const row = this.authorize(sessionId, who)
    if (!['COLLECTED', 'SELECTED'].includes(row.phase)) throw new ServiceError('SELECTION_LOCKED', 409, '분석을 시작한 세션은 선택을 바꿀 수 없습니다. 새 세션으로 다시 고르세요')
    if (!['ANY', 'ALL', 'PHRASE', 'SEMANTIC'].includes(filter.mode) || !Array.isArray(filter.keywords) || !Array.isArray(filter.exclude)) {
      throw new ServiceError('INVALID_INPUT', 400, '필터 형식이 올바르지 않습니다')
    }
    const spec: FilterSpec = { mode: filter.mode, keywords: cleanKeywords(filter.keywords), exclude: cleanKeywords(filter.exclude) }
    let semanticIds: Set<string> | undefined
    if (spec.mode === 'SEMANTIC') {
      const semantic = row.semantic_json ? JSON.parse(row.semantic_json) as { query: string; ids: string[] } : null
      if (!semantic || semantic.query !== (spec.keywords[0] ?? '')) throw new ServiceError('SEMANTIC_STALE', 409, '의미 필터 결과가 현재 주제와 다릅니다. 다시 찾아 주세요')
      semanticIds = new Set(semantic.ids)
    }
    const comments = this.comments(sessionId)
    const options = JSON.parse(row.options_json) as CollectOptions
    const selectionLimit = Math.min(MAX_SELECTED, options.max * SELECTED_PER_TOP_LEVEL)
    const matched = new Set(applyFilter(comments, spec, semanticIds).map((comment) => comment.id))
    const unique = [...new Set(commentIds)]
    if (unique.length === 0) throw new ServiceError('EMPTY_SELECTION', 400, '판정할 댓글을 하나 이상 고르세요')
    if (unique.length > selectionLimit) throw new ServiceError('INVALID_INPUT', 400, `이 수집 범위에서는 한 세션에 ${selectionLimit}개까지 판정합니다(원댓글 ${options.max}개 + 답글 포함)`)
    if (unique.some((id) => !matched.has(id))) throw new ServiceError('SELECTION_MISMATCH', 409, '조건에 맞지 않는 댓글이 선택에 섞여 있습니다. 화면을 새로 고쳐 다시 고르세요')
    const order = new Map(comments.map((comment, index) => [comment.id, index]))
    const at = this.now().toISOString()
    tx(this.db, () => {
      this.db.prepare('DELETE FROM session_items WHERE session_id = ?').run(sessionId)
      const insert = this.db.prepare(`INSERT INTO session_items (session_id, comment_id, ordinal, idempotency_key, status, updated_at)
        VALUES (?, ?, ?, ?, 'SELECTED', ?)`)
      for (const id of unique.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))) {
        // 세션·댓글마다 고정된 key. 재시도·새로고침·서비스 재시작 후에도 같은 key라 backend가 중복 발급하지 않는다.
        insert.run(sessionId, id, order.get(id) ?? 0, `vmr:${sessionId}:${sha256(id).slice(0, 24)}`, at)
      }
      this.db.prepare("UPDATE analysis_sessions SET phase = 'SELECTED', filter_json = ?, updated_at = ? WHERE session_id = ?").run(JSON.stringify(spec), at, sessionId)
    })
    return this.view(sessionId, who)
  }

  updateSettings(sessionId: string, who: Requester, settings: SessionSettings): SessionView {
    this.authorize(sessionId, who)
    if (typeof settings?.publicText !== 'boolean') throw new ServiceError('INVALID_INPUT', 400, '설정 형식이 올바르지 않습니다')
    this.db.prepare('UPDATE analysis_sessions SET settings_json = ?, updated_at = ? WHERE session_id = ?')
      .run(JSON.stringify({ publicText: settings.publicText }), this.now().toISOString(), sessionId)
    return this.view(sessionId, who)
  }

  publicView(publicId: string): PublicSessionView {
    const row = this.db.prepare('SELECT * FROM analysis_sessions WHERE public_id = ?').get(publicId) as SessionRow | undefined
    if (!row) throw new ServiceError('NOT_FOUND', 404, '공개 세션을 찾을 수 없습니다')
    const settings = JSON.parse(row.settings_json) as SessionSettings
    const source = JSON.parse(row.source_json) as ContentSource
    const comments = new Map(this.comments(row.session_id).map((comment) => [comment.id, comment]))
    const items = this.items(row.session_id)
    return {
      public_id: row.public_id,
      is_demo: row.is_demo === 1,
      source: { platform: source.platform, source_url: source.source_url, title: source.title, channel: source.channel },
      created_at: row.created_at,
      collected_count: comments.size,
      selected_count: items.length,
      text_published: settings.publicText,
      // 공개 링크에는 발급된 영수증 참조와 요약만 둔다. salt·private package는 절대 넣지 않는다.
      items: items.filter((item) => item.status === 'ISSUED' || item.status === 'DEMO_JUDGED').map((item) => {
        const summary = item.summary_json ? JSON.parse(item.summary_json) as Partial<SessionItem> : {}
        return {
          receipt_id: item.receipt_id, receipt_hash: item.receipt_hash, action: summary.action ?? null, status: item.status,
          recorded_at: summary.recorded_at ?? null, text: settings.publicText ? comments.get(item.comment_id)?.text ?? null : null,
        }
      }),
    }
  }

  /** 원래 설계의 Private Receipt Package 형식(package_version·receipt_id·original_text·content_salt·content_commitment)을
   * 영수증마다 그대로 만든다. 소유자만 받을 수 있고, 공개 링크·공개 API에는 들어가지 않는다. */
  privatePackages(sessionId: string, who: Requester) {
    this.authorize(sessionId, who)
    const comments = new Map(this.comments(sessionId).map((comment) => [comment.id, comment]))
    return this.items(sessionId).filter((item) => item.status === 'ISSUED' && item.private_json).map((item) => {
      const material = JSON.parse(item.private_json as string) as { receipt_id: string; content_commitment: string; content_salt: string }
      return {
        package_version: 'verimod-private/1' as const,
        receipt_id: material.receipt_id,
        original_text: comments.get(item.comment_id)?.text ?? '',
        content_salt: material.content_salt,
        content_commitment: material.content_commitment,
      }
    })
  }

  // ---- analysis runner support ----
  setPhase(sessionId: string, phase: SessionPhase, stopReason: string | null = null) {
    this.db.prepare('UPDATE analysis_sessions SET phase = ?, stop_reason = ?, updated_at = ? WHERE session_id = ?').run(phase, stopReason, this.now().toISOString(), sessionId)
  }

  pending(sessionId: string): Array<ItemRow & { text: string }> {
    const comments = new Map(this.comments(sessionId).map((comment) => [comment.id, comment.text]))
    return this.items(sessionId).filter((item) => ['SELECTED', 'FAILED', 'CANCELLED'].includes(item.status))
      .map((item) => ({ ...item, text: comments.get(item.comment_id) ?? '' }))
  }

  markItem(sessionId: string, commentId: string, fields: { status: SessionItem['status']; receipt_id?: string | null; receipt_hash?: string | null; summary?: unknown; private?: unknown; error_code?: string | null; attempt?: boolean }) {
    this.db.prepare(`UPDATE session_items SET status = ?, receipt_id = COALESCE(?, receipt_id), receipt_hash = COALESCE(?, receipt_hash),
      summary_json = COALESCE(?, summary_json), private_json = COALESCE(?, private_json), error_code = ?, attempts = attempts + ?, updated_at = ?
      WHERE session_id = ? AND comment_id = ? AND status != 'ISSUED'`).run(
      fields.status, fields.receipt_id ?? null, fields.receipt_hash ?? null,
      fields.summary === undefined ? null : JSON.stringify(fields.summary), fields.private === undefined ? null : JSON.stringify(fields.private),
      fields.error_code ?? null, fields.attempt ? 1 : 0, this.now().toISOString(), sessionId, commentId,
    )
  }

  rawRow(sessionId: string) { return this.row(sessionId) }
}

function toItem(row: ItemRow): SessionItem {
  const summary = row.summary_json ? JSON.parse(row.summary_json) as Partial<SessionItem> : {}
  return {
    comment_id: row.comment_id,
    status: row.status,
    receipt_id: row.receipt_id,
    receipt_hash: row.receipt_hash,
    action: summary.action ?? null,
    reason_codes: summary.reason_codes ?? [],
    triggered_rule_ids: summary.triggered_rule_ids ?? [],
    scores_ppm: summary.scores_ppm ?? null,
    input_status: summary.input_status ?? null,
    model_manifest_hash: summary.model_manifest_hash ?? null,
    policy_manifest_hash: summary.policy_manifest_hash ?? null,
    recorded_at: summary.recorded_at ?? null,
    error_code: row.error_code,
    attempts: row.attempts,
  }
}

/** 세션 하나를 순서대로(동시성 1) 판정한다. 기존 모델 서버는 batch 1·실행 슬롯 제한이 있어 병렬로 보내지 않는다. */
export class AnalysisRunner {
  private readonly running = new Map<string, { cancel: boolean; done: Promise<void> }>()

  constructor(private readonly store: SessionStore, private readonly backend: BackendClient, private readonly stopAfterUnavailable: number) {}

  isRunning(sessionId: string) { return this.running.has(sessionId) }

  start(sessionId: string, who: Requester): void {
    const row = this.store.authorize(sessionId, who)
    if (this.running.has(sessionId)) return
    if (row.phase === 'COLLECTED') throw new ServiceError('EMPTY_SELECTION', 409, '먼저 판정할 댓글을 고르세요')
    if (this.store.pending(sessionId).length === 0) return
    this.store.setPhase(sessionId, 'RUNNING')
    const state = { cancel: false, done: Promise.resolve() }
    state.done = this.run(sessionId, row.is_demo === 1, state).finally(() => this.running.delete(sessionId))
    this.running.set(sessionId, state)
  }

  cancel(sessionId: string, who: Requester): void {
    this.store.authorize(sessionId, who)
    const state = this.running.get(sessionId)
    if (state) state.cancel = true
  }

  /** 테스트용: 진행 중인 실행이 끝날 때까지 기다린다. */
  async settle(sessionId: string) { await this.running.get(sessionId)?.done }

  private async run(sessionId: string, isDemo: boolean, state: { cancel: boolean }) {
    let unavailableStreak = 0
    const queue = this.store.pending(sessionId)
    for (let index = 0; index < queue.length; index++) {
      const item = queue[index]
      if (state.cancel) {
        for (const rest of queue.slice(index)) this.store.markItem(sessionId, rest.comment_id, { status: 'CANCELLED', error_code: 'CANCELLED_BY_USER' })
        this.store.setPhase(sessionId, 'CANCELLED', 'CANCELLED_BY_USER')
        return
      }
      if (isDemo) {
        const judged = demoJudge(item.text)
        this.store.markItem(sessionId, item.comment_id, {
          status: 'DEMO_JUDGED', attempt: true,
          summary: { action: judged.action, scores_ppm: judged.scores_ppm, reason_codes: judged.reason_codes, triggered_rule_ids: [], input_status: 'FULL', recorded_at: new Date().toISOString() },
        })
        await new Promise((resolve) => setTimeout(resolve, 120))
        continue
      }
      this.store.markItem(sessionId, item.comment_id, { status: 'ISSUING', attempt: true })
      try {
        const issued = await this.backend.issue({ text: item.text, idempotencyKey: item.idempotency_key, principal: `verimod-redesign:${sessionId}` })
        unavailableStreak = 0
        this.store.markItem(sessionId, item.comment_id, {
          status: 'ISSUED', receipt_id: issued.receipt_id, receipt_hash: issued.receipt_hash, error_code: null,
          summary: {
            action: issued.action, reason_codes: issued.reason_codes, triggered_rule_ids: issued.triggered_rule_ids, scores_ppm: issued.scores_ppm,
            input_status: issued.input_status, model_manifest_hash: issued.model_manifest_hash, policy_manifest_hash: issued.policy_manifest_hash, recorded_at: issued.recorded_at,
          },
          private: issued.private_package,
        })
      } catch (error) {
        const code = error instanceof BackendIssueError ? error.code : 'UNKNOWN_ERROR'
        this.store.markItem(sessionId, item.comment_id, { status: 'FAILED', error_code: code })
        unavailableStreak = code === 'INFERENCE_UNAVAILABLE' || code === 'BACKEND_UNREACHABLE' ? unavailableStreak + 1 : 0
        if (unavailableStreak >= this.stopAfterUnavailable) {
          // AI·backend를 쓸 수 없는 상태에서 나머지를 계속 두드리지 않는다. 남은 댓글은 시도하지 않은 채로 둔다.
          this.store.setPhase(sessionId, 'STOPPED', code)
          return
        }
      }
    }
    this.store.setPhase(sessionId, 'DONE')
  }
}
