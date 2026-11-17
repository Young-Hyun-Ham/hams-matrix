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

## AI 프로젝트 분석·개인 설정·사용자 승인 (2026-11-16)

- AI 선택 프로젝트와 실제 화면 aiContext를 분리한다. 기존 방 project_id를 바꾸거나 질문·첨부를 다른 프로젝트로 자동 이전하지 않는다. 프로젝트 전체 분석은 조회 전용이다.
- HITL 기본 켜짐이다. 승인 대기 제안은 실제 저장 자료가 아니며, 서버에 보관된 변경안만 현재 권한·대상·정책·원본/참조/도메인 버전을 재검증해 전체 원자 적용한다. pending 동안 생성 lease·HTTP·쓰기 트랜잭션을 유지하지 않는다. 설정 해제는 기존 제안 자동 승인이 아니다.
- 개인 AI 설정은 사용자+workspace 범위다. 누적 토큰 알림 기본값 1,000,000, 판정은 실제 합계 > 한도다. 일반 헤더 배지는 미확인 팀 pending + 미확인 AI 초과 1건이다. 카운터 15초/상세 열 때 조회와 권한 폴링 금지를 유지한다.
- 이력 미저장 대화는 조회·초안 전용이다. 제목 version과 targetVersion을 독립 병합하고 수동/기존 제목을 자동 덮어쓰지 않는다.
- migration 046의 적용 상태와 제한은 [작업 기록](docs/work/2026-11-16/AI챗봇-프로젝트분석-AI설정-사용자승인-구현.md)을 따른다. `scripts/migrate.mjs --only`는 선택 파일만 적용하며 046은 기존 045 적용이 필요하다. 다른 미적용 파일을 함께 적용하지 않는다.
- 검증은 임시 DB·모의 공급자를 사용한다. `pnpm test:ai-settings-reviews`로 저장 경계·승인/거절·버전·토큰 경계를 검사하고 기존 AI/브라우저 회귀를 유지한다.

## 헤더 알림 카드·확인 상태 (2026-11-16)

- 최신 사용자 지시에 따라 11월 11일의 pending 수 전용 정책을 대체했다. migration 047의 notification_acknowledgements는 사용자+현재 workspace+알림 키로 확인을 저장한다. 클릭 성공 후 서버의 정확한 unread를 반영하며 재클릭으로 중복 차감하지 않는다.
- 팀 알림 키는 신청 ID+requested_at이다. 확인은 가입 승인/거절과 다르며 처리된 신청만 목록에서 제외한다. AI 초과 알림은 확인 후에도 한도 초과 중 표시하고, 한도 변경 때만 해당 확인을 초기화한다. HITL만 변경하거나 같은 한도를 저장하면 확인을 유지한다.
- 카운터는 15초, 상세는 패널 열 때 조회한다. 카운터에 목록/이름을 전송하지 않는다. 계약 알림은 기존 read_at과 승인/거절 제외 조건을 유지한다. 카드 버튼은 키보드로도 확인 가능하다.
- 검증은 임시 SQLite와 모의 AI, 브라우저로 수행한다. [작업 기록](docs/work/2026-11-16/헤더알림-카드분리-확인처리.md)을 확인한다.

## AI 2계층 오케스트레이션·프로젝트 RAG (2026-11-16)

- 1-layer의 rag/realtime/execution 분류는 실행 권한이 아니다. 실제 execute 허용 목록·기존 탭 권한·명시 요청·HITL·원본 버전/도메인 검증·원자 저장을 유지한다. RFP 탭의 기존 작성 요청은 별도 의도로 보존한다. 프로젝트 전체 분석은 읽기 전용이다.
- 현재 프로젝트 본문·연결·지원 문서·보드·도메인·연결 출처를 모두 수집한다. 기존 readProjectAnalysis의 축약 결과를 색인 입력으로 사용하지 않는다. 개인 채팅·키·미승인 변경안·과거 전체 revision은 공용 지식으로 자동 색인하지 않는다.
- 웹과 RAG 워커는 별도 AI_CREDENTIAL_ENCRYPTION_KEY를 공유한다. 입력 키·암호문을 DTO·query key·로그·문서·hydration에 넣지 않는다. 키 설정 스크립트는 기존 값을 보존하며 값을 출력하지 않는다.
- migration 048만 선택 적용한다. 기존 047이 필요하며 관련 없는 pending migration을 적용하지 않는다. 새 세대는 완전성·manifest·권한·lease 검증 후 포인터를 원자 교체하고 실패 시 이전 검색본을 보존한다.
- 검색은 libSQL native cosine 지원을 확인한 뒤 사용하며 미지원 환경은 전체 유효 청크를 페이지 순회한다. 예산 초과 시 부분 검색을 전체 검색처럼 제공하지 않는다. 현재 READ·존재·hash/version을 답변 저장 직전까지 재확인한다.
- RAG 진행 조회는 활성 작업에 한한다. project access 주기 조회를 재도입하지 않는다. 현재 Query scope·쓰기 자동 재시도 금지·대시보드 최소 DTO를 유지한다.
- 회귀는 `pnpm test:project-rag`, `pnpm test:ai-settings-reviews`, `pnpm test:ai-tool-execution`, `pnpm test:dashboard`와 Query/브라우저 검증을 격리 환경에서 수행한다. DB 적용·검증·운영 제한은 [작업 기록](docs/work/2026-11-16/AI챗봇-2계층오케스트레이션-프로젝트벡터화-구현.md)을 확인한다.


