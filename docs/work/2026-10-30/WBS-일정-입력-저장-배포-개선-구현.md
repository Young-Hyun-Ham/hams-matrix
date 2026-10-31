# WBS 일정 입력·조회·저장 및 날짜 표시 개선 구현

- 작업일: 2026-10-30 (한국시간)
- 기준: [최신 설계 문서](../../history/2026-10-30/WBS-일정-입력-저장-배포-개선.md)를 다시 읽고 구현했다.
- 상태: 날짜·검색·조회·저장·전체 일정 및 배포 구현 완료. 사용자가 확정한 프로젝트 owner/admin 배포·프로젝트 멤버 조회 정책을 반영했다.

## 주요 변경사항

- 샘플 tasks를 제거하고 실제 프로젝트 WBS artifacts로 차트를 표시한다. 빈 프로젝트에 샘플을 자동 저장하지 않는다. 서버 관리번호를 행에 표시하며 번호를 누르면 공통 스타일의 상세 편집 모달이 열린다.
- 시작·종료일은 readonly 표시와 달력 버튼으로 변경했다. native showPicker 지원에 의존하지 않는 달력 모달을 사용하며 타이핑·붙여넣기·드롭으로 날짜를 바꿀 수 없다. 달력의 키보드 이동·선택과 간트 드래그를 지원한다. 날짜 계산은 UTC 일자, 오늘과 저장 시각 표시는 한국시간 기준이다.
- 검색 아이콘과 입력을 별도 flex 영역으로 분리하여 공통 padding과 충돌하지 않게 했다. 상태 필터는 실제 산출물 상태 목록을 사용한다.
- 상태 필터 옆에 조회·저장·배포 및 배포본 보기 버튼을 배치했다. 프로젝트 owner/admin이 저장본을 배포하고 모든 프로젝트 멤버가 최신 확정 스냅샷을 조회한다. 미저장 변경 수·처리 상태·마지막 저장 메시지와 충돌 오류를 표시한다.
- 신규 작업의 단계·유형·범위·공수 등 필수값은 공통 스타일의 WBS 상세 편집 모달에서 입력한다. 하위 항목은 요약 작업에만 추가한다. 기존 숨겨진 필드·관계는 보존한다.
- 조회 실패·저장 실패·충돌 시 편집 초안을 유지한다. 조회 시 미저장 폐기를 확인하고, 프로젝트 선택·프로젝트 내부 탭 이동과 브라우저 새로고침/이탈에도 미저장 변경을 안내한다. 같은 프로젝트 데이터 재조회 중에는 편집 화면을 제거하지 않는다. 외부 갱신 시 초안을 덮어쓰지 않고 조회 안내를 표시한다.
- 요약 기간·진척률·공수는 기존 taskMetrics의 말단 작업 공수 가중 방식으로 집계한다. effect 안에서 tasks를 다시 변경하던 구조를 제거하여 기존 WBS lint 오류도 해소했다.
- 전체 일정 SVG를 배경→눈금→막대→라벨로 그려 날짜가 후속 배경에 가려지지 않게 했다. 모달의 연·월과 일자 눈금, 마지막 날짜·좌표 정렬을 보완하고 그래프 실제 비율 및 가로/세로 스크롤을 유지한다.

## 저장 API 및 데이터 보호

