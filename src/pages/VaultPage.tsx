import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PagerNav, useFitCount, usePager } from '../components/Pager'
import { StepFlow } from '../components/StepFlow'
import { formatTime, TopBar } from '../components/ui'
import { listGuestSessions, removeGuestSession } from '../lib/guestVault'

/** 이 브라우저 보관함. 로그인·계정은 없고, 세션을 만든 브라우저만 소유 토큰으로 다시 연다. */
export function VaultPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState(listGuestSessions)
  const listRef = useRef<HTMLDivElement>(null)
  const pageSize = useFitCount(listRef, 62, 2, 7)
  const { page, setPage, totalPages, pageItems } = usePager(items, pageSize)
  return (
    <div className="page vpage">
      <TopBar title="보관함" />
      <StepFlow stepKey="vault" icon="folder" eyebrow="보관함" title="이 브라우저에 남긴 분석" dense
        subtitle="다른 기기·브라우저에서는 보이지 않아요. 영수증 링크와 공개 링크는 어디서나 열려요.">
        <div className="vlist" ref={listRef}>
          {pageItems.length === 0 && <p className="muted vcenter-text">아직 남긴 분석이 없어요.</p>}
          {pageItems.map((row) => (
            <div key={row.session_id} className="vrow vrow--vault">
              <button type="button" className="vrow__body vrow__open" onClick={() => navigate(`/analyze?session=${row.session_id}`)}>
                <span className="vrow__text">{row.is_demo ? '[데모] ' : ''}{row.title ?? '제목 없음'}</span>
                <span className="vrow__meta">{formatTime(row.created_at)} · {row.platform}</span>
              </button>
              <button type="button" className="pager-navbtn" onClick={() => { removeGuestSession(row.session_id); setItems(listGuestSessions()) }} aria-label="이 브라우저에서 지우기">지우기</button>
            </div>
          ))}
        </div>
        <PagerNav page={page} totalPages={totalPages} onChange={setPage} />
      </StepFlow>
    </div>
  )
}
