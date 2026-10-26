import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

/** 레퍼런스와 같은 idle 애니메이션(좌우 ±4°, 위로 4px, 4.5초). reduced-motion이면 멈춘다. */
export function FloatingIcon({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      animate={reduce ? undefined : { rotate: [-4, 4, -4], y: [0, -4, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay }}
      style={{ display: 'inline-block' }}
    >
      {children}
    </motion.div>
  )
}
