import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { Action, ItemStatus } from '../../shared/types'
import { Icon3D } from './Icon3D'
import { ThemeToggle } from './ThemeToggle'

/** 문자 화살표 대신 모든 조작에 쓰는 둥근 획의 아이콘. */
export function ArrowIcon({ direction = 'right', size = 22 }: { direction?: 'left' | 'right'; size?: number }) {
  return <svg className={`arrow-icon arrow-icon--${direction}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/** 레퍼런스 TopBar(원형 홈 버튼 + 제목 + 테마 스위치)에 단계 표시를 더했다. 계정·로그인은 없다. */
export function TopBar({ title, step, onHome, onHelp }: { title: string; step?: string; onHome?: () => void; onHelp?: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="topbar">
      <button type="button" className="topbar__home" onClick={onHome ?? (() => navigate('/'))} aria-label="이전 화면"><ArrowIcon direction="left" /></button>
      <span className="topbar__title">{title}</span>
      {step && <span className="topbar__step" aria-label={`단계 ${step}`}>{step}</span>}
      <span className="topbar__spacer" />
      {onHelp && <button type="button" className="topbar__help" onClick={onHelp} aria-label="PENDING_ANCHOR 이후 흐름 도움말">?</button>}
      <ThemeToggle />
    </div>
  )
}

export function Chip({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className={`tab vchip${on ? ' tab--active' : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={`vtoggle${disabled ? ' vtoggle--disabled' : ''}`}>
      <span className="vtoggle__text">
        <strong>{label}</strong>
        {hint && <em>{hint}</em>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="vtoggle__track" aria-hidden><span className="vtoggle__knob" /></span>
    </label>
  )
}

export const ACTION_LABEL: Record<Action, string> = { ALLOW: '허용', HUMAN_REVIEW: '검토', RESTRICT: '제한' }

export function ActionBadge({ action, status }: { action: Action | null; status?: ItemStatus }) {
  if (!action) {
    const label = status === 'CANCELLED' ? '취소' : status === 'SELECTED' ? '미시도' : status === 'ISSUING' ? '발급 중' : '미발급'
    return <span className="vbadge vbadge--fail">{label}</span>
  }
  return <span className={`vbadge vbadge--${action.toLowerCase()}`}>{ACTION_LABEL[action]}</span>
}

export function Notice({ tone = 'info', children, icon }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode; icon?: string }) {
  return (
    <div className={`vnotice vnotice--${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      {icon && <Icon3D src={icon} size={22} />}
      <div className="vnotice__text">{children}</div>
    </div>
  )
}

export function CopyButton({ value, label = '복사' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('done')
    } catch {
      setState('fail')
    }
    window.setTimeout(() => setState('idle'), 1800)
  }
  return (
    <button type="button" className="vcopy" onClick={copy} aria-live="polite">
      <Icon3D src="clipboard" size={18} />
      {state === 'done' ? '복사됨' : state === 'fail' ? '복사 실패 — 직접 선택' : label}
    </button>
  )
}

/** 화면 위에 띄우는 작은 세부 화면. body로 portal해 프레임 containment에 갇히지 않게 한다. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const reduce = useReducedMotion()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [onClose])
  return createPortal(
    <div className="vmodal-overlay" onClick={onClose}>
      <motion.div
        className="vmodal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        initial={reduce ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.22 }}
      >
        <div className="vmodal__head">
          <strong>{title}</strong>
          <button ref={closeRef} type="button" className="vmodal__close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="vmodal__body">{children}</div>
      </motion.div>
    </div>,
    document.body,
  )
}

export function shortHash(value: string | null | undefined, head = 10, tail = 6): string {
  if (!value) return '—'
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
