// 새 앱의 핵심 흐름을 실제 브라우저로 클릭하며 캡처하고, 화면마다 세로 넘침·주 버튼 위치·깨진 이미지·콘솔 오류를 잰다.
// 사용: node e2e/walkthrough.mjs <출력폴더> [viewports=all] [themes=light,dark]
// 전제: 5190(Vite), 3101(수집 서비스), 3001(기존 backend)이 실행 중.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? 'e2e/shots'
const BASE = process.env.APP_URL ?? 'http://localhost:5190'
const ALL = { '1440x900': [1440, 900], '1366x768': [1366, 768], '390x844': [390, 844], '360x740': [360, 740] }
const viewports = (process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : Object.keys(ALL)).map((k) => [k, ALL[k]])
const themes = (process.argv[4] ?? 'light,dark').split(',')
mkdirSync(OUT, { recursive: true })

const report = []
const browser = await chromium.launch()

for (const theme of themes) {
  for (const [vpName, [width, height]] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    await context.addInitScript((t) => { try { localStorage.setItem('verimod_redesign_theme', t) } catch {} }, theme)
    const page = await context.newPage()
    const errors = []
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)) })
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.slice(0, 200)}`))

    const shot = async (name, { settle = 450 } = {}) => {
      await page.waitForTimeout(settle)
      const metrics = await page.evaluate(() => {
        const main = document.querySelector('.app-main')
        const primary = [...document.querySelectorAll('.step__next, .btn-primary')].filter((el) => el.offsetParent !== null).pop()
        const rect = primary?.getBoundingClientRect()
        const imgs = [...document.images]
        return {
          mainOverflow: main ? main.scrollHeight - main.clientHeight : null,
          pageOverflow: document.documentElement.scrollHeight - window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          primaryBottom: rect ? Math.round(rect.bottom) : null,
          primaryVisible: rect ? rect.bottom <= window.innerHeight && rect.top >= 0 : null,
          brokenImages: imgs.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src),
          fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
        }
      })
      const file = `${name}-${vpName}-${theme}.png`
      await page.screenshot({ path: `${OUT}/${file}` })
      report.push({ name, viewport: vpName, theme, file, ...metrics, consoleErrors: [...errors] })
      errors.length = 0
    }
    const clickText = async (text) => { await page.getByRole('button', { name: text }).first().click() }

    // 홈
    await page.goto(`${BASE}/`)
    await page.waitForLoadState('networkidle')
    await shot('01-home', { settle: 900 })
    await page.fill('#home-url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await shot('01b-home-link')

    // 데모 흐름
    await page.goto(`${BASE}/analyze?demo=1`)
    await shot('02-link-demo')
    await clickText('데모로 계속')
    await shot('03-scope')
    await clickText('댓글 가져오기')
    await page.waitForSelector('#kw')
    await page.fill('#kw', '짜증, 멍청')
    await clickText('추가')
    await page.getByRole('button', { name: '+ 제외할 단어 넣기' }).click()
    await page.fill('#ex', '민원')
    await page.getByRole('button', { name: '추가' }).nth(1).click()
    await shot('04-words')
    await page.getByRole('button', { name: /고르기/ }).click()
    await shot('05-pick')
    await page.getByRole('button', { name: /개로 계속/ }).click()
    await page.waitForSelector('text=판정 기준')
    await shot('06-settings')
    await page.getByRole('button', { name: /판정 .*시작/ }).click()
    await shot('07-run', { settle: 250 })
    await page.waitForSelector('.vtiles', { timeout: 20000 })
    await shot('08-result')
    await page.locator('.vresult').first().click()
    await shot('09-detail')
    await page.keyboard.press('Escape')
    await clickText('공유 화면 보기')
    await shot('10-share')

    // 직접 입력 → 실제 backend(현재 AI unavailable) → 멈춤
    await page.goto(`${BASE}/`)
    await page.evaluate(() => sessionStorage.clear())
    await page.goto(`${BASE}/analyze`)
    await page.getByRole('button', { name: '직접 입력' }).click()
    await page.fill('#manual-text', '오늘 영상 정말 유익했어요\n이건 좀 아닌 것 같네요\n댓글 테스트 세 번째 줄\n네 번째 문장입니다')
    await shot('11-link-manual')
    await page.getByRole('button', { name: /댓글 4개 불러오기/ }).click()
    await page.waitForSelector('#kw')
    await page.getByRole('button', { name: /고르기/ }).click()
    await page.getByRole('button', { name: /개로 계속/ }).click()
    await page.waitForSelector('text=판정 기준')
    await page.getByRole('button', { name: /판정 시작/ }).click()
    await page.waitForSelector('text=판정을 멈췄어요', { timeout: 20000 })
    await shot('12-run-stopped')
    await clickText('결과 보기')
    await shot('13-result-failed')

    // 링크 단계: YouTube 주소(키 없음)·뉴스 주소
    await page.goto(`${BASE}/`)
    await page.evaluate(() => sessionStorage.clear())
    await page.goto(`${BASE}/analyze`)
    await page.fill('#content-url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    await shot('14-link-youtube')
    await page.fill('#content-url', 'https://n.news.naver.com/article/001/0014000000')
    await shot('15-link-news')

    // 실제 공개 증거 영수증 → 브라우저 독립 검증(공개 RPC)
    await page.goto(`${BASE}/r/evidence-0`)
    await page.waitForSelector('text=브라우저에서 독립 검증')
    await shot('16-receipt-info')
    // 실제 체인 조회는 오래 걸리므로(배포 블록부터 로그 스캔) 첫 조합에서 한 번만 끝까지 기다린다.
    if (process.env.SKIP_CHAIN !== '1' && !report.some((r) => r.name === '17-receipt-verified')) {
      const started = Date.now()
      await clickText('브라우저에서 독립 검증')
      await page.waitForSelector('.vverdict', { timeout: 300000 })
      const code = await page.locator('.vverdict strong').innerText()
      console.log(`chain verification: ${code} in ${Math.round((Date.now() - started) / 1000)}s`)
      await shot('17-receipt-verified')
    }

    await page.goto(`${BASE}/verify`)
    await shot('18-verify')
    await page.goto(`${BASE}/vault`)
    await shot('19-vault')

    await context.close()
  }
}
await browser.close()
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
const bad = report.filter((r) => r.mainOverflow > 1 || r.pageOverflow > 1 || r.horizontalOverflow > 1 || r.primaryVisible === false || r.brokenImages.length || r.consoleErrors.length)
console.log(`screens ${report.length}, flagged ${bad.length}`)
for (const r of bad) console.log(`${r.name} ${r.viewport} ${r.theme} main+${r.mainOverflow} page+${r.pageOverflow} h+${r.horizontalOverflow} btnVisible=${r.primaryVisible} broken=${r.brokenImages.length} errors=${r.consoleErrors.join(' | ').slice(0, 160)}`)
