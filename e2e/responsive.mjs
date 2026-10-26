// 창 크기를 조금씩 바꾸며(같은 페이지에서 setViewportSize, 새로고침 없음) 화면이 따라 바뀌는지 잰다.
// 사용: node e2e/responsive.mjs <출력폴더>
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const OUT = process.argv[2] ?? 'e2e/responsive'
const BASE = process.env.APP_URL ?? 'http://localhost:5190'
mkdirSync(OUT, { recursive: true })
const WIDTHS = [320, 360, 390, 414, 480, 600, 768, 820, 899, 900, 1024, 1180, 1280, 1366, 1440, 1600, 1920]
const HEIGHTS = [640, 740, 768, 844, 900, 1080]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const rows = []

async function measure(state) {
  for (const width of WIDTHS) {
    for (const height of HEIGHTS) {
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(120)
      const m = await page.evaluate(() => {
        const main = document.querySelector('.app-main')
        const primary = [...document.querySelectorAll('.step__next, .home-link__go')].filter((el) => el.offsetParent !== null).pop()
        const r = primary?.getBoundingClientRect()
        const shell = document.querySelector('.app-shell').getBoundingClientRect()
        const body = document.querySelector('.vstep__body, .home-link')?.getBoundingClientRect()
        const rowsShown = document.querySelectorAll('.vlist > *').length
        return {
          overflow: Math.max(main.scrollHeight - main.clientHeight, (() => { const b = document.querySelector('.vstep__body'); return b ? b.scrollHeight - b.clientHeight : 0 })()),
          hscroll: document.documentElement.scrollWidth - window.innerWidth,
          btnVisible: r ? r.bottom <= window.innerHeight + 0.5 && r.top >= 0 : null,
          frameW: Math.round(shell.width), bodyW: body ? Math.round(body.width) : null, rowsShown,
        }
      })
      rows.push({ state, width, height, ...m })
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 })
}

await page.goto(`${BASE}/`)
await page.fill('#home-url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
await measure('home')
await page.goto(`${BASE}/analyze?demo=1`)
await page.getByRole('button', { name: '데모로 계속' }).click()
await page.getByRole('button', { name: '댓글 가져오기' }).click()
await page.waitForSelector('#kw')
await page.fill('#kw', '짜증, 공사')
await page.getByRole('button', { name: '추가' }).click()
await measure('words')
await page.getByRole('button', { name: /고르기/ }).click()
await measure('pick')
await page.getByRole('button', { name: /개로 계속/ }).click()
await page.waitForSelector('text=판정 기준')
await measure('settings')
await page.getByRole('button', { name: /판정 .*시작/ }).click()
await page.waitForSelector('.vtiles', { timeout: 30000 })
await measure('result')
await page.getByRole('button', { name: '공유 화면 보기' }).click()
await measure('share')
await page.goto(`${BASE}/r/evidence-0`)
await page.waitForSelector('.vscores')
await measure('receipt-info')
await page.getByRole('tab', { name: '변조 시험' }).click()
await page.getByRole('button', { name: '점수 한 항목 바꾸기' }).click()
await page.waitForSelector('.vreport')
await measure('receipt-tamper-report')

await browser.close()
writeFileSync(`${OUT}/responsive.json`, JSON.stringify(rows, null, 2))
const bad = rows.filter((r) => r.overflow > 1 || r.hscroll > 1 || r.btnVisible === false)
console.log(`measurements ${rows.length}, flagged ${bad.length}`)
const byState = {}
for (const r of bad) (byState[r.state] ??= []).push(`${r.width}x${r.height}(+${r.overflow}${r.hscroll > 1 ? ` h+${r.hscroll}` : ''})`)
for (const [state, list] of Object.entries(byState)) console.log(`${state}: ${list.join(' ')}`)
// 폭이 연속으로 변하는지: 데스크톱 프레임 폭 표본
console.log('frame width @h900:', WIDTHS.map((w) => `${w}:${rows.find((r) => r.state === 'pick' && r.width === w && r.height === 900).frameW}`).join(' '))
console.log('pick rows shown @w1366:', HEIGHTS.map((h) => `${h}:${rows.find((r) => r.state === 'pick' && r.width === 1366 && r.height === h).rowsShown}`).join(' '))
