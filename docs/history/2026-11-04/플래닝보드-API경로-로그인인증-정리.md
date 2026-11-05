# 플래닝보드 API 경로 이동 및 워크스페이스 로그인 인증 정리 설계

- 작성일: 2026-11-04 (한국시간, Asia/Seoul)
- 대상: `hams-matrix`
- 상태: 검토용 설계. 사용자가 문서를 검토·수정한 뒤 별도 구현을 요청할 예정.
- 선행 문서: [플래닝보드 화면설계서 이식 분석 및 설계](../2026-11-03/플래닝보드-화면설계서-이식-설계.md)
- 분석 기준: 작성 시점의 작업 디렉터리 소스. 기존 미커밋 변경과 신규 파일을 포함한다.

## 1. 요구사항과 작업 경계

1. `app/(editor)/planning-board/api`의 Route Handler를 `app/api/planning`으로 옮기고 실제 호출 endpoint를 일치시킨다.
2. planning-board의 로그인 사용자 판단과 사용자 표시를 `stores/workspace.ts`의 `useWorkspace.user` 기준으로 통일한다. 공통 `User` 타입을 사용한다.
3. 로그인된 사용자는 새 창, URL 직접 접속, 새로고침, 미리보기에서도 화면을 정상적으로 열 수 있어야 한다.
4. 로그인과 프로젝트 권한은 구분한다. 로그인했다고 모든 화면을 열거나 수정할 수 있는 것은 아니며 기존 READ/UPDATE·검토 상태·AI 정책을 유지한다.
5. 이번 단계에서는 이 설계 문서와 `HISTORY.md` 링크만 작성한다. 소스·테스트 코드·패키지·DB·스토리지는 변경하지 않으며 테스트용 DB 생성과 migration 실행도 하지 않는다.

## 2. 현재 구조와 확인 근거

### 2.1 화면과 API

```text
app/
  layout.tsx                               # 공통 root, 로그인 사용자 초기화 없음
  (workspace)/layout.tsx                   # currentUser 확인, WorkspaceShell 사용
  (editor)/planning-board/
    layout.tsx                            # 스타일과 EditorProvider만 구성
    page.tsx                              # PlanningBoardEditor 렌더링
    preview/page.tsx                       # 같은 planning-board layout 적용
    api/[...path]/route.ts                 # 현재 API 진입점
    stores/editor-provider.tsx            # 사용자 Context, 권한 조회, 창별 편집 상태
    lib/client-api.ts                     # 원본 호출을 Matrix API 경로로 변환
    lib/server/handler.ts                 # 인증 후 segments별 업무 처리
    lib/server/{access,board-service,assets,document-validation,...}.ts
stores/workspace.ts                       # 공통 user: User | null, setUser
lib/types.ts                              # User 타입의 실제 선언 위치
lib/auth.ts                               # HttpOnly 세션, currentUser/requireUser
```

- 현재 Route Handler는 `../../lib/server/handler`를 상대 경로로 가져오고 `GET/POST/PUT/PATCH/DELETE`, `maxDuration = 180`, 비동기 `params.path`를 사용한다.
- `boardBase()`는 `/planning-board/api/projects/{projectId}/screens/{screenId}`를 만든다. 템플릿 조회는 `/planning-board/api/templates/{name}`로 별도 변환한다.
- Provider는 일반 `fetch`로 `${boardBase()}/access`를 호출한다. 이미지 업로드는 `boardBase()`를 사용하며, 업로드 응답 URL은 서버 `assets.ts`에서 직접 만든다.
- `boardFetch`는 원본 UI의 `/api/projects`, `/api/generate-screen`, `/api/format-code`, `/template-data?...` 입력을 변환하는 어댑터다. 전역 `fetch`를 교체하지 않는다.
- 화면 진입 주소는 `/planning-board?projectId=...&screenId=...`, 미리보기는 `/planning-board/preview?...`다. API 이동 때문에 화면 URL을 `/planning`으로 바꿀 필요는 없다.

