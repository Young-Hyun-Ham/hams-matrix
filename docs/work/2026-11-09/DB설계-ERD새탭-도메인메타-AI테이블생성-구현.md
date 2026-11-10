# DB설계 ERD 새 탭·도메인 메타·AI 테이블 생성 구현

- 작성일: 2026-11-09 (한국시간, Asia/Seoul)
- 기준: [최신 설계 문서](../../history/2026-11-09/DB설계-ERD새탭-도메인메타-AI테이블생성-설계.md)를 다시 읽고 구현했다.
- 상태: 소스·DB 적용 및 관련 검증 완료.

## 주요 변경사항

- DB설계 탭에 ERD·도메인 메타 관리 새 탭 링크를 추가하고 인라인 ERD를 독립 화면으로 옮겼다. 프로젝트를 URL로 고정하고 인증·DB 권한·개인 테마를 적용했다.
- ERD 테이블명 오른쪽 수정·삭제 버튼, 기존 폼을 공유하는 수정 모달, 삭제 확인을 제공한다. 저장·삭제 후 ERD를 갱신하고 탭 복귀·변경 통지에 재조회한다. 편집 중 외부 갱신으로 입력을 덮어쓰지 않는다.
- 공통 테이블 삭제 경로에서 들어오는 FK·나가는 FK·자기 참조 FK를 검사한다. 기존 일반 산출물 연결 차단도 유지하므로 목록·ERD·AI 경로에서 우회할 수 없다.
- 프로젝트별 도메인 메타 CRUD, 검색·페이지 조회, 논리 삭제, version 충돌 및 catalog revision을 추가했다. 기존 database CRUD 권한과 감사 설정을 따른다.
- AI 신규 테이블 단건·일괄 등록에 같은 서버 resolver를 적용했다. 복합명 전체 일치·긴 용어 우선, 기본 `아이디 → id`, 부분 미해결·타입 충돌 차단을 지원한다. 예: `작업 / job / varchar2(16)` → `작업_아이디 / job_id / VARCHAR2 / 16`.
- 초기 AI 컨텍스트·최신 조회·메타 검색 도구를 연결하고, 임시 검증과 최종 저장 사이 메타 revision이 바뀌면 저장을 취소한다. 서버가 만든 적용 근거만 보존하며 클라이언트 위조를 거부한다.
- 독립 논리 컬럼명과 생성 당시 메타 근거를 보존하고 워크북의 기존 논리명/설명 열에 함께 출력한다. 메타 수정·삭제로 기존 테이블을 자동 변경하지 않는다.
- 수정 요청에서 기존 논리명·메타 근거를 생략해도 컬럼 ID를 기준으로 보존한다. 통지 채널을 사용할 수 없는 환경에서도 저장이 성공하고 탭 복귀·수동 재조회가 가능하도록 처리했다.

## 변경 파일

- 화면: `app/(database)/layout.tsx`, `app/(database)/projects/[projectId]/database/{erd,domains}/page.tsx`, `components/pages/database/`의 기존 화면·ERD·구조 편집기와 신규 독립 화면·메타 목록/폼·통지 훅·스타일.
- 공통 모달: `components/shared/artifact-dialogs.tsx`. context 래퍼를 유지하고 독립 화면용 본체를 같은 파일에서 분리했다.
- 메타 저장·검증: `lib/database-domain-types.ts`, `lib/database-domain-validation.ts`, `lib/database-domain-resolver.ts`, `lib/database-domain-generation.ts`, `lib/database-domains.ts`, `lib/database-relations.ts`.
- 메타 API: `app/api/projects/[projectId]/database/domains/route.ts`, `app/api/projects/[projectId]/database/domains/[domainId]/route.ts`.
- 산출물·AI: `lib/artifact-types.ts`, `lib/artifact-validation.ts`, `lib/artifacts.ts`, `lib/workbook.ts`, `lib/ai/page-data.ts`, `lib/ai/page-prompts.ts`, `lib/ai/page-tools.ts`, `lib/ai/database-batch-commit.ts`, `app/api/ai/chats/route.ts`.
- DB: `db/migrations/037_database_domains.sql`.
- 검증: `scripts/check-database-domains.mjs`, `scripts/test-database-domains.mjs`, `scripts/check-database-domains-browser.mjs`, `scripts/test-database-domains-browser.mjs`, 기존 `scripts/test-rfp-source.mjs`, `scripts/test-navigation-browser.mjs`, `scripts/check-ai-tool-execution.mjs`, `scripts/check-wbs-rfp-context.mjs`, `package.json` 실행 항목.
- 기록: 본 문서와 `WORK_HISTORY.md`. 기존 다른 변경사항과 이력 목록은 보존한다.

