# DB 설계 AI 제안요청서 참조 개선

- 작성일: 2026-11-05 (한국시간, Asia/Seoul)
- 상태: 구현 및 관련 검증 완료.

## 주요 변경사항

- 원인: `database` 시스템 프롬프트에 제안요청서 참조 지침이 없었고, `readAiPage()`도 WBS·요구사항 탭에만 제안요청서를 전달했다. 프롬프트 변경만으로는 실제 문서를 확인할 수 없었다.
- `page-prompts.ts`의 `database` 지침에 제안요청서 출처, `read_page` 최신 조회, 업무 범위·요구사항·보안·비고를 근거로 한 DB 설계, 명시적 등록 요청 시 `save_artifact` 사용을 추가했다. 기존 산출물 건수 0과 제안요청서 부재를 구분하고, 추측·중복·임의 ID 연결을 방지하도록 안내한다.
- `page-data.ts`에서 DB 탭에도 기존 `readRfp()`를 통해 현재 프로젝트의 `project_rfp_documents.document_json`을 조회·해석한 전체 문서와 실제 ID/version을 제공한다. 초기 `pageContext.rfp`와 `read_page`의 `data.rfp` 양쪽에 반영된다.
- 기존 프로젝트·워크스페이스·RFP 읽기 권한 검사와 삭제 문서 제외를 유지한다. WBS·요구사항 탭의 기존 전달 범위와 다른 탭 동작은 유지한다.
- 등록 대상은 테이블 정의서 산출물이다. 업무 DB에 임의 DDL/DML을 실행하는 기능을 추가하지 않았다.

## 변경 파일

- `lib/ai/page-prompts.ts`: DB 탭 시스템 프롬프트.
- `lib/ai/page-data.ts`: DB 탭 제안요청서 컨텍스트 전달.
- `scripts/check-wbs-rfp-context.mjs`: 기존 RFP 참조 검증에 DB 조회·테이블 등록·권한 검증 추가.
- 본 문서와 `WORK_HISTORY.md`: 작업 기록 및 상대 경로 링크 추가.

## DB 변경 여부

스키마·마이그레이션·실제 회원 DB 변경 없음. 검증에서는 OS 임시 폴더의 SQLite와 합성 데이터만 사용했다.

## 검증 결과

- `pnpm typecheck`: 통과.
- 변경 소스 및 검증 스크립트 대상 ESLint: 통과.
- `node scripts/test-rfp-source.mjs --wbs-context-only`: 통과. 기존 WBS·요구사항 회귀, 산출물 0건에서 DB 탭의 전체 RFP 제공, 최신 재조회, 테이블 정의서 임시 변경안 생성·트랜잭션 저장, 읽기 전용 저장 차단, 빈 요구사항·없는 문서·삭제 문서·프로젝트/워크스페이스 격리를 확인했다.
- `git diff --check`: 통과.

## 미완료 사항

구현 미완료 사항 없음. 실제 외부 AI 모델의 응답 품질 검증과 유료 호출은 수행하지 않았으며, 실제 저장 데이터와 도구의 조회·등록 경로를 격리 환경에서 검증했다. 기존 다른 변경사항은 보존했다.
