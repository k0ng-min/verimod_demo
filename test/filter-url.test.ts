import { describe, expect, it } from 'vitest'
import { applyFilter, cleanKeywords, matchesFilter } from '../shared/filter'
import { parseContentUrl } from '../shared/url'

const c = (id: string, text: string) => ({ id, text })
const comments = [
  c('1', '공사 소음 때문에 너무 짜증 나요'),
  c('2', '너무짜증나게 숨기지 말고'),
  c('3', '주차장 확장도 같이 해 주세요'),
  c('4', 'Library 리모델링 GOOD'),
  c('5', '공사   소음은 오후에만'),
]
const ids = (spec: Parameters<typeof applyFilter>[1], semantic?: Set<string>) => applyFilter(comments, spec, semantic).map((x) => x.id)

describe('keyword filter', () => {
  it('ANY ignores spacing and case', () => {
    expect(ids({ mode: 'ANY', keywords: ['너무 짜증'], exclude: [] })).toEqual(['1', '2'])
    expect(ids({ mode: 'ANY', keywords: ['library', '주차장'], exclude: [] })).toEqual(['3', '4'])
  })
  it('ALL requires every keyword', () => {
    expect(ids({ mode: 'ALL', keywords: ['공사', '소음'], exclude: [] })).toEqual(['1', '5'])
    expect(ids({ mode: 'ALL', keywords: ['공사', '주차장'], exclude: [] })).toEqual([])
  })
  it('PHRASE needs the exact spaced sequence (runs of whitespace collapse)', () => {
    expect(ids({ mode: 'PHRASE', keywords: ['너무', '짜증'], exclude: [] })).toEqual(['1'])
    expect(ids({ mode: 'PHRASE', keywords: ['공사 소음'], exclude: [] })).toEqual(['1', '5'])
  })
  it('exclude wins in every mode', () => {
    expect(ids({ mode: 'ANY', keywords: ['공사'], exclude: ['오후'] })).toEqual(['1'])
    expect(ids({ mode: 'SEMANTIC', keywords: ['주차'], exclude: ['확장'] }, new Set(['3', '4']))).toEqual(['4'])
  })
  it('SEMANTIC only trusts the server-provided id set', () => {
    expect(ids({ mode: 'SEMANTIC', keywords: ['x'], exclude: [] })).toEqual([])
    expect(ids({ mode: 'SEMANTIC', keywords: ['x'], exclude: [] }, new Set(['2']))).toEqual(['2'])
  })
  it('empty keyword list means all collected comments', () => {
    expect(ids({ mode: 'ANY', keywords: [], exclude: [] })).toHaveLength(5)
    expect(matchesFilter(c('z', 'anything'), { mode: 'PHRASE', keywords: [], exclude: [] })).toBe(true)
  })
  it('keywords are normalized, deduplicated and capped', () => {
    expect(cleanKeywords([' A ', 'a', '', 'b  c'])).toEqual(['a', 'b c'])
    expect(cleanKeywords(Array.from({ length: 30 }, (_, i) => `k${i}`))).toHaveLength(10)
  })
})

describe('content url parsing', () => {
  it('accepts YouTube forms and normalizes', () => {
    for (const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'youtu.be/dQw4w9WgXcQ', 'https://m.youtube.com/shorts/dQw4w9WgXcQ']) {
      expect(parseContentUrl(url)).toEqual({ kind: 'YOUTUBE', videoId: 'dQw4w9WgXcQ', canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
    }
  })
  it('separates news, unsupported and invalid', () => {
    expect(parseContentUrl('https://n.news.naver.com/article/001/0000000001').kind).toBe('NEWS')
    expect(parseContentUrl('https://example.com/post/1').kind).toBe('UNSUPPORTED')
    expect(parseContentUrl('javascript:alert(1)').kind).toBe('INVALID')
    expect(parseContentUrl('https://user:pw@youtube.com/watch?v=dQw4w9WgXcQ').kind).toBe('INVALID')
    expect(parseContentUrl('https://www.youtube.com/watch?v=short').kind).toBe('INVALID')
    expect(parseContentUrl('http://127.0.0.1:3001/api').kind).toBe('UNSUPPORTED')
  })
})
