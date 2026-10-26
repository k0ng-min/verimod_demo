/** 기존 frontend/src/features/ScoreBars.tsx와 같은 표시 규칙: BEEP 라벨은 혐오·공격적 표현, 단위 ppm.
 * 차이: 영수증의 정책 manifest가 W4 시험용 정책일 때만 그 manifest에 적힌 검토·제한 기준선을 함께 그린다. */

export const BEEP_NAMES: Record<string, string> = { hate: '혐오', offensive: '공격적 표현' }

export { W4_PROVISIONAL_THRESHOLDS } from '../verify/policy'

const pct = (ppm: number) => `${(ppm / 10_000).toFixed(1)}%`

export function ScoreBars({ scores, thresholds, synthetic }: {
  scores: Record<string, number>
  thresholds?: Record<string, { review: number; restrict: number }> | null
  synthetic?: boolean
}) {
  return (
    <div className="vscores">
      {Object.entries(scores).map(([label, value]) => {
        const t = thresholds?.[label]
        const level = t ? (value >= t.restrict ? 'restrict' : value >= t.review ? 'review' : 'none') : 'none'
        const name = BEEP_NAMES[label] ?? label
        return (
          <div key={label} className={`vscore vscore--${level}`}>
            <span className="vscore__label">{name}</span>
            <span className="vscore__rail" role="img"
              aria-label={t ? `${name} ${pct(value)}, 검토 기준 ${pct(t.review)}, 제한 기준 ${pct(t.restrict)}` : `${name} ${pct(value)}`}>
              <i className="vscore__fill" style={{ width: `${Math.min(100, value / 10_000)}%` }} />
              {t && <><b className="vscore__tick" style={{ left: `${t.review / 10_000}%` }} /><b className="vscore__tick vscore__tick--restrict" style={{ left: `${t.restrict / 10_000}%` }} /></>}
            </span>
            <code className="vscore__value">{pct(value)}</code>
          </div>
        )
      })}
      <p className="vscores__legend">
        {thresholds ? <><b className="vtick" /> 검토 기준 <b className="vtick vtick--restrict" /> 제한 기준 · </> : null}
        {synthetic ? '데모 합성 점수(실제 모델 아님)' : '모델 score(보정 전) — 허용·검토·제한은 서버 정책이 정해요'}
      </p>
    </div>
  )
}
