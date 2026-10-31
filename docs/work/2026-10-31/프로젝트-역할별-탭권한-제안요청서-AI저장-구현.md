# 프로젝트 역할별 탭 권한 및 제안요청서 AI 저장 구현

- 작성일: 2026-10-31 (한국시간)
- 기준: [최신 설계 문서](../../history/2026-10-31/프로젝트-역할별-탭권한-제안요청서-AI저장-개편.md)를 다시 읽고 구현했다.
- 기존 변경사항은 보존했다.

## 주요 변경사항

- 계정 역할·워크스페이스 역할과 구분되는 프로젝트 유효 역할/권한 DTO 및 공통 서버 검사를 추가했다. owner는 지원 기능 전체, admin은 RFP 조회 전용, member는 RFP/WBS/아키텍처 조회 전용, viewer는 모든 탭 조회 전용으로 적용한다.
- 팀 공유 타이틀 옆에 owner 전용 ‘역할별 권한 설정’ 공통 모달을 추가했다. admin/member의 허용된 등록·수정·삭제를 각각 회수/복원할 수 있으며 owner·viewer·조회 권한과 기본 상한은 고정이다. 정책은 프로젝트별 DB 저장 및 낙관적 버전 충돌 검사를 사용한다.
- 일반 산출물 CRUD, WBS 일괄 저장/확정 배포, Mermaid 저장, AI 이미지 생성/최종 저장, 문서함 폴더·파일 변경 및 ONLYOFFICE 편집 설정/callback에 권한을 적용했다. 이미 열린 문서 편집기의 늦은 callback도 회수된 U 권한으로 저장할 수 없다.
- 프로젝트 생성 시 함께 선택한 다른 구성원은 viewer로 추가한다. 직접 추가의 viewer 기본값은 유지한다. 가입 승인은 workspace viewer로만 참여시키고 모든 프로젝트 자동 가입 및 기존 viewer의 member 자동 승격을 제거했다. 프로젝트 참여/역할 변경은 별도 관리한다.
- 기존 소유권 양도 모델을 유지한다. 계정은 user로 유지되고 `projects.owner_id`가 프로젝트 owner를 결정하며 양도 후 이전 owner는 member가 된다. 기존 master/admin과 다른 프로젝트 역할을 변경하지 않는다.
- RFP 전용 CRUD API와 공통 저장 서비스·논리 삭제·불변 변경 이력을 추가했다. 프로젝트당 활성 문서 한 건, 구조화 JSON, ID/version, 저장자/시각 및 버전 충돌을 관리한다. 초안의 업무 필수값 누락은 허용하되 구조·자료형·길이·개수·날짜·분류·배점을 서버에서 검증한다.
- RFP 화면은 실제 저장본을 조회하고 조회/저장/삭제·샘플 불러오기·저장 상태·충돌 안내를 제공한다. 메모리 편집본과 그 기준 버전을 분리해 탭 이동 중 보존하며, AI 갱신 중 미저장 편집본을 자동으로 덮어쓰지 않는다. 저장된 문서가 없으면 빈 작성 화면을 사용한다.
- RFP AI 전용 조회와 `save_rfp_document`를 추가했다. 신규 ‘제안요청서를 작성해줘’는 DB 초안 저장까지 수행하며 예시만/저장 금지 요청은 저장하지 않는다. 수정은 지정한 장의 patch로 나머지 내용을 보존한다.
- AI 임시 검증은 롤백하고 출력 가드레일을 통과한 최종 트랜잭션에서만 저장한다. 최종 커밋 시 소속·계정 상태·현재 프로젝트 역할·정책·문서 버전을 재검사한다. 서버 확인 결과에는 실제 RFP ID/version을 반환한다. 일반 요구사항을 자동 생성하거나 별도 문서 관리번호를 발급하지 않는다.
- viewer의 프로젝트 AI 조회/설명은 허용하고, 쓰기 도구 제공·실행은 차단한다. 기존 AI 가드레일·취소·쿼터·요금제 검사는 유지한다.

## 적용한 설계 선택안

- 제안서/사업계획서는 현재 제안요청서(RFP) 유형으로 처리한다.
- 권한 모달은 기본 상한 내 C/U/D 회수와 복원 방식이며 기본 제한을 넘어서는 확대는 허용하지 않는다.
- RFP 신규 작성 요청은 초안 DB 저장 의도로 처리한다. 기존 문서의 모호한 전체 교체는 확인하도록 안내하고 AI UPDATE는 부분 patch만 허용한다.
- RFP는 프로젝트당 활성 한 건이며 서버 ID/version을 사용한다. 샘플 자동 저장과 기존 메모리 초안 자동 이관은 없다.
- 가입 승인만으로 프로젝트에 자동 참여시키지 않는다. 기존 owner/admin의 직접 viewer 추가 권한은 유지하고 역할/정책 변경은 owner만 가능하다.

## 변경 파일

