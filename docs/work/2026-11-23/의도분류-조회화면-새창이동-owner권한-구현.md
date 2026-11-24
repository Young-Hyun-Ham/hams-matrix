# 의도분류 조회 화면·새창 이동·프로젝트 owner 권한 구현

- 작성일: 2026-11-23 (한국시간, Asia/Seoul)
- 기준: [최신 설계](../../history/2026-11-23/의도분류-조회화면-새창이동-owner권한-설계.md)를 다시 읽고 권고안으로 구현했다.
- 상태: 소스 구현 후 최종 빌드·브라우저 검증 진행 중. 기존 미커밋 변경은 보존했다.

## 주요 변경사항

- 프로젝트 owner 전용 독립 화면 `/projects/[projectId]/intent-classifications`와 목록/상세 GET API를 추가했다. KST 날짜·주 의도·확인 질문·검색 대체 처리 필터, 20건 커서 페이지, 상세 직접 링크, 현재 검색본 상태, 공통 개인 테마를 제공한다.
- 기존 분류 이벤트의 최소 메타데이터와 참조 ID/버전만 읽는다. 질문·개인 대화·키·원문을 조회하거나 새 AI 호출을 하지 않는다. 분류 이벤트를 실행 성공 이력으로 표시하지 않는다.
- 의도분류 모달 좌측 하단의 이동 버튼과 원래 화면 재시도 버튼을 추가했다. 최신 owner 확인 전에는 창을 만들지 않으며, 허용된 새창 열기 시 모달을 닫는다. 팝업 차단/사용자 활성화 만료 환경은 직접 재클릭을 지원하고 noopener 반환값만으로 성공을 단정하지 않는다.
- 가드레일은 기존 관리자 권한과 진입 확인 프로젝트의 실제 owner·배정·플랜 조건을 모두 요구한다. 관리자 설정에서 현재 workspace의 소유 프로젝트를 명시 선택한다. 프로젝트 없는 기존 북마크는 선택 단계를 거친다.
- 가드레일은 기존 workspace 전체 관제 범위를 유지하며 진입 확인 프로젝트와 구분해 표시한다. `entryProjectId`를 목록 검색 `projectId`와 분리하고 모든 목록·건수·상세·overview·결정 API 및 super-admin 대응 경로에 전달한다. 승인 쓰기 트랜잭션에서도 최신 owner를 검사한다.
- 벡터화의 기존 owner/admin 관리 권한, 일반 채팅·자동 분류·검색, 승인/반려·HITL·명시적 재개 정책은 유지한다. Business 전용 제한과 시나리오 빌더 구현은 추가하지 않았다.
- 프로젝트 access 폴링을 추가하지 않았다. 권한 변경 이벤트·명시 갱신·작업 직전 검사와 권한 오류 시 데이터 숨김을 사용한다.

## 변경 파일

- 접근 검사: `lib/ai-console-access.ts`, `lib/guardrail-admin-access.ts`, `lib/ai/guardrail-approvals.ts`, `lib/query/keys.ts`.
- 조회 서비스/타입: `lib/ai/intent-classifications.ts`, `lib/ai/intent-classification-types.ts`.
- 신규 조회 라우트: `app/(control-tower)/projects/[projectId]/intent-classifications/page.tsx`, `app/api/projects/[projectId]/intent-classifications/route.ts`, `app/api/projects/[projectId]/intent-classifications/[eventId]/route.ts`.
- 신규 capability 라우트: `app/api/admin/ai-console-access/route.ts`, `app/api/super-admin/ai-console-access/route.ts`.
- 가드레일 라우트: `app/api/admin/ai-guardrail-approvals/route.ts`, `count/route.ts`, `[id]/route.ts`, `[id]/decision/route.ts`, `app/api/admin/ai-guardrail-control-tower/overview/route.ts`. super-admin의 기존 재수출은 공통 변경을 따른다.
- UI: `components/shared/console-access.tsx`, `components/ai/intent-classifications-page.tsx`, `components/ai/project-rag-control.tsx`, `components/admin/guardrail-console-entry.tsx`, `guardrail-admin.tsx`, `guardrail-control-tower-page.tsx`, `guardrail-control-tower.tsx`, `guardrail-control-tower-dashboard.tsx`, `guardrail-approval-detail.tsx`, `app/(control-tower)/layout.tsx`.
- CSS: `styles/ai-project-rag.css`, `styles/pages/projects/intent-classifications/intent-classifications.css`, `styles/pages/admin/settings/guardrail-admin.css`, `styles/pages/admin/guardrail-control-tower/guardrail-control-tower.css`, `styles/README.md`.
- 검증: `scripts/test-intent-classifications.mjs`, `scripts/intent-classifications-browser.mjs`, `scripts/test-ai-guardrail-approvals.mjs`, `scripts/guardrail-approval-browser.mjs`, `package.json`.
- 문서: `README.md`, `AGENTS.md`, `CLAUDE.md`, 이 작업 기록, `WORK_HISTORY.md`.

