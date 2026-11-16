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

## RFP 연계 산출물 (2026-11-13)

- function/FNC 기능명세서는 program 앞 탭이며 기존 specifications 별칭은 program을 유지한다. 공통 purpose/summary와 detailLevel(skeleton/detail)을 보존한다. 골격을 승인/완료 처리하거나 날짜·DB 컬럼을 임의로 채우지 않는다.
- 일괄 생성은 전용 deliverable-generations 경로를 사용한다. 현재 탭 AI의 kind 제한을 풀지 않는다. 관리자 maxChanges, 현재 권한·원본/참조 버전, 멱등성·lease·중지·원자 저장을 유지한다.
- 출처 snapshot은 불변이고 원본 삭제/변경과 독립적이다. 상세의 이전/다음은 모달 내 방문 기록이며 workspace/프로젝트 변경 시 정리한다. 일정 미정 WBS는 간트/발행과 구분한다.
- 045 migration은 부모 FK·불변 이력·보드·AI 대화를 보존해야 한다. 임시 DB 검증은 pnpm test:deliverable-generation, 브라우저는 빌드 후 pnpm test:artifact-detail-browser. 적용·검증 상태는 [작업 기록](docs/work/2026-11-13/RFP-연계산출물-일괄생성-구현.md)을 확인한다.

- [첨부 문서 일괄 생성 RFP 선택 오류 수정](docs/work/2026-11-14/첨부문서-일괄생성-RFP선택-오류수정.md) - 2026-11-14 · 저장 RFP는 명시 선택하며, 없는 RFP 선택과 실패한 시작 요청 ID의 잔존을 방지한다.

- [개요 페이지 기존 흐름도 복원](docs/work/2026-11-14/개요페이지-기존흐름도-복원.md) - 2026-11-14 · 사용자 요청으로 개요의 기존 흐름도를 복원하고, 일괄 생성 진입점은 RFP·문서함에 유지한다.

- [일괄 생성 백그라운드 작업 전환](docs/work/2026-11-14/일괄생성-백그라운드작업-전환.md) - 2026-11-14 · Node 24+, pnpm dev/start에서 독립 작업자를 함께 실행한다. 작업자 전용 AI 전체 대기 제한을 해제하고 DB 잠금 갱신·응답 ID 복구·중지 확인을 유지한다. 서버리스에서는 pnpm worker:deliverables를 별도 상시 실행한다.

- [일괄 생성 초안 검증과 임시 ID 정규화](docs/work/2026-11-16/일괄생성-초안검증-임시ID-정규화.md) - 2026-11-16 · 일괄 생성 임시 ID와 선언된 연결을 정규화하고, 초안 공통 필수값 검증 및 필드별 오류 안내를 유지한다.

- [일괄 생성 설계 근거와 직접 인용 구분](docs/work/2026-11-16/일괄생성-설계근거-직접인용-구분.md) - 2026-11-16 · 원문 직접 인용은 엄격히 검증하고, 설계 도출 요약은 전체 원문 출처와 검토 경고로 구분한다. 산출물 저장은 전체 트랜잭션을 유지하며 요청·출처 snapshot·사용량 진단 기록은 실패 후에도 보존한다.

- [첨부 문서 일괄 생성 제안요청서 동시 생성](docs/work/2026-11-16/첨부문서-일괄생성-제안요청서-동시생성.md) - 2026-11-16 · RFP가 없으면 첨부 기반 RFP 초안을 기본 동시 생성하고 산출물과 원자 저장한다. 기존 RFP는 덮어쓰지 않으며 RFP 1건도 관리자 변경 한도에 포함한다.

- [WBS 계획공수 근무일 자동 계산](docs/work/2026-11-16/WBS-계획공수-근무일-자동계산.md) - 2026-11-16

- [WBS 미정 일정 목록 반영·요약 저장·단계 선택](docs/work/2026-11-16/WBS-미정일정-목록반영-요약저장-단계선택.md) - 2026-11-16

- [WBS 상세 모달 헤더 배치·방문 이력 수정](docs/work/2026-11-16/WBS-상세모달-헤더배치-방문이력-수정.md) - 2026-11-16

- [아키텍처 이미지·Mermaid 구성 동기화](docs/work/2026-11-16/아키텍처-이미지-Mermaid-구성동기화.md) - 2026-11-16

- [Mermaid 숫자 엔티티 생성 제거](docs/work/2026-11-16/Mermaid-숫자엔티티-생성제거.md) - 2026-11-16
