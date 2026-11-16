# AI 챗봇 프로젝트 분석·AI 설정·사용자 승인 구현

- 작성일: 2026-11-16 (한국시간)
- 기준: [최신 설계](../../history/2026-11-16/AI챗봇-프로젝트선택-첫질문제목-설계.md)를 다시 읽고 구현했다. 기존 설계 문서와 HISTORY 변경은 보존했다.
- 진행 상태: 구현 및 구성 DB 046 적용 완료. 관련 집중 검증과 브라우저 검증을 통과했으며 기존 전체 검증의 제한은 아래에 기록했다.

## 주요 변경사항

- 대시보드·팀 공유에서 프로젝트를 검색·선택하고 실제 화면 이동 없이 프로젝트 전체 분석을 수행한다. 선택 전 새 채팅은 로컬 초안이며 입력·첨부를 프로젝트 방에 이어받는다. 기존 공통 방과 프로젝트 탭별 대상은 유지한다.
- 프로젝트 분석은 조회 전용이다. 현재 프로젝트의 RFP·8종 산출물·연결·집계를 권한에 맞게 제공하고, 긴 context를 제한하며 상세 산출물·RFP 장의 추가 조회 도구를 제공한다. 문서함 원문·보드 상세·과거 이력은 포함하지 않는다.
- 신규 방은 첫 정상 저장 질문을 짧은 AI 요약 제목으로 변경한다. 요약 실패 시 대체 제목을 쓰고 수동 제목·기존 방 제목은 보존한다. 제목 버전으로 늦은 응답을 보호하고 제목 호출의 실제 사용량도 기록한다.
- 설정 탭은 토큰 사용량 → 인터페이스 관리 → AI 설정 → 계정 설정 순서다. 개인·현재 workspace별 HITL과 토큰 한도를 버전 검사 후 저장한다. GET은 기본 설정 행을 생성하지 않는다.
- 토큰 한도 초기값은 **1,000,000**이다. 현재 사용자·workspace의 보관된 전체 누적 실제 total을 기준으로 **초과(>) 시 알림**을 표시한다. 가드레일·제목·취소 후 확인된 사용량도 포함하며 duplicate와 반복 snapshot을 중복 합산하지 않는다. 미확인 호출은 별도 표시한다. 월별 리셋·개인 한도 강제 차단은 추가하지 않았으며 기존 요금제 제한을 유지한다.
- 일반 헤더 알림에 활성 토큰 초과 1건을 팀 가입 대기 건수와 합산한다. 팀 공유 미사용자도 AI 알림을 볼 수 있다. 카운터는 기존 15초, 상세는 패널을 열 때 조회한다. 별도 계약 알림을 변경하지 않았다.
- HITL 기본값은 켜짐이다. 산출물·RFP·DB 배치 변경은 검토 대기 후 전체 승인/거절한다. 승인 전에는 업무 데이터가 반영되지 않는다. 수정 요청은 이전 제안을 거절하고 수정 피드백을 질문 입력란에 준비한다.
- 제안은 24시간 보관하며 생성 lease를 붙잡지 않는다. 승인 시 사용자·workspace·프로젝트·대상·정책·원본/연결/도메인 버전을 다시 확인하고 전체 원자 적용한다. 중복 승인은 같은 실행 결과를 반환한다. 미결 제안이 있으면 같은 방의 추가 실행·대상 변경·방 삭제를 막는다.

## 변경 파일

- 설정/알림: `app/(workspace)/settings/page.tsx`, `lib/menus.ts`, `components/ai/ai-settings.tsx`, `lib/ai/user-settings.ts`, `lib/ai/token-budget.ts`, `app/api/me/ai-settings/route.ts`, `app/api/me/notifications/route.ts`, `app/api/me/notifications/count/route.ts`, `components/header-notifications.tsx`.
- 프로젝트/대화: `app/api/ai/projects/route.ts`, 기존 chats/conversations route, `lib/ai-context.ts`, `lib/ai-target-pages.ts`, `lib/ai/{conversations,conversation-targets,resolve-target,conversation-title,project-analysis,page-data,page-prompts,page-tools,rfp-tools,token-types}.ts`, `stores/workspace.ts`.
- 승인: `lib/ai-review-types.ts`, `lib/ai/change-reviews.ts`, `app/api/ai/reviews/[reviewId]/route.ts`, `components/ai/ai-change-review.tsx`.
- UI 연계: `components/ai/ai-project-picker.tsx`, 기존 chatbot/menu/messages/title/dialog/layout/image/target 훅, `styles/ai-chatbot.css`.
- DB/검증: `db/migrations/046_ai_project_analysis_reviews.sql`, `scripts/migrate.mjs`, `scripts/inspect-ai-migration.mjs`, `scripts/test-ai-settings-reviews.mjs`, 관련 기존 AI/브라우저/migration fixture와 모의 공급자, `package.json`.
- 문서: README·AGENTS·CLAUDE, AI 컴포넌트 README, 본 기록과 WORK_HISTORY.

## DB 변경