## DB 변경 여부

- **변경 있음.** 연결된 DB에 `037_database_domains.sql`만 트랜잭션으로 적용하고 `schema_migrations`에 기록했다. 다른 미적용 마이그레이션은 실행하지 않았다.
- `project_database_domains`, `project_database_domain_catalogs` 및 활성 논리명 유일 인덱스·프로젝트 조회 인덱스를 생성했다.
- 기존 산출물·연결·revision 건수가 적용 전후 동일함을 확인했고 신규 테이블의 외래키 검사도 통과했다. 기존 데이터 변환·삭제·샘플 메타 삽입은 하지 않았다.
- 앱 저장소는 기존 libSQL이며 `VARCHAR2`는 테이블 정의서의 자료형이다. 실제 업무 DB의 테이블을 생성하거나 변경하지 않는다.

## 검증 결과

- `pnpm typecheck`: 통과.
- 변경 소스·검증 스크립트 대상 ESLint: 통과.
- `pnpm test:database-domains`: 통과. 실제 CRUD API·임시 SQLite로 정규화, 권한/프로젝트 격리, 메타 단건·일괄 적용, preview rollback·commit, 메타 충돌, 논리명 보존·근거 위조 차단, FK·자기 참조 삭제 차단, 감사 켬/끔을 확인했다.
- `pnpm test:ai-tool-execution`: 통과. 기존 100개 테이블 일괄 검증·저장·FK 매핑과 가드레일 회귀를 확인했다.
- `pnpm test:project-permissions-rfp`: 통과. 기존 프로젝트 역할별 CRUD·RFP·저장 시 권한 재검사 등을 확인했다.
- `node scripts/test-rfp-source.mjs --wbs-context-only`: 통과. 기존 전체 탭 RFP 조회와 DB 등록 연계를 확인했다.
- `pnpm build`: 최종 소스 기준 통과. 신규 독립 화면과 CRUD API의 빌드·타입 검사를 확인했다.
- `pnpm test:database-domains-browser`: 최종 빌드 기준 통과. 메타 등록·수정, ERD 모달 수정·미저장 보호, 연결 없는 테이블 삭제, FK 삭제 버튼 차단, 조회 전용 화면, 모바일 가로 스크롤·다크테마, 통지 채널이 차단되어도 저장·조회가 가능한 동작을 확인했다.
- `pnpm test:ai`: 통과. 기존 AI HTTP CRUD·동시성·권한·의도 검사·대화방·이미지·가드레일·취소·사용량 회귀를 확인했다. 제공자는 모의 응답이다.
- 변경 범위의 `git diff --check`와 신규 파일의 공백·충돌 표시 검사를 통과했다. `WORK_HISTORY.md`의 기존 바이트와 설계 문서 보존, 기록 링크도 확인했다.
- 테스트 중 libSQL `Row.length`와 동명 컬럼의 충돌을 확인해 SQL alias로 길이 값을 읽도록 수정했다.

## 미완료 사항 및 범위

- 이번 구현 범위의 미완료 사항 없음.
- 테스트는 OS 임시 SQLite·합성 사용자·모의 AI 응답을 사용한다. 실제 유료 모델의 응답 품질 검증은 수행하지 않았다.
- 프로젝트별 사전·기존 database 권한 상속·AI CREATE 자동 적용을 선택했다. 팀 공통 사전, 기존 테이블 일괄 재적용, 메타 AI CRUD, 확장 타입 문법은 이번 구현 범위가 아니다.
