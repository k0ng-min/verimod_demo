import type { Action, CollectOptions, ContentSource, NormalizedComment, ProviderCapabilities } from '../../shared/types'
import { dedupe, type CollectResult } from './types'

/** 사용자가 직접 고르는 데모 데이터. 실제 플랫폼 댓글이 아니라 이 저장소에서 지어낸 예시 문장이다.
 * 수집 실패를 이 데이터로 대신 채우는 경로는 없다(자동 fallback 금지). */

const DEMO_COMMENTS: Array<[id: string, parent: string | null, text: string, likes: number]> = [
  ['d01', null, '도서관 리모델링 소식 반가워요. 아이랑 주말마다 가는 곳이라 기대됩니다.', 41],
  ['d02', 'd01', '저도요! 열람실 의자 좀 바뀌었으면 좋겠어요.', 6],
  ['d03', null, '공사 기간 동안 대체 열람실은 어디인가요? 안내가 너무 부족해요.', 18],
  ['d04', null, '세금으로 이런 걸 하다니 진짜 짜증나네요.', 9],
  ['d05', 'd04', '짜증난다고 막말하지 마세요. 의견은 정중하게 남겨 주세요.', 12],
  ['d06', null, '주차장 확장도 같이 해 주세요. 주말엔 자리가 없어요.', 22],
  ['d07', null, '이런 글 쓰는 사람들 다 멍청한 거 아님?', 3],
  ['d08', null, '어린이 열람실 소음 문제도 같이 해결되면 좋겠습니다.', 15],
  ['d09', null, '공사 소음 때문에 너무 짜증 나요. 시간대 좀 지켜 주세요.', 7],
  ['d10', 'd09', '구청에 민원 넣으니 오후 6시 이후 공사는 없다고 하네요.', 10],
  ['d11', null, '리모델링 후에 운영 시간이 늘어나는지 궁금합니다.', 8],
  ['d12', null, '여기 관리하는 놈들 다 꺼져라.', 1],
  ['d13', null, '북카페 생긴다던데 진짜인가요?', 5],
  ['d14', 'd13', '설계안 보니 1층에 북카페 들어간다고 나와 있어요.', 4],
  ['d15', null, '장애인 접근성 개선 계획도 공개해 주세요.', 19],
  ['d16', null, '이번 공사 예산 내역 공개하라. 짜증나게 숨기지 말고.', 6],
  ['d17', null, '좋은 소식이네요. 공사 잘 마무리되길 바랍니다.', 14],
  ['d18', null, '도서관 리모델링 소식 반가워요. 아이랑 주말마다 가는 곳이라 기대됩니다.', 0],
  ['d19', null, '대출 중인 책 반납은 공사 중에도 되나요?', 3],
  ['d20', 'd19', '무인 반납함은 그대로 운영된다고 공지에 있었어요.', 2],
  ['d21', null, '이 동네 사람들 수준 알 만하다 ㅋㅋ', 2],
  ['d22', null, '공사 기간 너무 길어요. 6개월은 과한 것 같습니다.', 11],
  ['d23', null, '디지털 자료실 PC 사양도 올려 주세요.', 9],
  ['d24', null, '멍청한 행정 때문에 또 세금 낭비네.', 4],
]

export function demoCapabilities(): ProviderCapabilities {
  return { platform: 'DEMO', available: true, reason: null, orders: ['relevance', 'time'], replies: 'FULL', maxChoices: [20, 50, 100] }
}

export function demoSource(now: Date): ContentSource {
  return {
    platform: 'DEMO', source_url: null, content_id: 'demo-library-v1', title: '[데모] 동네 도서관 리모델링 안내 영상',
    channel: '데모 데이터 (실제 채널 아님)', published_at: null, platform_comment_count: DEMO_COMMENTS.length, resolved_at: now.toISOString(),
  }
}

export function collectDemo(options: CollectOptions, now: Date): CollectResult {
  const collectedAt = now.toISOString()
  const all: NormalizedComment[] = DEMO_COMMENTS.map(([id, parent, text, likes], index) => ({
    id, platform_comment_id: id, parent_id: parent, author: `데모 사용자 ${index + 1}`, text, like_count: likes,
    published_at: new Date(Date.UTC(2026, 9, 1, 9, 0) + index * 3_600_000).toISOString(), collected_at: collectedAt, source_url: null,
  }))
  let picked = options.includeReplies ? all : all.filter((comment) => comment.parent_id === null)
  if (options.order === 'time') picked = [...picked].reverse()
  else picked = [...picked].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
  const limited = dedupe(picked.slice(0, options.max))
  const notices = limited.comments.length < options.max
    ? [{ code: 'FEWER_THAN_REQUESTED' as const, detail: `데모 데이터에는 ${limited.comments.length}개만 있습니다` }]
    : []
  return { comments: limited.comments, notices }
}

/** 데모 전용 합성 판정. 실제 AI 모델·승인 정책이 아니며 영수증을 만들지 않는다. */
export function demoJudge(text: string): { action: Action; scores_ppm: { hate: number; offensive: number }; reason_codes: string[] } {
  const offensive = ['짜증', '멍청', '꺼져', '수준 알 만', '놈들'].filter((word) => text.includes(word)).length
  const hate = ['수준 알 만', '놈들'].filter((word) => text.includes(word)).length
  const scores_ppm = { hate: Math.min(1_000_000, hate * 420_000), offensive: Math.min(1_000_000, offensive * 380_000) }
  if (scores_ppm.hate >= 800_000 || scores_ppm.offensive >= 700_000) return { action: 'RESTRICT', scores_ppm, reason_codes: ['DEMO_SYNTHETIC_RESTRICT'] }
  if (scores_ppm.hate >= 400_000 || scores_ppm.offensive >= 350_000) return { action: 'HUMAN_REVIEW', scores_ppm, reason_codes: ['DEMO_SYNTHETIC_REVIEW'] }
  return { action: 'ALLOW', scores_ppm, reason_codes: [] }
}
