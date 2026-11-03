import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Capabilities } from '../../shared/types'
import { parseContentUrl } from '../../shared/url'
import { svc, SvcError } from '../api/svc'
import { FloatingIcon } from '../components/FloatingIcon'
import { Icon3D } from '../components/Icon3D'
import { KineticBand, KineticText, RotatingWord } from '../components/Kinetic'
import { ThemeToggle } from '../components/ThemeToggle'
import { ArrowIcon, Notice } from '../components/ui'
import { clearFlow, INITIAL, saveFlow } from '../flow/state'

/** 첫 화면 = 링크 넣기. 넣고 확인하면 바로 분석 흐름(콘텐츠 확인 단계)으로 이어진다. */
const INTRO_FLOW = [
  ['link', '1 · YouTube 링크를 넣어요', '검증하고 싶은 영상 링크를 넣으면, VeriMod가 공식 YouTube API로 영상과 댓글을 확인하면서 흐름을 시작해요.'],
  ['target', '2 · 가져온 댓글을 골라요', '원댓글 수를 먼저 정하고 답글까지 함께 불러와요. 그중 실제로 판정할 댓글만 직접 선택해요.'],
  ['gear', '3 · R01이 댓글을 판정해요', '선택한 원문이 하나씩 한국어 R01 모델과 고정 정책으로 넘어가 조치와 점수가 결정돼요. Gemini는 앞 단계에서 관련 댓글을 찾는 역할만 해요.'],
  ['receipt', '4 · 결과가 Receipt로 남아요', '판정이 끝날 때마다 조치·점수·모델·정책 정보가 담긴 영수증 하나가 발급돼요. 그래서 결과를 나중에 같은 근거로 다시 볼 수 있어요.'],
  ['chains', '5 · 보관·공유·검증해요', '발급된 Receipt는 보관함과 공개 링크에서 다시 볼 수 있어요. 공개 증거 영수증은 별도 검증 화면에서 독립적으로 확인할 수 있어요.'],
] as const

function IntroFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const [index, setIndex] = useState(0)
  const step = INTRO_FLOW[index]
  const next = () => setIndex((current) => current < INTRO_FLOW.length - 1 ? current + 1 : 0)
  useEffect(() => { if (open) setIndex(0) }, [open])
  useEffect(() => {
    if (!open || reduce) return
    const timer = window.setTimeout(() => index === INTRO_FLOW.length - 1 ? onClose() : next(), 4200)
    return () => window.clearTimeout(timer)
  }, [index, open, reduce, onClose])
  return createPortal(<AnimatePresence>{open && <motion.div className="intro-alert__overlay" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="intro-alert" role="dialog" aria-modal="true" aria-labelledby="intro-flow-title" initial={reduce ? false : { opacity: 0, y: 24, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0, y: 24, scale: .96 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
      <div className="intro-alert__head"><div><span className="section-label">VERIMOD · 전체 흐름</span><h2 id="intro-flow-title">댓글 하나가 영수증이 되기까지</h2></div><div className="intro-alert__head-actions"><span className="anchor-alert__counter">{index + 1} / {INTRO_FLOW.length}</span><button type="button" className="anchor-alert__close" onClick={onClose} aria-label="안내 닫기">×</button></div></div>
      <div className="intro-alert__rail">{INTRO_FLOW.map((item, i) => <span key={item[1]} className={`intro-alert__dot${i === index ? ' intro-alert__dot--active' : i < index ? ' intro-alert__dot--done' : ''}`} />)}</div>
      <motion.div key={step[1]} className="intro-alert__body" initial={reduce ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .2 }}><div className="intro-alert__art"><Icon3D src={step[0]} size={76} /></div><div><span>{String(index + 1).padStart(2, '0')} · FLOW</span><strong>{step[1]}</strong><p>{step[2]}</p></div></motion.div>
      <div className="intro-alert__footer"><i key={index} /><button type="button" onClick={next} aria-label="다음 흐름"><ArrowIcon size={26} /></button></div>
    </motion.section>
  </motion.div>}</AnimatePresence>, document.body)
}

