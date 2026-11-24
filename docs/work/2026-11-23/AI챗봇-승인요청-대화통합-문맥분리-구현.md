# AI 챗봇 승인 요청 대화 통합·문맥 분리 구현

- 작업일: 2026-11-23 (한국시간)
- 기준: [최신 설계](../../history/2026-11-23/AI챗봇-승인요청-대화통합-문맥분리-설계.md)를 다시 읽고 구현했다.
- 상태: 구현·구성 DB 적용·브라우저 검증 완료.
- 기존 미커밋 변경과 설계 문서, 공유 답변 플래그 등 관련 없는 기존 동작을 보존했다.

## 주요 변경

1. 정책 승인 요청을 입력 카드 아래에서 해당 질문의 AI 대화 영역으로 옮겼다. 예/아니요, 대기, 관리자 의견, 재개/취소/중지, 종료 상태를 대화 안에서 확인한다. 관리자 승인과 사용자 변경안 HITL은 별개로 유지한다.
2. 가드레일 승인 여부 선택·승인 대기·승인 후 재개 대기 중 다른 질문을 보낼 수 있다. 같은 방의 복수 승인 요청을 독립 관리하고, 실제 모델 실행만 방당 1건으로 제한한다.
3. 최초 질문 수락 시 서버가 안정적인 turn 순서와 모델 문맥을 고정한다. 새 질문의 문맥에는 완료된 이전 대화만 넣고 대기 질문·응답·이미지·도구 결과는 제외한다. 재개는 원래 질문/첨부와 고정된 이전 문맥을 사용하며 후속 대화를 섞지 않는다.
4. 선택한 이전 이력·첨부·공유 원문의 변경/삭제와 현재 정책·권한·대상·자료 변경은 재검증한다. 무관한 후속 대화 추가나 자동 제목 확정은 승인 무효화 사유에서 제외했다. 완료된 모델·도구 journal은 재사용하며 승인 판정/재개 선점 전 검증의 일시적 DB·서비스 오류에서는 checkpoint를 폐기하지 않는다.
5. 재개 결과를 최초 질문의 turn에 연결해 갱신한다. 후속 대화 위치를 보존하고 현재 작성 중인 새 질문·첨부·모델 선택을 재개 완료 시 초기화하지 않는다. 일반 제출에서도 제출 뒤 편집한 초안을 보호한다.
6. 사용자 검토 버튼은 답변 하단 왼쪽, 결과 크게 보기·다시 사용은 오른쪽에 배치했다. 공유 등록은 오른쪽 보조 작업으로 유지하고 승인·검토·결과 버튼에 챗봇 compact 크기를 적용했다.
7. 승인 상태는 ID/버전별로 병합하며 하나라도 활성 요청이 있으면 보이는 챗봇에서 기존 15초 갱신을 유지한다. 방 삭제 시 대기 checkpoint를 취소·정리하고 승인 감사 이력은 남긴다.

## 설계의 선택 사항 적용

- 버튼: 기존 챗봇 크기(11px, padding 6px 8px)를 재사용한다. 전역 버튼 크기를 바꾸지 않았다.
- 사용자 변경안 검토 `pending`: 기존 방 단위 제약을 유지한다. 가드레일 대기 해제와 구분한다.
- 재개 완료 뒤 새 질문: 완료된 재개 답변도 최초 turn 순서로 이력에 포함한다. 이미 생성한 후속 답변은 소급 변경하지 않는다.
- 구형 051 checkpoint: 암호문을 보존하고 포맷 1은 기존 방 잠금·전체 이력 해시 방식으로 재개한다. 해당 요청이 종료되면 새 요청에 포맷 2를 사용한다. 과거 경계를 추정하지 않았다.
- 차단 질문 표시: 마스킹된 요약만 사용한다. 종료 카드의 상세는 접을 수 있지만 질문 자체는 지우지 않는다.
- 대상 변경은 기존 API로 허용하되 이전 승인 요청은 대상 버전 변경으로 재개가 무효화된다. 방 활동 시각은 질문 수락/완료를 반영한다.

## 변경 파일

- UI: `components/ai/ai-chatbot.tsx`, `ai-conversation-messages.tsx`, `ai-guardrail-approval.tsx`, `ai-change-review.tsx`, `use-ai-conversation.ts`, `use-ai-images.ts`, `styles/ai-chatbot.css`.
- 서버/타입: `lib/ai/conversation-turns.ts`(신규), `conversations.ts`, `guardrail-approvals.ts`, `execution-journal.ts`, `guardrail-approval-types.ts`, `lib/ai-context.ts`.
- API: `app/api/ai/chats/route.ts`, `guardrail-approvals/route.ts`, `guardrail-approvals/[id]/resume/route.ts`, `conversations/[convId]/route.ts`.
- DB/검증: `db/migrations/052_ai_conversation_turns.sql`(신규), `scripts/migrate.mjs`, `verify-guardrail-approvals-schema.mjs`, `test-ai-guardrail-approvals.mjs`, `guardrail-approval-browser.mjs`, `test-ai-chat-pagination.mjs`, `test-ai-chat-pagination-browser.mjs`, `test-ai-settings-reviews.mjs`.
- 문서: `README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md`, 이 작업 기록.

## DB 변경

**변경 있음 / 구성 DB에 052만 선택 적용 완료.** 기존 051 SQL은 수정하지 않았다.

