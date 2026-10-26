// upstream/ 만들기: VeriMod 원본을 고정 커밋으로 복제하고, 원격을 지우고, push를 막는다.
// 이 앱은 VeriMod 코드를 이 복제본에서만 읽고 실행하므로 원래 작업 저장소와 겹치지 않는다.
// 사용: node scripts/setup-upstream.mjs [소스]   소스 기본값 = https://github.com/jujinho03/verimod
//       (로컬에 verimod가 있으면 경로를 줘도 된다: node scripts/setup-upstream.mjs ..\verimod)
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const COMMIT = 'cd5b1c5' // 이 앱을 검증한 기준(INTEGRATION_MAP.md)
const app = fileURLToPath(new URL('..', import.meta.url))
const target = resolve(app, 'upstream')
const source = process.argv[2] ?? 'https://github.com/jujinho03/verimod'
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })

if (existsSync(target)) {
  console.log('upstream/ 가 이미 있습니다. 다시 만들려면 지우고 실행하세요.')
} else {
  run('git', ['clone', '--quiet', '--no-hardlinks', source, target], app)
  run('git', ['checkout', '--quiet', COMMIT], target)
  run('git', ['remote', 'remove', 'origin'], target)
  const hook = join(target, '.git/hooks/pre-push')
  writeFileSync(hook, '#!/bin/sh\necho "verimod-redesign/upstream is a local, push-blocked copy." >&2\nexit 1\n')
  chmodSync(hook, 0o755)
  console.log(`upstream/ = ${COMMIT} (원격 없음, push 차단)`)
}
run('npm', ['ci'], join(target, 'backend'))
run('npm', ['ci'], join(target, 'backend/contracts'))
console.log('준비 완료: npm run dev:all')
