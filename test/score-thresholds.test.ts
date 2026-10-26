import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { W4_PROVISIONAL_THRESHOLDS } from '../src/verify/policy'

describe('W4 provisional thresholds shown in the UI', () => {
  it('match the pinned backend policy manifest exactly', () => {
    const manifest = JSON.parse(readFileSync(new URL('../upstream/backend/config/w4-provisional.policy_manifest.json', import.meta.url), 'utf8'))
    expect(W4_PROVISIONAL_THRESHOLDS).toEqual(manifest.thresholds_ppm)
  })
})
