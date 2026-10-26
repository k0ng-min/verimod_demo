/** 사용자가 붙여 넣은 주소가 어떤 수집 경로에 해당하는지 판별한다. 네트워크 요청은 하지 않는다.
 * 서버는 이 결과에서 꺼낸 id만 고정된 공식 API 주소에 넣고, 사용자 URL 자체로는 요청하지 않는다(SSRF 차단). */

export type ParsedUrl =
  | { kind: 'YOUTUBE'; videoId: string; canonicalUrl: string }
  | { kind: 'NEWS'; host: string; site: string }
  | { kind: 'UNSUPPORTED'; host: string }
  | { kind: 'INVALID'; reason: string }

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** 댓글 수집 공식 API를 찾지 못한 주요 국내 뉴스. 지원 사이트처럼 보이지 않도록 따로 안내한다. */
export const KNOWN_NEWS_SITES: Record<string, string> = {
  'n.news.naver.com': '네이버 뉴스',
  'news.naver.com': '네이버 뉴스',
  'm.news.naver.com': '네이버 뉴스',
  'v.daum.net': '다음 뉴스',
  'news.daum.net': '다음 뉴스',
  'news.nate.com': '네이트 뉴스',
}

export function parseContentUrl(input: string): ParsedUrl {
  const raw = input.trim()
  if (raw.length === 0) return { kind: 'INVALID', reason: '주소를 입력하세요' }
  if (raw.length > 2048) return { kind: 'INVALID', reason: '주소가 너무 깁니다' }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return { kind: 'INVALID', reason: '올바른 주소 형식이 아닙니다' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'INVALID', reason: 'http(s) 주소만 받습니다' }
  if (url.username || url.password) return { kind: 'INVALID', reason: '계정 정보가 들어간 주소는 받지 않습니다' }
  const host = url.hostname.toLowerCase()

  let videoId: string | null = null
  if (host === 'youtu.be') videoId = url.pathname.split('/')[1] ?? null
  else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v')
    else {
      const match = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname)
      videoId = match?.[1] ?? null
    }
  }
  if (videoId !== null || host === 'youtu.be' || YOUTUBE_HOSTS.has(host)) {
    if (!videoId || !VIDEO_ID.test(videoId)) return { kind: 'INVALID', reason: 'YouTube 영상 주소에서 영상 id를 찾지 못했습니다' }
    return { kind: 'YOUTUBE', videoId, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}` }
  }
  const site = KNOWN_NEWS_SITES[host]
  if (site) return { kind: 'NEWS', host, site }
  return { kind: 'UNSUPPORTED', host }
}