- 신규 migration 046: `project-analysis` target 허용, 제목 출처/버전, `user_ai_settings`, `ai_change_reviews`와 인덱스·제약 추가.
- 방 테이블은 기존 ID·제목·대상·버전·고정·생성 lease를 보존해 재생성한다. 메시지 테이블을 재생성하지 않아 rowid cursor·본문·첨부 암호문을 보존한다. FK 검사 후 SQLite deferred DROP 검사를 해제한다.
- 기존 방은 `title_source=legacy`로 보존한다. 사용자 설정·제안은 조회만으로 생성하지 않는다.
- 구성 DB 읽기 전용 사전 확인: 원격 libSQL, 기존 방 10건·질문 33건·이미지 0건, 최근 활성 생성 0건, FK 오류 0건. 미적용 파일은 과거 023과 이번 046이었다. 접속 문자열·계정·키는 기록하지 않는다.
- 전체 `pnpm db:migrate`는 대상·범위 미확정으로 자동 승인 검토에서 거부되어 실행되지 않았다. 관련 없는 023을 적용하지 않도록 `--only` 선택 실행을 추가했으며, 046은 기존 045 적용을 먼저 확인한다.
- `pnpm db:migrate --only 046_ai_project_analysis_reviews.sql`로 범위를 제한해 재검토를 통과한 뒤 현재 구성 DB에 **046 적용 완료**. 적용 후 대화방 10건·질문 33건·이미지 0건 유지, FK 오류 0건을 읽기 전용으로 확인했다. 기존 023은 미적용 상태를 유지했다.
- 선택 실행도 기존 045 적용을 확인하고 단일 트랜잭션으로 처리한다. 임시 DB에서 046 단독 실행·반복 실행 및 관련 없는 미적용 023을 실행하지 않는 것을 검증했다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| TypeScript | 통과 |
| 프로덕션 빌드 | 통과. 프리렌더 과정에 일반 `Request failed Error` 출력이 있었으나 빌드 종료 코드 0 |
| `test:ai-settings-reviews` | 설정 기본값/충돌/scope, 프로젝트 목록, 첫 질문/수동 제목, 승인 전후 저장 경계, 중복 승인, 거절, 원본 변경, RFP·DB 배치·수정·삭제, 토큰 경계, 자동 모드 통과 |
| `test:ai-targets` | 기존 대상·권한·잠금·임시 대화 회귀 통과 |
| `test:ai-tool-execution` | 기존 반복 호출 제한·진단·100개 DB 테이블 배치·FK·원자 저장·실제 chats route 회귀 통과 |
| `test:ai-target-migration` | 기존 방/질문/이미지/rowid·FK·반복 실행 보존 통과 |
| `test:query-audit` | 미분류 호출 0건 |
| `test:ai-targets-browser` | 기존 레이아웃·입력·이미지·대상·반응형에 더해 신규 AI 탭·대시보드 프로젝트 선택·입력 이전·제목·승인·헤더 알림 통과 |
| 변경 파일 ESLint | 49개 TS/TSX/MJS 파일, 오류 0·경고 0 |
| 전체 lint | 기존 `scripts/test-wbs-view.mjs`의 module 변수/최상위 Hook 오류 2건으로 실패. 해당 파일은 수정하지 않았다 |
| 기존 `test:ai` 전체 HTTP 회귀 | 합성 fixture의 사용자/워크스페이스 플랜 불일치를 정리한 뒤 재실행했으나, 기존 이미지 권한 fixture `temporaryProjectViewer()`가 프로젝트 소유권을 바꾸려다 `Project ownership transfer is not allowed` 트리거에 막혀 전체 완료하지 못함. 소유권 보호를 우회하거나 완화하지 않았다 |

검증은 합성 계정·임시 SQLite·모의 AI와 격리 Chrome을 사용했다. 운영 DB에 테스트 데이터를 생성하거나 실제 유료 AI를 호출하지 않았다. 브라우저 증거는 테스트가 출력하는 OS 임시 `matrix-navigation-browser-*` 폴더에 저장된다.

## 범위와 제한

- 이력 미저장 대화는 설계의 대안대로 **조회·초안 전용**이다. 영속 proposal 또는 대화/첨부를 몰래 저장하지 않는다. 임시 대화의 암호화 제안 토큰 승인 방식은 구현하지 않았다.
- 승인 대상은 챗봇의 변경 도구다. 별도 일괄 생성·이미지 생성·플래닝보드 편집은 기존 정책을 따른다. 전체 승인만 제공하며 별도 관리자 검토자·부분 승인은 없다.
- 원본·연결·도메인 버전 비교는 프로젝트 전체를 보수적으로 비교하므로 관련 없는 산출물 변경도 이전 제안을 무효화할 수 있다.
- 관리자 정책 version이 바뀌면 기존 검사 결과를 재사용해 실행하지 않고 제안을 무효화한다. 승인 단계에서 새 유료 분류 호출을 만들지 않는다.
- 배포·외부 공개·커밋은 수행하지 않는다. 실제 유료 공급자의 지연·요약 품질은 모의 검증 범위 밖이다.
- 미완료 검증은 기존 전체 lint와 `test:ai`의 기존 fixture 호환성 정리다. 재개 시 `scripts/test-wbs-view.mjs`, `scripts/test-project-role.mjs`와 `check-ai-images.mjs`의 합성 권한 fixture를 현재 소유권 불변 정책에 맞춰 정리한 뒤 전체 명령을 재실행한다. 새 기능의 집중 테스트와 브라우저 검증은 이미 통과했다.