### 2.2 현재 사용자 초기화와 인증

| 위치 | 현재 동작 | 영향 |
| --- | --- | --- |
| `lib/types.ts` | `User`에 id, name, email, workspaceId, workspaceName, role, plan, accountRole, onboardingComplete 등을 선언 | 공통 사용자 타입의 기준 |
| `stores/workspace.ts` | 위 타입을 import하여 `user: User \| null`, `setUser` 제공. 초기값 null, 메모리 저장 | 타입이 이 파일에 새로 선언되는 구조는 아님 |
| `components/workspace-shell.tsx` | 서버에서 받은 `user`를 effect에서 `setUser(user)`로 반영 | `(workspace)` 화면에서 공통 store 초기화 |
| `app/(editor)/planning-board/layout.tsx` | `WorkspaceShell` 또는 `currentUser()`를 사용하지 않음 | 독립 창에서는 공통 store 초기값을 채울 경로가 없음 |
| `stores/editor-provider.tsx` | `/access` 응답의 `User & { aiEnabled, displayName?, nickname? }`를 별도 Context에 저장 | 공통 store와 사용자 상태가 중복됨 |
| Provider 갱신 | 최초·창 focus·15초 간격으로 `/access` 호출, 실패하면 오류 문구만 표시 | 401·403·404·네트워크/응답 형식 오류가 같은 흐름으로 처리됨 |
| `lib/server/handler.ts` | 모든 요청에서 `requireUser()`, 변경 요청에서 `checkOrigin()` 호출 | 서버 세션 검사는 이미 존재 |
| `lib/server/access.ts` | 프로젝트 screen READ/UPDATE, workspace/project/screen 범위 및 삭제 여부 검사 | 로그인 사용자와 리소스 접근 권한은 별개 |

새 창과 새로고침은 부모 창의 Zustand 메모리를 이어받지 않는다. 따라서 사용자 selector만 `useWorkspace`로 바꾸면 로그인된 세션에서도 `user === null`로 남을 수 있다. 독립 진입 시 초기화가 이번 설계의 필수 항목이다.

현재 헤더·왼쪽 패널·검토 모달은 전용 Context의 user를 읽고, AI 생성기와 편집기는 `user.aiEnabled`를 읽는다. 공유 모달은 구성원 목록을 읽는다. 공통 `User`에는 `aiEnabled`, `displayName`, `nickname`이 없다.

### 2.3 확인된 사실과 추가 확인이 필요한 원인