export function Home() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [introOpen, setIntroOpen] = useState(true)
  useEffect(() => { svc.capabilities().then(setCaps).catch(() => setCaps(null)) }, [])

  const parsed = useMemo(() => (url.trim() ? parseContentUrl(url) : null), [url])
  const youtube = caps?.providers.YOUTUBE
  const ready = parsed?.kind === 'YOUTUBE' && youtube?.available !== false

  const start = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const { source } = await svc.resolve(url)
      clearFlow()
      saveFlow({ ...INITIAL, kind: 'URL', url, source, step: 'source' })
      navigate('/analyze')
    } catch (caught) {
      setError(caught instanceof SvcError ? caught.message : '주소를 확인하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  const hint = (() => {
    if (!parsed) return null
    if (parsed.kind === 'YOUTUBE') return youtube?.available === false
      ? <Notice tone="warn" icon="lock">{youtube.reason}</Notice>
      : <Notice tone="ok" icon="tick">YouTube 영상 주소예요</Notice>
    if (parsed.kind === 'NEWS') return <Notice tone="warn" icon="warning">{parsed.site} 댓글은 공식 수집 API가 없어 아직 가져올 수 없어요.</Notice>
    if (parsed.kind === 'UNSUPPORTED') return <Notice tone="warn" icon="warning">지금은 YouTube 영상 주소만 받아요.</Notice>
    return <Notice tone="error" icon="prohibited">{parsed.reason}</Notice>
  })()

  return (
    <div className="page home home--link">
      <KineticBand rows={['DECIDE · PROVE · APPEAL · ', '판정 · 영수증 · 검증 · ']} />
      <div className="home__topbar">
        <button type="button" className="topbar__help" onClick={() => setIntroOpen(true)} aria-label="VeriMod 전체 흐름 보기">?</button>
        <ThemeToggle />
        <span className="home__topbar-spacer" />
      </div>

      <motion.div className="home__hero" initial={reduce ? false : { opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <motion.div initial={reduce ? false : { scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}>
          <FloatingIcon><Icon3D src="link" size={78} /></FloatingIcon>
        </motion.div>
        <h1 className="home__title home__title--kinetic" aria-label="링크 하나로 댓글을 판정하고 영수증 받고 검증해요">
          <KineticText text="링크 하나로" />
          <br />
          <span aria-hidden>댓글을 </span><RotatingWord words={['판정해요', '영수증으로', '검증해요']} />
        </h1>
        <KineticText as="p" className="home__subtitle" text="영상 링크를 넣으면 댓글을 모아 고르고, 댓글마다 블록체인으로 다시 확인할 수 있는 판정 영수증을 드려요." stagger={0.006} delay={0.35} />
      </motion.div>

      <motion.form className="home-link" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.3 }}
        onSubmit={(event) => { event.preventDefault(); void start() }}>
        <label htmlFor="home-url" className="vlabel">YouTube 영상 링크</label>
        <input id="home-url" className="vinput home-link__input" type="url" inputMode="url" autoComplete="off" spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={(event) => { setUrl(event.target.value); setError(null) }} />
        <div className="home-link__status" aria-live="polite">
          {error ? <p className="error-box" role="alert">{error}</p> : hint}
        </div>
        <button type="submit" className="btn-primary home-link__go" disabled={!ready || busy}>{busy ? '확인하는 중...' : '댓글 가져오기'}</button>
        <button type="button" className="link-button home-link__alt" onClick={() => navigate('/analyze?demo=1')}>링크 없이 데모로 흐름 보기</button>
      </motion.form>

      <p className="home__footer">© 2026 VeriMod · 팀 HTTP 451</p>
      <IntroFlow open={introOpen} onClose={() => setIntroOpen(false)} />
    </div>
  )
}
