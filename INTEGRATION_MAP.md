# 연결표 — 화면 행동 → 새 앱 함수 → 기존 API/모듈 → 저장/검증

기준: verimod `seolkyeongmin` HEAD `cd5b1c5`의 로컬 복제본 `upstream/` (2026-10-26). 모든 기존 모듈·API는 이 복제본에서 읽고 실행한다. “검증”은 이번 작업에서 실제로 실행해 확인한 근거입니다.

## 1. 기능별 현황

| 기능 | 기존 파일/API | 기존 구현 | 이번 실행 확인 | 새 UI 연결 위치 | 이번에 추가한 것 |
| --- | --- | --- | --- | --- | --- |
| 판정 발급 | `backend/src/app.ts` `POST /api/decisions` (`{text}`만 허용, Idempotency-Key, demo principal) → `issuance.ts` | 있음 | 실행 중 3001에 직접 호출 → `503 INFERENCE_UNAVAILABLE`, 영수증 0건. 테스트에서 실제 `createApp`+테스트 전용 고정 추론으로 201·영수증 생성 확인 | 판정 진행 단계 → `server/sessions.ts AnalysisRunner` → `server/backendClient.ts issue()` | 세션·댓글별 고정 key `vmr:<session>:<sha(commentId)>`, 동시성 1, 연속 3회 unavailable 시 중단 |
| 실제 AI 추론 | `ai/.../service.py` `/healthz` `/infer`, backend `createHttpInferenceAdapter` | 있음 | 이 PC: 가중치 디렉터리 없음, `transformers` 미설치 → 실행 불가 | backend 경유만(직접 호출 안 함) | 없음(교체·우회 안 함) |
| 정책(허용/검토/제한) | `inference.ts createThresholdPolicyEvaluator`, `backend/config/w4-provisional.policy_manifest.json` | 있음(W4 provisional) | 테스트에서 manifest·hash·threshold 검증을 그대로 통과한 경우만 발급 | 결과·세부 화면에 action·reason_codes·rule·hash 표시 | 없음. 화면 단어 조건은 판정 정책과 분리 |
| 영수증 조회 | `GET /api/receipts/:id/bundle` → `EpochService.bundle()` | 있음 | 테스트: 발급 bundle이 공유 schema 통과, hash 재계산 일치, 원문 미포함 | `/r/:id` → `src/verify/verifier.ts fetchReceiptBundle` | 새 탭·새 브라우저에서 같은 공개 API로 조회 |
| 브라우저 독립 검증 | `frontend/src/domain/verify.ts`, `rpcLedger.ts`, `approvedProfiles.ts` | 있음 | 공개 증거 영수증 #0 → **VALID**(Base Sepolia, 153초) | `/r/:id` 검증 탭 → `runVerification()` (복사 없이 alias import) | 환경 값이 승인 프로필과 다르면 비활성. manifest 비교는 W4 R01/W4 provisional 해시 사용 |
| PENDING_ANCHOR | backend 발급 응답 `state`, bundle `proof/anchor null` | 있음 | 신규 발급은 proof/anchor null 확인(테스트) | 공유 단계·영수증 정보 탭에 “체인 등록 전”, 검증 결과 PENDING_ANCHOR 그대로 | — |
| Epoch freeze·등록·확정 | `epochs.ts`, `senderHandoff.ts`, `trustedConfirmation.ts`, `backend/contracts/scripts` | 있음(운영 절차) | 실행 안 함(운영 키·원본 DB 필요, 범위 밖) | 버튼 없음(우회 경로 만들지 않음) | — |
| 이의제기·검토 | `/api/appeals`, `/api/reviews` | **501 NOT_IMPLEMENTED** | 코드 확인 | 새 UI에 노출하지 않음 | — |
| 댓글 수집 | 없음 | 없음 | YouTube: 키 없음 → unavailable 표시. provider는 fetch mock 테스트 | 링크·확인·범위 단계 → `/svc/resolve`, `/svc/sessions` | `server/providers/youtube.ts`(공식 API), `manual.ts`, `demo.ts`, 뉴스=명시적 미지원 |
| 키워드·구문 필터 | 없음 | 없음 | 단위 테스트 + 서버 재계산 테스트 | 단어 조건·선택 단계 → `shared/filter.ts` | 서버가 같은 함수로 다시 계산해 선택 ⊆ 일치 확인(`SELECTION_MISMATCH`) |
| 의미 기반 선택 | 없음 | 없음 | 셸 키가 401 → 비활성 표시. 응답 경계는 테스트 | 단어 조건 “관련 주제(AI)” → `/svc/sessions/:id/semantic` | `server/semantic.ts`: 입력 id 부분집합만 허용, 원격 텍스트는 비신뢰 데이터로 명시, 키는 헤더로만 |
| 세션↔영수증 묶음 | 없음 | 없음 | 테스트: 댓글 2개 → 영수증 2개, 재분석해도 2개 | 결과·공유 단계, `/s/:publicId` | `analysis_sessions`·`session_items` 테이블(개발 DB). 묶음은 개별 receipt_id 참조일 뿐 새 증명 아님 |
| 공개 공유 | 없음 | 없음 | 새 브라우저 컨텍스트에서 조회 OK, salt·소유 토큰 없음, 원문은 설정 시에만 | 공유 단계 링크 복사 | `GET /svc/public/sessions/:publicId` |
| 비공개 패키지 | 기존 CheckPage가 localStorage+다운로드 | 일부 | 소유자만 200, 타인 403 | 공유 단계 “비공개 패키지 받기” | 서버 보관(개발 DB), 소유자 인증 후 다운로드 |
| 사용자 지갑·계정 | 없음 | 없음 | — | 연결하지 않음(2026-10-26 사용자 요청으로 로그인·회원가입 제거) | 세션은 소유 토큰(이 브라우저 보관함)으로만 다시 엶. 읽기 검증은 공개 RPC로 충분 |

