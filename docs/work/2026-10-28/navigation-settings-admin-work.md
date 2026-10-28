# 좌측 메뉴·개인 설정·관리자설정 개편 구현

- 작성일: 2026-10-28 (Asia/Seoul)
- 기준 문서: [navigation-settings-admin-design.md](../../history/2026-10-28/navigation-settings-admin-design.md)의 최신 내용을 작업 시작 시 다시 읽고 구현했다.
- 기존 미커밋 소스·문서·마이그레이션 변경을 보존했다. 설계 문서의 “문서만 작성” 문구는 이전 설계 작업의 기록이며, 이번 사용자 요청에 따라 소스와 DB를 변경했다.

## 주요 변경사항

- 로그인/게스트 공통 6개 메뉴를 구성하고 계정 master/admin에게만 요금제 바로 아래 관리자설정을 표시한다. 메뉴 표시·검색·제목·활성 상태를 공통 정의에 연결했다. AI는 기존 대화 패널, 도움말은 분리한 공통 콘텐츠를 사용한다.
- `/settings?tab=usage|interface|account` 3개 탭을 추가했다. 기존 프로필 모달을 제거하고 사용자 요약에서 계정 설정으로 이동한다. 기존 이름 저장·사용자 표시 갱신을 유지한다.
- 기존 토큰 통계와 현재 워크스페이스 본인 조회 범위를 유지한다. 해당 탭을 벗어나면 기존 컴포넌트의 interval 정리·AbortController가 실행된다.
- 개인 토스트 위치/테마를 DB에 저장하고 버전 충돌을 검사한다. 미리보기·취소·실패 복원을 제공한다. 공통 토스트는 중복 제거·최대 3개·상/하 중앙 표시를 지원한다. 빠른 테마 토글도 같은 개인 설정 저장 함수를 사용한다.
- 로그인 레이아웃에서 DB 테마를 먼저 적용하며 계정별 캐시만 보조 저장한다. 공용 localStorage 테마를 다른 계정의 기본값으로 가져오지 않는다.
- `/admin/settings?tab=plans|members|guardrails|history` 4개 탭을 추가했다. 기존 관리자 URL은 해당 탭으로 이동한다. 플랜 탭에서 회원 영역/조회 의존성을 제거했다.
- 회원 목록은 서버 검색·전체 건수·안정적인 정렬·페이지 보정·10/20/50/100개 페이징을 제공한다. 상세는 새 API로 조회하고 더블클릭/버튼으로 연다. 다이얼로그 닫기 후 목록 상태와 포커스를 보존한다.
- 회원 변경은 변경 필드와 관리 버전으로 처리한다. 계정 역할은 master만 변경하고 master 신원 보호, 역할 변경 세션 취소, 플랜 변경 시 사용량 보존을 유지한다.
- 가드레일 UI/정책 범위를 유지하며 계정 master/admin과 기존 워크스페이스 owner/admin 조건을 함께 적용한다.
- 전역 이력은 감사 + 플랜/회원 변경 + 로깅 설정 변경을 통합한다. 검색·출처/작업/결과/행위자/워크스페이스/자원/기간 필터·페이징·상세 조회를 제공한다. KST 종료일 다음 날 00시 미만 경계와 상세 JSON 허용 필드 제한을 적용한다.
- DB 로깅 변경은 boolean·version을 검증하고 설정 갱신과 별도 불변 증적을 동일 트랜잭션에 기록한다. 로깅 중단 후에도 변경 증적과 과거 이력은 유지된다. 이력 조회는 재귀 감사 기록을 만들지 않는다.
- 미확정 정책은 설계 권장안을 적용했다: 하단 중앙/초기 라이트, 빠른 토글의 개인 기본값 저장, 게스트 조회 전용, 기존 토큰·가드레일 범위, 감사·운영·로깅 이력 우선 통합.

## 변경 파일

- 메뉴·레이아웃: `lib/menus.ts`, `lib/types.ts`, `components/workspace-shell.tsx`, `components/help-content.tsx`, `components/ai/ai-workspace-layout.tsx`, `app/(workspace)/layout.tsx`, `app/guest/[...path]/page.tsx`
- 개인 설정: `app/(workspace)/settings/page.tsx`, `components/personal-settings.tsx`, `components/preferences-runtime.tsx`, `components/settings-tabs.tsx`, `components/theme-toggle.tsx`, `stores/preferences.ts`, `stores/toast.ts`, `stores/theme.ts`, `lib/theme.ts`, `app/api/me/preferences/route.ts`
- 관리자 화면: `app/(workspace)/admin/settings/page.tsx`, `app/(workspace)/admin/plans/page.tsx`, `app/(workspace)/admin/ai-guardrails/page.tsx`, `components/admin/plan-admin.tsx`, `components/admin/admin-lists.tsx`, `styles/settings.css`
- 관리자 API·조회: `app/api/admin/members/route.ts`, `app/api/admin/members/[userId]/route.ts`, `app/api/admin/plans/route.ts`, `app/api/admin/history/route.ts`, `app/api/admin/history/[source]/[id]/route.ts`, `app/api/admin/settings/logging/route.ts`, `lib/admin-query.ts`, `lib/admin-history.ts`, `lib/ai/guardrail-policy.ts`
- DB·검증·기록: `db/migrations/022_navigation_settings.sql`, `scripts/check-navigation-settings.mjs`, `scripts/test-accounts-plans.mjs`, `scripts/check-ai-guardrails.mjs`, 본 작업 기록, `WORK_HISTORY.md`

