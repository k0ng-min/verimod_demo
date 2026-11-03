import { useMemo, useState } from 'react'
import type { MaxComments, SessionView, SortOrder } from '../../shared/types'
import { parseContentUrl } from '../../shared/url'
import { svc, SvcError } from '../api/svc'
import { StepFlow } from '../components/StepFlow'
import { Chip, Notice, Toggle, formatTime } from '../components/ui'
import { saveGuestSession } from '../lib/guestVault'
import type { StepProps } from './AnalyzePage'
import type { FlowState, SourceKind } from './state'

const ORDER_LABEL: Record<SortOrder, string> = { relevance: '인기순', time: '최신순' }
const KIND_LABEL: Record<SourceKind, string> = { URL: '영상 링크', MANUAL: '직접 입력', DEMO: '데모 데이터' }

export function errorText(error: unknown): string {
  return error instanceof SvcError ? error.message : error instanceof Error ? error.message : '요청을 처리하지 못했습니다'
}

export function rememberSession(session: SessionView, owner: string, flow: FlowState) {
  if (flow.keepInBrowser) {
    saveGuestSession({
      session_id: session.id, public_id: session.public_id, owner_token: owner, title: session.source.title,
      platform: session.source.platform, is_demo: session.is_demo, created_at: session.created_at,
    })
  }
}