2026-11-16: 프로젝트 벡터화 실패 시 새로 시작/이어서 시작을 선택한다. 재개는 같은 세대·모델과 저장 청크를 유지하고 새 job에 resume_from_job_id를 기록한다. 원본 변경은 거절하며 실패 이력과 사용량 경계를 보존한다. DB는 048 이후 049_project_rag_resume.sql만 선택 적용한다. 구성 DB 적용과 외래키 검사를 완료했다. [작업 기록](docs/work/2026-11-16/프로젝트벡터화-실패후-재시작선택-구현.md).

## AI 공유 답변 (2026-11-17)

- 개인 대화의 사용자 scope를 제거하지 않는다. 공용 자원은 프로젝트별 별도 불변 버전이며 등록자 개인 대화/첨부를 공개하지 않는다.
- 자동 반환은 승인된 대표 질문·별칭만 허용한다. 모델의 의미 판정은 후보 안내용이며 권한·대상·기간·조건 검증을 우회할 수 없다. 연결 후 본문을 재작성하지 않는다.
- 공용 전체 manifest와 실제 페이지/RAG/도구 의존성을 생성부터 기록한다. 개인 이력·첨부·실행·불완전 추적·시간/미지원 자료는 등록 불가다. 새 도구/출처를 자동으로 추적 완료로 취급하지 않는다.
- 공유 상세·반환·저장 이력의 현재 권한과 정책을 확인한다. 재검증 중 캐시 원문을 노출하지 않는다. 근거 변경·철회는 새 재사용을 차단하고 오래된 공유 본문을 새 생성의 사실 근거로 보내지 않는다.
- 등록/새 버전은 멱등키와 expectedVersion, 승인은 owner/admin 검토를 유지한다. 새 근거를 승인할 때 과거 버전을 수정하지 않는다.
- 050은 049 이후 선택 적용한다. 구성 DB에 050 적용 및 외래키 검사 완료. 임시 DB/모의 공급자/Chrome 검증만 회귀 fixture로 사용한다.
- 검증: `pnpm test:shared-answers`, `pnpm test:shared-answers-browser`. 실제 범위·후속 사항은 [작업 기록](docs/work/2026-11-17/AI공유답변-등록승인-조건매칭-재사용-구현.md)을 확인한다.

## 문서 뷰어 레이아웃·Mermaid (2026-11-17)

- `/viewer` 본문 열에 고정 900px 상한을 재도입하지 않는다. 전역 메뉴 폭 연동과 실제 읽기 영역 폭을 기준으로 본문·목차를 배치한다.
- 목차 40단위 폭 확장은 취소했다. 메뉴를 펼친 상태의 본문:목차 7:3을 기준으로 하며, 메뉴를 접으면 목차 폭을 유지하고 본문에만 추가 공간을 배분한다. 셸의 `--workspace-sidebar-expanded-width`와 실제 페이지 폭을 사용해 접힌 상태 진입·리사이즈에도 대응한다. 본문 최소 500px과 목차 숨김 스크롤·휠·키보드 접근을 유지한다. [메뉴 접기 동작 기록](docs/work/2026-11-17/문서뷰어-메뉴접기-본문단독확장.md).
- Mermaid 블록은 기본 텍스트·선택 시 미리보기다. 일반 코드와 원문 초안·저장된 본문 기준 미리보기를 유지한다. fence 내부 제목은 목차에서 제외한다.
- `lib/mermaid-render.ts`의 직렬 렌더 경계와 `lib/mermaid-preview.ts`의 SVG/CSS 격리를 공유한다. 새로운 Mermaid 호출도 공유 설정을 경합시키지 않는다. 아키텍처 전용 flowchart 검증을 문서 전체에 강제하지 않는다.
- DB 변경 없음. 빌드 후 `node scripts/test-viewer.mjs`, `node scripts/test-architecture-mermaid-browser.mjs`로 합성 문서·임시 DB/Chrome에서 회귀한다. 구현·검증 범위는 [작업 기록](docs/work/2026-11-17/문서뷰어-영역확장-목차-Mermaid-개선-구현.md)을 확인한다.

## AI 챗봇 확대·공유 관리·근거 표시 (2026-11-17)

- 확대 또는 split 상태의 추가 너비는 100px 한 번이다. 기존 기준 너비와 실제 추가분을 구분해 분리 화면의 추가분 전체를 입력 열에 배분한다. 960px 이하 패널 440px 상한과 팝업 viewport-24px 제한을 유지한다.
- 공통 상단·대화 pane·입력 카드의 grid 영역을 명시한다. 관리 버튼은 대화 pane footer, 공유 후보는 입력 카드 안에 두며 메시지별 등록 버튼과 구분한다. 입력 DOM·방 scope·생성 상태를 배치 전환으로 초기화하지 않는다.
- 근거는 공통 `components/ai/ai-evidence.tsx`와 `styles/ai-chatbot.css`가 소유한다. 모달은 답변 ID로 최신 데이터를 사용하고 공유 재검증 중 본문·근거를 숨긴다. 원문 복사·서버 열람 제한·기존 권한 검증을 유지하고 표시를 위해 새 조회/폴링을 추가하지 않는다.
- DB 변경 없음. 빌드 후 `pnpm test:ai-targets-browser`, `pnpm test:shared-answers-browser`로 검증한다. 실제 결과·제한은 [작업 기록](docs/work/2026-11-17/AI챗봇-확대영역-공유관리버튼-결과근거-개선-구현.md)을 확인한다.
