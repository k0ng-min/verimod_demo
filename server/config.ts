import { resolve } from 'node:path'

/** 서버 비밀값(YouTube·Gemini 키)은 이 프로세스 환경변수에서만 읽는다. VITE_ 변수로 브라우저에 넘기지 않는다. */
export interface ServiceConfig {
  port: number
  dbPath: string
  backendUrl: string
  backendTimeoutMs: number
  youtubeApiKey: string | null
  geminiApiKey: string | null
  geminiModel: string
  /** 의미 선택은 수십 개 원문을 함께 보내므로 일반 외부 API보다 긴 제한을 쓴다. */
  geminiTimeoutMs: number
  upstreamTimeoutMs: number
  /** 연속 INFERENCE_UNAVAILABLE이 이만큼 나오면 나머지 발급 시도를 멈춘다. */
  stopAfterUnavailable: number
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function localBackend(value: string): string {
  const url = new URL(value)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('VERIMOD_BACKEND_URL은 로컬 주소만 허용합니다(개발 격리)')
  }
  return url.origin
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  return {
    port: Number(env.REDESIGN_SVC_PORT ?? 3101),
    dbPath: resolve(env.REDESIGN_DB_PATH ?? './.data/redesign-dev-v2.sqlite'),
    backendUrl: localBackend(env.VERIMOD_BACKEND_URL ?? 'http://127.0.0.1:3001'),
    backendTimeoutMs: Number(env.VERIMOD_BACKEND_TIMEOUT_MS ?? 20_000),
    youtubeApiKey: nonEmpty(env.YOUTUBE_API_KEY),
    geminiApiKey: nonEmpty(env.GEMINI_API_KEY),
    geminiModel: nonEmpty(env.GEMINI_MODEL) ?? 'gemini-2.5-flash',
    geminiTimeoutMs: Number(env.GEMINI_TIMEOUT_MS ?? 60_000),
    upstreamTimeoutMs: Number(env.REDESIGN_UPSTREAM_TIMEOUT_MS ?? 8_000),
    stopAfterUnavailable: Number(env.REDESIGN_STOP_AFTER_UNAVAILABLE ?? 3),
  }
}
