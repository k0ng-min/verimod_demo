import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { tamperOptions } from '@vm-features/tamper'
import type { ReceiptBody } from '@vm-domain/types'
import { requestAppeal } from '../api/appeal'
import { ScoreBars, W4_PROVISIONAL_THRESHOLDS } from '../components/ScoreBars'
import { StepFlow } from '../components/StepFlow'
import { ActionBadge, Chip, CopyButton, downloadJson, formatTime, Notice, shortHash, TopBar } from '../components/ui'
import { ReportView } from '../verify/ReportView'
import {
  BASE, fetchEvidenceBundle, fetchReceiptBundle, pickPackage, runVerification, W4_PROVISIONAL_POLICY_HASH, W4_R01_MODEL_HASH,
  type LoadedPackage, type VerificationBundle, type VerifyReport,
} from '../verify/verifier'

type Tab = 'info' | 'verify' | 'tamper' | 'files'

interface TamperCase { id: string; label: string; expect: string; slow?: boolean; make: (bundle: VerificationBundle) => { bundle: VerificationBundle; change: string } }

const flip = (hex: string) => `${hex.slice(0, -1)}${hex.endsWith('0') ? '1' : '0'}`

/** 기존 변조 패널과 같은 방식: 사본만 바꾸고 같은 검증 버튼으로 확인한다(원본 영수증은 그대로). */
function tamperCases(bundle: VerificationBundle): TamperCase[] {
  const cases: TamperCase[] = []
  for (const option of tamperOptions(bundle.receipt_body)) {
    if (!['score', 'action', 'policy', 'time'].includes(option.id)) continue
    cases.push({
      id: option.id, label: option.label, expect: 'HASH_MISMATCH',
      make: (original) => {
        const copy = structuredClone(original)
        const change = option.apply(copy.receipt_body as ReceiptBody)
        return { bundle: copy, change: `${change.path}: ${change.before} → ${change.after}` }
      },
    })
  }
  if (bundle.anchor) {
    cases.push({
      id: 'anchor', label: '앵커를 다른 컨트랙트로', expect: 'UNTRUSTED_ANCHOR',
      make: (original) => {
        const copy = structuredClone(original)
        copy.anchor!.contract_address = '0x000000000000000000000000000000000000dead'
        return { bundle: copy, change: `anchor.contract_address → 0x…dead` }
      },
    })
  }
  if (bundle.proof && bundle.proof.siblings.length > 0) {
    cases.push({
      id: 'proof', label: '포함 증명 경로 바꾸기', expect: 'INVALID_PROOF', slow: true,
      make: (original) => {
        const copy = structuredClone(original)
        copy.proof!.siblings[0] = flip(copy.proof!.siblings[0]) as never
        return { bundle: copy, change: 'proof.siblings[0] 마지막 글자 변경' }
      },
    })
  }
  return cases
}

