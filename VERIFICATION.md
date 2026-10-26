# 검증 기록과 이어서 작업하기

## 0. 최신 상태 (2026-10-26 마지막 갱신 — 아래 절보다 우선)

- **구조**: 앱은 `blockhack/verimod-redesign/`(별도 저장소 k0ng-min/verimod_demo, upstream·.data는 커밋 제외), VeriMod 코드는 그 안의 로컬 복제본 `upstream/`(원격 없음, pre-push 훅 차단)에서만 읽고 실행. 원래 `verimod` 저장소 `git status`는 작업 전과 동일(기존 미추적 3개).
- **로그인·회원가입 제거**: 서버 계정 테이블·쿠키·`/svc/auth/*`·`/svc/me/*`·claim 삭제, 앱의 로그인 화면·버튼·계정 저장 삭제. 테스트로 엔드포인트 404 확인.
- **키네틱 타이포그래피**: 단계 제목 글자별 3D 등장, eyebrow 자간 모임, 홈 회전 단어(판정해요/영수증으로/검증해요), 홈 뒤 DECIDE·PROVE·APPEAL 흐르는 글자 띠, 숫자 카운트업. reduced-motion이면 정지.
- **검사 결과**: `npm test` 27/27 · typecheck·build PASS · 화면 152개 문제 0(4뷰포트×라이트/다크) · 창 크기 연속 변경 816 측정 문제 0 · 브라우저 검사 14/14.
- **복제본 backend 테스트**(`upstream/backend`, npm ci 후): 197 중 176 PASS. 실패 21건은 모두 `durability-callback.test.ts`(T의 epoch 송신 CLI)이며 원인은 Windows에서 `DB_IDENTITY_MISMATCH` — 이 앱과 무관한 기존 코드의 Windows 환경 문제(원래 저장소에서는 ethers 미설치로 아예 로드되지 않던 파일). 수정하지 않음.
- **실제 연결**: 3001 backend는 복제본 코드로 실행되어 실제 응답(health, manifests, decisions). 가중치가 없어 판정은 `INFERENCE_UNAVAILABLE`로 거절되고 영수증 0건. 가중치·`ai/.venv`가 준비되면 `npm run dev:all`이 실제 AI 모드로 자동 전환(설정값은 고정 파일에서 생성, backend 신뢰 검사 통과를 테스트로 확인).

실행일: 2026-10-26, Windows 11, Node 22.14.0, Python 3.13.2, Playwright 1.63.0(Chromium). 기준 커밋 `cd5b1c5`(seolkyeongmin).

## 1. 실행한 검사

