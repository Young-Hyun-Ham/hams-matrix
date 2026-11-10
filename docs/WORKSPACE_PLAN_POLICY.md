# 워크스페이스 플랜 정책

- `workspaces.plan`은 생성 시 소유자의 `user_subscriptions.plan_code`를 저장한다. `subscription_plan`은 같은 값을 보존하며 CHECK로 불일치를 방지한다.
- 사용자 구독 변경이나 워크스페이스 소유권 양도는 기존 워크스페이스 플랜을 변경하지 않는다. 플랜 코드는 생성 시 고정되며 해당 코드의 기능·한도는 `plans`의 최신 설정을 조회한다.
- 040 마이그레이션은 기존 워크스페이스를 소유자의 현재 구독으로 한 번 보정한다. 이전 컬럼 값은 `legacy_workspace_plan`, `legacy_subscription_plan`에 보존한다. 이후 재실행으로 플랜을 덮어쓰지 않는다.
- 업무 API의 공통 인증과 프로젝트 접근·권한 검사, AI 사용량 예약은 현재 세션의 워크스페이스 소속과 사용자 구독의 정확한 플랜 일치를 확인한다. 상위 플랜도 다른 코드이면 이용할 수 없다. 관리자 계정도 업무 정책을 우회하지 않는다.
- 불일치는 HTTP 409, `WORKSPACE_PLAN_MISMATCH`, 필요한 플랜과 현재 플랜을 반환한다. 공통 모달은 업무 화면을 막고 `/settings/subscription?reason=workspace-plan`으로 안내한다. 일반 화면·DB설계·기획보드·문서 편집 화면에 적용한다. 열린 화면은 정책 오류 응답, 포커스 및 15초 주기 확인으로 갱신한다.
- 복구를 위한 계정 조회·개인 설정·요금제 변경·워크스페이스 목록/전환/생성은 불일치 상태에서도 허용한다. 새 워크스페이스 생성은 현재 구독으로 시작하며 현재 세션만 새 워크스페이스로 전환한다.
- 프로젝트 보유 한도는 해당 워크스페이스 안에서 사용자가 소유한 프로젝트 수에 적용한다. 프로젝트 산출물 이력은 프로젝트가 속한 워크스페이스 플랜을 따른다.
- AI 토큰·이미지·첨부·대화 이력 정책도 세션의 워크스페이스 플랜을 따른다. 사용량 원장은 기존처럼 사용자 단위이고 구독 변경이나 새 워크스페이스 생성으로 초기화하지 않는다. 서버는 사용량 예약·변경 트랜잭션에서 정책을 재검사한다.

검증: `node scripts/test-workspace-plan-policy.mjs`, `node scripts/test-workspace-plan-browser.mjs`, `node scripts/test-plan-quotas.mjs`, `node scripts/test-team-sharing.mjs`, `node scripts/test-subscription-change.mjs`, `node scripts/test-plan-code-migration.mjs`.

기존 DB 보정: `node --env-file=.env scripts/apply-workspace-plan-policy.mjs`. 039까지 적용된 DB에 040만 트랜잭션으로 반영하며, 소유자 구독 누락·플랜 불일치·외래키 오류 시 롤백한다.

2026-11-09 연결된 DB에 040 적용 완료: 기존 워크스페이스 3개를 소유자의 현재 구독 기준으로 Business 1개, Free 2개로 보정했다. `plan=subscription_plan`과 외래키 무결성을 확인했고 재실행은 `applied=false`로 종료하여 기존 플랜을 다시 갱신하지 않았다. 격리된 DB 정책·구독·AI 한도·팀 권한·플랜 코드 테스트와 실제 Chrome의 모달·요금제 복구·워크스페이스 생성/전환·DB설계/기획보드/문서 편집 화면 검증을 통과했다.
