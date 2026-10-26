// 한 번에 실행: (실제 AI 서비스) · 기존 VeriMod backend(3001) · 수집 서비스(3101) · 새 앱(5190).
// 모든 VeriMod 코드는 이 폴더의 로컬 복제본 upstream/(원격 없음, push 차단)에서 실행한다. 원래 작업 저장소는 건드리지 않는다.
//
// 실제 AI 모드: upstream/ai 아래에 선정 R01 가중치와 Python 환경(ai/.venv)이 있으면 자동으로 켠다.
//   - AI 서비스: uvicorn verimod_ai.inference.service:create_app (127.0.0.1:8765)
//   - backend W4 설정값은 손으로 넣지 않고 복제본의 고정 파일에서 읽는다(manifest 경로, 정책 hash 상수, manifest의 threshold).
//     값이 하나라도 다르면 backend가 스스로 fail-closed 한다.
// 가중치가 없으면 backend는 추론 unavailable로 뜨고, 판정 요청은 영수증 없이 거절된다.
// 사용(PowerShell): cd verimod-redesign; npm run dev:all   — 끝낼 때 Ctrl+C
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { w4BackendEnv } from './w4-env.mjs'

const app = fileURLToPath(new URL('..', import.meta.url))
const upstream = resolve(app, 'upstream')
const backend = join(upstream, 'backend')
const devDb = resolve(app, '.data/backend-dev.sqlite')
mkdirSync(resolve(app, '.data'), { recursive: true })
if (!existsSync(join(backend, 'node_modules'))) {
  console.error('upstream/backend 의존성이 없습니다: cd upstream/backend; npm ci')
  process.exit(1)
}

const baseEnv = { ...process.env }
delete baseEnv.VERIMOD_DB_PATH // 셸에 남은 다른 DB 경로가 섞이지 않게

const modelDir = process.env.VERIMOD_MODEL_DIR ?? join(upstream, 'ai/artifacts/checkpoints/beep-klue-roberta-base-w3-seed45126-cpu/selected_model')
const python = join(upstream, 'ai/.venv/Scripts/python.exe')
const AI_PORT = 8765
const realAi = existsSync(join(modelDir, 'model.safetensors')) && existsSync(python)

const children = []
function start(name, cwd, command, args, env) {
  const child = spawn(command, args, { cwd, env, shell: command === 'npx' })
  const write = (chunk) => { for (const line of String(chunk).split(/\r?\n/)) if (line.trim() && !line.includes('ExperimentalWarning') && !line.includes('--trace-warnings')) process.stdout.write(`[${name}] ${line}\n`) }
  child.stdout.on('data', write)
  child.stderr.on('data', write)
  child.on('exit', (code) => process.stdout.write(`[${name}] exited (${code})\n`))
  children.push(child)
  return child
}

async function waitHealthy(url, seconds) {
  for (let i = 0; i < seconds; i += 1) {
    try { if ((await fetch(url)).ok) return true } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

let backendEnv = { ...baseEnv, PORT: '3001', VERIMOD_DB_PATH: devDb }
if (realAi) {
  console.log(`실제 AI 모드: 가중치 ${modelDir}`)
  start('ai:8765', join(upstream, 'ai'), python, ['-m', 'uvicorn', '--factory', 'verimod_ai.inference.service:create_app', '--host', '127.0.0.1', '--port', String(AI_PORT)],
    { ...baseEnv, PYTHONPATH: join(upstream, 'ai/src'), VERIMOD_MODEL_DIR: modelDir })
  const healthy = await waitHealthy(`http://127.0.0.1:${AI_PORT}/healthz`, 120)
  console.log(healthy ? 'AI 서비스 /healthz 200' : 'AI 서비스가 준비되지 않았습니다 — backend는 fail-closed로 동작합니다')
  backendEnv = { ...backendEnv, ...w4BackendEnv(backend, `http://127.0.0.1:${AI_PORT}/infer`) }
} else {
  console.log(`실제 AI: 꺼짐 — 가중치 없음(${join(modelDir, 'model.safetensors')}) 또는 ${python} 없음. 판정 요청은 영수증 없이 거절됩니다.`)
}

start('backend:3001', backend, 'npx', ['tsx', 'src/server.ts'], backendEnv)
start('svc:3101', app, 'npx', ['tsx', 'server/index.ts'], baseEnv)
start('web:5190', app, 'npx', ['vite', '--port', '5190', '--strictPort'], baseEnv)

const stop = () => { for (const child of children) child.kill(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
console.log(`backend dev DB: ${devDb}`)
console.log('open http://localhost:5190')
