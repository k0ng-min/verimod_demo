// 계정·공유 링크·접근성 확인. 사용: node e2e/checks.mjs <출력폴더>
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? 'e2e/checks'
const BASE = process.env.APP_URL ?? 'http://localhost:5190'
mkdirSync(OUT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const browser = await chromium.launch()

// 1) 데모 세션을 만들고 공개 링크를 얻는다
const ctxA = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const a = await ctxA.newPage()
await a.goto(`${BASE}/analyze?demo=1`)
await a.getByRole('button', { name: '데모로 계속' }).click()
await a.getByRole('button', { name: '댓글 가져오기' }).click()
await a.waitForSelector('#kw')
await a.getByRole('button', { name: /고르기/ }).click()
await a.getByRole('button', { name: /개로 계속/ }).click()
await a.getByRole('button', { name: /데모 판정 .*시작/ }).click()
await a.waitForSelector('.vtiles', { timeout: 30000 })
await a.getByRole('button', { name: '공유 화면 보기' }).click()
const publicUrl = await a.locator('.vlinkrow__url').innerText()
check('공개 링크 생성', /\/s\/[A-Za-z0-9_-]+$/.test(publicUrl), publicUrl)
// 로그인·회원가입 기능이 없다
check('상단에 로그인 버튼 없음', (await a.locator('.account-pill').count()) + (await a.getByText('로그인', { exact: false }).count()) === 0)
await a.goto(`${BASE}/account`)
check('/account 화면 없음(404 화면)', (await a.locator('text=없는 화면이에요').count()) === 1)
check('계정 API 없음', (await a.evaluate(async () => (await fetch('/svc/auth/me')).status)) === 404)

// 2) 공개 링크를 새 컨텍스트(쿠키·localStorage 없음)로 연다
const ctxC = await browser.newContext({ viewport: { width: 360, height: 740 } })
const c = await ctxC.newPage()
let privateLeak = false
c.on('response', async (response) => {
  if (response.url().includes('/svc/public/')) { const text = await response.text(); if (/content_salt|owner_token|private/.test(text)) privateLeak = true }
})
await c.goto(publicUrl)
await c.waitForSelector('.vtiles')
check('공개 링크를 새 브라우저 컨텍스트로 조회', (await c.locator('.vresult').count()) > 0)
check('공개 응답에 salt·소유 토큰 없음', !privateLeak)
check('원문 비공개 기본값', (await c.locator('text=원문 비공개').count()) > 0)
await c.screenshot({ path: `${OUT}/public-session-360.png` })
// 남의 세션을 owner 없이 열면 거부
const sessionId = await a.evaluate(() => JSON.parse(sessionStorage.getItem('verimod_redesign_flow_v1') ?? '{}').sessionId)
const forbidden = await c.evaluate(async (id) => (await fetch(`/svc/sessions/${id}`)).status, sessionId)
check('소유자 아닌 세션 조회 거부(403)', forbidden === 403, String(forbidden))
const pkg = await c.evaluate(async (id) => (await fetch(`/svc/sessions/${id}/private-package`)).status, sessionId)
check('비공개 패키지 무단 다운로드 거부(403)', pkg === 403, String(pkg))

// 3) 없는 영수증 → 오류 표시, backend 공개 API로만 조회
await c.goto(`${BASE}/r/00000000-0000-4000-8000-000000000000`)
await c.waitForSelector('.error-box')
check('없는 영수증 ID 오류 표시', (await c.locator('.error-box').innerText()).includes('찾지 못했습니다'))

// 4) 200% 확대 근사(1366x768의 절반 CSS px): 내용이 잘리지 않고 프레임 안 스크롤로 버튼에 닿는다
const ctxZ = await browser.newContext({ viewport: { width: 683, height: 384 }, deviceScaleFactor: 2 })
const z = await ctxZ.newPage()
await z.goto(`${BASE}/analyze?demo=1`)
await z.waitForSelector('.step__next')
const reach = await z.evaluate(() => {
  const main = document.querySelector('.app-main')
  main.scrollTop = main.scrollHeight
  const rect = document.querySelector('.step__next').getBoundingClientRect()
  return { overflow: main.scrollHeight - main.clientHeight, bottom: rect.bottom, vh: window.innerHeight }
})
check('200% 확대: 프레임 안 스크롤로 주 버튼 도달', reach.bottom <= reach.vh, JSON.stringify(reach))
await z.screenshot({ path: `${OUT}/zoom200-scrolled.png` })

// 5) 키보드: Tab으로 링크 입력칸에 초점, 입력 후 Enter로 확인 시도
const k = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
await k.goto(`${BASE}/`)
let focused = null
for (let i = 0; i < 6; i += 1) {
  await k.keyboard.press('Tab')
  if (await k.evaluate(() => document.activeElement?.id === 'home-url')) {
    await k.waitForTimeout(300)
    focused = await k.evaluate(() => { const st = getComputedStyle(document.activeElement); return { outline: st.outlineStyle, shadow: st.boxShadow } })
    break
  }
}
check('키보드 Tab으로 링크 입력칸 초점·표시', Boolean(focused) && (focused.outline !== 'none' || !focused.shadow.startsWith('rgba(0, 0, 0, 0)')), JSON.stringify(focused))
await k.keyboard.type('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
check('입력 즉시 주소 판별 안내', (await k.locator('.home-link__status .vnotice').count()) === 1)

// 6) reduced motion: 배경 낙하 아이콘 숨김
const r = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage()
await r.goto(`${BASE}/`)
await r.waitForTimeout(1500)
check('reduced-motion에서 배경 장식 숨김', await r.evaluate(() => getComputedStyle(document.querySelector('.bg-decor')).display === 'none'))

await browser.close()
writeFileSync(`${OUT}/checks.json`, JSON.stringify(results, null, 2))
const failed = results.filter((item) => !item.ok)
console.log(`${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
