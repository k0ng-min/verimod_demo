/** 수집·선택 계층의 정규화 타입. 판정·영수증 규격(@verimod/protocol)과 분리되어 있으며,
 * 여기에 있는 어떤 값도 canonical receipt body에 들어가지 않는다. */

export type Platform = 'YOUTUBE' | 'NEWS' | 'MANUAL' | 'DEMO'

export type SortOrder = 'time' | 'relevance'
/** 최상위 댓글 기준 수집 상한. 답글은 이 숫자에 포함하지 않는다. */
export const MAX_CHOICES = [20, 50, 100, 200, 500] as const
export type MaxComments = (typeof MAX_CHOICES)[number]

export interface ProviderCapabilities {
  platform: Platform
  available: boolean
  /** available=false인 이유. 사용자에게 그대로 보여 준다. */
  reason: string | null
  orders: SortOrder[]
  replies: 'FULL' | 'PARTIAL' | 'NONE'
  maxChoices: MaxComments[]
}

export interface ContentSource {
  platform: Platform
  /** 사용자가 넣은 URL을 정규화한 주소. 직접 입력·데모는 null. */
  source_url: string | null
  content_id: string
  title: string | null
  channel: string | null
  published_at: string | null
  /** 플랫폼이 밝힌 전체 댓글 수. 수집한 개수와 다르다. 모르면 null. */
  platform_comment_count: number | null
  resolved_at: string
}

export interface NormalizedComment {
  /** 세션 안에서 고유한 id. 플랫폼 댓글 id가 있으면 그것을 그대로 쓴다. */
  id: string
  platform_comment_id: string | null
  parent_id: string | null
  author: string | null
  /** 원문 그대로. 수집·필터 계층은 이 값을 바꾸지 않는다. */
  text: string
  like_count: number | null
  published_at: string | null
  collected_at: string
  source_url: string | null
}

export interface CollectOptions {
  max: MaxComments
  order: SortOrder
  includeReplies: boolean
}

export interface CollectNotice {
  code: 'REPLIES_PARTIAL' | 'PAGE_LIMIT' | 'UPSTREAM_PARTIAL' | 'DUPLICATES_REMOVED' | 'FEWER_THAN_REQUESTED'
  detail: string
}

export type ProviderErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_SITE'
  | 'NEWS_NOT_SUPPORTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NOT_FOUND_OR_PRIVATE'
  | 'COMMENTS_DISABLED'
  | 'NO_COMMENTS'
  | 'QUOTA_EXCEEDED'
  | 'UPSTREAM_FAILED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'

export type ItemStatus = 'SELECTED' | 'ISSUING' | 'ISSUED' | 'FAILED' | 'DEMO_JUDGED' | 'CANCELLED'
export type Action = 'ALLOW' | 'HUMAN_REVIEW' | 'RESTRICT'

export interface SessionItem {
  comment_id: string
  status: ItemStatus
  receipt_id: string | null
  receipt_hash: string | null
  action: Action | null
  reason_codes: string[]
  triggered_rule_ids: string[]
  scores_ppm: { hate: number; offensive: number } | null
  input_status: 'FULL' | 'TRUNCATED' | null
  model_manifest_hash: string | null
  policy_manifest_hash: string | null
  recorded_at: string | null
  error_code: string | null
  attempts: number
}

export type SessionPhase = 'COLLECTED' | 'SELECTED' | 'RUNNING' | 'DONE' | 'STOPPED' | 'CANCELLED'

export interface SessionSettings {
  /** 공개 세션 링크에 댓글 원문을 함께 보일지. 기본 false. */
  publicText: boolean
}

export interface SessionView {
  id: string
  public_id: string
  is_demo: boolean
  phase: SessionPhase
  source: ContentSource
  options: CollectOptions
  notices: CollectNotice[]
  comments: NormalizedComment[]
  items: SessionItem[]
  settings: SessionSettings
  filter: FilterSpec | null
  stop_reason: string | null
  created_at: string
}

export type MatchMode = 'ANY' | 'ALL' | 'PHRASE' | 'SEMANTIC'

export interface FilterSpec {
  mode: MatchMode
  keywords: string[]
  exclude: string[]
}

export interface PublicSessionView {
  public_id: string
  is_demo: boolean
  source: Pick<ContentSource, 'platform' | 'source_url' | 'title' | 'channel'>
  created_at: string
  collected_count: number
  selected_count: number
  text_published: boolean
  items: Array<{
    receipt_id: string | null
    receipt_hash: string | null
    action: Action | null
    status: ItemStatus
    recorded_at: string | null
    text: string | null
  }>
}

export interface Capabilities {
  providers: Record<Platform, ProviderCapabilities>
  semantic: { available: boolean; reason: string | null; provider: 'GEMINI' }
  backend: { reachable: boolean; detail: string }
}
