# WBS 미정 일정 목록 반영·요약 저장·단계 선택

작성일: 2026-11-16 (한국시간)

## 주요 변경사항
- 일정 미정 WBS도 WBS System 목록과 작업 건수에 포함한다. 날짜가 없는 작업은 간트 기간 계산·막대·전체 일정 미리보기에서 제외하며 날짜를 임의 생성하지 않는다.
- 공통 모달에서 등록·수정·삭제한 WBS를 로컬 편집이 없는 경우 WBS System에 자동 반영한다. 미저장 편집이 있으면 기존 최신 조회/충돌 처리 흐름을 유지하여 로컬 변경을 보존한다.
- 요약 작업은 서버 정책상 문서 직접 배정과 선행 관계가 있으면 저장이 거부된다. 요약 선택 시 선행 관계를 해제하고, 관련 선택 영역을 비활성화하여 저장 요청에서 문서·선행 관계가 제외되도록 했다. 연결 해제 안내를 표시하고 하위 실제 작업에 배정하도록 안내한다. 서버 정책·검증은 유지한다.
- 공통 모달과 WBS System 편집 모달에 같은 WBS 상태·연결 선택 처리를 적용했다. System 편집 모달도 앞서 구현한 날짜별 공수 자동 계산과 관계 날짜 검증을 공유한다.
- 단계 필수 조건을 공통 필드 정의에서 제거하여 화면 필수 표시·브라우저 검증·서버 필수 검증에 함께 적용한다. 단계 선택지와 기존 값은 유지한다.

## 변경 파일
- components/pages/wbs/use-wbs-schedule.ts: 전체 WBS 행과 모달 CRUD 동기화.
- components/pages/wbs/wbs-schedule-chart.jsx: 날짜 없는 행에 대한 간트 처리.
- components/pages/wbs/wbs-deliverable-links.tsx: 공통 WBS 연결 문서 선택 및 요약 안내.
- components/pages/wbs/wbs-form-state.tsx: 요약 선택 시 선행 관계 초기화.
- components/pages/wbs/wbs-structure-editor.tsx: 요약 선행 관계 선택 방지.
- components/pages/wbs/wbs-task-dialog.tsx: 공유 상태와 연결 선택 적용.
- components/shared/artifact-dialogs.tsx: WBS 전용 연결 선택 연결.
- lib/artifact-types.ts: 단계 필수 조건 제거.
- scripts/test-wbs-editing.mjs: 목록·동기화·로컬 편집 보존·요약 배정 UI 회귀 검증.
- scripts/test-wbs-schedule.mjs: 단계 없는 요약 저장 및 하위 공수 집계 회귀 검증.
- README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md: 작업 기록 추가.

## DB 변경 여부
- DB 스키마·기존 데이터 변경 없음. 사용자가 요약 작업으로 저장할 때 문서 직접 배정·선행 관계 해제는 기존 저장 API와 이력 처리를 따른다.

## 검증 결과
- node scripts/test-wbs-editing.mjs: 통과. 일정 미정 행 표시, 모달 변경 동기화, 미저장 로컬 편집 보존, 요약 배정 비활성화 검증.
- node scripts/test-wbs-schedule.mjs: 통과. 임시 SQLite의 실제 API로 단계 없는 요약 저장, 집계, 트랜잭션, 충돌, 권한, 발행·날짜 검증.
- node scripts/test-wbs-effort.mjs: 통과.
- TypeScript --noEmit: 통과.
- 변경 파일 ESLint 및 git diff --check: 통과.
- 브라우저 직접 조작 검증은 수행하지 않았다.

## 미완료 사항
- 요청 범위 구현 완료. 일정 미정 작업은 기존처럼 초기 초안으로 저장하며 일정이 확정되기 전에는 발행하지 않는다.
