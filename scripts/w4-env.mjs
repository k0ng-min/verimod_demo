import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** backend W4 실제 모드 환경값을 복제본의 고정 파일·상수에서 만든다(손으로 채우지 않는다). */
export function w4BackendEnv(backend, inferenceUrl) {
  const modelManifestPath = join(backend, 'config/w4-r01.model_manifest.json')
  const policyManifestPath = join(backend, 'config/w4-provisional.policy_manifest.json')
  const policy = JSON.parse(readFileSync(policyManifestPath, 'utf8'))
  const source = readFileSync(join(backend, 'src/inference.ts'), 'utf8')
  const policyHash = /W4_PROVISIONAL_POLICY_HASH: Hex32 = '(0x[0-9a-f]{64})'/.exec(source)?.[1]
  if (!policyHash) throw new Error('정책 hash 상수를 backend 소스에서 찾지 못했습니다')
  return {
    VERIMOD_W4_PROVISIONAL_E2E_ONLY: 'true',
    VERIMOD_INFERENCE_URL: inferenceUrl,
    VERIMOD_INFERENCE_TIMEOUT_MS: '15000',
    VERIMOD_MODEL_MANIFEST_PATH: modelManifestPath,
    VERIMOD_POLICY_MANIFEST_PATH: policyManifestPath,
    VERIMOD_POLICY_MANIFEST_HASH: policyHash,
    VERIMOD_HATE_REVIEW_PPM: String(policy.thresholds_ppm.hate.review),
    VERIMOD_HATE_RESTRICT_PPM: String(policy.thresholds_ppm.hate.restrict),
    VERIMOD_OFFENSIVE_REVIEW_PPM: String(policy.thresholds_ppm.offensive.review),
    VERIMOD_OFFENSIVE_RESTRICT_PPM: String(policy.thresholds_ppm.offensive.restrict),
  }
}
