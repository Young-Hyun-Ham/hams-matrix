# WBS AI 제안요청서 수행 및 관리 참조 연계

- 작성일: 2026-11-03 (한국시간)

## 주요 변경사항

- WBS 챗봇 조회 시 기존 산출물에 더하여 동일 프로젝트의 저장된 제안요청서를 조회한다.
- 기존 `readRfp` 함수를 사용해 제안요청서 READ 권한, `project_id`, `workspace_id`, 삭제 여부를 검사한다.
- AI 문맥의 `rfp`에 문서 ID·버전·제목, 사업 시작/종료일, `delivery` 전체(일정·조직·품질·보안·위험·지원 관리)를 전달한다. 제안요청서 다른 장과 원본 첨부 파일은 이번 조회 대상이 아니다.
- 최초 요청의 `pageContext`와 `read_page` 도구가 공통 조회 함수를 사용하므로 두 경로 모두 반영된다. 도구 재조회는 최신 저장 내용을 읽는다.
- 기존 `total`은 산출물 건수로 유지하고 `rfpAvailable`을 별도로 제공한다. 산출물 0건이어도 제안요청서를 근거로 WBS 초안을 작성하도록 WBS 안내를 보완했다.
- 저장된 제안요청서가 없거나 삭제된 경우 `rfp=null`, `rfpAvailable=false`를 반환한다. 상대 기간의 기준일이나 공수가 불명확하면 AI가 확인하도록 명시했다.
- 다른 탭의 문맥과 기존 저장 권한·명시적 등록 요청 규칙·가드레일 동작은 유지한다. 미저장 화면 편집본은 참조하지 않는다.

## 변경 파일

- `lib/ai/page-data.ts`: WBS 전용 제안요청서 조회 및 문맥 제공.
- `lib/ai/page-prompts.ts`: 수행 및 관리 참조, 문서 존재 여부 및 날짜 불명확 시 확인 지침.
- `scripts/check-wbs-rfp-context.mjs`: 실제 조회 함수와 도구 통합 검증.
- `scripts/test-rfp-source.mjs`: `--wbs-context-only` 실행 옵션 추가.
- `WORK_HISTORY.md`: 작업 기록 링크 추가.

## DB 변경 여부

- 스키마와 운영 DB 데이터 변경 없음. 기존 `project_rfp_documents`를 읽는다.
- 검증 데이터는 분리된 임시 SQLite에만 생성했다.

## 검증 결과

- `node scripts/test-rfp-source.mjs --wbs-context-only`: 통과.
  - 산출물 0건에서도 저장된 제안요청서의 일정·관리·기준일 전달.
  - 실제 `read_page` 도구 결과와 최초 문맥의 제안요청서 일치.
  - 문서 수정 후 도구 재조회 시 최신 관리 내용과 버전 전달.
  - 다른 탭에 제안요청서 문맥이 추가되지 않음을 확인.
  - 프로젝트·워크스페이스 격리 및 없는/삭제된 문서 처리 확인.
- `node node_modules/typescript/bin/tsc --noEmit`: 통과.
- 변경 코드 및 검증 스크립트 ESLint: 통과.
- 변경 소스 `git diff --check`: 통과.

## 미완료 사항

- 없음. 실제 외부 AI를 호출하는 생성 품질 검증은 수행하지 않았으며, AI 입력 데이터와 도구 조회 경로를 검증했다.
