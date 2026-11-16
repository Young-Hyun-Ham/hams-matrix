# AI 챗봇 2계층 오케스트레이션·프로젝트 벡터화 구현

- 작업일: 2026-11-16 (한국시간, Asia/Seoul)
- 상태: 소스 구현·DB 적용 완료. 최종 검증 결과를 아래에 기록한다.
- 기준: 사용자가 지정한 설계 문서의 최신 내용을 다시 읽었다. 기존 HISTORY.md·설계 문서·PROMPT.md 변경을 보존한다.

## 주요 변경사항

- 1-layer에서 규칙과 모호한 요청의 JSON 구조화 LLM 판정으로 RAG/최신 업무 조회/실행을 구분한다. 분류 실패는 조회·확인 질문으로 처리하며 분류 결과가 쓰기 권한을 만들지 않는다. 기존 RFP 탭의 “작성해줘” 동작도 보존했다.
- 2-layer의 Responses 도구 반복·관찰·중지·deadline·가드레일·HITL·원자 저장을 유지하고 읽기 경로의 도구 목록과 execute를 모두 제한했다. 현재 원본과 검색 근거를 출력/저장 직전 재확인하고 출처 링크·버전을 보관/표시한다.
- OpenAI 입력 키를 별도 서버 키의 AES-GCM으로 프로젝트 범위에 암호화한다. 키 기준 모델 목록에서 text-embedding 계열만 반환하며 챗봇 서버 키로 자동 대체하지 않는다.
- RFP 전체·전체 현재 산출물/연결·문서함 지원 파일·화면설계 보드 텍스트·DB 도메인·연결된 원본 출처를 수집한다. 임베딩 배치·사용량 예약/정산·원본별 진행/미지원/실패를 기록한다. 개인 대화와 미승인 변경안은 제외한다.
- DB 큐·lease·checkpoint·멱등 작업 키로 백그라운드 처리한다. 검증된 새 세대만 원자 발행하며 실패/취소/원본 충돌 시 기존 검색본을 유지한다. 동일 원본/모델 벡터는 재사용한다.
- 참여 프로젝트 카드와 프로젝트 선택 옆에 의도분류 버튼·모델·KST 초 단위 성공 발행 시각을 제공한다. 키 입력 모달과 작업 중지·미지원/실패 상세·자료 변경 상태를 추가했다. 대시보드 상태는 일괄 요약하며 키·본문·벡터를 포함하지 않는다.
- 사용량에 의도분류/임베딩 purpose와 별도 합계를 추가했다. README·AGENTS·CLAUDE와 WORK_HISTORY를 갱신했다.

## DB 변경 여부

- 신규 migration: `048_project_rag_orchestration.sql`. 7개 신규 테이블·복합 범위 FK·활성 작업 제한·출처 저장 컬럼을 추가한다.
- 구성 DB: 047까지 적용된 상태를 확인한 후 `node --env-file=.env scripts/migrate.mjs --only 048_project_rag_orchestration.sql`로 **048만 적용 완료**했다. 관련 없는 pending migration은 적용하지 않았다.
- 적용 후 신규 테이블 7개와 migration 기록을 확인했고 `PRAGMA foreign_key_check` 결과는 0건이다. 기존 프로젝트·산출물·대화·불변 이력을 수정/삭제하는 SQL은 포함하지 않았다.
- 입력 API 키 보관에 필요한 별도 암호화 설정을 무시된 `.env`에 생성했다. 기존 값이 있으면 보존하는 `scripts/setup-ai-credential-key.mjs`를 추가했고 `.env.example`에는 빈 항목과 생성 명령만 추가했다. 웹/워커가 실행 중이었다면 새 설정을 읽도록 재시작해야 한다.
- 키 값·비밀번호·토큰은 이 문서에 기록하지 않는다.

## 변경 파일

- 서버: `lib/ai/{credentials,embeddings,rag-types,rag-chunks,rag-sources,project-rag-permissions,project-rag,rag-worker,rag-retrieval,intent-classifier,orchestration}.ts`, 채팅 route·사용량 API/타입/추적·대화 조회·가드레일의 서버 비밀 검출 목록·AI context 타입.
- API: `app/api/projects/[projectId]/rag/` 하위 상태·모델·작업·중지 route.
- UI: `components/ai/project-rag-control.tsx`, 참여 프로젝트 카드·프로젝트 상단·출처 표시·Query key·대시보드 요약·CSS.
- 실행: `scripts/rag-worker.mjs`, 기존 supervisor·`scripts/migrate.mjs` prerequisite·키 설정 스크립트·`package.json` 명령.
- 검증: `scripts/test-project-rag.mjs`, `test-ai-settings-reviews.mjs`의 신규 migration/보존 검사, `test-dashboard-browser.mjs`의 RAG UI 검증, `audit-query-fetch.mjs`의 명시 명령/서버 호출 분류.
- 안내: `README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md`, `.env.example`과 이 작업 기록.