| 검사 | 명령 | 결과 |
| --- | --- | --- |
| 타입체크(앱·서버·재사용 검증기 소스) | `npm run typecheck` | PASS |
| 단위·통합 | `npm test` | **26/26 PASS** (필터 7, URL 2, YouTube provider 5, Gemini 경계 6, 실제 backend `createApp` 통합 4 — Private Package content side-check 포함, 계정·CSRF 2, W4 기준선=manifest 1) |
| 연속 크기 변경 | `npm run e2e:responsive` | **816 측정 중 문제 0** — 같은 페이지에서 폭 17단계(320~1920)×높이 6단계(640~1080)를 바꿔 가며 8개 화면 측정. 데스크톱 프레임 폭 640→900px 연속, 목록 쪽 크기도 높이에 따라 재계산 (`verification/responsive.json`) |
| 빌드 | `npm run build` | PASS (JS 480KB / gzip 153KB, CSS 38KB) |
| 화면 넘침 측정 | `node e2e/walkthrough.mjs <out> all light,dark` | **161 화면 중 레이아웃 문제 0** — 세로(.app-main·문서)·가로 넘침 0, 주 버튼 화면 안, 깨진 이미지 0, 콘솔 오류 0. 결과: `verification/layout-report.json` |
| 실제 체인 검증 | walkthrough(체인 포함) | 공개 증거 영수증 #0 **VALID**(최근 실행: 확인 2,113,313회, 173초). 이때 콘솔에 RPC `413` 여러 건(기존 검증기가 첫 RPC 거부 시 두 번째 RPC로 넘어가는 정상 fallback) |
| 계정·공유·접근성 | `node e2e/checks.mjs <out>` | **16/16 PASS** (`verification/checks.json`) |
| 기존 frontend 회귀 | `cd ../frontend; npx vitest run` | 206/206 PASS (수정 없음) |
| 기존 backend 회귀 | `cd ../backend; npx vitest run` | 테스트 60/60 PASS, **테스트 파일 3개 로드 실패** — `Cannot find package 'ethers'`(이 PC의 `backend/node_modules`에 ethers 미설치). backend를 수정하지 않았고 이번 작업과 무관한 기존 로컬 환경 문제. `cd ../backend; npm ci` 후 재실행 필요 |
| 실제 backend 거부 | `curl POST 127.0.0.1:3001/api/decisions` | `503 INFERENCE_UNAVAILABLE` |
| 실패 후 미발급 | 개발 backend DB 조회 | 실제 발급 시도 63건 FAILED, `receipts` 0, `content_store` 0 |
| Gemini 키 | `GET .../v1beta/models` | `401 UNAUTHENTICATED: API key not valid` → 서버가 의미 선택을 끔 |
| 저장소 전체 `node scripts/check-all.mjs` | — | 실행하지 않음(기존 서비스 코드 미변경, 위 항목으로 대체) |

뷰포트: 1440×900, 1366×768, 390×844, 360×740 × 라이트/다크. 200% 확대 근사(683×384 @2x)에서는 프레임 안 스크롤로 주 버튼 도달 확인(접근성 fallback).

## 2. 실제로 연결·실행된 것 / 아닌 것

| 항목 | 상태 |
| --- | --- |
| 실제 AI 추론으로 영수증 발급 | **미실행** — 가중치·transformers·W4 설정 없음. 대신 (a) 실행 중 backend가 실제로 거부하고 영수증을 만들지 않음, (b) 테스트에서 기존 backend `createApp`(실제 검증·정책·발급·idempotency·SQLite)에 테스트 전용 고정 추론을 넣어 세션→개별 영수증 매핑, 선택 댓글만 전달, 재시도 무중복, bundle schema·hash 재계산을 확인 |
| 실제 YouTube 수집 | **미실행** — `YOUTUBE_API_KEY` 없음. 공식 API 응답 형태를 흉내 낸 fetch mock으로 정상·비공개/삭제·댓글 꺼짐·한도·부분 실패·timeout·답글·중복 처리 확인 |
| 실제 Gemini 의미 선택 | **미실행** — 셸 키가 유효하지 않음(401). 응답 경계(입력 id 부분집합, 비신뢰 데이터 표시, 헤더 키) 테스트 |
| 브라우저 체인 독립 검증 | **실행** — 공개 증거 영수증 VALID. 새로 발급될 영수증은 epoch 등록 전이라 PENDING_ANCHOR로 표시하도록 구현(실제 신규 영수증은 이 PC에서 만들 수 없음) |
| 계정 저장 | **실행** — 가입·저장·로그아웃·다른 브라우저 재로그인·보관함 조회·다른 계정 403 |
| 공개 공유 링크 | **실행** — 새 브라우저 컨텍스트에서 조회, salt·소유 토큰 없음, 원문 기본 비공개 |
| 사용자 지갑 | 구현 안 함 — 검증은 공개 RPC로 충분, 저장·소유권은 로컬 계정으로 처리. Publisher 키·epoch 송신은 운영 절차 그대로 |

## 3. 캡처 위치