- POST `/api/projects/[projectId]/wbs/schedule`: 변경 작업·명시적 삭제 목록·기준 버전·requestId를 받아 단일 트랜잭션으로 처리한다. 최대 500건, 요청 본문 최대 1,500,000바이트다.
- 기존 단건 mutation의 필드 검증·행 저장·관계 저장·변경 이력·감사 기록을 공유 함수로 분리했다. 아키텍처 등 기존 저장 동작은 유지한다.
- 새 임시 ID를 서버 ID로 치환하고 최종 후보 그래프 전체를 검증한 뒤 저장한다. 따라서 부모·자식 기간을 동시에 변경할 수 있고 중간 상태의 검증 실패로 일부만 저장되지 않는다.
- 권한·워크스페이스·kind·version·상위/선행 관계·참조 보호·마일스톤 조건 등 기존 제약을 유지한다. 자동 변경된 요약 작업도 기준 버전으로 보호한다.
- 모든 신규 행을 먼저 저장한 뒤 관계를 기록해 새 항목 간 부모·선행 참조를 지원한다. 참조 중인 부모만 삭제하는 요청은 실패하고, 유효한 하위 트리 전체 삭제는 원자적으로 처리한다.
- 변경 없는 항목은 버전을 증가시키지 않는다. 화면 필터·접힘 상태는 저장/삭제 범위를 바꾸지 않는다.
- 저장 요청 영수증으로 응답 유실 후 같은 요청을 재시도해도 작업을 중복 생성하지 않는다. 영수증에는 ID 매핑·저장 시각만 기록하고, 재시도 응답 데이터는 현재 권한과 최신 서버 자료로 다시 읽는다.

## 변경 파일

- 화면: `components/pages/wbs/wbs-page.tsx`, `wbs-schedule-chart.jsx`, `wbs-schedule-chart.css`.
- 신규 UI/편집 모델: `components/pages/wbs/use-wbs-schedule.ts`, `wbs-date-picker.tsx`, `wbs-task-dialog.tsx`, `wbs-overview.tsx`.
- 공통 UI 연결: `components/shared/confirmation-dialog.tsx`(신규), `artifact-field-inputs.tsx`, `project-page-context.tsx`, `use-project-data.ts`, `components/pages/wbs/wbs-fields.tsx`, `components/project-workbench.tsx`.
- 서버: `lib/artifacts.ts`, `lib/wbs-schedule.ts`(신규), `lib/wbs-schedule-server.ts`(신규), `app/api/projects/[projectId]/wbs/schedule/route.ts`(신규).
- 배포: `lib/wbs-publications.ts`, `app/api/projects/[projectId]/wbs/publications/route.ts`, `components/pages/wbs/wbs-publication-actions.tsx`(신규).
- DB: `db/migrations/025_wbs_schedule_requests.sql`, `026_wbs_schedule_publications.sql`(신규).
- 검증: `scripts/test-wbs-schedule.mjs`(신규), `package.json`의 `test:wbs-schedule`.
- 기록: 이 문서 및 `WORK_HISTORY.md`.

## DB 변경 및 적용 결과

- 저장 요청 중복 방지를 위한 `wbs_schedule_requests` 테이블을 추가했다. 프로젝트·워크스페이스·요청자·요청 ID별 고유키, 입력 해시와 응답 식별 정보를 저장한다. 기존 WBS의 저장소는 project_artifacts/관계/이력을 재사용한다.
- `pnpm db:migrate` 실행은 기존 `023_toast_colors.sql`에서 `duplicate column name: toast_background_color`로 실패했다. DB에는 해당 컬럼이 있으나 023 적용 이력이 없는 기존 상태를 확인했다. 024 적용 이력은 존재했다.
- 이번 범위와 무관한 023의 컬럼이나 적용 이력을 수정하지 않았다. 기존 projects/project_artifacts 테이블 존재 및 025 미적용을 확인한 뒤 **025만 트랜잭션으로 적용하고 schema_migrations에 기록**했다. 실제 설정 DB에서 새 테이블 존재를 확인했다.
- 배포 정책 확정 후 026도 별도 트랜잭션으로 적용하고 schema_migrations에 기록했다. `wbs_schedule_publications` 및 수정/삭제 차단 트리거 존재를 확인했다. 기존 업무 데이터를 삭제하거나 샘플 자료·실제 배포본을 넣지 않았다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| `pnpm typecheck` | 통과 |
| 변경한 WBS/공통/서버 파일 및 신규 테스트 ESLint | 통과 |
| 전체 `pnpm lint` | 오류 없이 통과. 기존 프로젝트 개요 파일의 미사용 변수 경고 3개만 남음 |
| `pnpm build` | 통과. 작업자 실행을 허용한 환경에서 검증 |
| `pnpm test:wbs-schedule` | 통과: 실제 route/SQLite 기반 신규·수정·하위 트리 삭제, 가중 집계, 최종 그래프 기간 확장, 부분 실패 롤백, 숨긴 필드 보존, 중복 재시도, 권한·버전 충돌, 날짜 계산 및 SVG 라벨 레이어 |
| `pnpm test:architecture-mermaid` | 통과: 공통 저장 함수 분리에 대한 회귀 |
| `pnpm test:architecture-images` | 아키텍처/WBS 이미지 회귀 통과. 예상 오류 시나리오의 서버 로그는 출력됨 |
| `pnpm test:ai` | 실제 HTTP·임시 DB·mock 제공자 기반 기존 CRUD/이력/권한/원자적 저장·가드레일·취소 회귀 통과 |
| `git diff --check` | 통과 |