- 설치된 Next.js `16.4.2`의 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`에는 Route Handler를 app 내부에 중첩할 수 있다고 설명되어 있다. 현재 파일 위치만으로 “해당 위치에서는 Route Handler를 등록할 수 없다”고 단정하지 않는다.
- 소스에서 확인한 현재 API 주소와 원하는 새 주소는 다르다. API 진입점을 `app/api/planning`으로 통일하는 변경 자체는 요구사항으로 확정한다.
- 실제 route 인식 오류의 재현, 빌드 manifest, 개발 서버 응답, 프록시·배포 설정은 이번 문서 작업에서 실행 확인하지 않았다. 이동이 기존 장애를 해결하는지는 후속 구현 시 실제 HTTP 요청과 빌드 결과로 검증한다.

## 3. API 이동 설계

### 3.1 이동 단위

- 이전: `app/(editor)/planning-board/api/[...path]/route.ts`
- 이후: `app/api/planning/[...path]/route.ts`
- 새 API 접두사: `/api/planning`
- Route Handler에서 전달하는 segments는 계속 `projects/...` 또는 `templates/...`로 시작한다. 접두사 `api/planning`을 업무 handler에 추가로 전달하지 않는다.
- 새 위치에서는 기존 상대 import가 맞지 않으므로 `@/app/(editor)/planning-board/lib/server/handler` 별칭으로 연결한다.
- 메서드 export, 비동기 params, `maxDuration = 180`과 응답 정책을 보존한다. 관련 서버 서비스는 기존 기능 폴더에 두고 API 진입점만 옮기는 안을 권장한다.
- `/api/planning` 자체는 필수 catch-all의 처리 대상이 아니다. 별도 루트 API가 필요하지 않다면 `[[...path]]`나 빈 경로 handler를 추가하지 않는다.

### 3.2 endpoint 대응표

`B = /api/planning/projects/{projectId}/screens/{screenId}`. 아래 각 `B/...`의 이전 주소는 `/planning-board/api/projects/{projectId}/screens/{screenId}/...`다.

| 새 endpoint | 현재 지원 메서드 | 용도 |
| --- | --- | --- |
| `B/access` | GET | 화면 접근 권한·사용자·AI 정책·구성원·보드 상태 |
| `B/board` | GET, POST, PUT | 보드 조회, 최초/기존 저장 |
| `B/documents` | GET | 동일 프로젝트 화면 목록 |
| `B/comments` | GET, POST | 코멘트 조회·등록 |
| `B/memos` | GET, POST | 메모 조회·등록 |
| `B/memos/{memoId}` | PATCH, DELETE | 메모 수정·삭제 |
| `B/review` | GET, POST | 검토 이력 및 상태 전환 |
| `B/revisions` | GET | 저장 이력 |
| `B/assets` | POST | 비공개 이미지 업로드 |
| `B/assets/{assetId}/content` | GET | 인증·범위 검사 후 이미지 응답 |
| `B/ai/generate` | POST | AI 생성·저장 |
| `B/ai/generate/{requestId}` | GET | AI 요청 상태 조회 |
| `B/ai/history` | GET | AI 요청 이력 |
| `B/format-code` | POST | 해당 화면 범위의 코드 포맷 |
| `/api/planning/templates/{name}` | GET | 허용된 세 템플릿 조회 |

선행 설계서에 있는 범위 없는 `/planning-board/api/format-code`와 달리, 현재 구현과 어댑터는 화면 범위의 `B/format-code`를 사용한다. 이번 변경도 실제 구현의 범위를 유지한다.

### 3.3 호출부와 서버의 동시 변경

1. `client-api.ts`의 `boardBase()`와 템플릿 URL을 새 접두사로 바꾼다.
2. `boardFetch`의 입력 호환과 버전·requestId 삽입, 응답 버전 갱신, BroadcastChannel 통지를 보존한다. 원본 UI의 모든 `/api/projects` 문자열을 일괄 치환하지 않는다.
3. `assets.ts`의 업로드 응답 URL, `board-service.ts`의 자산 범위 검사, `document-validation.ts`의 이미지 URL 검증을 함께 맞춘다.
4. 테스트의 실제 요청 URL과 코드 내보내기 검증에서 사용하는 기존 URL 문자열을 변경한다.
5. README의 API 진입점·폴더 설명을 갱신한다. 과거 이력 문서는 당시 기록으로 유지하고 본 문서에서 후속 설계를 설명한다.

## 4. 저장된 이미지 URL의 영향과 호환 설계

### 4.1 단순 경로 교체로 생기는 문제

`planning_boards.document_json`과 `planning_board_revisions.snapshot_json`의 `layerImages`에는 비공개 이미지 URL이 들어갈 수 있다. 기존 값이 `/planning-board/api/...`이면 새 코드 배포 후 이미지 표시가 깨지거나 새 저장 검증에서 거부될 수 있다. DB를 조회하지 않았으므로 실제 기존 데이터의 존재와 건수는 확인하지 않았다.

또한 `boardDto()`는 현재 JSON을 그대로 펼치고, revisions 응답은 `snapshot_json`을 직접 파싱한다. 클라이언트 호출 주소만 바꾸어서는 과거 문서의 주소가 바뀌지 않는다.

### 4.2 권장안: 읽기·입력 시 정규화

- DB 일괄 치환 없이, 허용된 이전 이미지 경로와 새 이미지 경로를 정확히 파싱하는 공용 순수 함수 후보 `lib/asset-url.ts`를 둔다.
- 기존 문서와 이력을 응답할 때 `layerImages`의 유효한 이전 URL만 새 URL로 변환한 DTO를 만든다. 조회로 DB 문서·이력·버전·갱신 시각을 변경하지 않는다.
- 오래 열려 있던 창의 저장 요청도 이전 URL을 받을 수 있다. 저장 입력을 정규화한 다음 기존 문서 검증과 실제 자산 소속 검사를 수행한다.
- 파싱 결과의 projectId/screenId가 요청 scope와 일치해야 한다. 절대 외부 URL, 다른 프로젝트·화면, 경로 확장, 잘못된 인코딩을 허용하지 않는다. 자산 ID의 workspace·보드·업로더·만료 조건은 기존 서버 검사로 유지한다.
- 새 업로드와 이후 정상 저장은 새 URL을 사용한다. 이미지의 객체 키·파일 본문·asset ID·DB 스키마는 바꿀 필요가 없다.
- AI가 기존 `layerImages`를 재사용하는 흐름, 코드 내보내기의 이미지 fetch, 미저장 미리보기 메시지도 같은 정규화 규칙의 영향을 확인한다. 필요한 경우 클라이언트 수신 경계에 같은 순수 함수를 적용한다.
- 변경 전 창이 직접 요청하는 이전 API 전체를 계속 지원할지는 별도 결정 사항이다. 오래 열린 창은 재접속 안내를 기본안으로 하고, 기존 저장 자료의 호환과 구버전 클라이언트 API 지원을 별도로 판단한다.

## 5. 로그인 사용자와 화면 권한의 상태 설계

### 5.1 상태별 책임

| 상태 | 기준 저장소·타입 | 사용처 |
| --- | --- | --- |
| 로그인 사용자 | `useWorkspace.user: User \| null` | 사용자 표시, 현재 사용자 ID 비교, 로그인된 화면 상태 |
| 세션 유효성 | 서버 `currentUser()` / `requireUser()` | 화면 진입 인증, 모든 API 요청의 최종 인증 |
| 화면 권한과 정책 | 전용 Provider의 access 상태 | canUpdate, status, members, aiEnabled, 권한 조회 상태·오류 |
| 편집 내용 | 기존 창별 vanilla Zustand store | 문서·선택·undo/redo 등 편집 상태 |

`stores/workspace.ts`의 기존 user/setUser 계약은 그대로 재사용하는 안을 권장한다. 다른 화면에 영향을 주는 전역 인증 store 재설계나 `User` 필드 추가는 필요하지 않다. 타입 import는 실제 선언부인 `@/lib/types`를 사용한다.

### 5.2 최초 진입과 공통 store 초기화

1. planning-board 서버 layout에 인증된 사용자 로딩 경계를 둔다. `currentUser()` 결과가 없으면 `/login`, guest이면 `/guest/dashboard`, 온보딩 미완료이면 `/onboarding`으로 이동하는 기존 workspace 정책을 따른다.
2. `cacheComponents: true`인 현재 설정과 root Suspense를 고려하여 동적 인증 조회를 Suspense 아래에 둔다. 해당 경계의 fallback은 로그인 확인 상태를 표시한다.
3. 서버에서 검증한 직렬화 가능한 `User` DTO를 `EditorProvider`에 초기 prop으로 전달한다. 전체 `WorkspaceShell`을 넣어 편집기 주변에 워크스페이스 메뉴를 추가할 필요는 없다.
4. Provider는 effect에서 `useWorkspace.setUser(initialUser)`를 실행한다. render 중 전역 store를 변경하지 않는다. 공통 store 반영이 끝날 때까지 준비 화면을 표시하여 초기 null로 로그인 안내가 잠깐 나타나는 현상을 막는다.
5. 최초 `/access` 조회 성공 후에 화면·미리보기 children을 노출한다. 로그인은 완료됐어도 READ 권한이 없으면 보드 내용을 표시하지 않는다.
6. Provider 해제 자체를 로그아웃으로 보지 않는다. 일반 unmount에서 `setUser(null)`을 실행하지 않는다.

`/access`만으로 공통 store를 채우는 대안도 가능하지만, 인증과 리소스 오류가 최초 진입 한 요청에 묶인다. 서버 layout 인증과 공통 store 초기화가 책임을 더 명확하게 하므로 이를 권장안으로 둔다.

### 5.3 `/access` 응답과 컴포넌트 소비

권장 응답 계약은 `{ user: User, aiEnabled: boolean, canUpdate, status, members }`다. 현재 `user` 내부에 있는 `aiEnabled`를 전용 정책 필드로 옮긴다.

- Provider는 응답 user를 공통 store에 반영하고 별도 user 복사본을 보관하지 않는다. 프로젝트 권한·AI 정책·갱신 상태만 Context에 둔다.
- 헤더·왼쪽 패널·검토 모달의 user selector는 `useWorkspace((state) => state.user)`로 변경한다. 사용자명은 `name`, 필요하면 `email`, 최종 기본 문구 순으로 표시한다.
- 전용 `useUserStore`는 `usePlanningAccess` 같은 의미가 명확한 이름으로 바꾸는 안을 권장한다. 편집기·AI 생성기·검토/공유 모달의 권한 selector를 함께 갱신한다.
- AI 표시 여부는 전용 access의 `aiEnabled`를 읽고 서버 생성 API가 최종 정책·사용량을 검사한다. `User`에 `aiEnabled`를 강제로 캐스팅하지 않는다.
- `left-panel.tsx`의 `/login?returnTo=/planning`은 현재 화면 주소와 맞지 않는다. 로그인 이동은 인증 경계로 모으고, 필요 시 안내 링크는 실제 `/planning-board` 진입 정보를 사용한다.
- 현재 로그인 페이지에는 보드로 복귀하는 `returnTo` 처리 근거가 없다. 이번 작업에서 복귀 지원까지 구현할지는 제9장에서 결정한다.

## 6. 권한 재확인과 실패 처리

현재 focus·15초 간격 갱신은 유지하되, HTTP 상태와 인증 초기화 상태를 구별한다.

| 상황 | 권장 동작 |
| --- | --- |
| 최초 인증/store 반영 중 | 준비 화면. null 하나로 미로그인을 확정하지 않음 |
| 최초 access 조회 중 | 화면 권한 확인 표시. 문서 내용과 변경 작업은 아직 노출하지 않음 |
| 401 세션 만료 | user를 null로 반영, 변경 작업 차단, 재로그인 안내. 미저장 편집본을 즉시 파기하지 않음 |
| 403 권한 거부 | 로그인 사용자는 유지, 해당 화면 접근·변경 차단. READ 가능 여부를 추정해 화면을 계속 노출하지 않음 |
| 404 화면 없음/삭제 | 화면을 찾을 수 없다는 상태 표시. 전역 로그아웃 처리하지 않음 |
| 5xx·네트워크·비 JSON 응답 | 사용자 친화적 오류와 재시도 제공. 로그인 사용자를 임의로 지우지 않음 |
| READ만 있음 | 조회·미리보기 허용, 변경 작업 차단 |
| 갱신 후 canUpdate=false 또는 review 상태 | 편집·저장·AI·템플릿·이미지 등 기존 잠금 조건 반영 |
| 갱신 중 요청 user/workspace가 바뀜 | 이전 범위 응답 무시, 편집본의 자동 재저장 차단, 재접속 안내 |

- 폴링 오류 때 Provider가 children을 제거하면 컴포넌트의 미저장 상태가 초기화될 수 있다. 최초 준비 상태와 진입 이후 오류를 구분하고, 후자는 기존 편집 상태를 유지하는 차단 화면/오버레이로 처리한다. 권한이 사라진 내용은 계속 노출하지 않는다.
- 오래된 응답이 최신 user·권한을 덮지 않도록 요청 취소/일련번호와 사용자·workspace·scope 일치를 확인한다. scope 변경 시 기존 요청을 정리하고 버전 커서와 편집 상태의 재초기화 필요 여부를 확인한다.
- 동일 창에서 user/workspace 전환이 확인되면 이전 창의 `initialUser`를 재주입하지 않는다. `/access` 재검증과 화면 재진입을 기준으로 한다.
- 부모·편집기·미리보기는 서로 다른 store를 쓴다. 다른 창의 로그아웃/권한 변경은 focus·주기 요청 또는 다음 API의 401/403으로 감지한다. 별도 인증 동기화 채널 추가는 이번 기본 범위에 포함하지 않는다.
- 403·404에서 전역 user를 지우지 않으며, API는 계속 HttpOnly 쿠키로 인증한다. 클라이언트의 `User` 객체나 타입 존재는 인증 증명이 아니다.

## 7. 변경 대상 파일과 영향 범위

아래는 **후속 구현 시 변경 대상**이며 이번 문서 단계에서는 수정하지 않는다. 경로 기준은 `hams-matrix/`다.

| 파일 | 변경 방향 |
| --- | --- |
| `app/(editor)/planning-board/api/[...path]/route.ts` | 기존 API 진입점 이동 후 제거 |
| `app/api/planning/[...path]/route.ts` | 새 진입점, handler import 수정, 기존 실행 계약 유지 |
| `app/(editor)/planning-board/lib/client-api.ts` | boardBase·템플릿 endpoint 변경, 기존 어댑터·버전 처리 유지 |
| `app/(editor)/planning-board/layout.tsx` | 서버 인증 경계·Suspense·초기 User 전달 |
| `app/(editor)/planning-board/stores/editor-provider.tsx` | 공통 user 초기화/갱신, 전용 권한 상태 분리, 오류·폴링 수명 관리 |
| `app/(editor)/planning-board/lib/server/handler.ts` | access 응답에서 user와 aiEnabled 분리, revisions 이미지 DTO 호환 |
| `app/(editor)/planning-board/lib/server/assets.ts` | 새 업로드 응답 URL |
| `app/(editor)/planning-board/lib/server/board-service.ts` | 이미지 입력·조회 정규화와 자산 scope 검사 |
| `app/(editor)/planning-board/lib/server/document-validation.ts` | 정규화 이후 새 이미지 URL 검증 |
| `app/(editor)/planning-board/lib/asset-url.ts` (신규 후보) | 구/신 URL 파싱·정규화 공용 함수 |
| `app/(editor)/planning-board/components/editor-header.tsx` | 공통 User 표시, 원본 전용 프로필 필드 제거 |
| `app/(editor)/planning-board/components/left-panel.tsx` | 공통 user, 로그인/권한 loading 구분, 로그인 링크 정리 |
| `app/(editor)/planning-board/components/review-dialog.tsx` | 공통 user ID와 전용 구성원 권한 사용 |
| `app/(editor)/planning-board/components/planning-board-editor.tsx` | 전용 권한·AI 정책 selector, 미리보기 URL 호환 확인 |
| `app/(editor)/planning-board/components/ai-screen-generator.tsx` | user.aiEnabled 의존 제거 |
| `app/(editor)/planning-board/components/share-dialog.tsx` | 전용 권한 hook 이름 변경에 따른 구성원 selector 수정 |
| `app/(editor)/planning-board/preview/page.tsx` | 공통 인증 적용 확인, 필요 시 수신 이미지 URL 정규화 |
| `scripts/test-planning-board.mjs` | 새 URL·자산 호환·서버 권한 회귀, 실제 route 검증 보완 |
| `scripts/test-planning-board-browser.mjs` | 독립 창/store 초기화·새 URL·프로필·만료·미리보기 검증 |
| `app/(editor)/planning-board/README.md` | API 폴더 이동과 사용자/권한 상태 설명 |

기본안에서 `stores/workspace.ts`, `lib/types.ts`, `lib/auth.ts`, `components/workspace-shell.tsx`, 화면 목록 링크, DB migration과 패키지는 기존 계약을 재사용하므로 수정할 필요가 없다. 로그인 후 자동 복귀나 이전 HTTP URL 지원을 선택하면 제9장에 따라 추가 파일이 생길 수 있다.

## 8. 검증 방법과 완료 기준

### 8.1 정적 검사와 실제 route 등록

1. `rg -n 'planning-board/api|/api/planning' app scripts`로 경로 참조를 점검한다. 이전 URL은 명시적인 호환 처리·과거 데이터 검증 fixture 외에는 남지 않아야 한다.
2. `pnpm typecheck`, 변경 파일 ESLint, `pnpm build`로 import·User 타입·서버/클라이언트 경계를 확인한다. 빌드 결과의 route 목록 또는 manifest에 `/api/planning/[...path]`가 등록되는지 확인한다.
3. 실행 서버에서 새 `/access`, 템플릿, 보드 저장, 이미지 GET, 메모 PATCH/DELETE를 실제 HTTP로 확인한다. 업무 handler 함수를 직접 호출한 결과만으로 route 이동 성공을 판단하지 않는다.
4. 기존 `test-planning-board.mjs`는 handler를 직접 로딩하므로 이것만으로 Next.js route 등록을 검증할 수 없다. 새 경로의 실제 통합 요청 검증을 보완하고 브라우저 테스트에서도 요청 경로를 확인한다.

### 8.2 로그인·화면 시나리오

| 시나리오 | 기대 결과 |
| --- | --- |
| 로그인 후 목록에서 새 창 열기 | 부모 store 전달 없이 공통 User 초기화, 편집기 정상 표시 |
| 로그인된 새 브라우저 탭에서 URL 직접 접속·새로고침 | 초기 null 오판/무한 loading 없이 사용자·권한 로딩 완료 |
| 미로그인·guest·온보딩 미완료 | 기존 Matrix 정책의 로그인/체험/가입 화면으로 이동 |
| READ 전용 사용자 | 문서·미리보기 표시, 저장·AI·이미지·검토 변경 불가 |
| 프로젝트 밖 사용자·다른 workspace·삭제된 screen | 403/404 구분, 문서 비노출, 전역 사용자 임의 삭제 없음 |
| 사용자명·검토 모달·AI 비활성 정책 | 공통 User와 전용 정책 기준으로 일관된 표시 |
| 편집 중 세션 만료·타 창 로그아웃 | 갱신/다음 API에서 감지, 변경 차단·재로그인 안내, 미저장 내용 보존 |
| 일시 네트워크 오류·HTML 오류 응답·권한 회수 | 무조건 로그아웃하거나 원시 JSON 파싱 오류를 표시하지 않음, 재시도·차단 상태 구분 |
| 갱신 중 사용자/workspace 전환 | 이전 응답/편집본이 새 범위에 적용되지 않음 |
| 저장본·미저장본 미리보기 | 별도 창에서도 인증/READ 적용, 기존 origin/source/nonce 검증 유지 |

### 8.3 이미지·저장·기존 기능 회귀

- 새 이미지 업로드 → 새 URL 반환 → 저장 → 재조회 → 편집기/미리보기 표시 → 코드 내보내기까지 확인한다.
- 구 URL이 들어 있는 보드·revision fixture를 준비하여 응답 정규화, 이전 창 저장 입력 호환, 이력 원본과 버전 불변을 확인한다.
- 구/신 URL 모두 다른 workspace/project/screen 자산, 타인의 미연결 자산, 만료 자산, 외부 URL과 변형된 경로를 거부하는지 검증한다.
- 보드 expectedVersion·expectedScreenVersion 충돌, review 잠금, 댓글·메모·검토·이력·AI 정책이 endpoint 변경 후에도 유지되는지 확인한다.
- `pnpm test:planning-board`, 빌드 후 `pnpm test:planning-board-browser`를 격리된 임시 DB와 외부 서비스 대역으로 실행한다. 브라우저 실행 환경은 기존 `MATRIX_TEST_BROWSER` 설정을 활용한다.
- 공통 workspace 화면의 사용자 표시·로그아웃·workspace 전환도 회귀 확인한다.

이 절은 **후속 구현의 검증 계획**이다. 이번 작성 단계에서는 빌드·테스트·브라우저 실행·DB 조회/생성·migration·AI 호출을 수행하지 않는다.

## 9. 결정이 필요한 사항

| 결정 항목 | 권장안 | 대안과 영향 |
| --- | --- | --- |
| 서버 서비스 이동 범위 | API 진입점만 `app/api/planning`으로 이동 | `lib/server`까지 옮기면 templates·타입·다수 상대 import 변경이 추가됨 |
| 공통 User 초기화 | 서버 layout 인증 후 Provider에서 setUser, access로 재확인 | access만으로 초기화하면 서버 layout 변경을 줄일 수 있으나 로그인과 화면 권한 오류 분리를 별도 구현해야 함 |
| access 응답 | `{ user: User, aiEnabled, ... }`로 분리 | 이전 클라이언트 지원이 필요하면 과도기 응답 계약이 추가됨 |
| 기존 저장 이미지 URL | 읽기·입력 정규화, DB 일괄 변경 없음 | 실제 이전 자료가 없다고 확인되면 호환 범위를 줄일 수 있으나 본 문서에서는 존재 여부를 가정하지 않음 |
| 이전 HTTP endpoint 지원 | 새 주소로 일원화, 구버전 창은 재접속 안내 | 필요 시 `next.config.ts`의 제한적 rewrite 등을 설계. 이미지 GET만 지원할지 API 전체를 지원할지와 종료 시점 확정 필요 |
| 세션 만료 중 미저장 편집본 | 자동 이동을 피하고 상태 보존·재로그인 안내 | 즉시 로그인 redirect를 선택하면 미저장 데이터 유실 처리/복구 정책이 필요 |
| 로그인 후 보드 자동 복귀 | 이번 기본 범위는 기존 로그인 동작 유지 | 필요 시 `app/(auth)/login/page.tsx`와 실제 로그인 폼을 추가 분석해 내부 경로만 허용하는 returnTo 검증·복귀 구현 |

API 이동 위치와 공통 `User` 기준 사용은 요구사항으로 확정되어 있다. 위 항목의 권장안은 사용자 검토 대상이며 구현 승인으로 해석하지 않는다.

## 10. 후속 구현 순서

1. 사용자가 검토·수정한 본 문서의 최신 내용과 미커밋 변경을 다시 확인한다.
2. API 진입점 이동과 호출부·서버 이미지 경로·호환 함수를 한 변경 단위로 적용한다.
3. 독립 화면의 서버 인증, 공통 store 초기화, 전용 권한 상태와 컴포넌트 selector를 함께 정리한다.
4. 오류 분기·재검증·미저장 편집본 보존·미리보기 동작을 연결한다.
5. 격리 환경에서 정적 검사·실제 HTTP·브라우저 회귀 검증 후 구현 결과를 별도 기록한다.

이번 작업의 산출물은 본 문서와 `HISTORY.md`의 작성일·상대 경로 링크다. 기존 소스, 기존 이력 내용과 DB는 변경하지 않는다.
