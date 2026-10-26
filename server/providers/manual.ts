import { createHash } from 'node:crypto'
import type { ContentSource, NormalizedComment, ProviderCapabilities } from '../../shared/types'
import { ProviderError } from '../errors'
import { dedupe, type CollectResult } from './types'

/** 사용자가 직접 붙여 넣은 댓글. 한 줄이 댓글 하나다. 원문은 앞뒤 공백만 걸러 내고 바꾸지 않는다. */
export const MANUAL_MAX_COMMENTS = 100
export const MANUAL_MAX_LENGTH = 1000

export function manualCapabilities(): ProviderCapabilities {
  return { platform: 'MANUAL', available: true, reason: null, orders: [], replies: 'NONE', maxChoices: [100] }
}

export function collectManual(text: string, now: Date): { source: ContentSource; result: CollectResult } {
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0)
  if (lines.length === 0) throw new ProviderError('NO_COMMENTS', '붙여 넣은 댓글이 없습니다')
  if (lines.length > MANUAL_MAX_COMMENTS) throw new ProviderError('INVALID_URL', `한 번에 ${MANUAL_MAX_COMMENTS}줄까지 넣을 수 있습니다`)
  if (lines.some((line) => [...line].length > MANUAL_MAX_LENGTH)) throw new ProviderError('INVALID_URL', `한 줄은 ${MANUAL_MAX_LENGTH}자까지입니다`)
  const collectedAt = now.toISOString()
  const comments: NormalizedComment[] = lines.map((line, index) => ({
    id: `m${index + 1}-${createHash('sha256').update(line).digest('hex').slice(0, 10)}`,
    platform_comment_id: null,
    parent_id: null,
    author: null,
    text: line,
    like_count: null,
    published_at: null,
    collected_at: collectedAt,
    source_url: null,
  }))
  const unique = dedupe(comments)
  return {
    source: {
      platform: 'MANUAL', source_url: null, content_id: `manual-${collectedAt}`, title: '직접 입력한 댓글',
      channel: null, published_at: null, platform_comment_count: null, resolved_at: collectedAt,
    },
    result: { comments: unique.comments, notices: [] },
  }
}
