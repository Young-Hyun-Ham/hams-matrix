# RFP 연계 산출물 일괄 생성 구현

- 작성일: 2026-11-13 (한국시간)
- 기준: [최신 설계](../../history/2026-11-12/RFP-산출물-일괄생성-기능명세서-연결문서탐색-설계.md)를 다시 읽고 권장안을 적용했다.
- 상태: 구현·구성 DB 적용 완료. 검증 결과와 지원 범위는 아래와 같다.
- 기존 변경: 작업 시작 당시 PROMPT.md 수정은 보존한다. 설계 문서는 수정하지 않는다.

## 주요 변경

- 프로그램 정의 바로 앞에 function/FNC 기능명세서 탭과 공통 CRUD·개별 AI 대상을 추가했다. 기존 specifications/program 경로는 유지한다.
- 문서 목적·설명/주요 구성과 skeleton/detail 작성 수준을 추가했다. 초기 초안은 날짜·DB 컬럼 미확정 상태로 점진 저장하며 상세 전환에서 기존 필수 검증을 적용한다.
- 저장 RFP 및 문서함 파일로 초기 연계 문서를 생성하는 전용 API와 UI를 추가했다. 단계 재개·중지·정책 한도·원본/기존 문서 버전 검사·중복 후보 재사용·원자 저장을 적용한다.
- 고정 원본 snapshot과 artifact 출처 참조를 저장하고, 공통 상세 모달에서 기준/후행 문서·근거를 탐색한다. 이전/다음 방문 기록은 분기와 새 탐색을 구분한다.
- 개요에 실데이터 관계를 표시하고 기능 경유 추적표·Excel·대시보드 집계를 확장했다. 일정 미정 WBS는 별도 목록으로 보여주고 간트/발행과 구분한다.

## 변경 파일

- 타입/저장/검증: lib/artifact-types.ts, artifacts.ts, artifact-validation.ts, project-tabs.ts, project-permission-model.ts, project-types.ts, source-capture.ts, source-references.ts.
- 생성: lib/ai/deliverable-generation.ts, deliverable-generation-prompt.ts, deliverable-batch-commit.ts, page-prompts.ts와 projects의 deliverable-generations/source-snapshots API 및 artifact 상세 GET.
- 화면: project-workbench.tsx, functions/functions-page.tsx, 공통 artifact-list/dialogs/detail, 출처 편집·문서 선택·일괄 생성 모달·방문 기록, 프로젝트 개요·추적표·WBS 화면.
- 연계: traceability.ts, integration.ts, workbook.ts, dashboard-model.ts, wbs-schedule.ts, wbs-publications.ts.
- 이관/검증: db/migrations/045_deliverable_generation.sql, scripts/test-deliverable-generation.mjs, test-artifact-detail-navigation-browser.mjs, apply-deliverable-migration.mjs, test-project-permissions-rfp.mjs, dashboard-test-fixture.mjs, package.json.
- 문서: README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md 및 이 작업 기록.

## DB 변경

- 045 migration 추가: artifact kind/detail_level, 기능 탭 권한, AI conversation target CHECK 확장 및 출처 snapshot/참조·생성 요청 테이블.
- 기존 프로젝트의 program 권한을 역할 상한 안에서 function으로 복사한다. 기존 데이터의 ID/번호/상태/버전/JSON/이력을 보존한다.
- 참조되는 부모 테이블 재구성 후 전체 foreign_key_check를 검사한 뒤 SQLite 지연 DROP 검사 카운터를 정리한다. 불변 이력과 보드·대화 보존을 합성 데이터로 검증했다.
- 구성 DB에 045 적용 완료. 전용 apply-deliverable-migration.mjs로 관련 기존 테이블 건수와 전체 외래키 보존을 확인했고 재실행은 변경 없이 종료했다.
- Turso에서 허용하지 않는 legacy_alter_table PRAGMA를 사용하지 않고 종속 대화 트리거를 명시적으로 재생성한다. 초기 호환성 오류는 롤백했으며 최종 버전으로 적용했다. 기존 사용자 데이터로 기능 회귀 테스트를 실행하지 않았다.

