# AI 채팅 대상 페이지 선택 및 대화방별 저장 구현

- 작성일: 2026-11-05 (한국시간, Asia/Seoul)
- 기준: [최신 설계 문서](../../history/2026-11-05/AI채팅-대상페이지-선택-대화방저장-설계.md)를 다시 읽고 권장안을 적용했다.
- 진행 상태: 구현 및 DB 적용 완료.

## 주요 변경사항

- 프롬프트 위에 실제 현재 위치와 별도의 `AI 대상` selectbox를 배치했다. 같은 프로젝트 안에서 화면 이동 없이 대상을 변경하며 프롬프트·조회·도구·쓰기 권한·결과 제목이 같은 target을 사용한다.
- 새 방은 새 채팅 클릭 시 현재 위치로 초기화하고, 영속 방은 선택 즉시 target과 버전을 저장한다. 화면 이동·재열기·새로고침에도 방별 대상을 복원한다. 프롬프트·이미지·모델은 대상 변경으로 초기화하지 않는다.
- 서버는 대화방·계정·워크스페이스·프로젝트 범위를 확인하고 CAS 및 생성 잠금으로 동시 변경·오래된 요청을 거부한다. 읽기 전용 권한과 팀 공유 자격을 재검증하며 오래된 메타데이터 응답이 최신 target을 덮어쓰지 않게 했다.
- 메시지와 생성 요청에 실행 target/version snapshot을 기록한다. 메시지의 기존 pathname/tab에는 실제 화면을 남겨 화면과 실행 대상을 구분한다.
- 문서함 초기 위치는 보존하되 지원 대상을 선택하기 전에는 생성하지 않는다. 설정·관리자 화면의 기존 AI 노출 정책을 유지한다. 이력 미저장 임시 방은 기존 정책대로 메모리에서만 대상을 유지한다.
- 기존 방은 마지막 유효 메시지 위치로 복원하고 빈 방은 첫 열기에 현재 위치를 한 번 초기화한다. 기존 pathname/tab API 호출은 호환 변환하되 저장 target과 다르면 조용히 덮어쓰지 않고 409를 반환한다.

## 변경 파일

- `lib/ai-target-pages.ts`, `lib/ai/resolve-target.ts`, `lib/ai/conversation-targets.ts`: 공통 대상 카탈로그·권한/실행 context·CAS 저장.
- `lib/ai-context.ts`, `lib/ai/conversations.ts`, `stores/workspace.ts`: DTO·목록/메시지 조회·버전 기반 병합.
- `app/api/ai/conversations/route.ts`, `app/api/ai/conversations/[convId]/route.ts`, `app/api/ai/chats/route.ts`: 초기화·저장·복원·실행 snapshot 및 충돌 처리.
- `components/ai/use-ai-target.ts`, `ai-chatbot.tsx`, `ai-chatbot.css`, `ai-conversation-menu.tsx`, `ai-workspace-layout.tsx`: 선택 UI·상태·표시·신규 방 초기값.
- `lib/ai/page-prompts.ts`: 실제 화면과 AI 대상 구분 지침.
- `db/migrations/036_ai_conversation_targets.sql`: 스키마와 기존 방 target 복원.
- `scripts/check-ai-targets.mjs`, `test-ai-target-migration.mjs`, `check-ai-target-browser.mjs`: 신규 API·이관·브라우저 검증.
- `scripts/test-ai.mjs`, `test-rfp-source.mjs`, `test-navigation-browser.mjs`, `check-ai-conversations.mjs`, `check-ai-crud.mjs`, `scripts/lib/ai-target-client.mjs`: target 계약에 맞춘 기존 회귀와 실행 진입점.
- `package.json`, `components/ai/README.md`, 본 문서, `WORK_HISTORY.md`: 검증 명령과 문서 기록.

## DB 변경 여부

- `ai_conversations`에 target/버전, `ai_prompt_chats`와 `ai_generation_requests`에 실행 target/버전 snapshot을 추가했다. 프로젝트/공통 방 target 범위를 DB 트리거로 제한한다.
- 설정된 DB에 `036_ai_conversation_targets.sql`만 트랜잭션으로 적용하고 적용 기록·추가 컬럼·기존 방/메시지/이미지/생성 요청 행 수 보존을 확인했다.
- 사전부터 별도로 미적용 상태였던 `023_toast_colors.sql`은 이번 작업에서 적용하거나 수정하지 않았다. 연결 정보·회원 데이터·키는 기록하지 않는다.

## 검증 결과

- 타입 검사 및 변경 소스·검증 스크립트 ESLint: 통과.
- 프로덕션 빌드: 최종 생성 잠금 날짜 비교 보완 후 재실행까지 통과. 정적 페이지 생성 중 기존 `Request failed Error` 로그가 출력되지만 빌드는 정상 종료했다.
- `node scripts/test-rfp-source.mjs --targets-only`: 통과. 현재 위치 초기화·즉시 저장·교차 탭 실제 산출물 등록·메시지/요청 snapshot·동시 CAS·생성/중지 잠금·권한·미지원 문서함·임시 방 정책 확인.
- `node scripts/test-ai-target-migration.mjs`: 통과. rowid/레거시/미지원/빈 방 복원, 원본 방/메시지/이미지 보존, FK·범위 제약, 이관 실행기 재실행 확인.
- `node scripts/test-ai.mjs`: 전체 통과. 대화·CRUD·권한·이미지·토큰·중지·가드레일 기존 회귀 확인.
- 전체 프로젝트 탭 RFP 컨텍스트 회귀: 통과.
- 기존 채팅방 마이그레이션 회귀: 통과. 메시지 ID·프로젝트 범위·암호화 이미지 원본 보존 확인.
- 실제 Chrome target 검증: 통과. 화면 이동 없는 선택·입력문/이미지 보존·실제 생성·즉시 저장·재접속 복원·탭 이동·저장 실패·생성 중 잠금·팝업·모바일/다크·문서함·임시 방 확인.
- 생성 요청의 SQLite 기본 날짜와 ISO 날짜를 동일하게 비교하도록 보완한 뒤 API target 검증을 다시 통과했다. 외부 AI는 모의 처리했으며 실제 유료 모델 품질은 검증 범위에 포함하지 않았다.

## 미완료 사항 및 재개 정보

- 기능 구현상 미완료 사항은 없다. 문서함 자체 AI 지원은 설계 범위에 따라 제외하고 지원 대상 선택 안내를 제공한다.
- 이번 작업 전부터 존재하던 다른 소스·설계/작업 문서·HISTORY/PROMPT 변경사항은 보존했다.
