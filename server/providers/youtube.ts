import type { CollectNotice, CollectOptions, ContentSource, NormalizedComment, ProviderCapabilities } from '../../shared/types'
import { ProviderError } from '../errors'
import { fetchJson } from './http'
import { dedupe, type CollectResult, type CommentProvider } from './types'

/** YouTube Data API v3 공식 경로(videos.list, commentThreads.list, comments.list).
 * 페이지 HTML은 댓글을 동적으로 불러오므로 HTML 수집은 쓰지 않는다. API 키가 없으면 unavailable이다. */

const API = 'https://www.googleapis.com/youtube/v3/'
const HOSTS = ['www.googleapis.com'] as const
const MAX_THREAD_PAGES = 5
/** 500개 원댓글 수집에서도 답글 API 호출 폭주를 막는 운영 상한. */
const MAX_REPLY_CALLS = 100

export interface YouTubeRef { videoId: string; canonicalUrl: string }

type Json = Record<string, unknown>
const obj = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : {})
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function upstreamError(status: number, body: unknown): ProviderError {
  const error = obj(obj(body).error)
  const reasons = (Array.isArray(error.errors) ? error.errors : []).map((item) => str(obj(item).reason))
  if (reasons.includes('commentsDisabled')) return new ProviderError('COMMENTS_DISABLED', '이 영상은 댓글이 꺼져 있습니다')
  if (reasons.includes('videoNotFound') || status === 404) return new ProviderError('NOT_FOUND_OR_PRIVATE', '영상을 찾을 수 없거나 비공개·삭제됐습니다')
  if (reasons.some((reason) => reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')) return new ProviderError('QUOTA_EXCEEDED', 'YouTube API 사용 한도를 넘었습니다')
  if (reasons.some((reason) => reason === 'rateLimitExceeded')) return new ProviderError('RATE_LIMITED', 'YouTube API 요청이 너무 잦습니다')
  if (reasons.some((reason) => reason === 'keyInvalid' || reason === 'badRequest') || status === 400 || status === 403) {
    return new ProviderError('PROVIDER_UNAVAILABLE', 'YouTube API 키 또는 권한을 확인하세요')
  }
  return new ProviderError('UPSTREAM_FAILED', `YouTube API 오류(HTTP ${status})`)
}

export function normalizeYouTubeComment(raw: unknown, sourceUrl: string, collectedAt: string, parentId: string | null): NormalizedComment | null {
  const item = obj(raw)
  const snippet = obj(item.snippet)
  const id = str(item.id)
  // textOriginal(작성 원문)을 우선하고, 없으면 plainText 형식의 textDisplay를 쓴다. 어느 쪽도 고치지 않는다.
  const text = str(snippet.textOriginal) ?? str(snippet.textDisplay)
  if (!id || text === null || text.length === 0) return null
  return {
    id,
    platform_comment_id: id,
    parent_id: parentId ?? str(snippet.parentId),
    author: str(snippet.authorDisplayName),
    text,
    like_count: num(snippet.likeCount),
    published_at: str(snippet.publishedAt),
    collected_at: collectedAt,
    source_url: sourceUrl,
  }
}

export function createYouTubeProvider(options: { apiKey: string | null; timeoutMs: number; fetcher?: typeof fetch; now?: () => Date }): CommentProvider<YouTubeRef> {
  const now = options.now ?? (() => new Date())
  const call = async (path: string, params: Record<string, string>) => {
    if (!options.apiKey) throw new ProviderError('PROVIDER_UNAVAILABLE', 'YOUTUBE_API_KEY가 설정되지 않아 YouTube 수집을 쓸 수 없습니다')
    const url = new URL(path, API)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    url.searchParams.set('key', options.apiKey)
    const { status, body } = await fetchJson(url, { method: 'GET', timeoutMs: options.timeoutMs, allowedHosts: HOSTS, fetcher: options.fetcher })
    if (status !== 200) throw upstreamError(status, body)
    return obj(body)
  }

  return {
    capabilities(): ProviderCapabilities {
      return {
        platform: 'YOUTUBE',
        available: options.apiKey !== null,
        reason: options.apiKey ? null : '서버에 YOUTUBE_API_KEY가 없어 YouTube 댓글을 가져올 수 없습니다',
        orders: ['time', 'relevance'],
        replies: 'FULL',
        maxChoices: [20, 50, 100, 200, 500],
      }
    },

    async resolve(ref): Promise<ContentSource> {
      const body = await call('videos', { part: 'snippet,statistics', id: ref.videoId })
      const items = Array.isArray(body.items) ? body.items : []
      if (items.length === 0) throw new ProviderError('NOT_FOUND_OR_PRIVATE', '영상을 찾을 수 없거나 비공개·삭제됐습니다')
      const video = obj(items[0])
      const snippet = obj(video.snippet)
      const statistics = obj(video.statistics)
      // commentCount가 없으면 댓글이 꺼진 영상인 경우가 많지만 확정은 commentThreads 응답으로 한다.
      return {
        platform: 'YOUTUBE',
        source_url: ref.canonicalUrl,
        content_id: ref.videoId,
        title: str(snippet.title),
        channel: str(snippet.channelTitle),
        published_at: str(snippet.publishedAt),
        platform_comment_count: num(statistics.commentCount),
        resolved_at: now().toISOString(),
      }
    },

    async collect(ref, source, collect: CollectOptions): Promise<CollectResult> {
      const collectedAt = now().toISOString()
      const sourceUrl = source.source_url ?? ref.canonicalUrl
      const notices: CollectNotice[] = []
      const comments: NormalizedComment[] = []
      let topLevelCount = 0
      const partialThreads: Array<{ parentId: string; have: number; total: number }> = []
      let pageToken: string | null = null
      let pages = 0
      do {
        const params: Record<string, string> = {
          part: collect.includeReplies ? 'snippet,replies' : 'snippet',
          videoId: ref.videoId,
          maxResults: '100',
          order: collect.order,
          textFormat: 'plainText',
        }
        if (pageToken) params.pageToken = pageToken
        let body: Json
        try {
          body = await call('commentThreads', params)
        } catch (error) {
          // 앞 페이지를 이미 받았다면 받은 만큼만 돌려주고 부분 수집임을 밝힌다.
          if (comments.length > 0 && error instanceof ProviderError && error.retryable) {
            notices.push({ code: 'UPSTREAM_PARTIAL', detail: `${pages + 1}번째 페이지 요청이 실패해 앞서 받은 ${comments.length}개만 사용합니다` })
            pageToken = null
            break
          }
          throw error
        }
        pages += 1
        for (const thread of Array.isArray(body.items) ? body.items : []) {
          if (topLevelCount >= collect.max) break
          const snippet = obj(obj(thread).snippet)
          const top = normalizeYouTubeComment(snippet.topLevelComment, sourceUrl, collectedAt, null)
          if (!top) continue
          comments.push(top)
          topLevelCount += 1
          if (!collect.includeReplies) continue
          const replies = Array.isArray(obj(obj(thread).replies).comments) ? obj(obj(thread).replies).comments as unknown[] : []
          let have = 0
          for (const reply of replies) {
            const normalized = normalizeYouTubeComment(reply, sourceUrl, collectedAt, top.id)
            if (normalized) { comments.push(normalized); have += 1 }
          }
          const total = num(snippet.totalReplyCount) ?? have
          if (total > have) partialThreads.push({ parentId: top.id, have, total })
        }
        pageToken = str(body.nextPageToken)
      } while (pageToken && topLevelCount < collect.max && pages < MAX_THREAD_PAGES)
      if (pageToken && topLevelCount < collect.max) notices.push({ code: 'PAGE_LIMIT', detail: `원댓글 요청 페이지 상한(${MAX_THREAD_PAGES}쪽)에서 멈췄습니다` })

      // commentThreads는 답글을 일부만 준다. 남은 개수 안에서 comments.list로 더 가져온다.
      let replyCalls = 0
      let missingReplies = 0
      for (const thread of partialThreads) {
        if (replyCalls >= MAX_REPLY_CALLS) { missingReplies += thread.total - thread.have; continue }
        replyCalls += 1
        try {
          const body = await call('comments', { part: 'snippet', parentId: thread.parentId, maxResults: '100', textFormat: 'plainText' })
          let have = thread.have
          for (const reply of Array.isArray(body.items) ? body.items : []) {
            const normalized = normalizeYouTubeComment(reply, sourceUrl, collectedAt, thread.parentId)
            if (normalized && !comments.some((comment) => comment.id === normalized.id)) { comments.push(normalized); have += 1 }
          }
          missingReplies += Math.max(0, thread.total - have)
        } catch {
          missingReplies += thread.total - thread.have
        }
      }
      if (missingReplies > 0) notices.push({ code: 'REPLIES_PARTIAL', detail: `개수 상한·요청 상한 때문에 답글 ${missingReplies}개는 가져오지 않았습니다` })

      const unique = dedupe(comments)
      if (unique.removed > 0) notices.push({ code: 'DUPLICATES_REMOVED', detail: `중복된 댓글 ${unique.removed}개를 한 번만 남겼습니다` })
      if (unique.comments.length === 0) throw new ProviderError('NO_COMMENTS', '가져올 수 있는 댓글이 없습니다')
      const actualTopLevel = unique.comments.filter((comment) => comment.parent_id === null).length
      if (actualTopLevel < collect.max) notices.push({ code: 'FEWER_THAN_REQUESTED', detail: `요청한 원댓글 ${collect.max}개보다 적은 ${actualTopLevel}개를 가져왔습니다(답글은 별도)` })
      return { comments: unique.comments, notices }
    },
  }
}
