import { useMemo, useRef, useState } from 'react'
import { applyFilter, cleanKeywords, MAX_KEYWORDS, normalizeCompact } from '../../shared/filter'
import type { MatchMode, NormalizedComment } from '../../shared/types'
import { MAX_INPUT_CODE_POINTS } from '@verimod/protocol/manifests'
import { svc } from '../api/svc'
import { PagerNav, useFitCount, usePager } from '../components/Pager'
import { StepFlow } from '../components/StepFlow'
import { Chip, Notice, Toggle } from '../components/ui'
import { CountUp } from '../components/Kinetic'
import { removeGuestSession } from '../lib/guestVault'
import type { StepProps } from './AnalyzePage'
import { errorText, rememberSession } from './stepsCollect'

const MODES: Array<{ mode: MatchMode; label: string }> = [
  { mode: 'ANY', label: '하나라도 포함' },
  { mode: 'ALL', label: '모두 포함' },
  { mode: 'PHRASE', label: '정확한 구문' },
  { mode: 'SEMANTIC', label: '관련 주제 (AI)' },
]

export function useMatched({ session, flow }: Pick<StepProps, 'session' | 'flow'>) {
  return useMemo(() => {
    const comments = session?.comments ?? []
    const semanticIds = flow.filter.mode === 'SEMANTIC' && flow.semantic && flow.semantic.query === (cleanKeywords(flow.filter.keywords)[0] ?? '')
      ? new Set(flow.semantic.ids) : undefined
    return applyFilter(comments, flow.filter, semanticIds)
  }, [session, flow.filter, flow.semantic])
}

