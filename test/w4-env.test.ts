import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs launcher helper
import { w4BackendEnv } from '../scripts/w4-env.mjs'
import { createThresholdPolicyEvaluator, W4_R01_MODEL_HASH, W4_PROVISIONAL_POLICY_HASH } from '../upstream/backend/src/inference.ts'

describe('real-AI launcher settings', () => {
  it('come only from the pinned clone files and pass the backend policy trust checks', async () => {
    const backend = fileURLToPath(new URL('../upstream/backend', import.meta.url))
    const env = w4BackendEnv(backend, 'http://127.0.0.1:8765/infer') as Record<string, string>
    expect(env.VERIMOD_POLICY_MANIFEST_HASH).toBe(W4_PROVISIONAL_POLICY_HASH)
    const evaluator = createThresholdPolicyEvaluator({
      policyManifestHash: env.VERIMOD_POLICY_MANIFEST_HASH as never,
      policyManifest: JSON.parse(readFileSync(env.VERIMOD_POLICY_MANIFEST_PATH, 'utf8')),
      localW4E2E: env.VERIMOD_W4_PROVISIONAL_E2E_ONLY === 'true',
      hate: { review: Number(env.VERIMOD_HATE_REVIEW_PPM), restrict: Number(env.VERIMOD_HATE_RESTRICT_PPM) },
      offensive: { review: Number(env.VERIMOD_OFFENSIVE_REVIEW_PPM), restrict: Number(env.VERIMOD_OFFENSIVE_RESTRICT_PPM) },
    })
    const result = await evaluator.evaluate({
      output_version: 'inference/1', inference_id: '11111111-1111-4111-8111-111111111111', content_commitment: `0x${'1'.repeat(64)}`,
      model_manifest_hash: W4_R01_MODEL_HASH, taxonomy_id: 'verimod-ko-beep-hate', taxonomy_version: '1',
      scores_ppm: { hate: 1000, offensive: 700000 }, score_semantics: 'UNCALIBRATED', input_status: 'FULL', evidence: [], inferred_at: '2026-10-26T00:00:00.000Z',
    })
    expect(result.action).toBe('RESTRICT')
  })
})
