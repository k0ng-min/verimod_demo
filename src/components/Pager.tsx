import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { ArrowIcon } from './ui'

/** 레퍼런스 Pager와 같은 동작: 목록이 길면 스크롤 대신 "다음"으로 넘긴다. 목록이 바뀌면 1쪽으로. */
export function usePager<T>(items: readonly T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(0)
  const size = Math.max(1, pageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const clampedPage = Math.min(page, totalPages - 1)
  useEffect(() => { setPage(0) }, [items.length, resetKey])
  const pageItems = items.slice(clampedPage * size, clampedPage * size + size)
  return { page: clampedPage, setPage, totalPages, pageItems }
}

/** 남은 높이에 들어가는 행 수를 잰다 — 고정 개수 대신 실제 프레임 높이와 실제 행 높이(반응형으로 바뀜)로 쪽 크기를 정한다.
 * 창 크기가 바뀔 때마다(ResizeObserver) 다시 계산한다. 첫 행이 아직 없으면 rowHeight를 추정값으로 쓴다. */
export function useFitCount(ref: RefObject<HTMLElement | null>, rowHeight: number, min = 2, max = 8) {
  const [count, setCount] = useState(min)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const available = element.clientHeight
      const first = element.firstElementChild as HTMLElement | null
      const gap = parseFloat(getComputedStyle(element).rowGap) || 0
      const row = (first && first.offsetHeight > 0 ? first.offsetHeight : rowHeight) + gap
      if (available > 0) setCount(Math.max(min, Math.min(max, Math.floor((available + gap) / row))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [ref, rowHeight, min, max])
  return count
}

export function PagerNav({ page, totalPages, onChange, label = '쪽' }: { page: number; totalPages: number; onChange: (page: number) => void; label?: string }) {
  if (totalPages <= 1) return null
  return (
    <div className="pager-nav">
      <button type="button" className="pager-navbtn" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}><ArrowIcon direction="left" size={16} /> 이전</button>
      <span className="pager-count" aria-live="polite">{page + 1} / {totalPages} {label}</span>
      <button type="button" className="pager-navbtn" onClick={() => onChange(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1}>다음 <ArrowIcon size={16} /></button>
    </div>
  )
}
