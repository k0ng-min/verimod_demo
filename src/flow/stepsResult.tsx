import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import type { Action, SessionItem, SessionView } from '../../shared/types'
import { svc } from '../api/svc'
import { Icon3D } from '../components/Icon3D'
import { CountUp } from '../components/Kinetic'
import { PagerNav, useFitCount, usePager } from '../components/Pager'
import { StepFlow } from '../components/StepFlow'
import { ScoreBars, W4_PROVISIONAL_THRESHOLDS } from '../components/ScoreBars'
import { ActionBadge, ACTION_LABEL, ArrowIcon, CopyButton, downloadJson, Modal, Notice, shortHash } from '../components/ui'
import { W4_PROVISIONAL_POLICY_HASH } from '../verify/verifier'
import type { StepProps } from './AnalyzePage'
import { errorText, rememberSession } from './stepsCollect'

const done = (item: SessionItem) => item.status === 'ISSUED' || item.status === 'DEMO_JUDGED'

function counts(session: SessionView | null) {
  const items = session?.items ?? []
  return {
    total: items.length,
    judged: items.filter(done).length,
    failed: items.filter((item) => item.status === 'FAILED').length,
    cancelled: items.filter((item) => item.status === 'CANCELLED').length,
    waiting: items.filter((item) => item.status === 'SELECTED' || item.status === 'ISSUING').length,
    byAction: (action: Action) => items.filter((item) => done(item) && item.action === action).length,
  }
}

const STOP_TEXT: Record<string, string> = {
  INFERENCE_UNAVAILABLE: '실제 AI 추론을 쓸 수 없어 영수증을 발급하지 않았어요.',
  BACKEND_UNREACHABLE: 'VeriMod backend(127.0.0.1:3001)에 연결하지 못했어요.',
  SERVICE_RESTARTED: '판정 중에 서비스가 다시 시작돼 멈췄어요. 다시 시도하면 같은 요청 키로 이어서 진행해요.',
}

const ERROR_TEXT: Record<string, string> = {
  INFERENCE_UNAVAILABLE: '실제 AI 추론을 사용할 수 없어 발급하지 않음',
  BACKEND_UNREACHABLE: 'backend 연결 실패',
  IDEMPOTENCY_CONFLICT: '같은 요청 키에 다른 내용이 와서 거부됨',
  CANCELLED_BY_USER: '사용자가 취소함',
  INVALID_BACKEND_RESPONSE: 'backend 응답 형식 오류',
}

const ANCHOR_DEMO = [
  {
    icon: 'receipt',
    label: '01 · Receipt 발급',
    title: '댓글마다 판정 영수증을 만들어요',
    detail: '실제 R01 추론과 정책 판단은 여기까지 완료됩니다. 새 영수증은 아직 체인에 올라가지 않아 PENDING_ANCHOR 상태예요.',
  },
  {
    icon: 'card-box',
    label: '02 · F freeze',
    title: 'F가 미앵커 Receipt를 Epoch로 묶어요',
    detail: 'authoritative DB에서 Merkle root와 Receipt 수를 고정합니다. 이 단계부터는 운영자 간 확인이 필요한 경계예요.',
  },
  {
    icon: 'key',
    label: '03 · T 서명 · 전송',
    title: 'T가 승인된 publisher 지갑으로 거래를 준비해요',
    detail: 'F의 durable ACK로 root·count·계약 주소가 일치함을 확인한 뒤에만 Base Sepolia 전송이 가능합니다.',
  },
  {
    icon: 'chains',
    label: '04 · F confirmation',
    title: 'F가 네트워크에서 최종 확인해요',
    detail: '거래 이벤트와 Epoch 값, 최소 12 confirmations를 재검증하면 proof와 anchor가 공개되고 CONFIRMED가 됩니다.',
  },
] as const

/**
 * 신규 Receipt의 실제 상태를 바꾸지 않고, 운영자 전용 anchor 절차를 발표용으로 설명한다.
 * 자동 재생 영상 대신 사용자가 넘길 수 있는 모션 카드로 각 책임 경계를 분명히 보여 준다.
 */
/**
 * PENDING_ANCHOR 이후 절차는 실제 Receipt 상태를 변경하지 않는 발표용 안내다.
 * 화면을 길게 만들지 않도록 Share 진입 시 alert 카드로 열고, 4초마다 다음 단계로 넘긴다.
 */