- `verification/compare/*.png` — 레퍼런스(왼쪽)와 새 앱(오른쪽)을 같은 뷰포트로 나란히(홈 1440·390 다크, 스텝 1440·1366 다크·390·360)
- `verification/screens/*.png` — 핵심 화면 22장(단계별, 멈춤·미발급, YouTube 키 없음·뉴스 미지원, 영수증 VALID, 공개 링크, 200% 확대 등)
- 레퍼런스 캡처 방법: finance_challenge 소스를 scratch 폴더로만 빌드(`vite build --outDir <scratch>`)해 미리보기, 백엔드 요청은 Playwright에서 가짜 응답으로 가로챔(레퍼런스 파일·DB 무수정).

## 4. 디자인에서 의도적으로 다른 점

- (2026-10-26 사용자 요청) 디자인만 가져오고 구성은 VeriMod에 맞춘다. 첫 화면은 링크 입력 하나뿐이며, 링크를 확인하면 바로 콘텐츠 확인 단계로 이어진다. 홈 카드·빠른 메뉴는 없앴고 데모 링크 한 줄만 남겼다.
- 눌린 것처럼 보이던 상태 정리: 비활성 보조 버튼의 옅은 파란 바탕 → 중립 회색, 흐릿한 비활성 페이지 버튼 → 숨김, 터치 기기에서 탭 뒤 남던 hover(떠 있음·테두리) → 마우스에서만.

- 레퍼런스 StepFlow는 1440×900에서도 다음 버튼이 프레임 밖으로 밀렸다(프레임 안 스크롤). 새 앱은 같은 구성(아이콘→eyebrow→제목→설명→내용→이전/다음)을 유지하되 프레임 높이(cqh)에 맞춰 아이콘·간격을 줄이고 버튼을 늘 아래에 고정, 목록은 남은 높이로 쪽 크기를 계산해 페이지로 넘긴다.
- 레퍼런스 홈의 손글씨 애니메이션(보험 브랜드 전용)은 3D 방패 아이콘으로 대체.
- 레퍼런스 홈 빠른 메뉴는 프레임 820px 이상에서 2줄로 접히며 잘렸다 → 960px 이상에서만 접도록 조정.

## 5. Checkpoint — 새 세션은 여기서 이어간다

**바뀐 파일**: `blockhack/verimod-redesign/` 전체(verimod 저장소 밖, Git 저장소 아님). verimod 저장소는 작업 전과 같은 상태(`git status`: 기존 미추적 3개만). 처음엔 저장소 안(`verimod/verimod-redesign`)에 만들었으나 2026-10-26 사용자 요청으로 밖으로 옮겼고, `design-prototype/README.md`에 넣었던 안내 한 줄도 되돌렸다. 커밋·push·병합 없음.

**실행**: `cd blockhack\verimod-redesign; npm run dev:all` → http://localhost:5190 (backend 3001은 `.data/backend-dev.sqlite` 사용).

**서비스 상태(작성 시점)**: dev:all로 3001·3101·5190 실행 중. 레퍼런스 미리보기(5180)는 종료.

**다음 작업 후보**

1. `YOUTUBE_API_KEY`를 받아 실제 영상 1개로 수집→선택→(AI unavailable 거부까지) 확인, 할당량 사용량 기록.
2. 유효한 `GEMINI_API_KEY`로 의미 선택 실제 호출 확인(데모 데이터로 먼저).
3. A 담당 환경(가중치·AI 서비스·W4 설정)에서 backend를 실제 추론으로 띄우고 이 앱으로 댓글 2~3개 실제 발급 → 영수증 화면 PENDING_ANCHOR 확인 → 운영 절차로 epoch 등록 후 VALID 확인.
4. `backend`에서 `npm ci` 후 회귀 3개 파일 재실행.
5. 기존 frontend와 통합할지 결정(사용자 승인 사항).

**차단 조건**: YouTube 키, 유효한 Gemini 키, R01 가중치·AI 런타임, 운영 epoch 송신 권한(Publisher 키·원본 DB) — 모두 사용자/팀 승인 필요.