## DB 변경 여부

- **실제 DB 적용 완료**: 기존 적용 내역이 021까지임을 확인한 뒤 `pnpm db:migrate`로 022만 추가 적용했다.
- `user_preferences`, `admin_setting_changes`와 증적 수정/삭제 방지 트리거를 생성했다.
- `users.management_version`, `plan_change_logs.actor_name`을 추가하고 회원/구독/전역 이력 정렬 인덱스를 추가했다. 이전 기록의 행위자 이름은 저장된 스냅샷이 없으면 기존 사용자 정보/ID로 표시한다.
- 기존 회원·구독·사용량·관리자 플랜 값·로깅 설정값과 과거 마이그레이션을 초기화/수정하지 않았다.
- 적용 후 신규 테이블/관리 버전 컬럼/마이그레이션 등록을 확인했고 외래 키 위반은 0건이다.
- 실제 실행 계획에서 회원 정렬은 `idx_users_joined`, 감사 이력 정렬은 `idx_audit_global_time`의 covering index 사용을 확인했다. 부분 일치 검색에는 별도 검색 엔진을 추가하지 않았다.

## 검증 결과

- `pnpm typecheck`: 통과.
- `pnpm lint`: 오류 0, 기존 `components/pages/project-overview/integration-overview.tsx`의 미사용 `report` 경고 1개. 기존 변경 보존을 위해 해당 파일을 수정하지 않았다.
- `pnpm build`: 프로덕션 빌드 통과. 정적 생성 중 기존 인증 처리의 `Request failed Error` 출력이 있었으나 종료 코드는 0이며 전체 경로 생성이 완료됐다.
- `node scripts/test-accounts-plans.mjs --db-only`: 임시 DB 전체 마이그레이션·기존 설정/제약·외래 키 보존 통과.
- `node scripts/test-accounts-plans.mjs`: 임시 DB/실제 HTTP/모의 AI 통합 검증 통과. 개인 설정 격리/버전 충돌/게스트 거부, 회원 0/1/20/21/100/101/205명과 네 가지 크기, 구독 누락, 페이지 보정, 역할 보호/세션 취소, 로깅 활성/중단 차이와 별도 증적, 전역 이력 출처/무결성을 확인했다.
- 이력 205개 fixture로 전역 페이징·타 워크스페이스/삭제·익명 행위자 보존·KST 날짜 경계·잘못된 날짜·상세 민감 필드 제외를 확인했다.
- `node scripts/test-plan-quotas.mjs`: 동시 할당량·예약/정산·기존 사용량 보존·KST 자정·첨부 한도 검증 통과.
- `node scripts/test-ai.mjs`: 기존 AI CRUD/대화/이미지/토큰/취소 및 가드레일 정책·첨부·워크스페이스 격리 회귀 검증 통과. 계정 관리자가 아닌 owner의 관리 API 접근 거부를 추가 확인했다.
- `node scripts/test-auth.mjs`: 인증·가입·프로젝트·산출물·팀·워크스페이스 권한·감사 무결성 회귀 검증 통과.
- `git diff --check`: 통과. 기존 파일의 CRLF 변환 안내만 출력됐다.
- 테스트는 임시 DB와 모의 AI를 사용했고 실제 DB에서 테스트 데이터 생성이나 유료 AI 호출을 하지 않았다.

## 미완료 사항·검증 한계

- 요청 범위의 소스 구현 및 실제 DB 반영은 완료했다.
- 실브라우저에서 모바일 레이아웃, 키보드 포커스 이동, 테마/토스트 시각적 배치와 뒤로가기 조작을 직접 수행하는 수동 검증은 하지 못했다. 서버 렌더링/탭 경로·API 통합 검증 및 코드 검토로 확인했다.
- 이력 통합의 산출물 버전·가드레일 이벤트·AI 원장 추가는 설계 권장 범위 밖으로 유지했다. 기존 개별 기능에서 조회한다.
