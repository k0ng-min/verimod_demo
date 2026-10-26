import { useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { BackgroundDecor } from './components/BackgroundDecor'
import { FrameScrollbar } from './components/FrameScrollbar'
import { AnalyzePage } from './flow/AnalyzePage'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { PublicSessionPage } from './pages/PublicSessionPage'
import { ReceiptPage } from './pages/ReceiptPage'
import { VaultPage } from './pages/VaultPage'
import { VerifyPage } from './pages/VerifyPage'

/** 레퍼런스 App과 같은 셸: 배경 낙하 아이콘 + 데스크톱 중앙 앱 프레임 + 프레임 안 스크롤 표시기.
 * 모든 화면은 프레임 높이에 맞춰 배치하고, 넘칠 때만(확대·아주 낮은 창) 프레임 안에서 스크롤된다. */
export default function App() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  return (
    <>
      <BackgroundDecor />
      <div className={`app-shell vshell${location.pathname === '/' ? ' app-shell--home' : ''}`}>
        <main className="app-main" ref={mainRef}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/analyze" element={<AnalyzePage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/r/:id" element={<ReceiptPage />} />
            <Route path="/s/:publicId" element={<PublicSessionPage />} />
            <Route path="/vault" element={<VaultPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <FrameScrollbar targetRef={mainRef} />
      </div>
    </>
  )
}