## 2. 화면 행동 → 호출 경로

| 화면 행동 | 새 앱 함수 | 서버/기존 API | 저장 | 검증 근거 |
| --- | --- | --- | --- | --- |
| 링크 입력 | `parseContentUrl` (즉시) | — | 흐름 상태(sessionStorage) | `test/filter-url.test.ts` |
| 주소 확인 | `svc.resolve` | `POST /svc/resolve` → YouTube `videos.list` | — | provider 테스트(성공·비공개/삭제) |
| 댓글 가져오기 | `svc.createSession` | `POST /svc/sessions` → `commentThreads.list`/`comments.list` 또는 manual/demo | `collected_comments`(원문·id·부모·출처·수집 시각) | 원문 보존·부모 연결·중복 제거·부분 수집·댓글 꺼짐·한도·timeout 테스트 |
| 단어 조건 변경 | `applyFilter` (브라우저 미리보기) | — | 흐름 상태 | 필터 테스트 |
| AI로 찾기 | `svc.semantic` | `POST /svc/sessions/:id/semantic` → Gemini `generateContent` | `semantic_json`(질의·id) | 경계 테스트, 실제 키 401 확인 |
| 선택 확정 | `svc.select` | `POST /svc/sessions/:id/selection` (서버가 필터 재계산) | `session_items`(고정 idempotency key) | 통합 테스트 `SELECTION_MISMATCH` |
| 판정 시작 | `svc.settings` → `svc.analyze` | `AnalysisRunner` → `POST /api/decisions {text}` | 영수증은 backend DB, 여기엔 receipt_id·hash·요약·private 자료 | 통합 테스트(입력 = 선택한 댓글 원문 순서 그대로) |
| 진행 표시 | `svc.session` 0.7초 폴링 | `GET /svc/sessions/:id` | — | 실제 처리 건수만 사용 |
| 취소·다시 시도 | `svc.cancel`·`svc.analyze` | 같은 key 재사용 | 상태 `CANCELLED`/`FAILED` → 재시도 | 재분석 시 영수증 수 불변 테스트 |
| 영수증 열기·검증 | `fetchReceiptBundle`·`runVerification` | `GET /api/receipts/:id/bundle` + 공개 RPC | — | 증거 영수증 VALID, 없는 ID 오류 |
| 공유 링크 | `svc.publicSession` | `GET /svc/public/sessions/:publicId` | — | 새 컨텍스트 조회, 비공개 자료 미포함 |

