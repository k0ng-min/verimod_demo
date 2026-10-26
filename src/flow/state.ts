import type { CollectOptions, ContentSource, FilterSpec } from '../../shared/types'

export type SourceKind = 'URL' | 'MANUAL' | 'DEMO'
export const STEPS = ['link', 'source', 'scope', 'words', 'pick', 'settings', 'run', 'result', 'share'] as const
export type StepId = (typeof STEPS)[number]

/** 화면 단계 상태. 서버 상태(SessionView)와 분리되어 있고, 새로고침해도 이어지도록 sessionStorage에 둔다.
 * 원문·salt는 담지 않는다(원문은 서버 세션에서 다시 받는다). */
export interface FlowState {
  step: StepId
  kind: SourceKind
  url: string
  manualText: string
  source: ContentSource | null
  options: CollectOptions
  sessionId: string | null
  owner: string | null
  filter: FilterSpec
  semantic: { query: string; ids: string[] } | null
  excluded: string[]
  keepInBrowser: boolean
  publicText: boolean
}

export const INITIAL: FlowState = {
  step: 'link',
  kind: 'URL',
  url: '',
  manualText: '',
  source: null,
  options: { max: 50, order: 'relevance', includeReplies: true },
  sessionId: null,
  owner: null,
  filter: { mode: 'ANY', keywords: [], exclude: [] },
  semantic: null,
  excluded: [],
  keepInBrowser: true,
  publicText: false,
}

const KEY = 'verimod_redesign_flow_v1'

export function loadFlow(): FlowState {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return INITIAL
    const parsed = JSON.parse(raw) as Partial<FlowState>
    return { ...INITIAL, ...parsed, manualText: '', step: STEPS.includes(parsed.step as StepId) ? parsed.step as StepId : 'link' }
  } catch {
    return INITIAL
  }
}

export function saveFlow(state: FlowState) {
  // 붙여 넣은 원문 목록은 저장하지 않는다(세션 생성 뒤에는 서버에 있다).
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...state, manualText: '' })) } catch { /* ignore */ }
}

export function clearFlow() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}
