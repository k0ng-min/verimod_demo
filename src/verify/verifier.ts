import { APPROVED_PROFILES } from '@vm-domain/approvedProfiles'
import { manifestHashes } from '@vm-domain/manifests'
import { baseSepoliaProfileFromEnv, createPublicRpcLedger, type ApprovedTrustProfile } from '@vm-domain/rpcLedger'
import { validateBundle } from '@vm-domain/schema'
import type { VerificationBundle } from '@vm-domain/types'
import { verifyReceipt, type VerifyReport } from '@vm-domain/verify'

/** 기존 frontend의 검증기(domain/verify.ts)와 공개 RPC 원장 reader(domain/rpcLedger.ts)를 복사하지 않고 그대로 쓴다.
 * 신뢰 기준은 번들의 locator가 아니라 승인된 BASE_SEPOLIA_DEMO 프로필이다. */

// backend/src/inference.ts의 W4 고정 해시와 같은 값(실제 R01 모델, W4 시험용 정책). 공개 목록 비교에만 쓴다.
export const W4_R01_MODEL_HASH = '0x96b337807aa81ebac6acc3997586cbd351cbfa5c9c44028d479cab327ad0b7c1'
export const W4_PROVISIONAL_POLICY_HASH = '0xa4559132db0d048483c43b258d189027b5de59067ae0b0f4365da2b222299a1e'

function approvedBaseProfile(): { profile: ApprovedTrustProfile | null; problem: string | null } {
  const profile = baseSepoliaProfileFromEnv(import.meta.env)
  if (!profile) return { profile: null, problem: 'VITE_BASE_SEPOLIA_* 공개 설정이 없어 체인 검증을 할 수 없습니다' }
  const approved = APPROVED_PROFILES.BASE_SEPOLIA_DEMO
  // 환경변수가 승인 프로필과 다른 컨트랙트·발행자를 가리키면 쓰지 않는다(fail-closed).
  if (profile.contract_address !== approved.contract_address || profile.publisher !== approved.publisher || profile.chain_id !== approved.chain_id) {
    return { profile: null, problem: '설정된 체인 정보가 승인된 TrustProfile과 다릅니다' }
  }
  return { profile, problem: null }
}

export const BASE = approvedBaseProfile()

export function decodeBundle(value: unknown): VerificationBundle {
  const parsed = validateBundle(value)
  if (!parsed.ok) throw new Error(`영수증 형식이 올바르지 않습니다: ${parsed.message}`)
  return parsed.value
}

export interface LoadedPackage { receipt_id: string; original_text: string; content_salt: string; content_commitment: string }

/** Private Package는 검증된 본문의 receipt_id와 같을 때만 쓴다(원래 설계 §4: verified body가 기준, package의 commitment는 사본). */
export async function runVerification(bundle: unknown, pkg?: LoadedPackage | null): Promise<VerifyReport> {
  if (!BASE.profile) throw new Error(BASE.problem ?? '체인 검증 설정이 없습니다')
  const legacy = await manifestHashes()
  return verifyReceipt(bundle, {
    trust: BASE.profile,
    ledger: createPublicRpcLedger(BASE.profile),
    manifests: { model: W4_R01_MODEL_HASH as never, policy: W4_PROVISIONAL_POLICY_HASH as never, review: legacy.review },
    findBundle: () => null,
    findPrivateContent: () => {
      const body = (bundle as { receipt_body?: { receipt_id?: string } }).receipt_body
      if (!pkg || body?.receipt_id !== pkg.receipt_id) return null
      return { salt: `0x${pkg.content_salt}` as never, text: pkg.original_text }
    },
  })
}

/** 파일에서 Private Package(단일 또는 배열)를 읽어 이 영수증의 것을 고른다. 필드는 원래 설계와 정확히 같아야 한다. */
export function pickPackage(value: unknown, receiptId: string): LoadedPackage {
  const list = Array.isArray(value) ? value : (value as { packages?: unknown[] })?.packages ?? [value]
  const keys = 'content_commitment,content_salt,original_text,package_version,receipt_id'
  const found = list.find((item) => typeof item === 'object' && item !== null && (item as { receipt_id?: unknown }).receipt_id === receiptId)
  if (!found) throw new Error('이 영수증의 Private Package가 파일에 없습니다')
  const record = found as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== keys || record.package_version !== 'verimod-private/1'
    || typeof record.original_text !== 'string' || typeof record.content_salt !== 'string' || !/^[0-9a-f]{64}$/.test(record.content_salt)) {
    throw new Error('Private Package 형식(verimod-private/1)이 아닙니다')
  }
  return record as unknown as LoadedPackage
}

/** 기존 backend의 공개 bundle API. 새 탭·새 브라우저에서도 같은 결과를 받는다(로컬 저장 의존 없음). */
export async function fetchReceiptBundle(receiptId: string): Promise<VerificationBundle> {
  let response: Response
  try {
    response = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}/bundle`)
  } catch {
    throw new Error('VeriMod backend(127.0.0.1:3001)에 연결하지 못했습니다')
  }
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: { code?: string } } | null
  if (response.status === 404 || payload?.error?.code === 'NOT_FOUND') throw new Error('이 영수증 ID를 backend에서 찾지 못했습니다')
  if (!response.ok || !payload?.ok) throw new Error(response.status >= 500 && !payload ? 'VeriMod backend가 실행 중이 아닙니다(127.0.0.1:3001)' : `영수증 조회 실패(HTTP ${response.status})`)
  return decodeBundle(payload.data)
}

export const EVIDENCE = [
  { id: 'evidence-0', file: '/evidence/receipt-0.bundle.json', label: '공개 증거 영수증 #0' },
  { id: 'evidence-1', file: '/evidence/receipt-1.bundle.json', label: '공개 증거 영수증 #1' },
] as const

export async function fetchEvidenceBundle(id: string): Promise<VerificationBundle> {
  const item = EVIDENCE.find((entry) => entry.id === id)
  if (!item) throw new Error('알 수 없는 공개 증거입니다')
  const response = await fetch(item.file)
  if (!response.ok) throw new Error('공개 증거 파일을 불러오지 못했습니다')
  return decodeBundle(await response.json())
}

export type { VerifyReport, VerificationBundle }
