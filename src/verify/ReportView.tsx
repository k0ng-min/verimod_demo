import { CODE_INFO, SIDE_INFO, STEP_LABEL } from '@vm-ui/format'
import type { VerifyReport } from '@vm-domain/verify'
import { shortHash } from '../components/ui'

/** 기존 frontend/src/features/VerifyReportView.tsx와 같은 내용(결과 코드·제목·설명, 6단계, 해시 비교, 보조 확인 3종)을
 * 같은 문구(ui/format.ts의 CODE_INFO·STEP_LABEL·SIDE_INFO)로 보여 준다. core VALID 옆의 보조 확인 실패·미확인도 숨기지 않는다. */

const SIDE_TITLE = { manifest: '모델·정책 manifest', content: '원문 commitment', lifecycle: '이의제기·검토 연결' } as const
const STATE_TEXT = { PASSED: '통과', FAILED: '실패', PENDING: '대기', SKIPPED: '건너뜀' } as const

export function ReportView({ report, brief = false }: { report: VerifyReport; brief?: boolean }) {
  const info = CODE_INFO[report.code]
  return (
    <div className="vreport">
      <div className={`vverdict vverdict--${info.tone}`} aria-live="polite">
        <strong>{info.title} <code>{report.code}</code>{report.confirmations ? <span> · 확인 {report.confirmations.toLocaleString('ko-KR')}회</span> : null}</strong>
        <span>{info.description}</span>
      </div>
      {!brief && <ol className="vsteps vsteps--grid">
        {report.steps.map((step) => (
          <li key={step.id} className={`vsteps__item vsteps__item--${step.state.toLowerCase()}`} title={`${STATE_TEXT[step.state]} · ${step.detail}`}>
            <span className="vsteps__name">{STEP_LABEL[step.id]}</span>
          </li>
        ))}
      </ol>}
      {(() => {
        const stop = report.steps.find((step) => step.state === 'FAILED' || step.state === 'PENDING') ?? [...report.steps].reverse().find((step) => step.state === 'PASSED')
        return stop ? <p className="vstop"><b>{STEP_LABEL[stop.id]} · {STATE_TEXT[stop.state]}</b> — {stop.detail}</p> : null
      })()}
      {report.code === 'HASH_MISMATCH' && (
        <p className="vhint vhint--warn">적힌 해시 <code>{shortHash(report.claimedHash)}</code> ≠ 본문으로 계산한 해시 <code>{shortHash(report.recomputedHash)}</code></p>
      )}
      {!brief && <dl className="vside">
        {(['manifest', 'content', 'lifecycle'] as const).map((key) => (
          <div key={key} className={`vside__row vside__row--${SIDE_INFO[report[key].state].tone}`} title={report[key].detail}>
            <dt>{SIDE_TITLE[key]}</dt>
            <dd><b>{SIDE_INFO[report[key].state].label}</b> {report[key].detail}</dd>
          </div>
        ))}
      </dl>}
    </div>
  )
}
