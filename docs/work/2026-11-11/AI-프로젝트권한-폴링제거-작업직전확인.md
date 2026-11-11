# AI·프로젝트 권한 조회를 작업 직전 확인으로 변경

- 작성일: 2026-11-11 (한국시간)
- 기준: 사용자 후속 지시가 기존 10초 권한 폴링 설계보다 우선한다.

## 주요 변경사항

- `use-ai-target`과 `use-project-access`의 공통 `/api/projects/{projectId}/access` 10초 폴링 제거. 포커스·가시성·재연결에 따른 자동 권한 재조회도 제거했다.
- 챗봇을 열거나 프로젝트가 바뀔 때 조회해 대상 UI를 구성한다. 공통 프로젝트 화면은 진입·프로젝트 변경 시 조회한다. 사용자 명시 재조회 및 실제 권한 변경 이벤트/storage 알림은 유지한다.
- 공통 Query 옵션과 최신 권한 조회 서비스를 분리해 사용자/workspace/project 응답 일치, staleTime 0·retry false, 같은 키의 동시 GET 공유를 유지한다.
- AI 실행과 AI 대상 변경 직전에 최신 READ 권한을 확인한다. 프로젝트 없는 dashboard/team 대상은 현재 사용자·플랜 상태를 다시 확인한다. 확인 실패 시 생성 POST를 보내지 않고 프롬프트·이미지를 유지한다. 확인 중 사용자/공간/대화 변경 및 취소된 요청은 실행하지 않는다.
- 일반 등록·수정·삭제의 기존 `verifyPermission()`을 통한 동작별 최신 권한 확인은 유지한다. 서버의 `validateTarget`, `requireProjectPermission`, 각 AI 도구의 실제 CREATE/UPDATE/DELETE 검증은 변경하지 않았다. AI 도구가 수행할 개별 쓰기는 서버에서 해당 권한을 최종 검증한다.
- 알림 카운터·플랜 확인·생성 복구·플래닝보드의 별도 15초 정책은 이번 범위에 포함하지 않는다.

## 변경 파일

- `lib/query/project-access.ts`
- `components/shared/use-project-access.ts`
- `components/ai/use-ai-target.ts`, `components/ai/ai-chatbot.tsx`
- `scripts/check-ai-target-browser.mjs`, `scripts/test-navigation-browser.mjs`, `scripts/check-ai-targets.mjs`, `scripts/check-ai-window-browser.mjs`
- README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md와 본 기록.

## DB 변경 여부

없음. 마이그레이션·운영 데이터 변경 없음. 임시 SQLite fixture만 현재 workspace 플랜 규칙에 맞췄으며 실제 AI 요청은 모의 제공자로 대체한다.

## 검증 결과

- 변경 소스 lint·`pnpm typecheck`·`pnpm build`·`pnpm test:query-audit` 통과. 기존 정적 생성 Request failed 로그가 있으나 빌드 종료 코드 0. fetch 미분류 0.
- `pnpm test:ai-targets` 통과: 실제 인증·서버 권한 격리·read-only·도구 쓰기·대상 버전 충돌·생성/중지 잠금·임시 대화 정책.
- `pnpm test:ai-targets-browser` 통과: 21초 유휴/포커스 시 access GET 0건, 재열기 시 재조회, 실행 전 403 시 생성 POST 0건·재시도 없음·초안 보존, 명시 재조회 후 복구. 정상 생성·대상 저장/재조회·저장 실패·초안/이미지·창 배치·임시 대화 전체 회귀도 통과.
- 브라우저 fixture는 Team/Free 공간을 분리해 현행 고정 workspace 플랜에 정렬했다. 기존 창 테스트의 버튼 순서를 현재 UI에 맞추고 별도 헤더 카운터 폴링을 AI 요청 없음 검증에서 제외했다. 애플리케이션 창 UI와 서버 권한 규칙은 변경하지 않았다.
- 변경 소스·검증 스크립트 lint 오류 0·경고 0, 변경 파일 diff check 통과.
- 기존 `test:project-permissions-rfp`는 현재 workspace Free/사용자 Team fixture 불일치로 변경 코드 실행 전에 409에서 실패한다. 해당 스크립트와 서버 권한 규칙은 수정하지 않았다.

## 미완료·별도 확인 사항

요청 범위 구현·관련 검증 완료. 위 기존 `test:project-permissions-rfp`의 fixture 불일치는 별도 항목으로 남겼다. 서버의 권한 검증을 완화하지 않았다. 운영 DB에서 테스트하지 않았으며 기존 미커밋 변경을 보존했다.
