import { useEffect, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Icon3D } from './Icon3D'
import { FloatingIcon } from './FloatingIcon'
import { KineticEyebrow, KineticText } from './Kinetic'
import { ArrowIcon } from './ui'

interface StepFlowProps {
  icon: string
  eyebrow: string
  title: string
  subtitle?: ReactNode
  children?: ReactNode
  stepKey: string | number
  onBack?: () => void
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  loading?: boolean
  loadingLabel?: string
  /** 주 버튼 왼쪽에 놓는 보조 행동(취소, 다시 시도 등). */
  secondary?: ReactNode
  /** 내용이 많은 단계는 아이콘·여백을 한 단계 줄인다. */
  dense?: boolean
}

/** 레퍼런스 StepFlow의 구조(중앙 3D 아이콘 → eyebrow → 제목 → 설명 → 현재 질문 → 이전/다음)를 그대로 따른다.
 * 차이: 프레임 높이 안에 고정 배치한다. 내용 영역이 남는 높이를 받고, 행동 버튼은 늘 아래에 보인다. */
export function StepFlow({
  icon, eyebrow, title, subtitle, children, stepKey, onBack, onNext, nextLabel, nextDisabled, loading, loadingLabel, secondary, dense,
}: StepFlowProps) {
  const reduce = useReducedMotion()
  useEffect(() => {
    document.querySelector('.app-main')?.scrollTo({ top: 0 })
  }, [stepKey])

  return (
    <div className={`vstep${dense ? ' vstep--dense' : ''}`}>
      <motion.div
        key={stepKey}
        className="vstep__inner"
        initial={reduce ? false : { x: 24, opacity: 0.4 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="vstep__head">
          <motion.div
            className="step__icon-wrap"
            initial={reduce ? false : { scale: 0.7 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <FloatingIcon>
              <Icon3D src={icon} size={84} className="step__icon vstep__icon" />
            </FloatingIcon>
          </motion.div>
          <KineticEyebrow className="step__eyebrow" text={eyebrow} />
          <KineticText as="h1" className="step__title vstep__title" text={title} delay={0.08} />
          {subtitle && <p className="step__subtitle vstep__subtitle">{subtitle}</p>}
        </div>
        <div className="vstep__body">{children}</div>
      </motion.div>

      {(onBack || onNext || secondary) && (
        <div className="step__actions vstep__actions">
          {onBack && (
            <motion.button whileTap={{ scale: 0.9 }} whileHover={{ y: -2 }} type="button" className="step__back" onClick={onBack} aria-label="이전" title="이전">
              <ArrowIcon direction="left" />
            </motion.button>
          )}
          {secondary}
          {onNext && (
            <motion.button whileTap={{ scale: 0.98 }} type="button" className="btn-primary step__next" onClick={onNext} disabled={nextDisabled || loading}>
              {loading ? (loadingLabel ?? '처리 중...') : (nextLabel ?? '다음')}
            </motion.button>
          )}
        </div>
      )}
    </div>
  )
}