export function LinkStep({ flow, update, go, caps, capsError, setSession }: StepProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => (flow.url.trim() ? parseContentUrl(flow.url) : null), [flow.url])
  const youtube = caps?.providers.YOUTUBE
  const lines = flow.manualText.split(/\r?\n/u).filter((line) => line.trim()).length

  const hint = (() => {
    if (!parsed) return null
    if (parsed.kind === 'YOUTUBE') return <Notice tone="ok" icon="tick">YouTube 영상 주소예요 · 영상 id <code>{parsed.videoId}</code></Notice>
    if (parsed.kind === 'NEWS') return <Notice tone="warn" icon="warning">{parsed.site} 댓글은 공식 수집 API가 없어 아직 가져올 수 없어요. 댓글을 복사해 <b>직접 입력</b>으로 넣을 수 있어요.</Notice>
    if (parsed.kind === 'UNSUPPORTED') return <Notice tone="warn" icon="warning"><code>{parsed.host}</code>은(는) 지원하지 않는 사이트예요. 지금은 YouTube 영상만 받아요.</Notice>
    return <Notice tone="error" icon="prohibited">{parsed.reason}</Notice>
  })()

  const next = async () => {
    setError(null)
    if (flow.kind === 'DEMO') return go('scope')
    setBusy(true)
    try {
      if (flow.kind === 'URL') {
        const { source } = await svc.resolve(flow.url)
        update({ source, step: 'source' })
      } else {
        const created = await svc.createSession({ kind: 'MANUAL', text: flow.manualText })
        rememberSession(created.session, created.owner_token, flow)
        setSession(created.session)
        update({ sessionId: created.session.id, owner: created.owner_token, source: created.session.source, manualText: '', excluded: [], semantic: null, step: 'words' })
      }
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  const disabled = flow.kind === 'URL'
    ? parsed?.kind !== 'YOUTUBE' || youtube?.available === false
    : flow.kind === 'MANUAL' ? lines === 0 || lines > 100 : false

  return (
    <StepFlow
      stepKey="link" icon="link" eyebrow="콘텐츠 연결" title="어떤 댓글을 판정할까요?"
      subtitle="영상 주소를 넣으면 서버가 공식 API로 댓글을 모아 와요."
      onNext={next} nextDisabled={disabled} loading={busy} loadingLabel="확인하는 중..."
      nextLabel={flow.kind === 'URL' ? '주소 확인' : flow.kind === 'MANUAL' ? `댓글 ${lines}개 불러오기` : '데모로 계속'}
    >
      <div className="vchips" role="group" aria-label="댓글 가져오는 방법">
        {(['URL', 'MANUAL', 'DEMO'] as const).map((kind) => (
          <Chip key={kind} on={flow.kind === kind} onClick={() => { setError(null); update({ kind }) }}>{KIND_LABEL[kind]}</Chip>
        ))}
      </div>
      {flow.kind === 'URL' && (
        <div className="vfield">
          <label htmlFor="content-url" className="vlabel">YouTube 영상 주소</label>
          <input id="content-url" className="vinput" type="url" inputMode="url" autoComplete="off" spellCheck={false}
            placeholder="https://www.youtube.com/watch?v=..." value={flow.url}
            onChange={(event) => update({ url: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !disabled) void next() }} />
          {hint}
          {youtube && !youtube.available && <Notice tone="warn" icon="lock">{youtube.reason} 설정 방법은 README의 “YouTube 수집 켜기”를 보세요.</Notice>}
          {capsError && <Notice tone="error" icon="warning">{capsError}</Notice>}
        </div>
      )}
      {flow.kind === 'MANUAL' && (
        <div className="vfield">
          <label htmlFor="manual-text" className="vlabel">댓글을 한 줄에 하나씩 <span className="vlabel__hint">{lines} / 100줄</span></label>
          <textarea id="manual-text" className="vinput vtextarea" value={flow.manualText} placeholder={'좋은 영상 감사합니다\n이건 좀 아닌 것 같네요'}
            onChange={(event) => update({ manualText: event.target.value })} />
          <p className="vhint">붙여 넣은 문장은 바꾸지 않고 그대로 판정해요. 출처 정보가 없어 “직접 입력”으로 기록돼요.</p>
        </div>
      )}
      {flow.kind === 'DEMO' && (
        <Notice tone="info" icon="puzzle">
          <b>데모 데이터</b>는 이 저장소에서 지어낸 예시 댓글 24개예요. 실제 YouTube 댓글이 아니며, 판정도 실제 AI가 아닌 <b>합성 점수</b>라 영수증을 만들지 않아요. 화면 흐름을 둘러볼 때만 쓰세요.
        </Notice>
      )}
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}

export function SourceStep({ flow, go }: StepProps) {
  const source = flow.source
  return (
    <StepFlow stepKey="source" icon="zoom" eyebrow="콘텐츠 확인" title="이 영상이 맞나요?"
      subtitle="YouTube에서 실제로 조회한 정보예요." onNext={() => go('scope')} nextLabel="수집 범위 정하기">
      {source ? (
        <div className="card vsource">
          <span className="vbadge vbadge--platform">YouTube</span>
          <strong className="vsource__title">{source.title ?? '(제목 없음)'}</strong>
          <dl className="vrows">
            <div><dt>채널</dt><dd>{source.channel ?? '—'}</dd></div>
            <div><dt>게시일</dt><dd>{formatTime(source.published_at)}</dd></div>
            <div><dt>플랫폼 표시 댓글 수</dt><dd>{source.platform_comment_count === null ? '공개 안 됨' : `${source.platform_comment_count.toLocaleString('ko-KR')}개`}</dd></div>
            <div><dt>주소</dt><dd className="vmono">{source.source_url}</dd></div>
          </dl>
        </div>
      ) : <Notice tone="error">조회한 콘텐츠 정보가 없어요. 이전 단계로 돌아가 주소를 다시 확인하세요.</Notice>}
    </StepFlow>
  )
}

export function ScopeStep({ flow, update, caps, setSession }: StepProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const provider = caps?.providers[flow.kind === 'DEMO' ? 'DEMO' : 'YOUTUBE']
  const maxChoices: MaxComments[] = provider?.maxChoices.length ? provider.maxChoices : [20, 50, 100, 200, 500]
  const orders: SortOrder[] = provider?.orders.length ? provider.orders : ['relevance', 'time']
  const total = flow.kind === 'DEMO' ? 24 : flow.source?.platform_comment_count ?? null

  const collect = async () => {
    setError(null)
    setBusy(true)
    try {
      const created = flow.kind === 'DEMO'
        ? await svc.createSession({ kind: 'DEMO', options: flow.options })
        : await svc.createSession({ kind: 'URL', url: flow.url, options: flow.options })
      rememberSession(created.session, created.owner_token, flow)
      setSession(created.session)
      update({ sessionId: created.session.id, owner: created.owner_token, source: created.session.source, excluded: [], semantic: null, step: 'words' })
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepFlow stepKey="scope" icon="target" eyebrow="수집 범위" title="댓글을 얼마나 가져올까요?"
      subtitle={total !== null ? `플랫폼 전체 ${total.toLocaleString('ko-KR')}개 중 원댓글 최대 ${flow.options.max}개를 가져와요. 답글은 별도예요.` : `원댓글 최대 ${flow.options.max}개를 가져와요. 답글은 별도예요.`}
      onNext={collect} loading={busy} loadingLabel="댓글을 가져오는 중..." nextLabel="댓글 가져오기">
      <div className="vgroup">
        <span className="vlabel">원댓글 최대 개수</span>
        <div className="vchips">
          {maxChoices.map((max) => <Chip key={max} on={flow.options.max === max} onClick={() => update({ options: { ...flow.options, max } })}>{max}개</Chip>)}
        </div>
      </div>
      <div className="vgroup">
        <span className="vlabel">정렬</span>
        <div className="vchips">
          {orders.map((order) => <Chip key={order} on={flow.options.order === order} onClick={() => update({ options: { ...flow.options, order } })}>{ORDER_LABEL[order]}</Chip>)}
        </div>
      </div>
      <Toggle checked={flow.options.includeReplies} disabled={provider?.replies === 'NONE'} onChange={(includeReplies) => update({ options: { ...flow.options, includeReplies } })}
        label="답글도 가져오기" hint="답글은 원댓글 개수에 포함하지 않고, 원댓글 아래에서 함께 판정·영수증 발급해요." />
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}
