import { Fragment, useEffect, useRef, useState, type ElementType } from 'react'
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion'

/** 키네틱 타이포그래피 묶음. 모두 reduced-motion이면 정지된 글자로 보이고, 스크린리더에는 원문 한 줄만 읽힌다. */

const charVariants = {
  hidden: { y: '0.62em', opacity: 0, rotateX: -78, filter: 'blur(6px)' },
  show: { y: '0em', opacity: 1, rotateX: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 420, damping: 26 } },
}

function Chars({ text, startIndex, stagger }: { text: string; startIndex: number; stagger: number }) {
  return (
    <>
      {[...text].map((char, index) => (
        <motion.span key={index} className="kt-char" variants={charVariants} custom={startIndex + index}
          transition={{ delay: (startIndex + index) * stagger }}>
          {char}
        </motion.span>
      ))}
    </>
  )
}

/** 글자가 아래에서 3D로 뒤집혀 올라오며 초점이 맞는다. 단어는 줄바꿈 단위(keep-all)를 지킨다. text가 바뀌면 다시 재생한다. */
export function KineticText({ text, as = 'span', className, stagger = 0.026, delay = 0 }: {
  text: string; as?: ElementType; className?: string; stagger?: number; delay?: number
}) {
  const reduce = useReducedMotion()
  const Tag = as
  if (reduce) return <Tag className={className}>{text}</Tag>
  let index = 0
  return (
    <Tag className={`kt${className ? ` ${className}` : ''}`} aria-label={text}>
      <motion.span key={text} className="kt__inner" aria-hidden initial="hidden" animate="show"
        transition={{ delayChildren: delay, staggerChildren: stagger }}>
        {text.split('\n').map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {line.split(' ').map((word, wordIndex) => {
              const start = index
              index += word.length + 1
              return (
                <Fragment key={wordIndex}>
                  {wordIndex > 0 && ' '}
                  <span className="kt-word"><Chars text={word} startIndex={start} stagger={0} /></span>
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </motion.span>
    </Tag>
  )
}

/** 같은 자리에서 단어가 위로 빠지고 새 단어가 올라온다. 가장 긴 단어 폭을 미리 잡아 둬 줄이 흔들리지 않는다. */
export function RotatingWord({ words, interval = 2400, className }: { words: string[]; interval?: number; className?: string }) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (reduce) return
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % words.length), interval)
    return () => window.clearInterval(timer)
  }, [reduce, words.length, interval])
  return (
    <span className={`kt-rotate${className ? ` ${className}` : ''}`} aria-live="off" aria-label={words.join(', ')}>
      {words.map((word) => <span key={word} className="kt-rotate__ghost" aria-hidden>{word}</span>)}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={words[index]} className="kt-rotate__word" aria-hidden
          initial={reduce ? false : { y: '0.9em', opacity: 0, rotateX: -70, filter: 'blur(4px)' }}
          animate={{ y: '0em', opacity: 1, rotateX: 0, filter: 'blur(0px)' }}
          exit={{ y: '-0.9em', opacity: 0, rotateX: 70, filter: 'blur(4px)' }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}>
          {words[index]}
        </motion.span>
      </AnimatePresence>
      <motion.span key={`mark-${index}`} className="kt-rotate__mark" aria-hidden
        initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1], delay: 0.12 }} />
    </span>
  )
}

/** 숫자가 이전 값에서 새 값으로 굴러간다. 실제 값만 보여 주며(목표 값으로 끝남) 임의로 부풀리지 않는다. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  const previous = useRef(value)
  useEffect(() => {
    if (reduce) { setShown(value); previous.current = value; return }
    const controls = animate(previous.current, value, { duration: 0.6, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setShown(Math.round(v)) })
    previous.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <span className={`kt-count${className ? ` ${className}` : ''}`}>{shown.toLocaleString('ko-KR')}</span>
}

/** 홈 뒤로 천천히 흐르는 큰 글자 띠(장식, 읽지 않음). */
export function KineticBand({ rows }: { rows: string[] }) {
  return (
    <div className="kt-band" aria-hidden>
      {rows.map((row, index) => (
        <div key={index} className={`kt-band__row kt-band__row--${index % 2 ? 'rev' : 'fwd'}`}>
          <span>{row}</span><span>{row}</span>
        </div>
      ))}
    </div>
  )
}

/** eyebrow: 넓게 퍼진 자간이 모이며 나타난다. */
export function KineticEyebrow({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.span key={text} className={className}
      initial={reduce ? false : { letterSpacing: '0.5em', opacity: 0 }}
      animate={{ letterSpacing: '0.02em', opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
      {text}
    </motion.span>
  )
}
