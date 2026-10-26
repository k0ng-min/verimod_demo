import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// 브라우저는 같은 origin(5190)으로만 요청한다. /api는 기존 VeriMod backend(3001),
// /svc는 이 앱 전용 수집·세션 서비스(3101)로 넘겨 CORS 없이 개발·미리보기를 한다.
const proxy = {
  '/api': 'http://127.0.0.1:3001',
  '/svc': 'http://127.0.0.1:3101',
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // 공유 프로토콜과 기존 브라우저 검증기를 복사하지 않고 원본 소스를 그대로 쓴다.
      { find: /^@verimod\/protocol\/(.*)$/, replacement: `${here('./upstream/shared/protocol/src/')}$1.ts` },
      { find: /^@vm-domain\/(.*)$/, replacement: `${here('./upstream/frontend/src/domain/')}$1.ts` },
      { find: /^@vm-ui\/(.*)$/, replacement: `${here('./upstream/frontend/src/ui/')}$1.ts` },
      { find: /^@vm-features\/(.*)$/, replacement: `${here('./upstream/frontend/src/features/')}$1.ts` },
    ],
  },
  server: { proxy, fs: { allow: [here('.')] } },
  preview: { proxy },
})
