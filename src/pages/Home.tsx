import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { Capabilities } from '../../shared/types'
import { parseContentUrl } from '../../shared/url'
import { svc, SvcError } from '../api/svc'
import { FloatingIcon } from '../components/FloatingIcon'
import { Icon3D } from '../components/Icon3D'
import { KineticBand, KineticText, RotatingWord } from '../components/Kinetic'
import { ThemeToggle } from '../components/ThemeToggle'
import { Notice } from '../components/ui'
import { clearFlow, INITIAL, saveFlow } from '../flow/state'

/** 첫 화면 = 링크 넣기. 넣고 확인하면 바로 분석 흐름(콘텐츠 확인 단계)으로 이어진다. */
export function Home() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)
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
    </div>
  )
}
