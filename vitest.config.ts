import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@verimod\/protocol\/(.*)$/, replacement: `${here('./upstream/shared/protocol/src/')}$1.ts` },
      { find: /^@vm-domain\/(.*)$/, replacement: `${here('./upstream/frontend/src/domain/')}$1.ts` },
      { find: /^@vm-ui\/(.*)$/, replacement: `${here('./upstream/frontend/src/ui/')}$1.ts` },
      { find: /^@vm-features\/(.*)$/, replacement: `${here('./upstream/frontend/src/features/')}$1.ts` },
    ],
  },
  test: { include: ['test/**/*.test.ts'], exclude: ['upstream/**', 'node_modules/**'], environment: 'node' },
})