- 신규 권한/DB: `lib/project-permission-model.ts`, `lib/project-permissions.ts`, `db/migrations/030_project_permissions_rfp.sql`, `app/api/projects/[projectId]/permissions/route.ts`.
- RFP: `lib/rfp-types.ts`, `lib/rfp-template.ts`, `lib/rfp-server.ts`, `app/api/projects/[projectId]/rfp/route.ts`, `components/pages/rfp/rfp-page.tsx`, `components/pages/rfp/use-rfp-document.ts`, `stores/rfp-drafts.ts`.
- AI: `lib/ai/rfp-tools.ts`, `lib/ai/page-prompts.ts`, `lib/ai/page-data.ts`, `lib/ai/page-tools.ts`, `app/api/ai/chats/route.ts`, `lib/ai/architecture-images.ts`, `lib/ai/wbs-images.ts`.
- 프로젝트/팀: `lib/artifact-types.ts`, `lib/artifacts.ts`, `app/api/projects/route.ts`, `app/api/team/requests/route.ts`, `components/pages/team/team-page.tsx`, `components/pages/team/project-permissions-dialog.tsx`.
- 공통 UI: `components/project-workbench.tsx`, `components/shared/project-page-context.tsx`, `components/shared/artifact-list.tsx`, `components/shared/artifact-dialogs.tsx`.
- WBS/아키텍처: `lib/wbs-schedule-server.ts`, `lib/wbs-publications.ts`, `components/pages/wbs/use-wbs-schedule.ts`, `components/pages/wbs/wbs-schedule-chart.jsx`, `components/pages/wbs/wbs-schedule.tsx`, `components/pages/architecture/architecture-diagram.tsx`, `components/pages/architecture/architecture-mermaid.tsx`.
- 문서함: `app/api/projects/[projectId]/documents/route.ts`, `documents/files/route.ts`, `documents/files/[fileId]/route.ts`, `lib/onlyoffice.ts`, `components/pages/documents/documents-page.tsx`.
- 검증/기록: `scripts/test-project-permissions-rfp.mjs`, `scripts/test-project-permissions-rfp-browser.mjs`, `scripts/check-ai-crud.mjs`, `scripts/test-documents.mjs`, `scripts/check-onlyoffice.mjs`, `package.json`, 본 문서, `WORK_HISTORY.md`.

## DB 변경 여부

- 실제 연결 DB에 `030_project_permissions_rfp.sql`을 트랜잭션으로 적용하고 `schema_migrations`에 기록했다.
- `project_permission_policies`, `project_role_tab_permissions`, `project_rfp_documents`, `project_rfp_revisions`를 생성했다.
- 기존 프로젝트마다 정책 헤더와 4개 역할 × 14개 탭의 기본 권한을 백필했다. 신규 프로젝트 생성 트랜잭션에서도 같은 정책을 생성한다.
- 적용 전후 회원 계정 역할, 프로젝트 소유자·소속, 프로젝트 구성원 데이터, 기존 산출물 건수, 전역/개인 설정의 동일함과 외래키 검사 결과 불변을 확인했다. RFP 샘플은 넣지 않았다.
- 기존 023 적용 이력 불일치는 별도로 유지했다. 전체 마이그레이션을 무리하게 재실행하지 않고 이번 030만 적용했다.

## 검증 결과

- `pnpm test:project-permissions-rfp`: 통과. 전체 역할×탭×CRUD, 기존 DB 백필/역할 보존, owner 정책 관리·충돌·상한 검사, RFP 공유 조회/저장/부분 수정/삭제/검증/롤백/이력/로그 토글, AI 임시 검증/최종 커밋/권한 회수, 우회 변경 차단, viewer 기본값, 역할 양도, 가입 승인 무승격을 검증했다.
- `pnpm test:project-permissions-rfp-browser`: 통과. 실제 Chrome·격리 DB·로컬 서버에서 owner RFP 저장/재조회, admin/viewer RFP 읽기 전용, member WBS 읽기 전용, owner 모달 표시·권한 저장과 admin의 모달 비노출을 확인했다. 임시 디렉터리에 화면 증빙을 남겼다.
- `pnpm test:ai`: 통과. 새 RFP 작성 및 장 단위 수정의 실제 HTTP→도구→DB 저장, viewer 조회 허용/변경 차단, 기존 대화·가드레일·취소·토큰·첨부 처리 회귀를 검증했다. 외부 AI는 모킹하여 유료 호출하지 않았다.
- `pnpm test:accounts`, `pnpm test:wbs-schedule`, `pnpm test:architecture-mermaid`, `pnpm test:personal-preferences`: 통과.
- `node scripts/test-documents.mjs`: 통과. 기존 파일/폴더·ONLYOFFICE 회귀 및 정책 회수 후 열린 편집기 callback 저장 거부를 확인했다. 테스트의 오래된 account_role=owner fixture는 현행 user로 수정했다.
- `pnpm typecheck`, `pnpm build`: 통과. 변경 파일 대상 ESLint와 `git diff --check`: 통과. 전체 lint는 기존 개요 화면의 미사용 변수 경고 3건이 있다.
- `pnpm test:auth`: 프로젝트/산출물/가입/팀 역할·양도 및 감사 로그 검증은 통과했으나, 후속 `/requirements` 화면의 기존 404 응답 때문에 전체 명령은 실패했다. 이번 작업에서 그 경로를 변경하지 않았다.

## 미완료 및 한계

- 요청 범위의 구현과 실제 DB 적용은 완료했다.
- 기존 인증 테스트의 `/requirements` 경로 기대값 불일치와 023 마이그레이션 이력 불일치는 별도 정리가 필요하다.
- 다른 브라우저의 이미 열린 화면에 권한 변경을 즉시 푸시하지 않는다. 재조회 시 화면에 반영되며 모든 실제 변경 요청/최종 커밋은 DB의 최신 권한으로 검사한다.
- 별도 사업계획서 유형·다중 RFP·관리번호·파일 내보내기·승인 절차와 기본 상한을 넘는 권한 확대는 이번 범위에 포함하지 않았다.