export function ReceiptView({ bundle, label, evidence }: { bundle: VerificationBundle; label: string; evidence: boolean }) {
  const [tab, setTab] = useState<Tab>('info')
  const [report, setReport] = useState<VerifyReport | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pkg, setPkg] = useState<LoadedPackage | null>(null)
  const [tamper, setTamper] = useState<{ id: string; change: string; report: VerifyReport | null; running: boolean } | null>(null)
  const [appeal, setAppeal] = useState<string | null>(null)
  const body = bundle.receipt_body
  const decision = body.event_kind === 'DECISION' ? body.payload : null
  const inference = decision?.inference as unknown as { scores_ppm?: Record<string, number>; model_manifest_hash?: string; input_status?: string } | undefined
  const policy = decision?.policy as unknown as { action?: 'ALLOW' | 'HUMAN_REVIEW' | 'RESTRICT'; reason_codes?: string[]; triggered_rule_ids?: string[]; policy_manifest_hash?: string } | undefined
  const w4Policy = policy?.policy_manifest_hash === W4_PROVISIONAL_POLICY_HASH

  const verify = async (withPkg: LoadedPackage | null = pkg) => {
    setTab('verify')
    setRunning(true)
    setError(null)
    try { setReport(await runVerification(bundle, withPkg)) } catch (caught) { setError(caught instanceof Error ? caught.message : '검증을 실행하지 못했습니다') } finally { setRunning(false) }
  }
  const runTamper = async (item: TamperCase) => {
    const made = item.make(bundle)
    setTamper({ id: item.id, change: made.change, report: null, running: true })
    try {
      const result = await runVerification(made.bundle)
      setTamper({ id: item.id, change: made.change, report: result, running: false })
    } catch (caught) {
      setTamper(null)
      setError(caught instanceof Error ? caught.message : '변조 검증 실패')
    }
  }
  const loadPackage = async (file: File | undefined) => {
    if (!file) return
    try {
      const loaded = pickPackage(JSON.parse(await file.text()), body.receipt_id)
      setPkg(loaded)
      await verify(loaded)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Private Package를 읽지 못했습니다')
    }
  }
  const askAppeal = async () => {
    try {
      const result = await requestAppeal(body.receipt_id)
      setAppeal(result.status === 501
        ? '이의제기 API(POST /api/appeals)는 backend에 아직 구현되지 않았어요(501 NOT_IMPLEMENTED). 접수되지 않았어요.'
        : `이의제기 요청 결과: HTTP ${result.status}${result.code ? ` · ${result.code}` : ''}`)
    } catch {
      setAppeal('backend에 연결하지 못해 이의제기를 보내지 못했어요.')
    }
  }

  const cases = tamperCases(bundle)
  return (
    <StepFlow stepKey={`receipt-${body.receipt_id}`} icon="receipt" eyebrow={label} dense
      title={`판정 영수증 ${body.receipt_id.slice(0, 8)}`}
      subtitle={bundle.anchor ? `epoch #${bundle.anchor.epoch_id}에 묶인 기록 · 검증은 이 브라우저가 공개 RPC로 직접 해요.` : '아직 epoch에 묶이지 않은 새 영수증이에요 · PENDING_ANCHOR'}
      secondary={<CopyButton value={window.location.href} label="링크 복사" />}
      onNext={() => void verify()} loading={running} loadingLabel="검증하는 중..." nextLabel={report ? '다시 검증' : '브라우저에서 독립 검증'} nextDisabled={!BASE.profile}>
      <div className="tabs vtabs" role="tablist">
        {([['info', '정보'], ['verify', '검증'], ['tamper', '변조 시험'], ['files', '원본·패키지']] as const).map(([key, text]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`tab${tab === key ? ' tab--active' : ''}`} onClick={() => setTab(key)}>{text}</button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="vpanel">
          <div className="vpanel__row"><ActionBadge action={policy?.action ?? null} /><span className="vmono vsmall">{policy?.reason_codes?.join(', ') || '근거 코드 없음(허용)'}</span><span className="vpanel__time">{formatTime(body.recorded_at)}</span></div>
          {inference?.scores_ppm && <ScoreBars scores={inference.scores_ppm} thresholds={w4Policy ? W4_PROVISIONAL_THRESHOLDS : null} />}
          <dl className="vrows">
            <div><dt>모델 manifest</dt><dd className="vmono">{shortHash(inference?.model_manifest_hash)}{inference?.model_manifest_hash === W4_R01_MODEL_HASH ? ' · W4 R01' : ''}</dd></div>
            <div><dt>정책 manifest</dt><dd className="vmono">{shortHash(policy?.policy_manifest_hash)}{w4Policy ? ' · W4 시험용' : ''}</dd></div>
            <div><dt>영수증 hash</dt><dd className="vmono">{shortHash(bundle.receipt_hash)} · #{body.issuer_seq}</dd></div>
            <div><dt>봉인 상태</dt><dd>{bundle.anchor
              ? <>epoch #{bundle.anchor.epoch_id} · <a className="link-button" href={`https://sepolia.basescan.org/tx/${bundle.anchor.tx_hash}`} target="_blank" rel="noreferrer">tx {shortHash(bundle.anchor.tx_hash, 8, 4)}</a></>
              : 'PENDING_ANCHOR · 아직 공개 체인 검증 결과가 아니에요'}</dd></div>
          </dl>
          {policy?.action === 'RESTRICT' && (
            appeal ? <Notice tone="warn" icon="warning">{appeal}</Notice>
              : <button type="button" className="btn-secondary vsmall-btn" onClick={() => void askAppeal()}>이 제한 판정에 이의제기</button>
          )}
        </div>
      )}

      {tab === 'verify' && (
        <div className="vpanel">
          <p className="vhint">검증 기준: {BASE.profile ? <>승인 프로필 BASE_SEPOLIA_DEMO · chain {BASE.profile.chain_id} · contract <code>{shortHash(BASE.profile.contract_address, 8, 4)}</code></> : BASE.problem}{pkg ? ' · Private Package 불러옴' : ''}</p>
          {!report && !running && !error && <p className="vhint">해시 재계산 → 신뢰 앵커 → 원장 조회 → 포함 증명 → 블록 확정 순서로 확인해요. 서버의 성공 문구를 믿지 않아요.</p>}
          {running && <p className="vhint">공개 RPC에서 원장을 읽는 중이에요. 체인에 묶인 영수증은 1~3분 걸릴 수 있어요.</p>}
          {report && <ReportView report={report} />}
        </div>
      )}

      {tab === 'tamper' && (
        <div className="vpanel">
          <div className="vchips vchips--row">
            {cases.map((item) => (
              <Chip key={item.id} on={tamper?.id === item.id} disabled={tamper?.running} onClick={() => void runTamper(item)}>
                {item.label}
              </Chip>
            ))}
          </div>
          {!tamper && <p className="vhint">사본만 바꿔 같은 검증기로 확인해요. 원본 영수증은 그대로예요.</p>}
          {tamper && <p className="vhint">바꾼 곳: <code>{tamper.change}</code> · 예상 {cases.find((c) => c.id === tamper.id)?.expect}{cases.find((c) => c.id === tamper.id)?.slow && tamper.running ? ' · 공개 RPC 조회 중(1~3분)' : ''}</p>}
          {tamper?.report && (() => {
            const expected = cases.find((c) => c.id === tamper.id)?.expect
            const ok = tamper.report.code === expected
            return <div className={`vexpect ${ok ? 'vexpect--ok' : 'vexpect--no'}`}>{ok ? '✓ 예상대로 탐지' : '✕ 예상과 다름'} · 예상 {expected} · 결과 {tamper.report.code}</div>
          })()}
          {tamper?.report && <ReportView report={tamper.report} brief />}
        </div>
      )}

      {tab === 'files' && (
        <div className="vpanel">
          <p className="vcard-text">공개 bundle에는 판정 기록·hash·포함 증명만 있어요. 원문과 salt는 Private Package에만 있어요.{evidence ? ' 이 파일은 저장소의 공개 증거와 같아요.' : ''}</p>
          <button type="button" className="vaction" onClick={() => downloadJson(`verimod-receipt-${body.receipt_id}.json`, bundle)}>
            <span><strong>공개 bundle 저장</strong><em>영수증 JSON · 누구와 공유해도 돼요</em></span>
          </button>
          <label className="vaction vfile">
            <span><strong>Private Package 불러오기</strong><em>{pkg ? '불러옴 · 검증 탭의 원문 commitment에서 결과 확인' : '원문 commitment를 이 브라우저에서 다시 계산해요'}</em></span>
            <input type="file" accept="application/json,.json" onChange={(event) => void loadPackage(event.target.files?.[0])} />
          </label>
          <p className="vhint">Private Package를 공유하면 원문이 함께 공개돼요.</p>
        </div>
      )}
      {error && <p className="error-box" role="alert">{error}</p>}
    </StepFlow>
  )
}

export function ReceiptPage() {
  const { id = '' } = useParams()
  const evidence = id.startsWith('evidence-')
  const [bundle, setBundle] = useState<VerificationBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setBundle(null)
    setError(null)
    ;(evidence ? fetchEvidenceBundle(id) : fetchReceiptBundle(id)).then(setBundle).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : '영수증을 불러오지 못했습니다'))
  }, [id, evidence])
  return (
    <div className="page vpage">
      <TopBar title="판정 영수증" />
      {error && <div className="vcenter"><p className="error-box">{error}</p></div>}
      {!error && !bundle && <div className="vcenter"><p className="muted">영수증을 불러오는 중...</p></div>}
      {bundle && <ReceiptView bundle={bundle} evidence={evidence} label={evidence ? '공개 증거 · 2026-10-20 체인 등록' : '공개 영수증'} />}
    </div>
  )
}
