/** backend/config/w4-provisional.policy_manifest.json의 thresholds_ppm (test/score-thresholds.test.ts가 파일과 대조). */
export const W4_PROVISIONAL_THRESHOLDS: Record<string, { review: number; restrict: number }> = {
  hate: { review: 24495, restrict: 216950 },
  offensive: { review: 180483, restrict: 646501 },
}
