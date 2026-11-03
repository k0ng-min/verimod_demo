import { createBackendClient } from './backendClient'
import { loadConfig } from './config'
import { openServiceDatabase } from './db'
import { createServiceApp } from './app'
import { createYouTubeProvider } from './providers/youtube'
import { createGeminiSemanticFilter } from './semantic'

const config = loadConfig()
const db = openServiceDatabase(config.dbPath)
const { app } = createServiceApp({
  db,
  config,
  youtube: createYouTubeProvider({ apiKey: config.youtubeApiKey, timeoutMs: config.upstreamTimeoutMs }),
  semantic: createGeminiSemanticFilter({ apiKey: config.geminiApiKey, model: config.geminiModel, timeoutMs: config.geminiTimeoutMs }),
  backend: createBackendClient({ baseUrl: config.backendUrl, timeoutMs: config.backendTimeoutMs }),
})

app.listen(config.port, '127.0.0.1', () => {
  // 키 값은 출력하지 않고 설정 여부만 알린다.
  console.log(`verimod redesign service on http://127.0.0.1:${config.port}`)
  console.log(`  dev db: ${config.dbPath}`)
  console.log(`  backend: ${config.backendUrl} | YOUTUBE_API_KEY ${config.youtubeApiKey ? 'set' : 'not set'} | GEMINI_API_KEY ${config.geminiApiKey ? 'set' : 'not set'}`)
})
