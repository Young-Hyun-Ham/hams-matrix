# 제안요청서 단일 첨부·문서함 연계·AI 생성 구현

- 작업일: 2026-11-03 (한국시간)
- 기준: [최신 설계 문서](../../history/2026-11-03/제안요청서-단일첨부-문서함연계-AI생성-설계.md)를 다시 읽고 권장 초기안을 적용했다.

## 주요 변경사항

- 샘플 불러오기가 있는 상단 영역 아래에 원본 파일 한 개를 첨부·교체·해제하는 영역과 파일 옆 AI 생성 버튼을 추가했다. 원본은 문서함 루트에 같은 파일 ID로 저장하고 다운로드·문서함 이동을 제공한다.
- PDF/DOCX/UTF-8 TXT·MD, 최대 4MiB, PDF 최대 50페이지, 추출 본문 최대 100,000자를 지원한다. 공통 파서를 분리하고 기존 관리자 가드레일 파일 입력 계약은 유지했다. OCR·HWP/HWPX 및 대형 원본 분할 생성은 초기 범위에 포함하지 않았다.
- 공통 확인 모달에서 실행 후 구조화된 RFP를 DB 초안으로 저장한다. 기존 문서는 재생성 확인 후 전체 교체하며 리비전을 보존한다. 미저장 편집본이 있으면 먼저 저장하거나 조회에서 명시적으로 폐기하도록 안내한다.
- 원본 관계 버전·파일 객체/이름/크기·RFP ID/version·권한·AI 정책을 최종 저장 시 재검사한다. 원본/저장본 변경, 중지, 불완전 응답, 검증 실패 시 기존 저장본을 보존한다.
- 생성 요청의 멱등성, 프로젝트별 동시 실행 제한, lease 만료 처리, 실행자 전용 상태 조회·응답 유실 복구·중지/중지 재시도를 추가했다. 토큰 예약·정산과 입력/참고 자료/출력 가드레일을 기존 공통 기반으로 연결했다.
- 교체/해제 시 기존 파일은 문서함에 보존한다. 활성 원본은 문서함에서 바로 삭제할 수 없고, 이름 변경·ONLYOFFICE 편집 및 저장 콜백에 RFP 권한을 추가 검사한다. 일반 문서함의 20MiB 업로드 정책은 유지한다.
- 기존 AI 팝업 스타일, 설계 문서/이력, PROMPT 및 작업 중 확인된 다른 메뉴·타입 변경은 보존했다. 의존성은 기존 잠금 파일의 누락 패키지를 복구했으며 버전·잠금 파일을 변경하지 않았다.

## 변경 파일

- `components/pages/rfp/rfp-page.tsx`, `rfp-page.css`, `use-rfp-document.ts`, 신규 `rfp-source.tsx`, `use-rfp-source.ts`
- `components/pages/documents/documents-page.tsx`, `documents-page.css`
- 신규 `lib/rfp-sources.ts`, `lib/rfp-source-types.ts`, `lib/document-text.ts`
- 신규 `lib/ai/rfp-generation.ts`, `lib/ai/rfp-generation-prompt.ts`; `lib/ai/guardrail-files.ts`
- `lib/documents.ts`, `lib/document-types.ts`, `lib/onlyoffice.ts`
- 신규 `app/api/projects/[projectId]/rfp/source/route.ts`, `rfp/generate/route.ts`, `rfp/generate/[requestId]/route.ts`, `rfp/generate/[requestId]/stop/route.ts`
- `app/api/projects/[projectId]/documents/route.ts`, `documents/files/[fileId]/route.ts`
- 신규 `db/migrations/031_rfp_sources_generation.sql`
- 신규 `scripts/test-rfp-source.mjs`, `scripts/test-rfp-source-browser.mjs`; `scripts/ai-test-provider.mjs`, `scripts/test-project-permissions-rfp.mjs`, `package.json`
- `docs/AI_GUARDRAILS.md`, 이 작업 기록, `WORK_HISTORY.md`