## 3. 바꾸지 않은 것

canonical serialization, receipt hash, Merkle, issuer_seq, schema, manifest binding, `/api/decisions` 입력 계약, fail-closed 추론 검사, epoch 송신·확정 절차, 기존 frontend 라우트. UI 메타데이터는 receipt body에 넣지 않습니다.

## 4. 원래 설계와 대조 (링크·수집·선택 단계 제외, 발급 이후)

기준: `verimod/docs/spec/screen-requirements.md`(FE-00), 기존 `frontend/src/pages/CheckPage.tsx` LIVE 경로, `ReceiptDetailPage`, `VerifyPage`, `features/*`. 2026-10-26 대조 후 맞춘 결과.

| 원래 설계 항목 | 새 앱 | 연결 방식 |
| --- | --- | --- |
| 판정 결과: 점수·action·reason_codes·triggered_rule_ids·model manifest hash | 결과 세부·영수증 정보 탭 | 점수 막대는 기존 ScoreBars 규칙(혐오·공격적 표현, ppm). W4 시험용 정책일 때 그 manifest의 기준선을 표시(값은 테스트로 manifest와 대조) |
| 503이면 발급 실패, ALLOW로 대체 금지 | 미발급으로 표시, 영수증 0건 | backend 응답 그대로 |
| 신규 영수증은 PENDING, tx 없으면 탐색기 링크 없음 | “PENDING_ANCHOR · 아직 공개 체인 검증 결과가 아니에요”, tx 있을 때만 basescan 링크 | bundle.anchor 기준 |
| 검증 보고: core code·PASS/FAIL/PENDING, 재검증 | 결과 코드·제목·설명, 6단계, 멈춘 지점, 다시 검증 | 기존 `ui/format.ts`의 CODE_INFO·STEP_LABEL·SIDE_INFO 문구를 그대로 import |
| core VALID 옆 side-check(manifest·content·lifecycle) 숨기지 않음 | 3종 모두 표시 | 기존 `domain/verify.ts` 결과 그대로 |
| chain 정보: 활성 TrustProfile·chain ID·contract | 검증 탭 첫 줄 | 승인 프로필 BASE_SEPOLIA_DEMO와 일치할 때만 활성 |
| Package 필드 package_version·receipt_id·original_text·content_salt·content_commitment | 서버가 정확히 이 형식(verimod-private/1)으로 생성, 결과 세부에서 한 건, 공유 단계에서 묶음 저장 | 소유자만, 공개 API 미포함 |
| Package 불러오기 → content side-check, verified body가 기준 | 영수증 “원본·패키지” 탭 | receipt_id가 같은 패키지만 사용, 한 글자 변경 시 FAILED(테스트) |
| 공개 bundle 저장 | “공개 bundle 저장” | 기존 bundle 그대로 |
| 변조 패널: 같은 검증 버튼, body 변조 → HASH_MISMATCH, proof 변조 → INVALID_PROOF | “변조 시험” 탭: 점수·조치·정책·시각 변경, 앵커 컨트랙트 변경(UNTRUSTED_ANCHOR), proof 경로 변경 | 기존 `features/tamper.ts`의 변조 함수를 사본에 적용 |
| 이의: 본인 RESTRICT 대상, 같은 key 재시도 | RESTRICT 영수증에 “이의제기” | 기존 `POST /api/appeals`에 같은 key(`appeal:<id>`)로 연결 → 현재 backend가 501 NOT_IMPLEMENTED, 접수 안 됨이라고 그대로 표시 |
| 500자 초과는 점수에 쓰지 않고 검토 보류 | 댓글 선택 목록에 “500자 초과·검토” 표시 | 공유 프로토콜 MAX_INPUT_CODE_POINTS |
| 검토(reviewer)·epoch 운영 | 노출 안 함 | 사용자 흐름이 아니며 reviewer/operator 권한 화면 |
| timeline(DECISION/APPEAL/REVIEW) | lifecycle side-check로 표시 | 이의·검토 영수증이 backend에서 아직 발급되지 않음 |
