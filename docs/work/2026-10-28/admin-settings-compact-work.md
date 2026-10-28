# 관리자설정 화면 밀도·탭·상세 모달 개선

- 작성일: 2026-10-28 (Asia/Seoul)
- 기준: [최신 설계 문서](../../history/2026-10-28/admin-settings-compact-design.md)를 작업 시작 시 다시 읽고 구현했다.
- 설계 문서의 이전 “문서만 작성” 상태와 별개로 이번 구현 요청을 적용했다. 기존 미커밋 변경사항은 보존했다.

## 주요 변경사항

- 관리자 본문의 중복 제목을 제거하고 접근성용 숨김 제목을 유지했다. 상단 breadcrumb에는 현재 탭명만 표시하며 좌측 관리자설정 메뉴는 유지했다.
- 관리자 전용 루트/스타일을 적용했다. 본문·제목·설명·입력·표·JSON은 12px 기준으로 맞추고 카드·표·폼·바깥 여백을 축소했다. 버튼은 데스크톱 최소 26px, 작은 화면/터치 환경 최소 32px로 적용했다.
- 기존 색상 변수를 사용하는 연결형 탭 헤더를 만들었다. 선택 탭의 보라색 상단 경계·본문 연결을 표현하고 작은 화면에서는 한 줄 가로 스크롤과 선택 탭 노출을 지원한다. 기존 링크·URL·뒤로가기 방식과 일반 설정 탭 외형을 유지했다.
- 회원/이력 상세에 공통 헤더·본문 래퍼를 적용했다. 외곽 padding 0, 헤더 padding 8px 12px, 작은 내용 너비 닫기 버튼, 얕은 하단 그림자, 본문 padding 12px를 사용한다. 긴 JSON은 본문만 스크롤한다.
- 관리자에서 공통 `.settings-page` 스타일을 사용하지 않도록 분리해 fieldset/label 충돌을 차단했다. 가드레일은 넓은 화면 2열/좁은 화면 1열이며 체크박스가 제목 앞에 나온다. 허용 변경 작업·요금제 체크박스도 가로 배치를 유지한다.
- 요금제·가드레일의 중복 큰 제목과 간격을 정리했다. 워크스페이스·정책 상태·권한·초안/게시/테스트·회원 변경·이력 조회 로직은 유지했다.
- 실제 브라우저 화면에서 발견한 최상위 탭 스트립의 불필요한 세로 스크롤바를 제거했다.

## 변경 파일

- `app/(workspace)/admin/settings/page.tsx`: 관리자 전용 루트·콘텐츠·스타일·탭 variant·숨김 제목.
- `components/settings-tabs.tsx`: 관리자 연결형 탭 variant 및 선택 탭 스크롤. 기본 variant 유지.
- `components/workspace-shell.tsx`: 관리자 breadcrumb와 관리자 본문 여백 클래스.
- `components/admin/admin-lists.tsx`: 회원/이력 공통 모달 골격, 필터·표·페이징·로깅 카드의 인라인 스타일을 클래스로 이동.
- `components/admin/plan-admin.tsx`, `components/admin/guardrail-admin.tsx`: 탭과 중복되는 큰 제목 제거.
- `styles/admin-settings.css`: 관리자 전용 크기·여백·색상 연결·체크박스·모달·반응형 스타일.
- `scripts/test-admin-compact.mjs`: 임시 DB·로컬 서버·별도 프로필의 헤드리스 Chromium/Edge를 사용하는 실제 브라우저 회귀 검증. 기존 사용자 프로필과 실제 DB를 사용하지 않는다.
- 본 문서 및 `WORK_HISTORY.md`.

## DB 변경 여부

- **DB 변경 없음.** 설계 범위가 화면 구조/CSS 개선이므로 API·DB·마이그레이션은 수정하거나 실행하지 않았다.
- 검증 데이터는 OS 임시 디렉터리의 독립 SQLite DB에만 생성했다. 유료 AI 요청은 실행하지 않았다.

