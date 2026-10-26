# VeriMod redesign (verimod-redesign)

finance_challenge의 디자인(앱 프레임·Jua/Pretendard·색·카드·버튼·3D 아이콘)에 **키네틱 타이포그래피**를 더해, 첫 화면에서 바로 영상 링크를 넣고 VeriMod 흐름(수집 → 단어 조건 → 댓글 선택 → 판정 → 결과 → 영수증·공유·재검증)으로 이어 가는 분리된 앱입니다. **로그인·회원가입은 없습니다.** 세션은 만든 브라우저의 소유 토큰으로만 다시 열고, 영수증·공개 링크는 누구나 열 수 있습니다.

## 원래 저장소와 겹치지 않는 구조

```text
blockhack/
├─ verimod/              ← 원래 작업·push 하는 저장소. 이 앱은 읽지도 쓰지도 않음
└─ verimod-redesign/     ← 이 앱(별도 저장소 k0ng-min/verimod_demo)
   └─ upstream/          ← verimod의 로컬 복제본(cd5b1c5). 원격 없음 + pre-push 훅으로 push 차단. 이 저장소에는 올리지 않음(.gitignore)
```

- 앱이 쓰는 VeriMod 코드(공유 프로토콜, 기존 브라우저 검증기, backend)는 전부 `upstream/`에서 읽고 실행합니다.
- `upstream`은 `git clone`한 뒤 `origin`을 지웠고(`git remote -v`가 비어 있음), `.git/hooks/pre-push`가 모든 push를 거부합니다.
- 원래 저장소 `verimod`의 `git status`에는 이 앱 관련 항목이 없습니다.
- 원래 저장소의 새 커밋을 반영하려면: `cd upstream; git fetch ../../verimod <branch>; git merge FETCH_HEAD` (가져오기만, 보내기 없음).

## 실행 (Windows PowerShell)

처음 한 번:

```powershell
git clone https://github.com/k0ng-min/verimod_demo verimod-redesign
cd verimod-redesign
npm ci
node scripts/setup-upstream.mjs   # VeriMod 원본(cd5b1c5)을 upstream/에 복제, 원격 제거·push 차단, backend 의존성 설치
```

```powershell
npm run dev:all      # backend(3001, upstream) + 수집 서비스(3101) + 앱(5190) [+ 실제 AI 8765] · Ctrl+C로 종료
```

브라우저: **http://localhost:5190**

| 서비스 | 포트 | 실행 위치 |
| --- | --- | --- |
| 앱 (Vite + React) | 5190 | 이 폴더. `/api` → 3001, `/svc` → 3101 프록시 |
| 수집·세션 서비스 | 3101 | `server/` |
| VeriMod backend | 3001 | `upstream/backend` (코드 변경 없음), DB는 `.data/backend-dev.sqlite` |
| 실제 AI 서비스 | 8765 | `upstream/ai` — 아래 조건이 맞을 때만 자동 실행 |

## 실제 AI 판정 켜기

이 PC에는 **선정 R01 가중치가 없어** 지금은 판정 요청이 영수증 없이 거절됩니다(backend가 `INFERENCE_UNAVAILABLE`, fail-closed). 가중치는 저장소에 들어 있지 않고 A 담당 로컬에만 있습니다(`ai/README.md`).

다음 두 가지가 준비되면 `npm run dev:all`이 자동으로 실제 모드로 뜹니다.

1. 가중치: `upstream\ai\artifacts\checkpoints\beep-klue-roberta-base-w3-seed45126-cpu\selected_model\` (또는 `VERIMOD_MODEL_DIR`)
2. Python 환경: `upstream\ai\.venv` — `ai/AI09.md`의 절차(`requirements-w4-service.lock.txt` 등)

실제 모드에서 launcher는 uvicorn으로 `verimod_ai.inference.service:create_app`을 띄우고 `/healthz` 200을 기다린 뒤, backend를 W4 설정으로 실행합니다. 설정값은 손으로 넣지 않고 `upstream/backend/config`의 고정 manifest와 `inference.ts`의 정책 hash 상수에서 만듭니다(`scripts/w4-env.mjs`, 테스트로 backend 신뢰 검사 통과 확인). 값이 하나라도 다르면 backend가 스스로 거절합니다.

## 외부 수집 키 (서버 프로세스에만)

- `YOUTUBE_API_KEY` — 없으면 YouTube 수집 꺼짐(화면에 이유 표시)
- `GEMINI_API_KEY`(+`GEMINI_MODEL`) — 서버가 실제 인증을 확인해 켜고 끔. 지금 셸의 키는 Google이 401(유효하지 않음)로 거절

뉴스(네이버·다음 등)는 공식 댓글 API가 없어 지원하지 않습니다. 링크 없이 흐름을 보려면 첫 화면의 “데모로 흐름 보기”(지어낸 예시 + 합성 점수, 영수증 없음).

## 검사

```powershell
npm run typecheck; npm test; npm run build
npm run e2e:walk        # 전 화면 × 4뷰포트 × 라이트/다크
npm run e2e:responsive  # 같은 페이지에서 창 크기 102단계 변경
npm run e2e:checks      # 공유 링크·403·로그인 없음·확대·키보드·reduced-motion
```

연결 근거 [INTEGRATION_MAP.md](INTEGRATION_MAP.md) · 검사 결과와 이어서 할 일 [VERIFICATION.md](VERIFICATION.md) · 에셋 출처 [ASSET_LICENSES.md](ASSET_LICENSES.md)