## 검증 결과

- 검증은 임시 DB·합성 자료·모의 공급자를 사용했다. 구성 DB에서는 schema 적용 상태·벡터 함수 호환성·FK 무결성만 확인했으며 업무 데이터로 회귀 테스트하지 않았다.
- 통과: `pnpm typecheck`, 이번 변경 파일 대상 ESLint, `pnpm build`, `node scripts/rag-worker.mjs --check`, `pnpm test:query-audit`(미분류 0건).
- 통과: `pnpm test:project-rag` — 300건 초과 자료/긴 RFP, 지원 텍스트 파일과 미지원 집계, 모델/키·권한 격리, 멱등/동시 시작, 완전한 세대 발행, native/전수 검색, 오래된 근거 차단, 벡터 재사용, 중지·실패·원본 충돌, 사용량·FK를 확인했다. 구조화 분류의 손상 응답/권한 확대 차단과 lease 만료 복구·이전 워커 재발행 차단도 검증 대상으로 포함했다.
- 통과: `pnpm test:ai-settings-reviews`, `pnpm test:ai-tool-execution`, `pnpm test:dashboard`, `pnpm test:deliverable-background`.
- 통과: 최종 빌드의 `pnpm test:dashboard-browser` — 대시보드 카드와 프로젝트 상단 선택 상자 옆 버튼·모델/KST 시각·키 입력 모달, 기존 SSR/필터/뒤로 가기/권한·빈 상태·4개 viewport/테마를 확인했다. 스크린샷은 무시된 `.auth-tests/dashboard/`에 생성했다.
- 전체 `pnpm lint`는 이번에 변경하지 않은 `scripts/test-wbs-view.mjs`의 module 변수 금지·최상위 Hook 호출 2개 오류와 기존 경고 9건으로 실패했다. 해당 파일은 수정하지 않았고 변경 파일 별도 lint는 통과했다.
- 전체 `pnpm test:ai`는 이미지 권한 검증 fixture의 `temporaryProjectViewer()`가 `projects.owner_id`를 UPDATE하면서 기존 소유권 변경 금지 트리거에 차단되어 중단됐다. 실제 오류 위치는 `scripts/test-project-role.mjs`이며 업무 권한·소유권 정책을 바꾸어 우회하지 않았다. 관련 AI 실행·승인 회귀는 별도 통과했다.
- WORK_HISTORY 기존 목록 보존, 작업 링크/날짜, README·AGENTS·CLAUDE의 작업 기록 링크와 변경 파일 공백 검사를 확인했다.

## 미완료 및 재개 정보

- 웹/워커 재시작 후 프로젝트의 의도분류 모달에서 실제 임베딩 키와 모델을 선택하면 사용할 수 있다. 서버리스에서는 `pnpm worker:rag`를 별도 Node 24+ 상시 프로세스로 실행해야 한다. 실제 사용자 키를 입력하거나 유료 프로젝트 벡터화를 대신 시작하지는 않았다.
- 정책 선택: owner/admin 관리, 현재 업무 데이터 전체·지원 파일, 수동 재구축, 프로젝트 공용 키 사용 범위 안내, 파일 추출 실패 시 신규 발행 보류, 성공 시각은 KST의 published_at. 음성 Realtime·외부 API 커넥터는 추가하지 않았다.
- 설계 권장안과의 구체화: RAG 미구축/장애에서 조회는 최신 원본으로 대체한다. 기존 명시적 실행 요청도 최신 원본·기존 권한·HITL 검증을 통과할 때 유지하여 RAG 구축 전 기존 작성/저장 기능을 보존했다. 분류가 모호하거나 조회 의도이면 쓰기 도구를 허용하지 않는다.
- 구성 DB와 임시 libSQL에서 저장 Float32 BLOB과 native cosine 호환성을 확인하여 지원 환경은 DB 내부 전체 거리 정렬을 사용한다. 미지원 환경은 전체 유효 청크를 페이지 순회한다. 검색 예산 초과 시 부분 결과 대신 직접 조회로 전환한다. ANN 인덱스·대규모 프로젝트 성능 합격선은 별도 측정 대상이다.
- 실제 모델을 사용한 한국어 정답 평가의 macro-F1/recall·환각 감소율·p95/비용 수치는 아직 측정하지 않았다. 모의 공급자 회귀 결과를 실제 품질 향상 수치로 해석하지 않는다.
- OCR·기존 파일 추출 한도 확대·과거 revision 전체·보드 댓글/메모·자동 증분 색인은 범위에 포함하지 않았다. 원본 변경은 재검사/최신 조회로 처리한다. 이전 세대/폐기 키의 자동 보존기간 정리와 키 폐기 전용 UI는 추가 운영 정책이 필요한 후속 항목이다.
