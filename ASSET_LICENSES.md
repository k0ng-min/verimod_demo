# 에셋 출처와 라이선스

라이선스 원문: `public/licenses/` (fluentui-emoji MIT, Jua OFL 1.1, Pretendard OFL 1.1)

확인일: 2026-10-26.

## 3D 아이콘 — Microsoft Fluent Emoji 3D (MIT)

- 원본: https://github.com/microsoft/fluentui-emoji (`assets/<이름>/3D/<파일>_3d.png`)
- 라이선스: MIT License, Copyright (c) Microsoft Corporation — 저장소 `LICENSE` 직접 확인. 상업적 이용·수정·재배포 허용, 저작권·허가 고지 유지.
- 제작자: Microsoft
- 수정: 투명 여백 자르기, 긴 변 240px로 축소, WEBP(q90) 변환. 색·형태는 바꾸지 않음.
- 재현: `npm run assets` (`scripts/build_icons.py`가 공식 URL에서 받아 변환하고 파일별 원본 URL·SHA-256을 `public/3d/SOURCES.json`에 기록)

| 앱 이름 | Fluent 원본 | 쓰는 곳 |
| --- | --- | --- |
| link | Link | 콘텐츠 연결, 새 링크 분석 |
| chat-bubble | Speech balloon | 배경 장식 |
| zoom | Magnifying glass tilted left | 콘텐츠 확인, 404 |
| target | Bullseye | 수집 범위 |
| gear | Gear | 단어 조건, 조건 바꿔 다시 |
| shield | Shield | 홈 히어로, 영수증 검증 |
| tick | Check mark button | 댓글 선택, 성공 안내 |
| receipt | Receipt | 영수증·공유, 영수증 화면 |
| file-text | Page facing up | 영수증 파일 고르기 |
| folder | File folder | 보관함 |
| clipboard | Clipboard | 복사 버튼 |
| key | Key | 계정 |
| lock | Locked | 로그인, 비공개 패키지 |
| lock-key | Locked with key | 판정 전 확인 |
| hourglass | Hourglass not done | 판정 진행, PENDING 안내 |
| chains | Chains | 공개 증거·체인 검증 |
| warning | Warning | 경고 안내 |
| prohibited | Prohibited | 잘못된 주소 |
| chart | Bar chart | 판정 결과 |
| card-box | Card file box | 공개 판정 묶음 |
| notebook, bulb, bell, star, puzzle | Notebook, Light bulb, Bell, Star, Puzzle piece | 홈 빠른 메뉴·배경 장식 |
| sun, moon | Sun, Crescent moon | 테마 스위치 |
| party | Party popper | (예비) |

### 레퍼런스 에셋을 직접 복사하지 않은 이유

finance_challenge `frontend/public/3d`의 주석은 서로 다릅니다(`Icon3D.tsx`: “3dicons.co(CC0)”, `app.css`: “Fluent Emoji 3D(MIT)”). 파일 단위로 대조한 결과(투명 영역 자른 뒤 24×24 평균 픽셀 차):

- shield, tick, zoom, target, lock, wallet, chat-bubble, file-text, notebook, sun, moon, bell, puzzle, star, chart, flag, gift, map-pin, suitcase, umbrella 등 20개 = 공식 Fluent Emoji 3D PNG와 **차이 0.0** (Fluent 파일).
- folder, copy, key, clock, cube 등 = `_originals/`의 3dicons.co 흰 배경 렌더에서 배경을 지운 것으로 보이나 어느 Fluent 파일과도 일치하지 않고, 원본 다운로드 기록이 없어 파일 단위 출처를 확정하지 못함.

그래서 새 앱은 레퍼런스 파일을 복사하지 않고, 같은 재질·시점의 공식 Fluent 원본만 직접 받아 썼습니다(레퍼런스에서 실제로 보이는 아이콘과 동일한 그림). 3dicons.co 파일은 쓰지 않았습니다.

## 폰트 (finance_challenge `frontend/public/fonts`에서 복사, 수정 없음)

| 파일 | 폰트 | 제작자 | 라이선스 | SHA-256 |
| --- | --- | --- | --- | --- |
| `public/fonts/Jua-Regular.woff2` | Jua | Woowahan Brothers (The Jua Project Authors) | SIL Open Font License 1.1 — google/fonts `ofl/jua/OFL.txt`, METADATA `license: "OFL"` 확인 | `421968b0c6c7d71494c6f4e62a3e88d35de36c068414c938650ebdd14486f953` |
| `public/fonts/PretendardVariable.woff2` | Pretendard Variable | Kil Hyung-jin (orioncactus) | SIL Open Font License 1.1 — `orioncactus/pretendard` LICENSE 확인 | `9599f12fd42fc0bce1cd50b47a0c022e108d7aa64dd0d1bb0ed44f3282d900b4` |

OFL 폰트는 소프트웨어와 함께 번들·재배포할 수 있고, 폰트 자체를 단독 판매할 수 없습니다. 예약 글꼴 이름(Pretendard 등)을 수정본에 쓰지 않습니다(이 앱은 수정하지 않음).

## 공개 증거 데이터

`public/evidence/receipt-0.bundle.json`, `receipt-1.bundle.json` — 이 저장소의 `docs/handoffs/w4-anchored-epoch-public/20261020-r01/` 공개 증거와 같은 파일(원문·salt 없음).
