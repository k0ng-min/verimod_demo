import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { PublicSessionView } from '../../shared/types'
import { svc } from '../api/svc'
import { PagerNav, useFitCount, usePager } from '../components/Pager'
import { StepFlow } from '../components/StepFlow'
import { CountUp } from '../components/Kinetic'
import { ActionBadge, ACTION_LABEL, Notice, shortHash, TopBar } from '../components/ui'

/** 공개 세션 링크. 서버의 공개 API만 쓰므로 새 브라우저에서도 같은 내용이 열린다. 비공개 자료는 응답에 없다. */
export function PublicSessionPage() {
  const { publicId = '' } = useParams()
  const [view, setView] = useState<PublicSessionView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pageSize = useFitCount(listRef, 54, 2, 8)
  const { page, setPage, totalPages, pageItems } = usePager(view?.items ?? [], pageSize)
  useEffect(() => {
    svc.publicSession(publicId).then((data) => setView(data.session)).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : '불러오지 못했습니다'))
  }, [publicId])
  const count = (action: string) => view?.items.filter((item) => item.action === action).length ?? 0

  return (
    <div className="page vpage">
      <TopBar title="공개 판정 묶음" />
      {error && <div className="vcenter"><p className="error-box">{error}</p></div>}
      {!error && !view && <div className="vcenter"><p className="muted">불러오는 중...</p></div>}
      {view && (
        <StepFlow stepKey={publicId} icon="card-box" eyebrow={view.is_demo ? '데모 세션 · 합성 판정' : '공개 판정 묶음'} dense
          title={view.source.title ?? '판정 묶음'}
          subtitle={`가져온 ${view.collected_count}개 중 ${view.selected_count}개를 골라 ${view.is_demo ? '데모 판정' : `영수증 ${view.items.length}개를 발급`}했어요.`}>
          <div className="vtiles">
            {(['ALLOW', 'HUMAN_REVIEW', 'RESTRICT'] as const).map((action) => (
              <div key={action} className={`vtile vtile--${action.toLowerCase()}`}><strong><CountUp value={count(action)} /></strong><span>{ACTION_LABEL[action]}</span></div>
            ))}
          </div>
          <div className="vlist" ref={listRef}>
            {pageItems.map((item, index) => (
              <div key={item.receipt_id ?? index} className="vresult vresult--static">
                <ActionBadge action={item.action} status={item.status} />
                <span className="vresult__text">{item.text ?? <em className="muted">원문 비공개</em>}</span>
                {item.receipt_id ? <Link className="vresult__meta link-button" to={`/r/${item.receipt_id}`}>{shortHash(item.receipt_id, 6, 0).replace('…', '')} ›</Link> : <span className="vresult__meta">데모</span>}
              </div>
            ))}
          </div>
          <PagerNav page={page} totalPages={totalPages} onChange={setPage} />
          <Notice tone="info" icon="bulb">이 페이지는 개별 영수증 목록을 모아 보여 줄 뿐 새로운 암호학적 증명이 아니에요. 각 영수증을 열어 따로 검증하세요.</Notice>
        </StepFlow>
      )}
    </div>
  )
}