function AnchoringDemo({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [index, setIndex] = useState(0)
  const reduce = useReducedMotion()
  const item = ANCHOR_DEMO[index]
  const next = () => setIndex((current) => current < ANCHOR_DEMO.length - 1 ? current + 1 : 0)

  useEffect(() => { if (open) setIndex(0) }, [open])

  useEffect(() => {
    if (!open || reduce) return
    const timer = window.setTimeout(() => {
      if (index === ANCHOR_DEMO.length - 1) onOpenChange(false)
      else next()
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [index, open, reduce])

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div className="anchor-alert__overlay" role="presentation"
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="anchor-alert" role="dialog" aria-modal="true" aria-labelledby="anchor-alert-title"
              initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0, y: 24, scale: 0.96 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
              <div className="anchor-alert__head">
                <div>
                  <span className="section-label">PENDING_ANCHOR 이후 · 흐름 데모</span>
                  <h2 id="anchor-alert-title">운영 확인은 이렇게 이어져요</h2>
                </div>
                <div className="anchor-alert__head-actions"><span className="anchor-alert__counter">{index + 1} / {ANCHOR_DEMO.length}</span><button type="button" className="anchor-alert__close" onClick={() => onOpenChange(false)} aria-label="안내 닫기">×</button></div>
              </div>
              <div className="anchor-alert__rail" aria-label="Epoch anchor 단계">
                {ANCHOR_DEMO.map((stage, stageIndex) => (
                  <span key={stage.label} className={`anchor-alert__dot${stageIndex === index ? ' anchor-alert__dot--active' : stageIndex < index ? ' anchor-alert__dot--done' : ''}`}>{stageIndex + 1}</span>
                ))}
              </div>
              <div className="anchor-alert__viewport" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={item.label} className="anchor-alert__slide"
                    initial={reduce ? false : { opacity: 0, x: 24, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0, x: -24, scale: 0.98 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
                    <div className="anchor-alert__art"><Icon3D src={item.icon} size={70} /></div>
                    <div className="anchor-alert__copy"><span>{item.label}</span><strong>{item.title}</strong><p>{item.detail}</p></div>
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="anchor-alert__footer">
                <span className="anchor-alert__timer" aria-label="다음 단계까지 남은 시간"><i key={index} /></span>
                <button type="button" className="anchor-alert__next" onClick={next} aria-label="다음 안내 단계"><ArrowIcon size={26} /></button>
              </div>
              <p className="anchor-alert__notice"><b>흐름 이해를 위한 데모예요.</b> 이 Receipt는 실제로 PENDING_ANCHOR에 머뭅니다. T/F ACK와 네트워크 확인의 실제 구현·검증 근거는 발표 PPT에서 확인할 수 있어요.</p>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function RunStep({ flow, go, session, setSession }: StepProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const c = counts(session)
  const phase = session?.phase
  const processed = c.judged + c.failed + c.cancelled

  useEffect(() => {
    if (!session || phase !== 'RUNNING') return
    const timer = window.setInterval(() => {
      svc.session(session.id, flow.owner).then(({ session: next }) => setSession(next)).catch((caught) => setError(errorText(caught)))
    }, 700)
    return () => window.clearInterval(timer)
  }, [session, phase, flow.owner, setSession])

  useEffect(() => {
    if (phase !== 'DONE') return
    const timer = window.setTimeout(() => go('result'), 900)
    return () => window.clearTimeout(timer)
  }, [phase, go])

  const retry = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try { setSession((await svc.analyze(session.id, flow.owner)).session) } catch (caught) { setError(errorText(caught)) } finally { setBusy(false) }
  }
  const cancel = async () => {
    if (!session) return
    try { await svc.cancel(session.id, flow.owner) } catch (caught) { setError(errorText(caught)) }
  }

  const demo = session?.is_demo
  const stage = (label: string, detail: string, state: 'done' | 'run' | 'wait' | 'stop') => (
    <li className={`vstage vstage--${state}`}>
      <span className="vstage__dot" aria-hidden>{state === 'done' ? '✓' : state === 'stop' ? '!' : state === 'run' ? '' : '·'}</span>
      <span className="vstage__label">{label}</span>
      <span className="vstage__detail">{detail}</span>
    </li>
  )
  const judgeState = phase === 'RUNNING' ? 'run' : phase === 'DONE' ? 'done' : phase === 'STOPPED' || phase === 'CANCELLED' ? 'stop' : 'wait'

  return (
    <StepFlow stepKey="run" icon="hourglass" eyebrow="판정 진행" dense
      title={phase === 'DONE' ? '판정을 마쳤어요' : phase === 'STOPPED' ? '판정을 멈췄어요' : phase === 'CANCELLED' ? '판정을 취소했어요' : '판정하고 있어요'}
      subtitle={`실제 처리한 건수로만 진행률을 보여 줘요. ${demo ? '데모는 합성 점수예요.' : ''}`}
      secondary={phase === 'RUNNING'
        ? <button type="button" className="btn-secondary vgrow" onClick={cancel}>취소</button>
        : phase === 'STOPPED' || phase === 'CANCELLED'
          ? <button type="button" className="btn-secondary vgrow" onClick={retry} disabled={busy}>{busy ? '다시 시도 중' : '다시 시도'}</button>
          : undefined}
      onNext={phase === 'RUNNING' ? undefined : () => go('result')} nextLabel="결과 보기">
      <ol className="vstages">
        {stage('댓글 수집', `가져온 ${session?.comments.length ?? 0}개`, 'done')}
        {stage('조건·선택', `판정 대상 ${c.total}개`, 'done')}
        {stage(demo ? '합성 판정(데모)' : 'AI 판정 · 정책 적용', `${processed} / ${c.total}`, judgeState)}
        {stage('영수증 발급', demo ? '데모는 영수증 없음' : `발급 ${c.judged}개 · 실패 ${c.failed}개`, demo ? 'wait' : c.judged > 0 && phase !== 'RUNNING' ? 'done' : judgeState)}
      </ol>
      <div className="vprogress" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={processed} aria-label="판정 진행">
        <span style={{ width: `${c.total ? (processed / c.total) * 100 : 0}%` }} />
      </div>
      <p className="vbig-count" aria-live="polite"><CountUp value={processed} /><span> / {c.total}</span></p>
      <p className="vhint vcenter-text">{processed} / {c.total}개 처리 · 남은 {c.waiting}개{c.cancelled ? ` · 취소 ${c.cancelled}개` : ''}</p>
      {phase === 'STOPPED' && (
        <Notice tone="error" icon="warning">
          {STOP_TEXT[session?.stop_reason ?? ''] ?? `판정을 멈췄어요(${session?.stop_reason})`} 실패한 댓글은 영수증이 없어요.
          {c.waiting > 0 && ` 연속 실패로 남은 ${c.waiting}개는 시도하지 않았어요.`}
        </Notice>
      )}
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}

type Tab = 'ALL' | Action | 'FAILED'

function ItemDetail({ item, text, onClose, demo, sessionId, owner }: { item: SessionItem; text: string; onClose: () => void; demo: boolean; sessionId: string; owner: string | null }) {
  const [pkgError, setPkgError] = useState<string | null>(null)
  const savePackage = async () => {
    try {
      const { packages } = await svc.privatePackages(sessionId, owner)
      const one = packages.find((entry) => entry.receipt_id === item.receipt_id)
      if (!one) throw new Error('Private Package를 찾지 못했어요')
      downloadJson(`verimod-private-${item.receipt_id}.json`, one)
    } catch (caught) { setPkgError(errorText(caught)) }
  }
  return (
    <Modal title="판정 세부" onClose={onClose}>
      <p className="vquote">{text}</p>
      {item.scores_ppm && <ScoreBars scores={item.scores_ppm} synthetic={demo} thresholds={!demo && item.policy_manifest_hash === W4_PROVISIONAL_POLICY_HASH ? W4_PROVISIONAL_THRESHOLDS : null} />}
      <dl className="vrows">
        <div><dt>조치</dt><dd><ActionBadge action={item.action} status={item.status} /></dd></div>
        <div><dt>근거 코드</dt><dd className="vmono">{item.reason_codes.length ? item.reason_codes.join(', ') : '없음(허용)'}</dd></div>
        {item.triggered_rule_ids.length > 0 && <div><dt>적용 규칙</dt><dd className="vmono">{item.triggered_rule_ids.join(', ')}</dd></div>}
        {item.input_status && <div><dt>입력 상태</dt><dd>{item.input_status === 'TRUNCATED' ? '길어서 잘림(검토로 보냄)' : '전체'}</dd></div>}
        {!demo && <div><dt>모델 manifest</dt><dd className="vmono">{shortHash(item.model_manifest_hash)}</dd></div>}
        {!demo && <div><dt>정책 manifest</dt><dd className="vmono">{shortHash(item.policy_manifest_hash)}</dd></div>}
        {item.error_code && <div><dt>미발급 이유</dt><dd>{ERROR_TEXT[item.error_code] ?? item.error_code}</dd></div>}
        {item.receipt_id && <div><dt>영수증</dt><dd><Link className="link-button" to={`/r/${item.receipt_id}`}>{shortHash(item.receipt_id, 8, 4)} 열기</Link></dd></div>}
      </dl>
      {item.receipt_id && <button type="button" className="btn-secondary vsmall-btn" onClick={() => void savePackage()}>이 댓글의 Private Package 저장</button>}
      {pkgError && <p className="error-box">{pkgError}</p>}
      <p className="vhint">{demo ? '데모 판정은 실제 AI·정책이 아니에요.' : '점수와 조치는 판정 기록이에요. AI가 옳다는 증명은 아니에요.'}</p>
    </Modal>
  )
}

export function ResultStep({ go, session, flow }: StepProps) {
  const c = counts(session)
  const [tab, setTab] = useState<Tab>('ALL')
  const [open, setOpen] = useState<SessionItem | null>(null)
  const texts = useMemo(() => new Map((session?.comments ?? []).map((comment) => [comment.id, comment.text])), [session])
  const items = (session?.items ?? []).filter((item) =>
    tab === 'ALL' ? true : tab === 'FAILED' ? !done(item) : done(item) && item.action === tab)
  const listRef = useRef<HTMLDivElement>(null)
  const pageSize = useFitCount(listRef, 54, 2, 8)
  const { page, setPage, totalPages, pageItems } = usePager(items, pageSize, tab)
  const tabs: Array<[Tab, string, number]> = [
    ['ALL', '전체', c.total], ['ALLOW', '허용', c.byAction('ALLOW')], ['HUMAN_REVIEW', '검토', c.byAction('HUMAN_REVIEW')],
    ['RESTRICT', '제한', c.byAction('RESTRICT')], ['FAILED', '미발급', c.total - c.judged],
  ]

  return (
    <StepFlow stepKey="result" icon="chart" eyebrow="판정 결과" title={session?.is_demo ? '데모 판정 결과예요' : `영수증 ${c.judged}개를 받았어요`} dense
      subtitle={session?.is_demo ? '합성 점수 결과라 실제 판단이 아니에요.' : '항목을 누르면 점수·근거 코드·정책 정보를 볼 수 있어요.'}
      onNext={() => go('share')} nextLabel={session?.is_demo ? '공유 화면 보기' : '영수증·공유'}>
      <div className="vtiles">
        {(['ALLOW', 'HUMAN_REVIEW', 'RESTRICT'] as const).map((action) => (
          <div key={action} className={`vtile vtile--${action.toLowerCase()}`}><strong><CountUp value={c.byAction(action)} /></strong><span>{ACTION_LABEL[action]}</span></div>
        ))}
        <div className="vtile vtile--fail"><strong><CountUp value={c.total - c.judged} /></strong><span>미발급</span></div>
      </div>
      <div className="tabs vtabs" role="tablist">
        {tabs.filter(([key, , n]) => key === 'ALL' || n > 0).map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' tab--active' : ''}`} onClick={() => setTab(key)}>{label} {n}</button>
        ))}
      </div>
      <div className="vlist" ref={listRef}>
        {pageItems.map((item) => (
          <button key={item.comment_id} type="button" className="vresult" onClick={() => setOpen(item)}>
            <ActionBadge action={done(item) ? item.action : null} status={item.status} />
            <span className="vresult__text">{texts.get(item.comment_id)}</span>
            <span className="vresult__meta">{item.receipt_id ? shortHash(item.receipt_id, 6, 0).replace('…', '') : item.error_code ? '영수증 없음' : ''} ›</span>
          </button>
        ))}
      </div>
      <PagerNav page={page} totalPages={totalPages} onChange={setPage} />
      {open && session && <ItemDetail item={open} text={texts.get(open.comment_id) ?? ''} demo={session.is_demo} sessionId={session.id} owner={flow.owner} onClose={() => setOpen(null)} />}
    </StepFlow>
  )
}

export function ShareStep({ flow, update, session, setSession, restart, anchorDemoOpen, setAnchorDemoOpen }: StepProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const c = counts(session)
  if (!session) return null
  const publicUrl = `${window.location.origin}/s/${session.public_id}`

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try { await task() } catch (caught) { setError(errorText(caught)) } finally { setBusy(null) }
  }
  const download = () => run('pkg', async () => {
    downloadJson(`verimod-private-session-${session.id.slice(0, 8)}.json`, (await svc.privatePackages(session.id, flow.owner)).packages)
  })
  const again = () => run('again', async () => {
    const created = session.is_demo
      ? await svc.createSession({ kind: 'DEMO', options: flow.options })
      : session.source.platform === 'MANUAL'
        ? await svc.createSession({ kind: 'MANUAL', text: session.comments.map((comment) => comment.text).join('\n') })
        : await svc.createSession({ kind: 'URL', url: flow.url || session.source.source_url || '', options: flow.options })
    rememberSession(created.session, created.owner_token, flow)
    setSession(created.session)
    update({ sessionId: created.session.id, owner: created.owner_token, excluded: [], semantic: null, step: 'words' })
  })

  return (
    <StepFlow stepKey="share" icon="receipt" eyebrow="영수증·공유" dense
      title={session.is_demo ? '데모는 영수증이 없어요' : '영수증을 보관하고 공유해요'}
      subtitle={session.is_demo ? '실제 블록체인 검증은 공개 증거 영수증으로 해 볼 수 있어요.' : `영수증 ${c.judged}개는 댓글마다 따로 발급됐고, 아래 링크는 그 목록을 모아 보여 줘요.`}
      >
      <div className="card vcard-tight">
        <span className="section-label">공개 링크 {session.is_demo && '· 데모'}</span>
        <div className="vlinkrow">
          <code className="vlinkrow__url">{publicUrl}</code>
          <CopyButton value={publicUrl} />
        </div>
        <p className="vhint vshare-hint">새 브라우저에서도 열려요. 영수증 ID 목록일 뿐 새로운 암호학적 증명이 아니며, 원문은 {session.settings.publicText ? '함께 보여요' : '보이지 않아요'}. salt·Private Package는 들어가지 않아요.</p>
      </div>
      {session.is_demo ? (
        <Notice tone="info" icon="chains">
          <Link className="link-button" to="/r/evidence-0">2026-10-20 Base Sepolia에 실제 등록된 공개 영수증</Link>으로 브라우저 독립 검증을 해 볼 수 있어요.
        </Notice>
      ) : (
        <>
          <Notice tone="info" icon="hourglass">
            새 영수증은 <b>PENDING_ANCHOR</b>예요. 운영자가 epoch를 묶어 체인에 등록·확정하기 전에는 블록체인 검증이 <b>대기</b>로 나와요(VALID 아님).
          </Notice>
          <AnchoringDemo open={anchorDemoOpen} onOpenChange={setAnchorDemoOpen} />
        </>
      )}
      <div className="vactions-grid">
        {!session.is_demo && (
          <button type="button" className="vaction" onClick={download} disabled={busy !== null || c.judged === 0}>
            <Icon3D src="lock" size={30} /><span><strong>Private Package 저장</strong><em>원문·salt 포함 · 공유 금지</em></span>
          </button>
        )}
        <Link className="vaction" to="/vault"><Icon3D src="folder" size={30} /><span><strong>보관함</strong><em>{flow.keepInBrowser ? '이 브라우저에 보관됨' : '브라우저 보관 안 함'}</em></span></Link>
        <button type="button" className="vaction" onClick={again} disabled={busy !== null}><Icon3D src="gear" size={30} /><span><strong>조건 바꿔 다시</strong><em>새 세션으로 다시 수집</em></span></button>
        <button type="button" className="vaction" onClick={restart} disabled={busy !== null}><Icon3D src="link" size={30} /><span><strong>새 링크 분석</strong><em>처음부터</em></span></button>
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}
