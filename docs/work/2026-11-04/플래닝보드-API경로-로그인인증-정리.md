# 플래닝보드 API 경로 이동 및 로그인 인증 정리

- 작성일: 2026-11-04 (한국시간, Asia/Seoul)
- 기준: [최신 설계 문서](../../history/2026-11-04/플래닝보드-API경로-로그인인증-정리.md)를 다시 읽고 권장안으로 구현했다.

## 주요 변경사항

- API 진입점을 `app/api/planning/[...path]/route.ts`로 이동하고 기존 진입점을 제거했다. 클라이언트·템플릿·이미지 업로드 응답·검증·테스트 endpoint를 `/api/planning`으로 맞췄다. 서버 서비스와 편집기 화면 URL은 기존 위치를 유지한다.
- 서버 layout에서 세션·guest·온보딩을 확인하고 독립 창의 `useWorkspace.user`를 공통 `User`로 초기화한다. 프로필·현재 사용자 ID는 공통 store를 사용하며, 화면 권한·구성원·AI 정책은 `usePlanningAccess`로 분리했다.
- 최초 접근과 이후 권한 갱신을 구분했다. 401은 사용자 상태를 비우고 재로그인을 안내하며, 403/404·통신/응답 오류는 사용자를 임의로 지우지 않는다. 실패 시 화면·요청을 차단하면서 기존 편집 상태를 유지하고 재확인을 제공한다.
- 중첩 권한 요청의 오래된 응답을 무시하고, 사용자/workspace가 바뀌면 이전 편집기를 차단한다. 화면 scope 변경 시 창별 편집 store와 버전 커서를 분리하고 오래된 응답의 버전 반영을 차단한다.
- 기존 보드·이력의 구 이미지 URL은 응답 DTO와 저장/AI 입력에서 정규화한다. 정확한 상대 경로와 동일 project/screen 여부를 검사하고 실제 자산 소속·만료 검사는 유지한다. 조회 과정에서 저장 자료나 불변 이력을 덮어쓰지 않는다.
- 코드 내보내기의 이미지 탐색 정규식도 새 경로에 맞췄다. 동일 출처·화면 범위를 확인한 비공개 이미지를 포함하여 외부에서도 사용할 수 있게 내보낸다.
- 기존의 다른 미커밋 변경은 보존했다. 소스 해시 대조에서 변경 범위가 플래닝보드 관련 파일에 한정됨을 확인했다.

## 변경 파일

경로 기준은 `hams-matrix/`다.

- 이동: `app/(editor)/planning-board/api/[...path]/route.ts` → `app/api/planning/[...path]/route.ts`.
- 인증·상태: `app/(editor)/planning-board/`의 `layout.tsx`, `stores/editor-provider.tsx`.
- 통신·자산: 해당 기능의 `lib/client-api.ts`, `lib/upload-image.ts`, 신규 `lib/asset-url.ts`.
- 서버: 해당 기능의 `lib/server/handler.ts`, `assets.ts`, `board-service.ts`, `document-validation.ts`, `ai-generation.ts`.
- UI: 해당 기능의 `components/editor-header.tsx`, `left-panel.tsx`, `right-panel.tsx`, `review-dialog.tsx`, `share-dialog.tsx`, `planning-board-editor.tsx`, `ai-screen-generator.tsx`, `preview/page.tsx`.
- 설명·검증: 해당 기능의 `README.md`, `scripts/test-planning-board.mjs`, `scripts/test-planning-board-browser.mjs`.
- 기록: 본 문서와 `WORK_HISTORY.md`.

## DB 변경 여부

- 새 DB 스키마·migration과 운영 데이터 변경은 필요하지 않아 수행하지 않았다. 기존 `032_planning_boards.sql`도 수정하지 않았다.
- 이미지 URL은 애플리케이션 경계에서 처리하며 객체 키·asset ID를 유지한다. 이후 일반 저장은 정규화된 URL을 저장하지만 이력 일괄 수정은 하지 않는다.
- 검증은 임시 SQLite DB와 가짜 사용자·스토리지·AI 응답으로 수행한다. 실제 회원 데이터나 유료 AI 호출은 사용하지 않는다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| `pnpm typecheck` | 통과 |
| 변경 기능 및 두 테스트 스크립트 ESLint | 통과 |
| `pnpm build` | 통과. `/api/planning/[...path]` 등록 및 기존 API route 제거 확인 |
| `pnpm test:planning-board` | 통과. 공통 User/AI 응답 분리, 구 URL 조회·입력 호환, 이력·버전 불변, 잘못된/타 범위 자산 거부와 기존 저장·권한·검토·AI 회귀 포함 |
| `pnpm test:planning-board-browser` | 통과. 실제 새 HTTP endpoint와 옛 주소 404, 독립 창·새로고침의 공통 User 초기화, 비로그인/guest/온보딩 이동, 비 JSON/403/404 복구, 오래된 응답 무시, 세션 만료·사용자 전환, 미저장 상태 보존, SPA scope 분리, 이미지 업로드·내보내기·미리보기, READ 전용·테마·기존 화면 링크 확인 |

- 기본 sandbox 실행은 설치된 의존성 읽기 제한으로 실패하여 권한을 확장한 검증 명령으로 다시 실행했다.
- 삭제된 기존 route를 참조하던 `.next/dev/types/validator.ts` 생성 캐시만 제거하고 타입을 다시 생성했다.
- 빌드 정적 생성 중 일반 `Request failed Error` 로그가 출력되었으나 빌드는 성공했다. 플래닝보드 API 동작은 별도 실제 HTTP·브라우저 시나리오로 검증한다.
- 브라우저 테스트의 새로고침 대기 조건을 문서 로딩 완료 시점까지 기다리도록 보완했다.
- 브라우저 검증에서 발견한 코드 내보내기의 구 API 정규식 의존을 수정한 뒤 재빌드와 전체 브라우저 회귀 검증을 통과했다. 테스트 도구가 DOM 객체 자체를 JSON으로 반환하지 않도록 보완했다.

## 미완료 사항 및 선택 범위

- 요청 범위의 미완료 사항은 없다. 소스 구현·서버 테스트·타입 검사·ESLint·빌드·브라우저 검증을 완료했다.
- 이전 HTTP endpoint의 rewrite와 로그인 후 보드 자동 복귀는 설계의 권장 기본안에 따라 추가하지 않았다. 기존 저장 이미지 URL의 호환 처리는 포함한다.
- 실제 외부 AI·운영 스토리지·실운영 데이터 전체에 대한 검증은 이번 격리 테스트 범위 밖이다.
