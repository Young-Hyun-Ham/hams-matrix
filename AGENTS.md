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

## 관리자 API 책임 분리 (2026-11-12)

- 상품·workspace·슈퍼관리자 API는 URL별 `route.ts`에 메서드, 입력 추출, 권한 함수 호출, Origin 검사, JSON·상태·헤더·오류 응답을 둔다. lib에 `segments`·HTTP 메서드 기반 dispatcher를 다시 만들지 않는다.
- 조회는 `lib/product-admin-service.ts`, `lib/master-workspace-admin.ts`, `lib/super-admin-service.ts`를 재사용한다. 저장의 트랜잭션 안 권한·version·정원·이력 검증을 유지한다. 정지·만료 상품의 상태 변경에 조회용 활성 상품 조건을 추가하지 않는다.
- `me`는 현재 관리 상품, 정적 `workspace`는 master의 현재 workspace다. 슈퍼관리자의 planCode와 실제 상품 종류를 대조하고, 동적 경로 fallback에서도 예약어를 상품 ID로 허용하지 않는다.
- 대체되어 사용하지 않게 된 파일은 참조·라우팅·테스트 전환 후 삭제한다. 정상 URL·DTO·Query scope를 보존한다. 기존 별칭 PATCH에 쓰기 권한을 새로 부여하지 않는다.
- 검증은 임시 SQLite와 합성 계정만 사용한다. API 회귀는 실제 route export를, 404·405·HEAD·OPTIONS와 경로 우선순위는 Next 서버를 검증한다. DB 변경 없음. 기록: `docs/work/2026-11-12/관리자API-라우팅과-업무함수-분리.md`.

## 화면·프로젝트 탭 CSS 위치 (2026-11-12)

- 공통 기반 CSS는 기존 `styles/`, 화면 소유 CSS는 `styles/pages/[화면주소]/`, 프로젝트 탭 전용 CSS는 `styles/pages/projects/tabs/[ProjectTab 식별자]/`에서 관리한다. WBS는 tabs/wbs, 프로그램은 tabs/program, 산출물은 tabs/export다. CSS를 컴포넌트 폴더로 다시 분산하거나 styles/pages/_shared를 만들지 않는다.
- 소스 import는 `@/styles/...` 절대 별칭, CSS 내부 @import는 해당 파일 기준 상대 경로를 사용한다. 기존 import 주체·순서·CSS 선언·일반 CSS/Module 구분을 보존한다. 이동만으로 미import CSS를 활성화하지 않는다.
- 독립 projects/database/erd·domains와 projects/documents 편집기는 프로젝트 내부 탭과 구분한다. 여러 탭이 사용하는 입력·이미지 동작 CSS는 styles/pages/projects에서 공유한다.
- 전체 경로와 유지보수 기준은 `styles/README.md`, 구현·검증 결과는 `docs/work/2026-11-12/CSS-화면주소별-스타일경로-정리.md`를 확인한다. DB 변경은 없다.

## 미사용 컴포넌트 정리 (2026-11-12)

- 설계의 D01~D18과 전용 CSS 2개·샘플 데이터·미사용 프로젝트 store를 제거했다. 현재 컴포넌트 디렉터리 코드 140개와 CSS 48개(공통 17·화면 31개)를 기준으로 관리한다.
- 과거 컴포넌트와 가입 선택 UI를 다시 연결하지 않는다. WBS는 wbs-page → wbs-schedule-chart 경로이며 AI 이미지 서버 API는 유지한다. 기능 복원은 별도 요청으로 처리한다.
- 14개 프로젝트 탭 맵·플래닝보드 동적 아이콘·타입 전용 소스·공통 CSS·공개 API를 미사용으로 판단하지 않는다. lib/admin-history.ts는 test-team-sharing의 직접 호출 때문에 유지한다.
- DB·의존성 변경 없음. 삭제 목록과 실제 검증·기존 실패는 [작업 기록](docs/work/2026-11-12/미사용-컴포넌트-전수조사-정리.md)을 확인한다.

## 대시보드 문서 흐름 (2026-11-12)

- `/dashboard`는 `GET /api/dashboard`의 최소 요약 DTO를 사용한다. `lib/dashboard-query.ts`는 읽기 트랜잭션 안에서 workspace·배정·READ·이력 플랜을 검증하고 `lib/dashboard-model.ts`의 KST 기간/통계/후보 계산을 사용한다. 원본 fields·structure·이력 snapshot을 요약 응답에 추가하지 않는다.
- Query key는 `matrixKeys.dashboard(scope, projectId)`이고 전체 무효화는 `matrixKeys.dashboards(scope)`다. SSR 프리패치와 클라이언트 필터를 일치시키고 프로젝트 생성·산출물 CRUD·AI 변경 후 요약도 무효화한다. access 폴링을 추가하지 않는다.
- 최근 변경은 오늘 포함 KST 7개 달력 날짜의 UPDATE 횟수다. 최신 10개 활동 길이로 계산하지 않는다. 미지원 이력은 0건과 구분한다.
- 재검증 후보는 승인된 통과 test의 저장 baseline과 현재 버전의 불일치만 표시한다. baseline 누락·삭제된 연결·일반 미승인을 변경 영향으로 단정하지 않는다. 권한이 제한되면 확인 범위 제한을 표시한다.
- 기존 개인 테마를 사용한다. 화면 CSS는 `.matrix-dashboard`로 범위를 제한하고 `styles/pages/dashboard/dashboard-page.css`에서 관리한다. 실제 Matrix 탭으로만 이동하며 전체 상태에서 첫 프로젝트를 임의 선택하지 않는다.
- 서버의 기존 guest 접근 제한을 유지한다. 현재 READ는 정책상 고정 허용이지만 반환 권한을 필터에 적용하며 정책을 임의 확장하지 않는다. DB 변경 없음. 검증은 `pnpm test:dashboard`, 빌드 후 `pnpm test:dashboard-browser`; [작업 기록](docs/work/2026-11-12/대시보드-퍼플화면-개편.md)을 확인한다.
