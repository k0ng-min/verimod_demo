/** 게스트 보관함: 이 브라우저의 localStorage에만 있다. 다른 기기·브라우저에서는 보이지 않는다.
 * 원문·salt·private package는 여기 넣지 않는다. 세션 id, 공개 id, 소유 토큰(이 세션을 다시 열기 위한 열쇠), 제목만 둔다. */

export interface GuestSessionRef {
  session_id: string
  public_id: string
  owner_token: string
  title: string | null
  platform: string
  is_demo: boolean
  created_at: string
}

const KEY = 'verimod_redesign_guest_sessions_v1'

export function listGuestSessions(): GuestSessionRef[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(parsed) ? parsed.filter((item): item is GuestSessionRef => typeof item?.session_id === 'string' && typeof item?.owner_token === 'string') : []
  } catch {
    return []
  }
}

export function saveGuestSession(ref: GuestSessionRef): boolean {
  try {
    const next = [ref, ...listGuestSessions().filter((item) => item.session_id !== ref.session_id)].slice(0, 50)
    localStorage.setItem(KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

export function removeGuestSession(sessionId: string) {
  try { localStorage.setItem(KEY, JSON.stringify(listGuestSessions().filter((item) => item.session_id !== sessionId))) } catch { /* ignore */ }
}

export function guestOwnerToken(sessionId: string): string | null {
  return listGuestSessions().find((item) => item.session_id === sessionId)?.owner_token ?? null
}
