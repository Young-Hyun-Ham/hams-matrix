# AI 공유 답변 등록·승인·조건 매칭·재사용 구현

- 작성일: 2026-11-17 (한국시간, Asia/Seoul)
- 기준: [최신 설계 문서](../../history/2026-11-17/AI공유답변-의미조건매칭-재사용-설계.md)를 다시 읽고 구현했다.
- 상태: 구현 및 구성 DB 적용 완료. 검증 결과와 기존 전체 AI 회귀 fixture의 실패 원인은 아래에 기록한다.

## 주요 변경사항

- 질문/답변별 공유 등록 버튼과 프로젝트 공유 답변 관리 창을 추가했다. 등록자는 조건·질문 별칭·공개 적합성을 확인하고 owner/admin이 원문·근거·별칭·조건을 검토한 뒤 승인한다. viewer는 조회만 허용한다.
- 동일 workspace/프로젝트 안에서 공유 답변을 일반 RAG보다 먼저 찾는다. 승인된 대표 질문/별칭에 정확히 연결되고 근거가 유효한 경우 불변 원문을 그대로 반환하며 업무 도구와 답변 생성 LLM은 호출하지 않는다.
- 유사 질문은 강제 조건을 먼저 비교하고 도구 없는 모델로 관련 후보를 판정한 뒤 안내·원문 열람·새 답변 생성을 제공한다. 후보 클릭을 조건 일치 승인으로 해석하지 않는다. 새 답변 생성은 추천을 건너뛰어 기존 RAG/LLM으로 진행한다.
- 모델을 통한 유사 후보 판정은 기존 `orchestration` 목적과 별도 call index로 실제 토큰을 기록한다. 가드레일·제목 호출은 발생할 수 있으며 재사용을 무조건 무료/토큰 0으로 표시하지 않는다.
- 새 답변에 실제 페이지/RAG/읽기 도구 입력·출력 hash와 공용 자료 전체 manifest를 기록한다. 출처·관계·집합 추가/삭제·버전/hash 변경을 반환 직전까지 검사한다. 기존 답변의 추적 정보는 unknown으로 남겨 소급 등록하지 않는다.
- 개인 이력·첨부·개인화·민감정보·실행 결과·기간/실시간·상대 시간 표현·생략된 자료·미지원 출처·미지정 대상은 등록/자동 반환에서 제외한다. 원문을 자동으로 가공하거나 비식별화하여 공유하지 않는다.
- 자료가 바뀌면 공유 후보에서 제외하고 관리 화면에 재검토 필요 상태를 표시한다. 최신 자료로 생성한 새 답변을 기존 공유 항목의 새 불변 버전으로 등록·재승인할 수 있다. 철회한 항목은 새 항목으로 등록해야 한다.
- 후보·원문·이력 조회의 현재 권한과 정책을 검사하고 private/no-store를 적용했다. 재검증 중에는 과거 캐시 원문을 표시하지 않는다. 철회된 원문은 B 이력에서도 숨기며, 오래된 공유 답변은 새 생성 문맥의 사실 근거로 전달하지 않는다.
- 기존 미커밋 변경(PROMPT, RAG 관리 UI/워커, 의존성 잠금파일, 공통 스타일 등)을 보존했다. 이미 수정 중이던 package.json에는 테스트 명령만 추가했다.

## 구현한 정책과 초기 범위

- 유효한 현행 플랜·프로젝트 배정을 확인하며 별도 Business owner 전용 제한을 추가하지 않았다. 등록은 owner/admin/member, 승인·반려·새 버전 등록은 owner/admin, 열람은 현재 조회권한이 있는 참여자에게 허용한다.
- 자동 반환은 검토된 질문 표현에 한정한다. 유사도 점수나 모델 판정만으로 자동 반환하지 않는다. 조건 충돌·미확정 대상·복수 exact 후보는 자동 반환하지 않는다.
- 대상은 관리번호 또는 프로젝트/RFP를 명시해야 한다. 선택한 화면·‘그 문서’ 같은 개인 문맥을 대상 식별자로 사용하지 않는다.
- 날짜·현재/지난주/진행률 등 시간 의미를 안정적으로 검증하는 과거 snapshot 계약은 아직 지원하지 않아 기간 질문 전체를 초기 공유 범위에서 제외했다.
- 파일·연결된 과거 snapshot의 콘텐츠 불변성이 보장되지 않으므로 해당 자료가 있는 프로젝트는 최초 공유 등록에서 보수적으로 제외한다. 개인정보 자동 탐지만으로 승인하지 않고 사람의 공개 적합성 검토도 요구한다.
- 목록은 최근 100개, 의미 판정은 강제 조건을 통과한 최대 20개/40,000자 안에서 수행한다. 예산 초과·판정 장애는 공유 반환을 승인하지 않고 기존 생성 경로로 진행한다.
- 조회에서 계산한 재검토 상태는 GET으로 DB에 쓰지 않는다. 동시 변경이 최종 저장 직전에 발생하면 원문 반환을 막고 409로 재질문을 안내한다. 중지/중복 실행 경계를 보존하기 위해 자동 요청 재실행은 하지 않는다.

## 변경 파일