## 검증 결과

- `pnpm typecheck`: 통과. 기본 샌드박스에서 node_modules 타입 선언 접근이 차단되어 권한을 확장해 검증했다.
- `pnpm lint`: 오류 0, 기존 `components/pages/project-overview/integration-overview.tsx`의 미사용 `report` 경고 1개. 해당 기존 파일은 수정하지 않았다.
- 수정 파일 및 새 브라우저 검증 스크립트에 대한 ESLint: 통과.
- `pnpm build`: 프로덕션 빌드 통과. 기존 인증 관련 정적 생성 로그 `Request failed Error`가 있으나 빌드는 정상 종료했다.
- `node scripts/test-accounts-plans.mjs`: 회원/설정/권한/검색·페이징/이력·로깅·기존 플랜 기능 회귀 통과.
- `node scripts/test-ai.mjs`: 기존 AI 및 가드레일 정책·초안/게시/복원·첨부·워크스페이스 격리·토큰·취소 회귀 검증 통과.
- `node scripts/test-admin-compact.mjs`: 실제 헤드리스 Edge 검증 통과. 1440/1024/768/390px의 12px 글자, 2열/1열 및 앞쪽 체크박스 좌표, 관리자 버튼 26px/기존 개인 설정 버튼 42px 격리, 동일한 회원/이력 모달 헤더(데스크톱 43px), 본문 top padding 12px, 그림자·JSON 본문 스크롤·Escape/포커스 복귀·선택 탭 노출·브라우저 뒤로가기를 확인했다.
- 실제 브라우저 스크린샷으로 라이트/다크 회원 모달·다크 이력 모달·모바일 가드레일을 확인했다. 검증 중 Next.js의 숨겨진 스트리밍 DOM을 조기에 읽던 테스트를 실제 표시된 요소를 기다리도록 보완했다.
- `git diff --check`: 통과. 기존 파일의 줄바꿈 변환 안내만 출력됐다.

## 검토용 화면

모두 독립 테스트 DB의 합성 데이터이며 실제 회원 정보가 아니다.

- [회원 상세 · 라이트](admin-settings-compact/member-detail-light.png) / [다크](admin-settings-compact/member-detail-dark.png)
- [이력 상세 · 다크](admin-settings-compact/history-detail-dark.png) / [모바일](admin-settings-compact/history-detail-mobile.png)
- [가드레일 · 모바일](admin-settings-compact/guardrails-mobile.png)

## 미완료 사항·검증 한계

- 요청 범위의 구현과 DB 변경 필요 여부 확인은 완료했다. 물리적 터치 기기와 브라우저 200% 확대 조작은 직접 검증하지 않았으며 화면 폭별 헤드리스 검증을 수행했다.

## 후속 수정 (2026-10-28)

- 회원·이력 상세 모달의 헤더 상하 여백을 8px에서 6px로 줄이고, 닫기 버튼을 내용 너비·24px 최소 높이에 맞췄다. 본문 시작 여백은 12px에서 16px로 늘리고 헤더 아래 그림자를 라이트/다크에서 더 뚜렷하게 조정했다. 작은 화면의 닫기 버튼은 28px 최소 높이를 사용한다.
- `styles/admin-settings.css`와 `scripts/test-admin-compact.mjs`를 수정하고, 위의 네 모달 이미지를 새 프로덕션 빌드의 실제 브라우저 캡처로 교체했다. 개인 정보 대신 임시 DB의 합성 데이터만 포함한다.
- DB 변경 없음. `pnpm typecheck`, 수정 스크립트 ESLint, `pnpm build`, `node scripts/test-admin-compact.mjs`, `git diff --check`를 통과했다. 빌드 중 기존 정적 생성의 `Request failed Error` 로그는 있었지만 빌드는 정상 종료했다.
- 추가 미완료 사항은 없다. 물리적 터치 기기와 브라우저 200% 확대 조작은 여전히 직접 검증하지 않았다.
