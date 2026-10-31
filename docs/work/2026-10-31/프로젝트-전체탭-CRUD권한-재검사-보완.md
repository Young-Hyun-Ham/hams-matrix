# 프로젝트 전체 탭 CRUD 권한 재검사 보완

- 작성일: 2026-10-31 (한국시간)
- 요청: 사업계획서로 사용하는 RFP 탭의 viewer 저장 가능 현상을 확인하고 전체 프로젝트 탭의 버튼/API에 체크된 CRUD 권한을 일관되게 적용한다.

## 확인한 문제

- 기존 DB에서 viewer의 등록·수정·삭제 권한은 모두 꺼져 있었으며, 직접 RFP API 호출은 viewer에게 403을 반환했다. 실제 DB의 viewer 쓰기 성공은 재현하지 못했다.
- 열린 프로젝트 화면은 역할/정책 변경을 자동 재조회하지 않았다. 기존 편집 권한으로 열린 RFP 화면과 일부 모달은 저장/적용 버튼을 계속 표시할 수 있었다.
- RFP 조회 API의 개별 permissions 응답을 화면에서 사용하지 않았고 일부 열린 삭제 확인·WBS 적용·문서함·AI 이미지 모달은 권한 회수 시 버튼을 다시 검사하지 않았다.
- 초기화된 정책의 행이 누락될 때 기본 쓰기 권한을 복원하는 fallback이 있었다.

## 주요 변경사항

- 일반 프로젝트 구성원에게 본인의 최신 프로젝트 역할/탭별 CRUD 권한만 반환하는 private/no-store 접근 조회 API를 추가했다. 정책 관리 API의 owner 전용 제한은 유지한다.
- 공통 프로젝트 Context는 조회 API의 최신 권한을 사용한다. 최초 확인 전이나 권한 조회 실패 시 변경 기능을 허용하지 않는다. 사용자/워크스페이스/프로젝트가 다른 응답도 거부한다.
- 탭 이동, 창 포커스/화면 복귀, 역할·정책 변경 알림 및 보이는 화면의 10초 주기 확인으로 권한을 갱신한다. 팀 역할/정책 저장 시 같은 창과 다른 브라우저 탭에 갱신 알림을 보낸다.
- 프로젝트 화면에 현재 프로젝트 역할을 표시한다. 계정 역할과 다른 프로젝트 역할을 구분할 수 있다.
- 사업계획서/RFP는 자체 조회 permissions와 공통 최신 권한 모두를 만족할 때만 입력·저장·삭제를 허용한다. 저장 직전 권한 재확인에 실패하면 변경 API를 보내지 않는다. viewer로 변경된 뒤에도 기존 저장 성공 메시지가 남지 않도록 했다.
- 일반 산출물의 등록/수정/삭제, Mermaid 코드, WBS 저장/배포 및 문서함 변경/업로드 직전에 최신 CRUD 권한을 확인한다. 서버 API의 실제 mutation/최종 커밋 권한 검사도 유지한다.
- 열린 수정·삭제 확인·WBS 적용/배포·문서함·AI 이미지 생성 모달의 입력과 확인 버튼도 해당 개별 C/U/D 권한을 따른다. 권한을 회수하면 기존 모달이 열린 상태에서도 변경 액션을 차단한다.
- 공통 산출물 DB 쓰기 함수에도 실제 대상 kind와 액션의 권한 검사를 추가했다. 초기화된 정책에서 행이 누락되면 admin/member의 쓰기 권한을 자동 복원하지 않는다.
- owner의 지원 기능 전체 및 viewer의 조회 전용이라는 기존 정책 상한은 유지한다. 다른 역할도 체크 해제된 C/U/D는 화면과 API에서 거부한다.

## 변경 파일

- 신규: `app/api/projects/[projectId]/access/route.ts`, `components/shared/use-project-access.ts`, `lib/project-access-events.ts`.
- 권한/저장: `lib/project-permissions.ts`, `lib/artifacts.ts`, `components/project-workbench.tsx`, `components/shared/project-page-context.tsx`, `components/shared/use-artifact-actions.ts`.
- 화면/모달: `components/shared/artifact-dialogs.tsx`, `components/shared/confirmation-dialog.tsx`, `components/shared/ai-image-actions.tsx`, `components/pages/rfp/use-rfp-document.ts`, `components/pages/rfp/rfp-page.tsx`, `components/pages/wbs/use-wbs-schedule.ts`, `components/pages/wbs/wbs-task-dialog.tsx`, `components/pages/wbs/wbs-publication-actions.tsx`, `components/pages/architecture/architecture-mermaid.tsx`, `components/pages/documents/documents-page.tsx`.
- 변경 알림: `components/pages/team/team-membership.tsx`, `components/pages/team/project-permissions-dialog.tsx`.
- 검증/기록: `scripts/test-project-permissions-rfp.mjs`, `scripts/test-project-permissions-rfp-browser.mjs`, 본 문서, `WORK_HISTORY.md`.

## DB 변경 여부

- 스키마와 운영 데이터 변경 없음. 현재 역할/정책 상태를 읽기 전용으로 확인했다. 격리 테스트 DB에서만 역할/권한 회수를 수행했다.

## 검증 결과

- `pnpm test:project-permissions-rfp`: 통과. 전체 역할×탭×CRUD 매트릭스 외에 7종 산출물 API 각각의 viewer C/U/D, Mermaid·폴더/파일 변경 차단, admin의 체크 해제 액션, 정책 누락 행 거부를 추가 검증했다. 거부된 요청 후 데이터가 동일함을 확인했다.
- `pnpm test:project-permissions-rfp-browser`: 통과. Chrome에서 RFP 편집 도중 owner를 viewer로 변경한 뒤 저장 클릭 시 변경 요청이 0건이고 DB 문서가 유지되는 것을 검증했다. 전체 14개 탭의 viewer 변경 버튼 차단, admin의 개별 C/U/D 및 열린 수정/삭제 모달의 권한 회수도 확인했다.
- `pnpm test:wbs-schedule`, `pnpm test:architecture-mermaid`, `pnpm test:accounts`, `pnpm test:ai`, `node scripts/test-documents.mjs`: 통과. AI 및 문서함/ONLYOFFICE 최종 저장의 권한 회수 검사도 유지된다.
- 타입 검사, 프로덕션 빌드, 변경 파일 대상 ESLint, `git diff --check`: 통과. 전체 lint는 기존 개요 화면의 미사용 변수 경고 3건만 있다.

## 미완료 및 한계

- DB 권한 변경을 모든 브라우저에 서버 push하지 않는다. 같은 브라우저의 변경 알림은 즉시 확인하며, 다른 브라우저는 화면 복귀/10초 주기로 갱신한다. 실제 저장 직전과 서버 DB 변경 시에는 항상 최신 권한을 검사한다.
- 사용자 신고의 viewer DB 저장 성공 자체는 재현하지 못했으므로, 그 원인을 단정하지 않는다. 확인된 오래된 화면 권한과 버튼 처리 경로는 보완했고 해당 회귀 시나리오를 검증했다.