프로젝트 선택 상태는 기존 회원/이력 검색 상태를 건드리지 않도록 `GuardrailConsoleEntry` 내부에서 관리하며 workspace별 key로 초기화한다. 대시보드/작업 화면은 기존 공통 RAG 컨트롤을 통해 함께 반영된다.

## DB 변경 여부

- **스키마·데이터 마이그레이션 없음.** 기존 `ai_orchestration_events`와 인덱스를 재사용한다. 쿼리 계획에서 `idx_orchestration_time` 사용을 확인했다.
- 구성된 DB에는 접속하거나 변경하지 않았다. 테스트는 별도 임시 SQLite에 합성 데이터와 기존 migration만 적용했다.
- 기존 DB는 소유권 이전과 owner 배정 제거를 trigger로 금지한다. trigger는 수정하지 않았으며 접근 회수는 계정/플랜·상품 소속 상태 변경으로 검증한다.
- 과거 참조는 저장된 식별자/버전만 표시한다. 삭제·변경된 원문의 존재나 당시 본문을 추정하거나 복원하지 않는다. 시나리오 연결용 신규 테이블도 이번에는 만들지 않는다.

## 검증 결과

- 통과: `pnpm typecheck` (초기 샌드박스 의존성 읽기 EPERM을 해소한 실행).
- 통과: `pnpm test:intent-classifications` — 실제 route handler의 owner·workspace/project 격리, KST 경계, 동일 시각 페이지, 필터 검증, 최소 DTO, 관리자+owner 조합, admin/super-admin 전 API, 처리 트랜잭션에서 상품 접근 회수.
- 통과: `pnpm test:ai-guardrail-approvals` — 기존 승인/재개·journal·원래 turn·HITL·자기 요청 승인 회귀. 관리자별 소유 진입 프로젝트 fixture를 추가했다.
- 통과: `pnpm test:project-rag` — owner/admin 권한·벡터화·실패 재개·검색·사용량·외래키 회귀.
- 확인: `pnpm test:query-audit` — 신규 호출은 모두 Q/IQ로 분류됐다. 전체 감사는 기존 `app/(sample)`의 미분류 fetch 5건 때문에 실패했다. sample 파일과 감사 기준은 변경하지 않았다.
- 진행 중: 변경 파일 lint, 최종 빌드, 신규/기존 가드레일 브라우저 회귀, AI 설정/도구 실행 회귀.

## 미완료 및 재개 정보

- 최종 검증 결과를 확인하고 이 절을 갱신해야 한다.
- 브라우저 실행: 빌드 성공 후 `pnpm test:intent-classifications-browser`, `pnpm test:ai-guardrail-approvals-browser`. 두 명령 모두 임시 SQLite·합성 세션을 사용한다.
- 범위 밖: 시나리오 빌더 연결/실행, 질문 원문·요약 공개, Business 플랜 전용 정책, 프로젝트별 가드레일 통계 귀속.
