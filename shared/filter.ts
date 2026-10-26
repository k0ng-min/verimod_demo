import type { FilterSpec, NormalizedComment } from './types'

/** 화면 표시용 키워드 필터. 판정 정책·threshold와 무관하며 어떤 댓글을 판정에 보낼지만 고른다.
 *
 * 규칙
 * - 공통: 유니코드 NFKC 정규화, 영문 대소문자 무시.
 * - ANY/ALL(단어 포함): 띄어쓰기를 무시하고 포함 여부를 본다("너무 짜증" = "너무짜증").
 * - PHRASE(정확한 구문): 키워드를 입력 순서대로 한 칸 띄어 이은 구문이 그대로 있어야 한다.
 *   연속 공백·줄바꿈은 한 칸으로 본다.
 * - exclude: 모드와 관계없이 하나라도 포함(띄어쓰기 무시)하면 뺀다.
 * - SEMANTIC: 서버의 의미 판단 결과(semanticIds)만 일치로 본다. 그 뒤 exclude를 적용한다.
 */

export const MAX_KEYWORDS = 10
export const MAX_KEYWORD_LENGTH = 40

export function normalizeSpaced(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

export function normalizeCompact(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, '')
}

export function cleanKeywords(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const spaced = normalizeSpaced(value).slice(0, MAX_KEYWORD_LENGTH)
    if (!spaced || seen.has(spaced)) continue
    seen.add(spaced)
    out.push(spaced)
    if (out.length >= MAX_KEYWORDS) break
  }
  return out
}

export function matchesFilter(comment: Pick<NormalizedComment, 'id' | 'text'>, spec: FilterSpec, semanticIds?: ReadonlySet<string>): boolean {
  const keywords = cleanKeywords(spec.keywords)
  const exclude = cleanKeywords(spec.exclude)
  const compact = normalizeCompact(comment.text)
  if (exclude.some((word) => compact.includes(normalizeCompact(word)))) return false
  switch (spec.mode) {
    case 'SEMANTIC':
      return semanticIds?.has(comment.id) ?? false
    case 'ANY':
      return keywords.length === 0 || keywords.some((word) => compact.includes(normalizeCompact(word)))
    case 'ALL':
      return keywords.every((word) => compact.includes(normalizeCompact(word)))
    case 'PHRASE': {
      if (keywords.length === 0) return true
      return normalizeSpaced(comment.text).includes(keywords.join(' '))
    }
  }
}

export function applyFilter<T extends Pick<NormalizedComment, 'id' | 'text'>>(comments: readonly T[], spec: FilterSpec, semanticIds?: ReadonlySet<string>): T[] {
  return comments.filter((comment) => matchesFilter(comment, spec, semanticIds))
}
