<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Query 및 workspace 설정 작업 지침 (2026-11-11)

- 구현 범위와 검증 결과는 `docs/work/2026-11-11/fetch-ReactQuery-전환-구현.md`를 확인한다. `pnpm test:query-audit`로 전송 호출의 분류 누락을 검사한다.
- Query key는 `lib/query/keys.ts`의 사용자/workspace scope를 사용하고, 일반 조회는 WorkspaceQueryRuntime의 정책을 구독한다.
- 권한·플랜 확인은 staleTime 0/retry 0 예외를 유지한다. 저장·생성·스트림은 자동 재시도하지 않는다.
- 서버 QueryClient는 요청별로 생성하며 인증 쿠키·비밀키를 캐시나 hydration DTO에 넣지 않는다.
- 시스템설정은 전역 admin_setting과 분리한다. 043 마이그레이션은 구성된 DB에 적용되었으며 GET은 행을 생성하지 않는다.
- 편집 초안·버전 커서·개인 설정 generation/owner 보호를 보존하고 운영 DB에서 회귀 테스트를 실행하지 않는다.

- 보드 DTO 캐시를 적용할 때 version/screenVersion 커서를 함께 복구한다. 서버 캐시를 편집 초안에 자동 덮어쓰지 않는다.
- 요청 오류는 RequestError의 status/code/details를 보존하고 현재 workspace 문구로 표시한다. 복구에 필요한 업무별 동작·안내는 별도로 유지한다.

- 2026-11-11 이력 검색은 작업자의 기록 이름·현재 이름/이메일과 현재 프로젝트 배정 기준이다. 회원관리와 같은 필터를 유지하고 workspace/상품 범위를 서버에서 검증한다. 상세는 공통 `workspace-dialog admin-detail-dialog` 스타일을 재사용한다. 작업 기록: `docs/work/2026-11-11/관리자-이력관리-검색조건-상세모달.md`.

- 2026-11-11 헤더 알림은 카운터만 15초 폴링한다. 계약 목록은 SSR 프리패치·주기 조회하지 않고 패널을 열 때 조회한다. 일반 배지는 기존 팀 가입 신청 pending 수이며 새 unread 저장 구조를 만들지 않았다. 공통 팝오버 닫기 훅과 배지 스타일을 재사용한다. 기록: `docs/work/2026-11-11/헤더알림-카운터조회-패널분리.md`.

- 2026-11-11 사용자 후속 지시에 따라 AI/공통 프로젝트 access의 기존 10초 폴링을 제거했다. UI 진입/챗봇 열기·프로젝트 변경과 작업 직전에 확인한다. focus/visibility/reconnect 자동 access 조회를 재도입하지 않는다. 명시 재조회·권한 변경 이벤트와 서버 작업별 권한 검증은 유지한다. 기록: `docs/work/2026-11-11/AI-프로젝트권한-폴링제거-작업직전확인.md`.

- 2026-11-11 개인 테마는 `lib/theme-presets.ts`의 light/dark 6종과 custom이다. 프리셋은 테마·강조 색상을 함께 고정하며 UI/API 모두 임의 강조 색상 변경을 차단한다. 기존 개인 설정은 custom으로 보존했다. 044 마이그레이션은 구성 DB에 적용 완료. 기록: `docs/work/2026-11-11/인터페이스-테마프리셋-커스텀색상.md`.

- 2026-11-11 테마 UI는 2행×4열이다. 라이트/다크 각 3개 프리셋 옆에 커스텀을 배치한다. 두 커스텀은 기존 `themePreset=custom`과 `defaultTheme`로 구분하며 색상은 밝기 전환 시 보존한다. 별도 DB 마이그레이션 없음. 기록: `docs/work/2026-11-11/커스텀테마-라이트다크-버튼분리.md`.

- 커스텀 테마 버튼 문구는 `.theme-custom-label`에 10px·nowrap을 적용한다. 설정 공통 12px 규칙으로 덮어쓰지 않도록 선택자 범위를 유지한다. 기록: `docs/work/2026-11-11/커스텀버튼-글자-한줄표시.md`.