로그인된 실제 브라우저의 달력 조작·드래그·작은 화면·테마·모달 초점 수동 검증은 미실시다. 유료 AI 호출은 실행하지 않았다.

## 배포 정책 확정 후 구현

- 사용자 선택: “프로젝트 owner/admin이 마지막 저장본을 확정 스냅샷으로 배포하고, 프로젝트 멤버에게 배포본 보기를 제공”.
- GET/POST `/api/projects/[projectId]/wbs/publications`를 추가했다. 배포는 현재 프로젝트 역할을 서버에서 확인하며 workspace 관리자라는 이유로 프로젝트 권한을 우회하지 않는다. 조회는 해당 프로젝트 멤버에게 허용한다.
- 배포 확인 모달에 프로젝트·전체 저장 작업 수·일정 그래프를 표시한다. 미저장 변경이 있으면 먼저 저장해야 하며 배포 중 중복 제출·모달 닫기를 차단한다.
- 서버가 저장된 전체 WBS ID/version 목록을 대조하므로 수정·추가·삭제된 다른 저장본은 409로 거부한다. 빈 일정도 배포하지 않는다. 클라이언트의 스냅샷 본문은 받지 않고 DB 저장본으로 생성한다.
- 원본 ID/version·모든 WBS 필드·부모/선행 관계·연결 ID, 프로젝트명·배포자·배포시각·순번·소스 해시를 불변 스냅샷에 저장한다. 원본 상태를 일괄 승인·완료로 바꾸지 않는다.
- 동일한 저장본은 기존 배포본을 반환한다. 신규 저장본은 다음 순번을 발급하며 이전 스냅샷은 유지한다. DB 트리거로 배포본 수정/삭제를 차단한다.
- 배포본 보기에는 읽기 전용 전체 일정 그래프와 전체 필드·관계·원본 버전 표를 표시한다. 편집 화면의 필터/접힘 상태와 무관하게 전체 저장본을 표시한다. 작업을 나중에 수정·삭제해도 기존 배포본은 바뀌지 않는다.
- 배포 관련 UI도 현재 테마를 사용하며 저장본과 배포본의 동일 여부를 표시한다.
- 확인 모달의 저장 중 닫기/중복 제출 방지 및 하단 버튼의 공통 스타일도 보완했다(`components/shared/confirmation-dialog.tsx`, `styles/dialog.css`).
- `pnpm test:wbs-schedule`에 owner/admin 배포, 일반 member 배포 차단, viewer 조회, 외부 사용자 차단, 오래된 버전/빈 일정 거부, 중복 배포 재사용, 스냅샷 불변성·작업 삭제 후 보존·최신 배포본 조회를 추가하여 통과했다.

## 남은 확인 사항

- 요청한 기능 구현의 미완료 사항은 없다. 로그인 브라우저에서 달력·드래그·모달·작은 화면·테마를 직접 조작하는 수동 검증은 미실시다.
- 표준 `db:migrate`의 기존 023 이력 불일치는 별도 정비 대상이다. 이번 025/026은 이미 적용했으므로 중복 적용하지 않는다. 해당 기존 컬럼이나 적용 이력은 변경하지 않았다.
- 기존 다른 작업의 변경사항은 모두 보존했다.