function KeywordInput({ label, placeholder, values, onChange, id }: { label: string; placeholder: string; values: string[]; onChange: (next: string[]) => void; id: string }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const next = cleanKeywords([...values, ...draft.split(',')])
    onChange(next)
    setDraft('')
  }
  return (
    <div className="vfield vfield--tight">
      <label htmlFor={id} className="vlabel">{label} <span className="vlabel__hint">{values.length}/{MAX_KEYWORDS}</span></label>
      <div className="vinline">
        <input id={id} className="vinput" value={draft} placeholder={placeholder} maxLength={40}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
        <button type="button" className="btn-secondary vinline__btn" onClick={add} disabled={!draft.trim() || values.length >= MAX_KEYWORDS}>추가</button>
      </div>
      {values.length > 0 && (
        <div className="vtags">
          {values.map((value) => (
            <button key={value} type="button" className="vtag" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={`${value} 지우기`}>
              {value}<span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function WordsStep(props: StepProps) {
  const { flow, update, go, session, caps, restart } = props
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topic, setTopic] = useState(flow.filter.mode === 'SEMANTIC' ? flow.filter.keywords[0] ?? '' : '')
  const [showExclude, setShowExclude] = useState(flow.filter.exclude.length > 0)
  const matched = useMatched(props)
  const total = session?.comments.length ?? 0
  const semanticReady = flow.filter.mode !== 'SEMANTIC' || (flow.semantic !== null && flow.semantic.query === (cleanKeywords(flow.filter.keywords)[0] ?? ''))
  const semanticAvailable = caps?.semantic.available ?? false

  const setFilter = (patch: Partial<typeof flow.filter>) => update({ filter: { ...flow.filter, ...patch }, excluded: [] })
  const findSemantic = async () => {
    if (!session) return
    setError(null)
    setBusy(true)
    try {
      const result = await svc.semantic(session.id, flow.owner, topic)
      const query = cleanKeywords([topic])[0] ?? ''
      update({ semantic: { query, ids: result.ids }, filter: { ...flow.filter, keywords: [query] }, excluded: [] })
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  const locked = session && !['COLLECTED', 'SELECTED'].includes(session.phase)

  return (
    <StepFlow stepKey="words" icon="gear" eyebrow="단어 조건" title="어떤 댓글을 고를까요?"
      subtitle={`가져온 댓글 ${total}개 안에서만 골라요. 판정 기준은 바뀌지 않아요.`} dense
      onNext={() => go('pick')}
      nextDisabled={matched.length === 0 || !semanticReady || Boolean(locked)} nextLabel={matched.length ? `일치한 ${matched.length}개 고르기` : '일치하는 댓글이 없어요'}>
      {locked && <Notice tone="warn" icon="lock">이 세션은 이미 판정을 시작해 조건을 바꿀 수 없어요. <button type="button" className="link-button" onClick={restart}>새로 시작</button></Notice>}
      <div className="vchips vchips--row" role="group" aria-label="단어 선택 방식">
        {MODES.map(({ mode, label }) => (
          <Chip key={mode} on={flow.filter.mode === mode} disabled={mode === 'SEMANTIC' && !semanticAvailable}
            title={mode === 'SEMANTIC' && !semanticAvailable ? caps?.semantic.reason ?? '' : undefined}
            onClick={() => setFilter({ mode, keywords: mode === 'SEMANTIC' ? (topic ? [topic] : []) : flow.filter.mode === 'SEMANTIC' ? [] : flow.filter.keywords })}>
            {mode === 'SEMANTIC' && !semanticAvailable ? '관련 주제 (AI 꺼짐)' : label}
          </Chip>
        ))}
      </div>
      {flow.filter.mode === 'SEMANTIC' ? (
        <div className="vfield vfield--tight">
          <label htmlFor="semantic-topic" className="vlabel">관련 주제</label>
          <div className="vinline">
            <input id="semantic-topic" className="vinput" value={topic} maxLength={80} placeholder="예: 주차 문제" onChange={(event) => setTopic(event.target.value)} />
            <button type="button" className="btn-secondary vinline__btn" onClick={findSemantic} disabled={!topic.trim() || busy}>{busy ? '찾는 중' : 'AI로 찾기'}</button>
          </div>
          <p className="vhint">Gemini가 주제와 관련된 댓글 id만 고르고, 판정은 하지 않아요. 댓글이 많을 때는 최대 60초까지 기다릴 수 있어요.</p>
        </div>
      ) : (
        <KeywordInput id="kw" label="찾을 단어" placeholder="예: 짜증, 공사" values={flow.filter.keywords} onChange={(keywords) => setFilter({ keywords })} />
      )}
      {showExclude
        ? <KeywordInput id="ex" label="제외할 단어" placeholder="이 단어가 있으면 빼요" values={flow.filter.exclude} onChange={(exclude) => setFilter({ exclude })} />
        : <button type="button" className="link-button vexclude-open" onClick={() => setShowExclude(true)}>+ 제외할 단어 넣기</button>}
      <div className="vcount" aria-live="polite">
        <strong><CountUp value={matched.length} /></strong><span>/ 가져온 {total}개 중 일치</span>
        <em>{flow.filter.keywords.length === 0 && flow.filter.mode !== 'SEMANTIC' ? '단어가 없으면 전부 일치로 봐요 · ' : ''}띄어쓰기·대소문자 무시, 정확한 구문은 띄어쓰기까지 일치</em>
      </div>
      {session && session.notices.length > 0 && <p className="vhint vhint--warn">{session.notices.map((notice) => notice.detail).join(' · ')}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}

function commentMeta(comment: NormalizedComment, byId: Map<string, NormalizedComment>): string {
  const parts: string[] = []
  if (comment.parent_id) {
    const parent = byId.get(comment.parent_id)
    parts.push(`↳ 답글${parent ? ` · “${parent.text.slice(0, 18)}${parent.text.length > 18 ? '…' : ''}”에` : ' · 원댓글 미수집'}`)
  }
  if (comment.like_count !== null) parts.push(`좋아요 ${comment.like_count}`)
  if (comment.author) parts.push(comment.author)
  return parts.join(' · ')
}

export function PickStep(props: StepProps) {
  const { flow, update, go, session, setSession } = props
  const matched = useMatched(props)
  // API 페이지 경계를 넘어 늦게 받아온 답글도 원댓글 바로 아래에 놓는다.
  const orderedMatched = useMemo(() => {
    const all = session?.comments ?? []
    const wanted = new Set(matched.map((comment) => comment.id))
    const children = new Map<string, NormalizedComment[]>()
    for (const comment of all) if (comment.parent_id) children.set(comment.parent_id, [...(children.get(comment.parent_id) ?? []), comment])
    const ordered: NormalizedComment[] = []
    const visit = (comment: NormalizedComment) => {
      if (wanted.has(comment.id)) ordered.push(comment)
      for (const child of children.get(comment.id) ?? []) visit(child)
    }
    for (const comment of all) if (!comment.parent_id) visit(comment)
    return ordered
  }, [matched, session])
  const listRef = useRef<HTMLDivElement>(null)
  const pageSize = useFitCount(listRef, 66, 2, 7)
  const excluded = useMemo(() => new Set(flow.excluded), [flow.excluded])
  const { page, setPage, totalPages, pageItems } = usePager(orderedMatched, pageSize, flow.filter)
  const byId = useMemo(() => new Map((session?.comments ?? []).map((comment) => [comment.id, comment])), [session])
  const duplicates = useMemo(() => {
    const count = new Map<string, number>()
    for (const comment of matched) count.set(normalizeCompact(comment.text), (count.get(normalizeCompact(comment.text)) ?? 0) + 1)
    return count
  }, [matched])
  const selected = matched.filter((comment) => !excluded.has(comment.id))
  const selectionLimit = Math.min(1000, (session?.options.max ?? 50) * 2)
  const overSelectionLimit = selected.length > selectionLimit
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) => update({ excluded: excluded.has(id) ? flow.excluded.filter((item) => item !== id) : [...flow.excluded, id] })
  const confirm = async () => {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const result = await svc.select(session.id, flow.owner, flow.filter, selected.map((comment) => comment.id))
      setSession(result.session)
      go('settings')
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepFlow stepKey="pick" icon="tick" eyebrow="댓글 선택" title="판정할 댓글을 골라요" dense
      subtitle={`조건에 맞은 ${matched.length}개 중 빼고 싶은 댓글의 체크를 풀어요.`}
      onNext={confirm} loading={busy} nextDisabled={selected.length === 0 || overSelectionLimit} nextLabel={`${selected.length}개로 계속`}>
      <div className="vtoolbar">
        <span className="vtoolbar__count"><b>{selected.length}</b> 선택 / {matched.length} 일치</span>
        <button type="button" className="pager-navbtn" onClick={() => update({ excluded: [] })} disabled={excluded.size === 0}>전체 선택</button>
        <button type="button" className="pager-navbtn" onClick={() => update({ excluded: matched.map((comment) => comment.id) })} disabled={selected.length === 0}>전체 해제</button>
      </div>
      <div className="vlist" ref={listRef}>
        {pageItems.map((comment) => (
          <label key={comment.id} className={`vrow${comment.parent_id ? ' vrow--reply' : ''}${excluded.has(comment.id) ? ' vrow--off' : ''}`}>
            <input type="checkbox" checked={!excluded.has(comment.id)} onChange={() => toggle(comment.id)} />
            <span className="vrow__body">
              <span className="vrow__text">{comment.text}</span>
              <span className="vrow__meta">
                {(duplicates.get(normalizeCompact(comment.text)) ?? 0) > 1 && <span className="vbadge vbadge--muted">같은 문장</span>}
                {[...comment.text].length > MAX_INPUT_CODE_POINTS && <span className="vbadge vbadge--human_review" title={`${MAX_INPUT_CODE_POINTS}자를 넘는 부분은 점수에 쓰지 않고, 정책에 따라 검토 보류로 보내요`}>{MAX_INPUT_CODE_POINTS}자 초과·검토</span>}
                {commentMeta(comment, byId)}
              </span>
            </span>
          </label>
        ))}
      </div>
      <PagerNav page={page} totalPages={totalPages} onChange={setPage} />
      {overSelectionLimit && <Notice tone="warn" icon="warning">이번 수집 범위에서는 원댓글 {session?.options.max}개와 답글을 합쳐 최대 {selectionLimit}개까지 판정할 수 있어요. 체크를 {selected.length - selectionLimit}개 해제해 주세요.</Notice>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}

export function SettingsStep({ flow, update, go, session, setSession }: StepProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const count = session?.items.length ?? 0

  const start = async () => {
    if (!session || !flow.owner) return
    setBusy(true)
    setError(null)
    try {
      await svc.settings(session.id, flow.owner, { publicText: flow.publicText })
      if (flow.keepInBrowser && flow.owner) rememberSession(session, flow.owner, flow)
      if (!flow.keepInBrowser) removeGuestSession(session.id)
      const result = await svc.analyze(session.id, flow.owner)
      setSession(result.session)
      go('run')
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepFlow stepKey="settings" icon="lock-key" eyebrow="판정 전 확인" title={`${count}개를 판정할게요`} dense
      subtitle="한 번에 한 개씩 순서대로 판정하고, 성공한 댓글마다 영수증이 하나씩 생겨요."
      onNext={start} loading={busy} loadingLabel="시작하는 중..." nextLabel={session?.is_demo ? `데모 판정 ${count}개 시작` : `${count}개 판정 시작`}>
      <div className="card vcard-tight">
        <span className="section-label">판정 기준 · 바꿀 수 없음</span>
        {session?.is_demo
          ? <p className="vcard-text">데모는 <b>합성 점수</b>로만 나눠요. 실제 AI·승인 정책이 아니며 영수증을 만들지 않아요.</p>
          : <p className="vcard-text">서버에 고정된 한국어 판정 모델과 정책으로 판정해요. 앞에서 정한 단어 조건은 <b>판정할 댓글을 고르는 데만</b> 쓰였어요.</p>}
      </div>
      <div className="card vcard-tight">
        <span className="section-label">저장·공유 기본값</span>
        <Toggle checked={flow.publicText} onChange={(publicText) => update({ publicText })} label="공개 링크에 댓글 원문 보이기" hint="끄면 공개 링크엔 영수증 ID와 조치만 보여요" />
        <Toggle checked={flow.keepInBrowser} onChange={(keepInBrowser) => update({ keepInBrowser })} label="이 브라우저 보관함에 남기기" hint="이 기기·브라우저에서만 다시 열 수 있어요" />
      </div>
      {!flow.keepInBrowser && <Notice tone="warn" icon="warning">어디에도 남기지 않으면 이 창을 닫은 뒤 세션을 다시 열 수 없어요. 영수증 링크는 그대로 열려요.</Notice>}
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}
