import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Capabilities, SessionView } from '../../shared/types'
import { svc, SvcError } from '../api/svc'
import { TopBar } from '../components/ui'
import { guestOwnerToken } from '../lib/guestVault'
import { INITIAL, loadFlow, saveFlow, STEPS, type FlowState, type StepId } from './state'
import { LinkStep, ScopeStep, SourceStep } from './stepsCollect'
import { PickStep, SettingsStep, WordsStep } from './stepsSelect'
import { ResultStep, RunStep, ShareStep } from './stepsResult'

export interface StepProps {
  flow: FlowState
  update: (patch: Partial<FlowState>) => void
  go: (step: StepId) => void
  session: SessionView | null
  setSession: (session: SessionView | null) => void
  caps: Capabilities | null
  capsError: string | null
  restart: () => void
  anchorDemoOpen: boolean
  setAnchorDemoOpen: (open: boolean) => void
}

const TITLES: Record<StepId, string> = {
  link: '콘텐츠 연결', source: '콘텐츠 확인', scope: '수집 범위', words: '단어 조건', pick: '댓글 선택',
  settings: '판정 전 확인', run: '판정 진행', result: '판정 결과', share: '영수증·공유',
}

export function stepForPhase(phase: SessionView['phase']): StepId {
  if (phase === 'COLLECTED') return 'words'
  if (phase === 'SELECTED') return 'settings'
  if (phase === 'RUNNING') return 'run'
  return 'result'
}

export function AnalyzePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [flow, setFlow] = useState<FlowState>(loadFlow)
  const [session, setSession] = useState<SessionView | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [capsError, setCapsError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [anchorDemoOpen, setAnchorDemoOpen] = useState(false)
  const previousStep = useRef<StepId | null>(null)

  const update = useCallback((patch: Partial<FlowState>) => setFlow((current) => ({ ...current, ...patch })), [])
  const go = useCallback((step: StepId) => setFlow((current) => ({ ...current, step })), [])
  const restart = useCallback(() => { setSession(null); setFlow({ ...INITIAL }) }, [])

  useEffect(() => { saveFlow(flow) }, [flow])
  useEffect(() => {
    if (flow.step === 'share' && previousStep.current !== 'share') setAnchorDemoOpen(true)
    previousStep.current = flow.step
  }, [flow.step])

  useEffect(() => {
    svc.capabilities().then(setCaps).catch((error: unknown) => setCapsError(error instanceof SvcError ? error.message : '서비스 상태를 확인하지 못했습니다'))
  }, [])

  // 홈의 "데모 둘러보기"는 사용자가 명시적으로 고른 데모 경로다(수집 실패 시 자동 대체가 아니다).
  useEffect(() => {
    if (params.get('demo') !== '1') return
    setSession(null)
    setFlow({ ...INITIAL, kind: 'DEMO' })
    setParams({}, { replace: true })
  }, [params, setParams])

  // ?session=ID로 들어오면(보관함에서 다시 열기) 서버 세션을 불러와 알맞은 단계로 간다.
  const resumeId = params.get('session')
  useEffect(() => {
    if (!resumeId) return
    const owner = guestOwnerToken(resumeId)
    svc.session(resumeId, owner).then(({ session: loaded }) => {
      setSession(loaded)
      setFlow((current) => ({
        ...current, sessionId: loaded.id, owner, kind: loaded.source.platform === 'DEMO' ? 'DEMO' : loaded.source.platform === 'MANUAL' ? 'MANUAL' : 'URL',
        source: loaded.source, options: loaded.options, filter: loaded.filter ?? current.filter, step: stepForPhase(loaded.phase),
        publicText: loaded.settings.publicText,
      }))
      setParams({}, { replace: true })
    }).catch((error: unknown) => setLoadError(error instanceof SvcError ? error.message : '세션을 불러오지 못했습니다'))
  }, [resumeId, setParams])

  // 새로고침으로 들어온 경우 진행 중이던 세션을 다시 받는다.
  useEffect(() => {
    if (resumeId || session || !flow.sessionId || ['link', 'source', 'scope'].includes(flow.step)) return
    svc.session(flow.sessionId, flow.owner).then(({ session: loaded }) => setSession(loaded)).catch(() => {
      setFlow((current) => ({ ...current, sessionId: null, owner: null, step: 'link' }))
    })
  }, [resumeId, session, flow.sessionId, flow.owner, flow.step])

  const props: StepProps = { flow, update, go, session, setSession, caps, capsError, restart, anchorDemoOpen, setAnchorDemoOpen }
  const index = STEPS.indexOf(flow.step)
  const needsSession = index >= STEPS.indexOf('words')
  const goPrevious = () => {
    const previous: Partial<Record<StepId, StepId>> = {
      source: 'link', scope: 'source',
      words: flow.kind === 'MANUAL' ? 'link' : 'scope', pick: 'words', settings: 'pick', run: 'settings', result: 'run', share: 'result',
    }
    const step = previous[flow.step]
    if (step) go(step)
    else navigate('/')
  }

  return (
    <div className="page vpage">
      {/* 분석 화면에는 FINANCECHALLENGE 톤의 상단 고정 뒤로가기 하나만 둔다. */}
      <TopBar title={TITLES[flow.step]} step={`${index + 1}/${STEPS.length}`} onHome={goPrevious} onHelp={flow.step === 'share' && !session?.is_demo ? () => setAnchorDemoOpen(true) : undefined} />
      {loadError ? (
        <div className="vcenter"><p className="error-box">{loadError}</p><button type="button" className="btn-secondary" onClick={() => { setLoadError(null); restart() }}>새로 시작</button></div>
      ) : needsSession && !session ? (
        <div className="vcenter"><p className="muted">세션을 불러오는 중...</p></div>
      ) : (
        <>
          {flow.step === 'link' && <LinkStep {...props} />}
          {flow.step === 'source' && <SourceStep {...props} />}
          {flow.step === 'scope' && <ScopeStep {...props} />}
          {flow.step === 'words' && <WordsStep {...props} />}
          {flow.step === 'pick' && <PickStep {...props} />}
          {flow.step === 'settings' && <SettingsStep {...props} />}
          {flow.step === 'run' && <RunStep {...props} />}
          {flow.step === 'result' && <ResultStep {...props} />}
          {flow.step === 'share' && <ShareStep {...props} />}
        </>
      )}
    </div>
  )
}