## 검증 결과

- pnpm typecheck: 통과.
- pnpm test:deliverable-generation: 통과. populated migration, 무결성/FK, 이력·보드·대화 보존, 여섯 종류 원자 생성, 멱등성, 롤백/순번 보존, 출처·권한·중복·중지·추적/출력. 첨부 원본 수정/삭제 후 근거 보존, 제목 수정 후 출처 기반 중복 후보, 초기 부모/상세 자식의 WBS 집계도 확인했다.
- pnpm test:dashboard: 통과.
- pnpm test:wbs-schedule: 통과.
- pnpm test:ai-target-migration: 통과.
- pnpm test:query-audit: 통과 (미분류 0).
- pnpm test:project-permissions-rfp: 통과. 15개 탭 역할×CRUD·RFP/AI 저장·권한 회수·격리·기존 소유권 불변 정책을 검증했다. 낡은 테스트의 탭 수·워크스페이스 플랜·양도 허용 가정을 현재 정책에 맞췄으며 제품 권한을 완화하지 않았다.
- pnpm test:database-domains: 통과.
- pnpm test:rfp-source -- --scope-only: 통과.
- pnpm lint: 기존 scripts/test-wbs-view.mjs의 module 변수 및 최상위 hook 호출 오류 2건으로 실패. 기존 편집기 등 경고도 남아 있다. 이번 변경 파일의 별도 ESLint 검사는 오류/경고 없이 통과했다.
- pnpm build: 최종 빌드 통과, TypeScript 검사 포함. 빌드 전후 소스 동일 여부를 확인했다. 프리렌더링 중 Request failed Error 진단은 출력되지만 빌드는 정상 종료했다.
- pnpm test:artifact-detail-browser: 통과. 실제 Next/Chrome, 기능 탭 순서, 연결 요구사항/고정 출처, 이전·다음 분기, Escape, 모바일 공통 모달의 초기 초안 수정/저장. 증거: .auth-tests/deliverable-navigation/mobile-detail.png.

## 정책 및 제한

- 관리자 maxChanges를 우회하지 않는다. 기본 3건으로 부족하면 정책에서 허용 건수를 조정해야 한다. 생성 범위 전체를 충족하지 못한 결과는 저장하지 않는다.
- 원본 바이너리 과거 사본·OCR·정확한 PDF 페이지/DOCX 문단 이동·별도 worker/queue는 권장 초기 범위에 따라 포함하지 않는다. 생성 당시 추출 원문/구조화 RFP snapshot을 제공한다.
- 기존 문서는 자동 삭제/교체하지 않는다. 제목 또는 동일 출처/발췌로 찾은 중복 후보는 사용자가 기존 항목 재사용/신규 생성을 선택한다.
- 브라우저 종료 후에는 checkpoint를 조회하여 이어간다. 실제 외부 AI/R2를 사용하는 검증은 운영 자료로 실행하지 않는다.

## 미완료 사항 / 후속 참고

- 요청 범위의 소스 구현과 구성 DB 적용은 완료했다.
- 전체 lint의 기존 test-wbs-view.mjs 오류 2건은 이번 기능과 별개로 남아 있다. 신규/변경 파일 lint는 통과했다.
- 실제 유료 AI 응답·운영 R2 원본에 대한 생성 실험은 하지 않았다. 합성 DB·모의 AI/스토리지와 실제 브라우저로 검증했다.
- 운영 사용 시 관리자 maxChanges를 필요한 산출물 수에 맞춰 설정한다. 범위/파일 한도를 초과하면 입력을 줄이거나 정책을 조정해야 한다.
- 추후 재검증: pnpm test:deliverable-generation, pnpm test:wbs-schedule, pnpm test:project-permissions-rfp, pnpm build, pnpm test:artifact-detail-browser.