## DB 변경 여부

- **있음.** `project_rfp_sources`와 `project_rfp_generation_requests`, 파일 범위 복합 UNIQUE 인덱스·원본 복합 FK·프로젝트별 활성 생성 UNIQUE 인덱스를 추가했다.
- 격리된 통합 테스트 DB에서 마이그레이션을 검증한 후 프로젝트에 설정된 연결 DB에도 `031`을 적용하고 `schema_migrations`에 기록했다. 적용 전후 기존 파일·RFP 문서·리비전 건수는 동일했다.
- 전체 `pnpm db:migrate`는 기존 `023` 이력 누락과 이미 존재하는 `toast_background_color` 컬럼 때문에 중단됐다. 실제 `030`까지의 선행 테이블 구조를 확인한 뒤 **신규 031만 트랜잭션으로 선택 적용**했다. 기존 마이그레이션 기록을 임의로 보정하지 않았다.
- 운영 파일 업로드·AI 유료 호출은 수행하지 않았다. 기능 테스트는 임시 SQLite DB·모의 공급자·모의 스토리지로 실행했다.

## 검증 결과

- 프로덕션 빌드: 통과. 신규 원본/생성/상태/중지 라우트 포함.
- `pnpm typecheck`: 누락 의존성 복구 후 통과.
- 변경 TS/TSX 및 테스트 스크립트 ESLint: 통과. 테스트의 미사용 도우미 경고를 제거한 뒤 재검사하여 경고도 해소했다. Windows 실행 래퍼 오류가 있어 `node node_modules/eslint/bin/eslint.js ...`로 직접 실행했다.
- `pnpm test:rfp-source`: 통과. 단일 첨부·문서함 동일 파일/바이트·권한·삭제/확장자 보호·제한·DB 저장/리비전·중복 요청·취소·동시 수정/원본 변경 충돌·DB 실패 보상 정리·가드레일·사용량·작업 만료·복합 FK 격리·DOCX/XML 방어·편집 권한 철회 콜백 검증.
- `node scripts/test-documents.mjs`: 통과. 일반 문서함 및 ONLYOFFICE 기존 회귀.
- `pnpm test:project-permissions-rfp`: 통과. 역할×탭×CRUD, RFP 저장/부분 수정/이력 및 기존 AI 저장 도구 회귀.
- `pnpm test:project-permissions-rfp-browser`: 통과. 수동 저장·재조회·권한 변경 즉시 반영·조회 전용 화면 회귀.
- `pnpm test:ai`: 통과. 채팅·가드레일·실제 PDF/DOCX 파서·토큰·중지/재시도·암호화 첨부·원자적 저장 회귀.
- `pnpm test:rfp-source-browser`: 통과. 모의 S3 서버의 SDK 쿼리 처리 오류를 수정한 뒤 재검증했다. 실제 업로드·공통 확인창/취소·DB 생성·편집본 보호·문서함 동일 파일/다운로드·390px 밝은/어두운 테마·해제 후 파일/문서 보존·조회 전용 admin을 확인했다.
- 변경 범위 `git diff --check`: 통과. 작업 전부터 존재한 다른 파일의 공백 경고는 수정하지 않았다.

## 미완료 사항

- 요청한 초기 기능의 미완료 사항은 없다.
- 기존 `023` 마이그레이션의 기록/실제 스키마 불일치는 이번 기능 범위 밖의 기존 문제로 남긴다. 신규 031은 연결 DB에 정상 적용됐다.
- 실제 모델의 문서 추출/매핑 품질, 스캔 문서 OCR·HWP 계열·대형 문서 분할, 운영 R2 실패 후 고아 객체의 정기 점검 자동화는 이번 초기 범위에 포함하지 않는다. 업로드 보상 정리 실패 시 객체 식별 정보를 서버 로그에 남겨 재처리할 수 있게 했다.
