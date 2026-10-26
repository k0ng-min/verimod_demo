import type { CollectNotice, CollectOptions, ContentSource, NormalizedComment, ProviderCapabilities } from '../../shared/types'

export interface CollectResult {
  comments: NormalizedComment[]
  notices: CollectNotice[]
}

/** 수집 provider 계약. 원문을 바꾸거나 만들어 내지 않고, provenance(id·부모·출처·수집 시각)를 채운다. */
export interface CommentProvider<Ref> {
  capabilities(): ProviderCapabilities
  resolve(ref: Ref): Promise<ContentSource>
  collect(ref: Ref, source: ContentSource, options: CollectOptions): Promise<CollectResult>
}

/** 같은 id의 댓글을 한 번만 남긴다(페이지 경계의 중복 등). */
export function dedupe(comments: NormalizedComment[]): { comments: NormalizedComment[]; removed: number } {
  const seen = new Set<string>()
  const out: NormalizedComment[] = []
  for (const comment of comments) {
    if (seen.has(comment.id)) continue
    seen.add(comment.id)
    out.push(comment)
  }
  return { comments: out, removed: comments.length - out.length }
}