- 채팅 통합: `app/api/ai/chats/route.ts`, `lib/ai/orchestration.ts`, `lib/ai/conversations.ts`, `lib/ai-context.ts`.
- 공유 자원·매칭·추적·출력 정책: `lib/ai/shared-answers.ts`, `shared-answer-types.ts`, `shared-answer-matching.ts`, `shared-answer-output.ts`, `answer-provenance.ts`.
- API: `app/api/projects/[projectId]/shared-answers/route.ts`와 `[answerId]` 상세·review·revoke 경로.
- UI: `components/ai/ai-chatbot.tsx`, `ai-conversation-messages.tsx`, `shared-answer-dialog.tsx`, `shared-answer-candidates.tsx`, `styles/ai-chatbot.css`, `lib/query/keys.ts`.
- DB/검증: `db/migrations/050_project_shared_answers.sql`, `scripts/migrate.mjs`, `scripts/test-shared-answers.mjs`, `scripts/test-shared-answers-browser.mjs`, `scripts/test-ai-settings-reviews.mjs`, `package.json`.
- 안내: `README.md`, `AGENTS.md`, `CLAUDE.md`, `components/ai/README.md`, `WORK_HISTORY.md`, 이 기록.

## DB 변경 및 적용

- **DB 변경 있음.** 기존 개인 답변에 `provenance_json`(기본 `{}`), `shared_answer_id`, `shared_answer_version`을 추가했다. 기존 개인 답변과 업무 자료를 삭제하거나 일괄 공개하지 않았다.
- 공유 자원·불변 버전·감사 이벤트·만료되는 선택 정보·등록 멱등성 테이블을 추가했다. 프로젝트 복합 FK와 버전 UPDATE 금지 trigger를 적용했다.
- 구성 DB의 049 적용을 확인한 뒤 **`pnpm db:migrate --only 050_project_shared_answers.sql`만 적용했다.** 관련 없는 migration은 적용하지 않았다.
- 적용 후 050 기록·신규 컬럼 존재를 확인했고 `PRAGMA foreign_key_check` 위반은 **0건**이다. 접속정보·키·토큰·업무 본문은 출력하거나 이 기록에 남기지 않았다.
- 다른 환경에서는 049까지 적용한 뒤 050만 선택 적용해야 한다. 애플리케이션은 새 스키마를 필요로 한다. 되돌릴 경우 기존 데이터 보존을 위해 컬럼/테이블 삭제 대신 기능 경로를 중단한다.

## 검증 결과

- 통과: 공유 답변 통합 테스트(실제 인증/route + 임시 SQLite + 모의 AI), Chrome UI 테스트, 타입 검사, 변경 코드 ESLint.
- 통과: `pnpm test:project-rag`, `pnpm test:ai-settings-reviews`, `pnpm test:ai-tool-execution`, `node scripts/test-ai-chat-pagination.mjs`, `pnpm test:dashboard`, `pnpm test:query-audit`(미분류 호출 0).
- 통합 테스트는 승인 전 비공개, 승인된 별칭 원문 동일성, 생성/쓰기 도구 미호출, 유사 후보와 새 생성, 조건 충돌, 다른 프로젝트/미배정 차단, 개인 문맥/민감정보/미추적 도구 제외, 자료 변경과 생성 중 경합, 새 불변 버전 재승인, 멱등성, 철회 후 이력 보호, FK/버전 불변성을 확인한다.
- 브라우저는 등록 확인/중복 방지, 검토 체크·버전 전달, 정확한 원문/줄바꿈, 근거 재검증 실패 시 캐시 본문 미노출, 새 답변 선택을 확인한다.
- 기존 승인 테스트가 049까지만 준비하던 fixture를 050까지 갱신하고 기존 행과 새 기본값 보존을 추가 검증했다.
- 프로덕션 빌드는 종료 코드 0으로 완료됐다. 사전 렌더링 중 일부 `Request failed Error` 로그가 있었으며 빌드 자체는 성공했다.
- **전체 `pnpm test:ai`는 기존 이미지 접근권한 fixture에서 중단됐다.** `scripts/check-ai-images.mjs:137`이 호출한 기존 `scripts/test-project-role.mjs`가 프로젝트 owner_id를 바꾸려 하지만, 041의 `project_owner_immutable` trigger가 `Project ownership transfer is not allowed`로 거절한다. 이 helper와 trigger는 이번 작업에서 변경하지 않았다. 소유권 보호를 약화하여 테스트를 통과시키지 않았다. 이미지 테스트 앞부분의 인증·암호화·위변조·롤백 확인까지 진행했으나 뒤의 전체 HTTP 항목이 모두 통과했다고 간주하지 않는다.
- 운영 DB를 회귀 fixture로 사용하지 않았다. 구성 DB에는 선택 migration 적용 및 스키마/무결성 확인만 수행했다.

## 후속 범위·재개 정보

- 광범위한 임베딩 색인, 미등록 표현의 모델 판정에 의한 자동 반환 확대, 고정 과거 기간/실시간 지표, 파일 콘텐츠 digest, 세분화된 자료별 ACL, 감사 보존기간 자동 정리는 후속 범위다. 현재 구현은 설계의 보수적인 최초 활성화 범위를 사용한다.
- 확대 전에 별도 합성 평가 세트로 오수락률·임계값·지연·비용을 확정해야 한다. 현재 모델은 후보 안내만 결정하며 조회·실행 권한이나 강제 조건을 바꿀 수 없다.
- 전체 HTTP 회귀를 마무리하려면 소유자 변경에 의존하는 예전 fixture를 실제 비소유 참여자의 접근권한 회수 시나리오로 바꿔야 한다. 현재 공유 답변 전용 통합/브라우저 검증과 별도 승인·RAG·도구·이력·대시보드 검증은 통과했다.
- 검증 재개 명령: `pnpm test:shared-answers`, `pnpm test:shared-answers-browser`, `pnpm typecheck`, `pnpm build`. 테스트는 운영 환경 파일을 로드하지 않으며 브라우저는 설치된 Chrome을 사용한다.