- 신규 `ai_conversation_turns`: 서버 할당 순서, logical request, 승인 상태, 최종 chat 연결을 저장한다. 기존 대화의 rowid 순서를 보존해 이관하고, 기존 INSERT 호출은 트리거로 연결한다.
- 승인 테이블: `turn_id`, `context_version` 추가. 방 단위 활성 unique를 logical request 단위로 변경했다.
- 기존 완료 승인과 답변은 저장된 사용량의 chat 연결이 있으면 복원한다. 구형 대기 checkpoint 원문/암호문은 재작성하지 않는다.
- 적용 명령: `node --env-file=.env scripts/migrate.mjs --only 052_ai_conversation_turns.sql`. 선행 051을 확인하며 다른 미적용 migration은 적용하지 않는다.
- 적용 전후 기존 건수 동일: 대화 34, 이미지 0, 변경안 검토 0, 정책 승인 2, 실행 요청 49. 테스트 자료는 구성 DB에 생성하지 않았다.
- 적용 후 읽기 전용 검사: 외래키 위반 0, 완료 대화 연결 누락 0, turn 범위 불일치 0, 동일 logical request의 중복 활성 승인 0. checkpoint 암호화 설정 정상.

## 검증 결과

회귀는 임시 SQLite·합성 사용자·모의 AI 또는 외부 AI 호출을 차단한 로컬 서버/Chrome에서 수행했다.

| 검증 | 결과 |
| --- | --- |
| TypeScript 및 `pnpm build` | 통과. 초기 sandbox 의존성 접근 실패 후 접근 가능한 실행 환경에서 재검증. 빌드의 기존 정적 페이지 `Request failed Error` 로그는 있으나 정상 종료. |
| 변경 TS/TSX ESLint | 통과. pnpm 하위 프로세스 접근 오류는 ESLint 직접 실행으로 검증했다. |
| `pnpm test:ai-guardrail-approvals` | 통과. 기존 5단계 차단·권한·승인·재개·재차단·HITL·동시 재개와 새 모델 입력 격리, 복수 대기, 원래 위치 연결, 후속 대화 후 cached 출력 재개, 이전 이력 변경 무효화, busy/일시적 검증 오류 시 승인 보존, 구형 포맷 재개, 방 삭제 정리 검사. |
| `pnpm test:ai-guardrail-approvals-browser` | 통과. 관리자 검토/확인, 대화 내 승인 카드, 대기 중 입력 활성, 명시적 재개, 결과 중복 없음, 새 질문/캡처 이미지 초안 보존, HITL 3개 버튼 왼쪽·compact 결과 버튼 오른쪽 정렬, 390px light/dark 가로 넘침 없음 확인. |
| `node scripts/test-ai-chat-pagination.mjs` | 통과. 0/1/10/11/20/25/55건, 같은 시각, 삽입·재조회·사용자/프로젝트 격리, 커서와 외래키 검사. |
| `node scripts/test-ai-chat-pagination-browser.mjs` | 통과. 실제 Query runtime과 React를 사용해 이전 페이지 anchor, 중복 방지, 실패 후 수동 재시도, 소진, 새 답변, 재열기·방 전환을 확인했다. 오래된 fixture의 pnpm 모듈 해석/Query provider도 현재 런타임에 맞췄다. |
| `pnpm test:ai-settings-reviews` | 통과. 052 선택 적용/재실행과 기존 사용자 HITL·설정·제목·알림·버전 검증. |
| `pnpm test:ai-tool-execution` | 통과. 모의 AI와 실제 채팅 경로의 100건 테이블 변경안·FK·원자 저장·권한·실행 제한 검사. |
| `pnpm test:shared-answers` | 기존 항목에서 실패. `test-shared-answers.mjs`의 개인 이력 후속 답변 `shareEligibility.eligible=false` 기대와 현재 소스의 `eligible: !sharedAnswer`가 불일치한다. 작업 시작 전 존재한 플래그/주석을 보존했으며 이번 범위에서 수정하지 않았다. 서버의 공유 등록 시 근거 검증은 유지한다. |
| 구성 DB 스키마/무결성 | 통과. 052 적용 기록·3개 관련 테이블·추가 열·기존 건수 보존과 위 무결성 0건 확인. |

## 미완료 사항 및 재개 정보

- 요청한 가드레일 대기 분리·대화 통합·문맥 고정·버튼 배치는 구현했다. 사용자 변경안 검토 대기 중 새 질문 허용, 이력 미저장 방의 승인 복구, 별도 대화 분기는 이번 범위에 포함하지 않았다.
- 이번 요청 범위에 미구현 사항은 없다. 재검증은 `pnpm test:ai-guardrail-approvals-browser`이며 빌드 산출물이 필요하다.
- 공유 답변 회귀의 기존 실패는 별도 후속 사항이다. 테스트를 통과시키기 위해 기존 사용자 변경이나 공유 정책을 변경하지 않았다.
- 구형 요청은 해당 요청 처리/취소/만료 후 새 요청부터 복수 대기·고정 문맥을 사용한다. 새 배포 환경에는 선행 051 뒤 052만 선택 적용한다.

## 후속 버튼 배치 수정 (2026-11-23)

- 승인 여부 선택의 `아니요`·`예`·`상태 새로고침`과 재개/취소/상세 버튼을 공통 HITL 행에 배치했다. 버튼은 축소하거나 글자를 나누지 않고, 실제 너비가 부족할 때만 다음 줄로 흐른다.
- 변경: `components/ai/ai-guardrail-approval.tsx`, `styles/ai-chatbot.css`. DB 변경 없음.
- 검증: 현재 React/CSS를 사용하는 임시 Chrome fixture에서 넓은 행의 세 버튼 동일 높이, 좁은 행의 자연 줄바꿈·가로 넘침 없음, 기존 대화 페이지/스크롤 회귀를 확인했다. 변경 컴포넌트 ESLint도 확인했다.
