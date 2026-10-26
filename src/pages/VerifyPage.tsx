import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon3D } from '../components/Icon3D'
import { StepFlow } from '../components/StepFlow'
import { Notice, TopBar } from '../components/ui'
import { decodeBundle, EVIDENCE, type VerificationBundle } from '../verify/verifier'
import { ReceiptView } from './ReceiptPage'

const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function VerifyPage() {
  const navigate = useNavigate()
  const [receiptId, setReceiptId] = useState('')
  const [fileBundle, setFileBundle] = useState<VerificationBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  const readFile = async (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (file.size > 256_000) return setError('영수증 파일이 너무 큽니다(256KB 이하)')
    try {
      setFileBundle(decodeBundle(JSON.parse(await file.text())))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '영수증 파일을 읽지 못했습니다')
    }
  }

  if (fileBundle) {
    return (
      <div className="page vpage">
        <TopBar title="영수증 검증" onHome={() => setFileBundle(null)} />
        <ReceiptView bundle={fileBundle} evidence={false} label="내가 가진 영수증 파일" />
      </div>
    )
  }

  const valid = RECEIPT_ID.test(receiptId.trim())
  return (
    <div className="page vpage">
      <TopBar title="영수증 검증" />
      <StepFlow stepKey="verify" icon="shield" eyebrow="독립 검증" title="어떤 영수증을 확인할까요?" dense
        subtitle="지갑 연결 없이 공개 RPC만 읽어 이 브라우저가 직접 계산해요."
        onNext={() => navigate(`/r/${receiptId.trim().toLowerCase()}`)} nextDisabled={!valid} nextLabel="이 영수증 열기">
        <div className="vfield">
          <label htmlFor="receipt-id" className="vlabel">영수증 ID</label>
          <input id="receipt-id" className="vinput" value={receiptId} placeholder="예: 3f2a…-…" spellCheck={false}
            onChange={(event) => setReceiptId(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && valid) navigate(`/r/${receiptId.trim().toLowerCase()}`) }} />
          {receiptId && !valid && <p className="vhint vhint--warn">영수증 ID는 UUID 형식이에요.</p>}
        </div>
        <label className="vaction vfile">
          <Icon3D src="file-text" size={30} />
          <span><strong>영수증 JSON 파일 고르기</strong><em>받아 둔 bundle 파일을 검증해요</em></span>
          <input type="file" accept="application/json,.json" onChange={(event) => void readFile(event.target.files?.[0])} />
        </label>
        <div className="vactions-grid">
          {EVIDENCE.map((item) => (
            <button key={item.id} type="button" className="vaction" onClick={() => navigate(`/r/${item.id}`)}>
              <Icon3D src="chains" size={30} /><span><strong>{item.label}</strong><em>Base Sepolia 실제 등록</em></span>
            </button>
          ))}
        </div>
        <Notice tone="info" icon="bulb">검증은 기록이 바뀌지 않았는지 확인할 뿐, 판정이 옳은지 증명하지 않아요.</Notice>
        {error && <p className="error-box" role="alert">{error}</p>}
      </StepFlow>
    </div>
  )
}
