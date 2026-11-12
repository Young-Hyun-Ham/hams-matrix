# 관리자 API 라우팅과 업무 함수 분리 설계

- 작성일: 2026-11-12 (한국시간, Asia/Seoul)
- 상태: 검토용 설계안. 사용자 검토·수정 후 별도 구현 요청을 받아 적용한다.
- 이번 작업: 현재 소스 분석, 본 문서 작성, `HISTORY.md`에 링크 추가.
- 이번 작업에서 실행하지 않는 것: 애플리케이션 소스 수정, DB 접속·조회·변경, 마이그레이션, 데이터 생성, 빌드·실행 테스트.

## 1. 요구사항과 설계 결론

현재 `handleProductAdmin(request, segments, superMode)`는 HTTP 메서드와 경로 배열을 해석하고, 권한 검사·SQL 실행·응답 생성까지 담당한다. 실제 URL의 동작을 알아보려면 `route.ts`에서 공통 핸들러를 따라가 배열의 의미와 분기 순서를 함께 읽어야 한다.

다음 구조로 바꾸는 것을 제안한다.

1. **URL은 `app/api/**/route.ts` 파일 구조로 구분한다.** 각 파일의 `GET`, `POST`, `PATCH` 등에서 해당 URL의 입력과 실행할 업무 함수를 확인할 수 있게 한다.
2. **HTTP 처리와 응답은 해당 `route.ts`에 둔다.** 경로·쿼리·본문 추출, 인증·권한 함수 호출, Origin 검사, 상태 코드·JSON·캐시 헤더·오류 응답을 명시한다.
3. **`lib`에는 재사용 업무 함수를 둔다.** 권한 범위 계산, 조회, 업무 입력 검증, 저장, 트랜잭션, 이력 기록을 담당하며, 경로 배열이나 HTTP 메서드로 업무를 선택하지 않는다.
4. **현재 사용 중인 URL과 업무 정책을 우선 보존한다.** 관리자 화면, 서버 프리패치, Query key까지 함께 바꾸는 작업으로 확대하지 않는다.
5. **상품·workspace·슈퍼관리자 범위를 구분한다.** 상품 관리 함수를 재사용하더라도 서버가 검증한 관리 범위와 권한을 명시적으로 전달한다.
6. **수정하면서 사용하지 않게 된 파일들은 삭제 처리한다.** 업무 이동과 호출처 전환을 완료한 뒤 불필요해진 기존 파일을 남기지 않는다.

이 방향은 프로젝트의 구조 선택이다. 저장소의 Next.js 버전은 `package.json` 기준 `16.4.2`이며, 설치된 가이드 `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`에서도 URL별 `route.ts`와 HTTP 메서드 export를 안내한다. 여러 URL을 `lib`의 단일 분기 함수로 모아야 한다는 필수 규칙은 없다.

## 2. 분석 기준과 범위

### 2.1 직접 확인한 주요 소스

| 구분 | 확인 파일 | 확인 목적 |
| --- | --- | --- |
| 상품 관리자 진입점 | `app/api/admin/products/[...segments]/route.ts` | GET·POST를 공통 핸들러로 위임하는 구조 |
| 관리자 별칭 API | `app/api/admin/members/route.ts`, `app/api/admin/members/[userId]/route.ts`, `app/api/admin/history/route.ts`, `app/api/admin/history/[source]/[id]/route.ts` | `me` 경로 배열 생성, PATCH 불일치 |
| 공통 상품 핸들러 | `lib/product-admin-api.ts` | URL 해석, 권한, 조회·저장, 응답 결합 |
| master workspace | `lib/master-workspace-admin.ts` | workspace 권한 함수와 HTTP 핸들러 결합 |
| 슈퍼관리자 | `app/api/super-admin/[...segments]/route.ts`, `lib/super-admin-api.ts` | 상품 핸들러 재호출, 별도 상품·알림·신청 분기 |
| 권한·저장 | `lib/product-access.ts`, `lib/plan-products.ts`, `lib/auth.ts` | 상품 범위, master 확인, 저장 중 재검증, 오류 계약 |
| 검색 조건 | `lib/admin-query.ts`, `lib/admin-history-query.ts` | 페이지·검색·프로젝트 조건, SQL 범위 |
| 화면·프리패치 | `app/(workspace)/admin/settings/page.tsx`, `app/(workspace)/super-admin/settings/page.tsx`, `components/admin/product-admin.tsx`, `components/super-admin/product-console.tsx`, `components/query/admin-product-boundary.tsx` | 실제 URL·응답 소비, Query 연계 |
| 과거 화면·테스트 | `components/admin/admin-lists.tsx`, `scripts/test-team-sharing.mjs`, `scripts/check-navigation-settings.mjs`, `scripts/test-accounts-plans.mjs` | 이전 관리자 계약이 남은 부분 식별 |
| 주요 회귀 테스트 | `scripts/test-product-administration.mjs`, `scripts/test-product-administration-browser.mjs` | 현재 정책 검증과 핸들러 직접 호출 의존성 |
| RFP 비교 | `app/api/projects/[projectId]/rfp/route.ts`, `app/api/projects/[projectId]/rfp/source/route.ts`, `lib/rfp-server.ts`, `lib/rfp-sources.ts` | HTTP 처리와 업무 함수 분리 사례 |

관련 작업 기록 `docs/work/2026-11-11/관리자-이력관리-검색조건-상세모달.md`와 프로젝트 `AGENTS.md`도 확인했다. 이력 검색 의미, workspace·상품 격리, Query 정책을 유지하는 것이 전제다.

### 2.2 구현 범위 제안

- 필수 범위: 상품 관리자 API, master workspace API, 위 네 개의 관리자 별칭 API, `handleProductAdmin`을 재호출하는 슈퍼관리자 상품 API.
- 권장 연계 범위: `handleSuperAdmin`의 나머지 URL도 명시적 route로 분리하여 `lib/super-admin-api.ts`의 HTTP 라우터 역할을 함께 제거한다. URL 목록은 5.3절에 명시한다.
- 별도 개선으로 남길 범위: RFP 내부의 Request 의존성 제거, 관리자 전체 UI 개편, Query 전송 방식 변경, 인증 정책 변경, 데이터 구조 변경.
- 독립적인 `admin/plans`, `super-admin/plans`, AI 가드레일, 로깅·시스템설정 API는 이번 라우터의 직접 분기 대상이 아니다. 해당 파일을 일괄 개편하지 않는다.

## 3. 현재 구조와 동작

### 3.1 요청 흐름

```text
일반 상품 관리자
  admin/products/[...segments]/route.ts (GET, POST)
    → handleProductAdmin(request, segments)
      → requireUser({ allowPlanMismatch: true })
      → productAdminScope
      → resource별 SQL 또는 changeProductMember
      → Response.json / errorResponse

master의 현재 workspace 관리
  같은 catch-all route
    → handleProductAdmin: segments[0] === "workspace"
      → handleMasterWorkspace(request, user, segments.slice(1))
        → masterWorkspaceScope → resource별 조회·응답

슈퍼관리자 상품 관리
  super-admin/[...segments]/route.ts (GET, POST, PATCH)
    → handleSuperAdmin
      → requireSuperAdmin → URL의 team/business와 상품 종류 대조
      → 일부 요청은 직접 처리
      → 나머지는 handleProductAdmin(request, [id, ...], true)
        → 사용자 재조회 → 상품 범위 검증 → 조회·저장·응답

관리자 별칭
  admin/members, admin/history 등의 route.ts
    → ["me", "members" 또는 "history", ...]를 만들어 handleProductAdmin 호출
```

### 3.2 상품 관리자 핸들러

- 첫 번째 segment가 `me`이면 현재 사용자의 관리 상품을 찾는다. 그 외에는 지정 상품에 대한 권한을 확인한다.
- 두 번째 segment가 없으면 `overview`로 처리한다.
- GET `overview`: 상품 정보, 상품 소속 workspace·프로젝트 목록, 활성 상품 회원 수를 반환한다.
- GET `candidates`: 이메일을 trim·소문자화하고 기본 형식·254자 제한을 검사한다. `product-candidate:${user.id}` 키로 `rateLimit(..., 30)`을 적용한다. 가입 완료된 일반 회원이며 어느 상품에도 활성 소속이 없는 계정을 최대 1명 조회한다.
- GET `members`: 이름·이메일 검색, 페이지, 프로젝트 조건으로 활성 상품 회원을 조회한다. 세 번째 segment가 있으면 같은 조회 조건을 적용한 회원 상세를 반환한다.
- POST `members`: `changeProductMember`로 지원 부여·회수를 실행하고 `{ ok: true }`를 반환한다.
- GET `history`: `product_events`와 상품 소속 workspace의 `audit_logs`를 합쳐 조회한다. source·id가 모두 있으면 범위 내 상세를 반환한다.
- GET 외 요청은 Origin을 검사한다. POST members 외에는 405를 반환한다. 알 수 없는 GET resource는 404다.
- 정상 응답은 공통 `noStore`를 사용하고, 예외는 `errorResponse`로 변환한다.

### 3.3 master workspace 핸들러

- 상품과 무관하게 **현재 세션의 workspace**를 기준으로 한다.
- `masterWorkspaceScope`는 DB의 `account_role='master'`와 workspace의 owner/admin 소속을 확인한다.
- GET `overview`, `members`, `history`, `history/{source}/{id}`를 처리한다. 회원 상세 전용 분기는 없다.
- GET 이외 요청은 405와 “상품 회원 지원은 슈퍼관리자설정에서 진행해 주세요.” 문구로 차단한다.
- 현재 상위 핸들러는 workspace 요청을 먼저 위임한다. 따라서 workspace의 변경 요청 거절은 상품 쪽 `checkOrigin`보다 앞에서 발생한다.
- 상품 overview와 달리 `product` 필드가 없고, workspace 이력 상세는 `beforeJson`, `afterJson`만 반환한다. 두 범위의 DTO를 억지로 같게 만들면 안 된다.

### 3.4 권한과 저장의 보존 조건

| 항목 | 현재 조건 및 보존할 동작 |
| --- | --- |
| 일반 상품 관리자 | biz_admin/business 또는 team_admin/team, 활성 admin 소속, 구독의 상품·플랜 일치, 지정 상품 일치 |
| 상품 유효성 | `productById`의 활성 상품·활성 계약·기간 조건 유지 |
| 슈퍼관리자 | `requireSuperAdmin` 및 DB master 확인, URL의 team/business와 실제 상품 종류 대조 |
| master workspace | master여도 임의 workspace 전체 접근을 허용하지 않음. 현재 workspace의 관리 소속 검증 |
| 회원 변경 | `changeProductMember`의 쓰기 트랜잭션 안에서 `productAdminScope` 재검증 |
| 변경 충돌 | `users.management_version`과 입력 version 비교, 충돌 409 |
| 허용 입력 | `userId`, `action`, `version`만 허용. grant/revoke 처리로 한정 |
| 업무 제약 | 정원·소속 제약, 일반 회원 역할 유지, 프로젝트 소유자의 지원 회수 금지, 구독 복구·이력 기록 유지 |
| 상세 조회 | 회원·이력 ID만 조회하지 않고 권한이 확인된 상품/workspace 조건을 SQL에 포함 |

### 3.5 RFP와의 비교

RFP route는 해당 URL의 메서드, `context.params`, 인증·Origin 검사, JSON 응답, 상태 코드, 오류 변환을 파일 안에 두고 `readRfp`, `mutateRfp`, `readRfpSource` 등의 업무 함수를 호출한다. 공통 `change`·`upload` 함수도 해당 URL의 route 파일 안에 있으므로 메서드와 동작을 추적하기 쉽다.

다만 `mutateRfp`, `uploadRfpSource`, `detachRfpSource`에는 여전히 `Request` 전달이 있으며 업로드 함수는 URL 쿼리도 읽는다. RFP가 모든 계층 의존성을 제거한 완성 사례라는 뜻은 아니다. 이번에는 **URL·메서드·응답의 위치**를 참고하고 RFP 소스를 수정하지 않는다.

### 3.6 확인된 불일치와 호환성 주의점

1. `app/api/admin/members/route.ts`는 GET·PATCH를 export하지만 내부 저장은 POST members만 지원한다. 권한·Origin 검사를 통과한 PATCH도 최종적으로 405가 된다. 실제 상품 관리 화면은 `/api/admin/products/{id}/members`에 POST한다. 이 둘을 합치면서 PATCH에 새로운 저장 권한을 부여하면 안 된다.
2. `components/admin/admin-lists.tsx`는 `/api/admin/members`에 PATCH하는 이전 계약을 사용한다. 현재 app·components 검색에서는 `AdminList` 사용처가 발견되지 않았다. 삭제나 재활성화는 이번 분리와 별도 결정이다.
3. `test-team-sharing.mjs`, `check-navigation-settings.mjs`, `test-accounts-plans.mjs`에는 이전 관리자 API의 전역 회원 관리·플랜 변경 기대가 남아 있다. 현재 상품 관리자 정책과 다르므로 실패를 모두 이번 변경의 회귀로 판단하거나, 테스트에 맞추어 권한을 확대하지 않는다. 실행 전 기준 결과와 호출 맥락을 분류해야 한다.
4. catch-all은 정확한 경로 길이를 제한하지 않는다. 예를 들어 `/members/{id}/extra`의 GET은 회원 상세로, `/history/{source}`는 이력 목록으로 처리될 수 있다. `/members/{id}`에 POST해도 body 기준 회원 변경으로 진행할 수 있다. 명시적 route로 바꾸면 이러한 부수 동작은 404·405로 달라진다.
5. 현재 슈퍼관리자 핸들러는 상품 수정·생성·관리자 생성·매핑 외 요청을 상품 핸들러로 위임한다. 직접 분리할 때 URL의 상품 종류 대조와 활성 상품 조건을 빠뜨리기 쉽다.
6. 상품 상태 PATCH는 상품 종류를 확인한 뒤 version으로 갱신하며, 상품 조회용 `productAdminScope`를 경유하지 않는다. 이 경로에 활성 상품 조회 조건을 일괄 추가하면 정지 상품 등의 상태 관리가 달라질 수 있다.

## 4. 목표 책임 분리

### 4.1 계층별 책임

| 위치 | 담당할 일 | 두지 않을 일 |
| --- | --- | --- |
| URL별 `route.ts` | GET·POST 등 export, params await, 쿼리·본문 읽기, 인증·권한 함수 호출, Origin 검사, 업무 함수 선택, JSON/status/headers, try/catch와 `errorResponse` | SQL 본문, 트랜잭션 안의 업무 규칙 |
| `lib/product-access.ts` | 기존 상품·슈퍼관리자 권한 및 상품 유효성 확인 | `segments` 해석, Response 생성 |
| `lib/product-admin-service.ts` (신규 제안) | 상품 개요·후보·회원·이력 조회, 범위 내 프로젝트 검증, 조회 DTO 구성 | Request/Response, URL별 메서드 분기, 다른 HTTP 핸들러 호출 |
| `lib/master-workspace-admin.ts` | `masterWorkspaceScope` 유지, workspace 개요·회원·이력 조회 함수 | `handleMasterWorkspace`, HTTP 응답·라우팅 |
| `lib/super-admin-service.ts` (연계 분리 시 신규) | 상품 목록·상태 변경·workspace 매핑·알림·신청 목록 등 현재 직접 SQL의 업무 함수 | 전체 슈퍼관리자 URL 분기 |
| `lib/plan-products.ts`, `lib/business-requests.ts` | 기존 생성·지원 변경·신청 처리와 트랜잭션·이력 | HTTP 경로에 따른 분기 |
| 공통 입력/필터 helper | 입력 정규화, 페이지·검색 검증, SQL 검색 조건 구성 | 경로를 선택하는 범용 dispatcher |

route에는 공통 업무 함수를 몇 줄로 호출하는 코드가 있어도 된다. 중요한 것은 파일만 읽어도 “이 URL의 GET은 무엇을 조회하고 어떤 응답을 만드는지”와 “POST가 어떤 변경을 실행하는지”를 알 수 있는 것이다. route 전체를 감싸서 업무 선택과 응답까지 숨기는 새로운 범용 핸들러는 만들지 않는다.

### 4.2 업무 함수 경계 제안

함수명은 구현 시 최종 확정하되, 최소한 다음 작업은 독립된 함수로 표현한다.

| 업무 | 함수명 예시 | 입력·출력 원칙 |
| --- | --- | --- |
| 상품 개요 | `getProductAdminOverview` | 권한이 검증된 상품 → 기존 overview DTO |
| 후보 조회 | `findProductMemberCandidates` | 검증된 관리 범위·actor·정규화 이메일 → 후보 배열. 호출 제한과 후보 자격 보존 |
| 회원 목록 | `listProductMembers` | 검증된 상품·검색/페이지/projectId → 목록 DTO |
| 회원 상세 | `getProductMember` | 검증된 상품·userId·기존 상세 조회 조건 → member. route에서 canEditRole=false 응답 |
| 이력 목록·상세 | `listProductHistory`, `getProductHistoryDetail` | 검증된 상품·필터 또는 source/id → 기존 DTO |
| workspace 조회 | `getWorkspaceAdminOverview`, `listWorkspaceMembers`, `listWorkspaceHistory`, `getWorkspaceHistoryDetail` | `masterWorkspaceScope` 결과를 기준으로 조회 |
| 회원 지원 변경 | 기존 `changeProductMember` | actor·productId·input·서버가 정한 superMode. 저장 중 권한 재검증 유지 |

- HTTP 입력은 route에서 읽고 명시적인 값·타입으로 전달한다. 업무 함수가 `request.method`나 `segments`를 받아 여러 일을 선택하지 않는다.
- 일반 상품 route의 `me`는 route에서 현재 상품 의미로 해석해 기존 권한 함수에 전달한다. `workspace`는 정적 route로 분리한다. 두 예약어를 일반 상품 ID로 DB 조회하지 않는다.
- 슈퍼관리자 상품 route는 로그인한 master를 확인하고, planCode가 team/business인지와 상품 종류가 맞는지 검증한 뒤 공통 조회 함수를 호출한다. 기존 `handleProductAdmin` 재호출은 제거한다.
- `superMode`를 쿼리·본문에서 받지 않는다. route에서 정한 서버 값으로 기존 권한 함수에 전달한다. 이 boolean을 별도 권한 타입으로 바꾸는 것은 필수 조건이 아니다.
- 조회용 executor 주입을 사용할 수 있으나 쓰기 함수의 트랜잭션 소유권·rollback·close는 기존 함수에 유지한다. 현재 트랜잭션 범위를 임의로 확대·축소하지 않는다.
- 목록 count와 데이터에 같은 검색 조건을 적용한다. 현재 read transaction을 사용하는 회원 목록과 workspace 이력 조회는 그 경계를 보존한다. 상품 이력 count/목록을 새 transaction으로 묶는 변경은 별도 개선으로 남긴다.
- `paging`·`searchValue`는 route에서 호출 가능한 기존 입력 helper로 유지할 수 있다. `lib/admin-history-query.ts`는 URL 대신 명시적인 검색 값과 허용 workspace ID를 받는 SQL 조건 함수로 조정한다. LIKE 이스케이프는 정확히 한 번만 적용하고 관련 호출부를 함께 전환한다.
- 이력 JSON 역직렬화는 서비스의 DTO 구성에 둘 수 있다. route는 JSON 응답 생성과 헤더·상태를 담당한다.

### 4.3 route에서 보이는 실행 순서

상품 회원 POST의 목표 흐름은 다음과 같다.

1. 로그인 사용자 확인: 기존 `allowPlanMismatch: true` 유지.
2. params를 읽고 요청 상품에 대한 관리자 범위 확인.
3. `checkOrigin(request)` 실행.
4. `body(request)`로 JSON 입력을 읽음. 현재 기본 크기 제한·오류 응답 보존.
5. `changeProductMember` 호출. 함수 안의 transaction과 권한 재검증 유지.
6. route에서 `{ ok: true }`, 기존 `no-store` 헤더로 응답.
7. route의 catch에서 `errorResponse` 호출.

슈퍼관리자 경로는 기존 외부 핸들러의 master 확인·Origin 검사와 상품 종류 확인 순서도 고려한다. 단순 추출을 이유로 인증·권한·Origin·입력 오류의 우선순위를 일괄 변경하지 않는다. 허용하지 않는 메서드의 응답 정책은 8절에서 확정한다.

## 5. URL별 목표 route 구성

아래 표는 제안하는 최종 파일 목록이다. 경로는 저장소 루트 `hams-matrix/` 기준이며, 실제 화면이 사용하는 base URL은 유지한다. `[productId]`는 기존 상품 ID와 `me` 별칭을 수용하고, 정적 `workspace` 경로가 master workspace 관리를 담당한다.

### 5.1 일반 상품 관리자와 master workspace

| 목표 파일 | 메서드 | 동작 |
| --- | --- | --- |
| `app/api/admin/products/[productId]/route.ts` | GET | 상품 overview |
| `app/api/admin/products/[productId]/overview/route.ts` | GET | 기존 명시적 overview URL 유지 |
| `app/api/admin/products/[productId]/candidates/route.ts` | GET | 지원 후보 조회 |
| `app/api/admin/products/[productId]/members/route.ts` | GET, POST | 회원 목록, 상품 지원 부여·회수 |
| `app/api/admin/products/[productId]/members/[userId]/route.ts` | GET | 상품 회원 상세 |
| `app/api/admin/products/[productId]/history/route.ts` | GET | 상품 이력 목록 |
| `app/api/admin/products/[productId]/history/[source]/[id]/route.ts` | GET | 상품 이력 상세 |
| `app/api/admin/products/workspace/route.ts` | GET | 현재 workspace overview |
| `app/api/admin/products/workspace/overview/route.ts` | GET | 기존 명시적 workspace overview URL 유지 |
| `app/api/admin/products/workspace/members/route.ts` | GET | 현재 workspace 회원 목록 |
| `app/api/admin/products/workspace/history/route.ts` | GET | 현재 workspace 이력 목록 |
| `app/api/admin/products/workspace/history/[source]/[id]/route.ts` | GET | 현재 workspace의 audit 이력 상세 |

정적 workspace 하위에 없는 `candidates`·회원 상세 URL 등이 동적 상품 경로로 처리되더라도 `productId=workspace`를 허용하지 않도록 검사한다. 경로 파일의 존재만으로 범위 격리를 가정하지 않는다. 정상 workspace URL과 지원하지 않는 workspace URL을 실제 Next 서버에서 모두 확인한다.

workspace POST의 기존 405 업무 문구를 유지하기로 결정하면 관련 route에 명시적인 거절 POST를 추가한다. 위 표는 정상 업무 메서드만 기재했다. workspace 회원 지원 기능을 새로 구현한다는 의미가 아니다.

### 5.2 기존 관리자 별칭 API

| 기존 파일 | 제안 처리 |
| --- | --- |
| `app/api/admin/members/route.ts` | GET은 현재 관리 상품 회원 목록 업무 함수를 직접 호출. PATCH는 기존 실효 동작인 405 유지 권고. POST 저장 별칭을 새로 추가하지 않음 |
| `app/api/admin/members/[userId]/route.ts` | GET으로 현재 관리 상품 회원 상세 조회 |
| `app/api/admin/history/route.ts` | GET으로 현재 관리 상품 이력 목록 조회 |
| `app/api/admin/history/[source]/[id]/route.ts` | GET으로 현재 관리 상품 이력 상세 조회 |

이 별칭을 master의 전역 회원 관리나 현재 workspace 관리로 바꾸지 않는다. 현재 `me`는 `productAdminScope`의 현재 관리 상품 의미다. PATCH를 명시적 거절 route로 유지할 경우 기존 사용자·상품 권한·Origin 확인 후 405 JSON 응답을 반환하도록 하여 오류 우선순위도 보존할 수 있다. 제거·폐기 또는 다른 의미의 API로 재설계할지는 별도 결정이다.

### 5.3 슈퍼관리자 연계 분리

`[planCode]`는 team/business 두 값으로 제한한다. 고정 리소스 경로 안에서 두 상품 종류를 검증하는 것은 허용하며, 이 값을 받아 전체 URL을 재분기하는 dispatcher는 만들지 않는다. 동적 params는 현재 프로젝트 방식인 `Promise`를 await한다.

| 목표 파일 | 메서드 | 동작 |
| --- | --- | --- |
| `app/api/super-admin/[planCode]/products/route.ts` | GET, POST | 상품·미연결 workspace 목록. POST 생성은 business만 허용 |
| `app/api/super-admin/[planCode]/products/[productId]/route.ts` | GET, PATCH | 상품 overview, version 기반 상품 상태 변경 |
| `app/api/super-admin/[planCode]/products/[productId]/overview/route.ts` | GET | 명시적 overview URL 유지 |
| `app/api/super-admin/[planCode]/products/[productId]/candidates/route.ts` | GET | 상품 지원 후보 조회 |
| `app/api/super-admin/[planCode]/products/[productId]/members/route.ts` | GET, POST | 상품 회원 목록·지원 변경 |
| `app/api/super-admin/[planCode]/products/[productId]/members/[userId]/route.ts` | GET | 상품 회원 상세 |
| `app/api/super-admin/[planCode]/products/[productId]/history/route.ts` | GET | 상품 이력 목록 |
| `app/api/super-admin/[planCode]/products/[productId]/history/[source]/[id]/route.ts` | GET | 상품 이력 상세 |
| `app/api/super-admin/[planCode]/products/[productId]/admins/route.ts` | POST | business 관리자 생성만 허용 |
| `app/api/super-admin/[planCode]/products/[productId]/mapping/route.ts` | POST | 기존 workspace와 상품 연결 |
| `app/api/super-admin/business/requests/route.ts` | GET | 계약 신청 목록 |
| `app/api/super-admin/business/requests/[requestId]/route.ts` | PATCH | 계약 신청 처리 |
| `app/api/super-admin/notifications/route.ts` | GET | 알림 목록과 unread |
| `app/api/super-admin/notifications/count/route.ts` | GET | unread 카운터만 조회 |
| `app/api/super-admin/notifications/[notificationId]/route.ts` | PATCH | 본인 알림 읽음 처리 |

현재 team 상품 생성은 지원하지 않으므로 team POST를 새로 허용하지 않는다. business 전용 admins, 지원하지 않는 planCode, 예약어 `me`·`workspace`를 실제 상품 ID로 사용하는 슈퍼관리자 요청의 처리도 route에서 명시한다. 상품 생성·상태 변경·매핑·관리자 생성의 기존 성공 상태(201 또는 200), 감사 이력과 version 검증을 보존한다.

알림 목록·카운터는 분리된 URL을 유지한다. 15초 카운터 폴링, 패널을 열 때만 목록 조회, 수신자·신청 상태 조건도 변경하지 않는다.

전체 슈퍼관리자 분리를 이번 구현에 포함하지 않는다면, 상품 관련 명시적 route부터 추가하고 나머지 catch-all을 임시 유지할 수 있다. 이 경우 `lib/super-admin-api.ts`의 상품 URL 분기와 `handleProductAdmin` 호출은 제거하고, “알림·신청의 라우팅 분리 미완료”를 후속 작업으로 명시한다. 최종 권장안은 위 표 전체를 분리하고 두 범용 HTTP 핸들러를 제거하는 것이다.

## 6. 응답·검색·캐시 호환성

### 6.1 유지할 정상 응답

| 작업 | 보존할 JSON 형태 |
| --- | --- |
| 상품 overview | `{ product, workspaces, projects, used }` |
| workspace overview | `{ workspaces, projects, used }` |
| 후보 | `{ members }` |
| 회원 목록 | `{ members, total, page, pageSize }` |
| 상품 회원 상세 | `{ member, canEditRole: false }` |
| 상품 이력 목록 / workspace 이력 목록 | `{ entries, total, page, pageSize }` |
| 상품 이력 상세 | 기존 row 필드와 파싱된 `beforeJson`, `afterJson` |
| workspace 이력 상세 | `{ beforeJson, afterJson }` |
| 회원 지원 변경 | `{ ok: true }` |

상품·workspace별 목록 필드 차이까지 현재 값을 유지한다. 이메일·관리 version 등 필요한 DTO는 유지하고 비밀번호·세션·비밀키를 노출하지 않는다. 기존 SQL의 `SELECT *` 결과를 새 공용 API DTO로 무작정 확대하지 않는다.

### 6.2 검색과 상세 조회

- `page`는 양의 안전 정수, `pageSize`는 10·20·50·100, 기본은 1페이지·20개다. 마지막 페이지 초과 시 현재의 page 보정 동작을 유지한다.
- `q`는 trim 후 100자 이하이며 `%`, `_`, `\`를 LIKE 검색용으로 이스케이프한다.
- `projectId`는 빈 값·`unassigned`·실제 프로젝트 ID를 구분한다. 실제 ID가 현재 상품 또는 workspace에 속하지 않으면 404로 차단한다.
- 이력 검색은 기록된 작업자 이름, 현재 계정 이름·이메일과 **현재 프로젝트 배정** 기준이다. 삭제된 계정의 과거 이름 검색을 유지한다.
- 상품 이력은 product/audit 출처를, workspace 이력은 audit 출처만 지원한다. 상세 ID는 해당 범위 조건과 함께 조회한다.
- 현재 상품 회원 상세도 목록과 같은 q/projectId/page 조건의 영향을 받는다. 함수 추출 중 이를 무심코 제거하지 않는다. 상세 URL에서 목록 필터를 무시하도록 개선하려면 별도 동작 변경으로 승인받는다.

### 6.3 HTTP 오류와 Query

- 기존 `HttpError`의 status/message/details를 `errorResponse`로 변환한다. 클라이언트 `RequestError`의 status/code/details 계약을 보존한다.
- 정상 상품·workspace 응답의 `Cache-Control: no-store`를 유지한다. 슈퍼관리자 API도 기존 URL별 헤더 유무를 확인해 유지한다. 이번 변경에서 모든 응답에 새 캐시 정책을 일괄 적용하지 않는다.
- 관리자 페이지와 `AdminProductBoundary`는 현재 내부 HTTP API로 SSR 프리패치를 한다. 이를 서비스 직접 호출로 바꾸는 작업은 포함하지 않는다.
- base URL, Query key의 사용자/workspace scope, 목록·상세 key와 변경 후 invalidate 범위를 유지한다. `retry: false`인 저장도 유지한다.
- route를 세분화하면 framework 기본 404·405의 본문·헤더와 인증 실행 여부가 기존 JSON 오류와 달라질 수 있다. 모든 비정상 URL까지 완전 동일하다고 가정하지 않고 8절에서 정책을 결정한다.

## 7. 변경 대상 파일과 영향 범위

아래는 **향후 구현 시**의 목록이며 이번 문서 작업에서 수정한 소스 목록이 아니다.

| 대상 | 예정 변경 | 영향 |
| --- | --- | --- |
| `app/api/admin/products/[...segments]/route.ts` | 5.1절의 URL별 route로 대체 후 제거 | 상품·workspace API 진입점 |
| 5.1절의 `app/api/admin/products/**/route.ts` | 표의 모든 파일 신규 작성 | GET/POST 선택과 응답 위치 명시 |
| 5.2절의 관리자 별칭 route 4개 | 경로 배열 위임 제거, 업무 함수 직접 호출 | 이전 URL 보존, PATCH 처리 명시 |
| `lib/product-admin-api.ts` | 조회 업무 추출 후 핸들러·파일 제거 | 모든 import·테스트 직접 호출 전환 필요 |
| `lib/product-admin-service.ts` | 신규: 상품 조회 업무와 DTO 구성 | 일반 관리자·슈퍼관리자에서 재사용 |
| `lib/master-workspace-admin.ts` | scope 함수 이름·export 유지, 핸들러를 업무별 조회 함수로 분리 | 관리자 페이지의 기존 scope import 유지 가능 |
| `lib/admin-history-query.ts` | URL 입력을 명시적 필터 값으로 전환 | 상품·workspace 검색 의미·SQL 이스케이프 회귀 확인 |
| `lib/admin-query.ts` | 기존 helper 재사용 우선. 필요 시 명시적 값용 정규화 함수 추가 | `lib/admin-history.ts` 등 기존 호출 시그니처 보존 |
| `lib/product-access.ts` | 기존 검증 재사용, 필요 시 상품 종류 확인 helper 추가 | 일반·슈퍼관리자 권한 조건 보존 |
| `lib/plan-products.ts`, `lib/business-requests.ts` | 원칙적으로 기존 저장 함수를 재사용 | 트랜잭션·정원·충돌·이력 정책 변경 불필요 |
| `app/api/super-admin/[...segments]/route.ts` | 5.3절 전체 분리 시 제거 | 기존 독립 plans/ai-guardrails route와 충돌 여부 확인 |
| 5.3절의 `app/api/super-admin/**/route.ts` | 표의 모든 파일 신규 작성 | 상품 조회·저장, 신청·알림 HTTP 처리 명시 |
| `lib/super-admin-api.ts` | 직접 SQL을 업무 함수로 추출하고 HTTP 핸들러 제거 | 범위 결정에 따라 전체 제거 또는 임시 잔여 핸들러 유지 |
| `lib/super-admin-service.ts` | 전체 분리 시 신규: 기존 SQL 업무 함수 | 상품 목록·상태·매핑·신청 목록·알림 재사용 |
| `scripts/test-product-administration.mjs` | 제거되는 핸들러 직접 호출을 route export 호출로 변경 | params 전달, HTTP 처리와 업무 정책 함께 검증 |
| `scripts/test-product-administration-browser.mjs` | URL별 응답·화면 회귀 항목 보강 | 실제 Next 라우팅과 SSR/hydration 확인 |
| 과거 계약을 기대하는 테스트·check 스크립트 | 기존 실패와 새 회귀를 분류하고 합의된 API 계약에 한해 조정 | 이전 전역 관리자 권한 재도입 방지 |
| `README.md` 등 API 구조 설명 | 구현 완료 후 실제 구조에 맞춰 필요한 부분만 갱신 | 설계와 실제 구현의 일치 |

다음 파일은 **호출 영향 확인 대상**이다. URL·DTO를 유지하면 수정할 필요가 없다.

- `app/(workspace)/admin/settings/page.tsx`
- `app/(workspace)/super-admin/settings/page.tsx`
- `components/admin/product-admin.tsx`
- `components/super-admin/product-console.tsx`
- `components/query/admin-product-boundary.tsx`
- `components/admin/admin-lists.tsx`
- `lib/query/keys.ts`, `lib/query/server-fetch.ts`, `lib/query/browser-fetch.ts`
- 독립 관리자 plans·ai-guardrails·settings API

DB 스키마·마이그레이션·인덱스·운영 데이터는 변경 대상이 아니다. 기존 테이블과 SQL 조건의 의미를 보존한다.

### 7.1 사용하지 않게 된 파일 삭제

- 향후 구현 과정에서 새 route·업무 함수로 대체되어 사용하지 않게 된 파일은 삭제한다. 빈 파일이나 미사용 구현을 보관 목적으로 남기지 않는다.
- 삭제 전 import·export, 동적 참조, 파일 기반 라우팅, 테스트·스크립트·설정의 참조를 확인하고 필요한 호출처를 새 구조로 전환한다. route 파일은 import가 없어도 URL 진입점이므로 단순 참조 검색만으로 미사용 여부를 판단하지 않는다.
- 대표 대상은 대체가 완료된 기존 catch-all route와 `lib/product-admin-api.ts`이며, 슈퍼관리자 전체 분리 시 `lib/super-admin-api.ts`도 포함한다. 계속 사용하는 권한·조회 함수가 남은 파일은 유지하고 미사용 부분만 제거한다.
- 삭제한 파일 목록과 대체 위치를 구현 완료 기록에 남기고, 삭제된 파일의 활성 참조가 없는지와 기존 정상 URL이 새 route에서 동작하는지 검증한다.
- 이 항목은 향후 구현 단계에 적용한다. 현재 문서 작성 단계에서는 소스 파일을 삭제하지 않는다.

## 8. 결정이 필요한 사항

| 결정 항목 | 권고안 | 다른 선택의 영향 |
| --- | --- | --- |
| 슈퍼관리자 분리 범위 | 상품 재사용 경로와 함께 5.3절 전체를 분리 | 상품만 먼저 분리하면 알림·신청의 lib 라우팅은 후속 작업으로 남음 |
| 기존 관리자 별칭 API | 조회 URL을 유지하고 PATCH는 명시적 405 유지 | 삭제 시 이전 호출자 영향 확인 필요. PATCH 저장 지원은 새로운 기능·권한 설계 필요 |
| catch-all의 비정상 경로 | 표에 없는 추가 segment·불완전 상세 URL은 404로 정규화 | 우연히 허용되던 URL까지 보존하려면 별도 호환 route가 늘어남 |
| 지원하지 않는 메서드 | 정상 업무는 명시된 메서드만 허용. workspace POST와 기존 별칭 PATCH는 기존 JSON 405 문구 보존 권고 | 전부 framework 기본 405로 맡기면 본문·헤더·인증 우선순위가 달라짐. 전부 기존 JSON로 맞추면 거절 handler가 증가 |
| team 상품 생성·business 전용 admins 등 | 새 기능은 열지 않고 기존 허용 범위 유지. 미지원 요청의 정확한 404/405는 URL별로 확정 | 일반화된 POST 구현으로 인해 team 생성이나 관리자 생성이 열릴 위험 |
| 명시적 `/overview`와 `me` 별칭 | 현재 지원 URL로 유지 | 제거하면 코드량은 줄지만 호환성 변경이므로 호출자 점검·공지 필요 |
| 조회 함수 모듈명 | 신규 `product-admin-service.ts`, `super-admin-service.ts` 사용 | 기존 `*-api.ts`에 순수 업무만 남길 수도 있으나 파일명과 역할이 어긋남 |
| 과거 전역 관리자 테스트 | 현재 상품·workspace 권한 계약과 충돌하는 기대는 별도 정리 | 예전 테스트 통과를 위해 권한·조회 범위를 복원하지 않음 |

권고안은 검토용 기본안이다. 특히 404·405의 JSON·오류 우선순위·헤더를 어디까지 보존할지와 슈퍼관리자 전체 분리 포함 여부는 구현 착수 전에 확정한다. 정상 URL의 권한·저장 정책 보존은 선택 사항이 아니다.

## 9. 구현 순서 제안

1. 8절의 범위를 확정하고 현재 정상 URL·응답·오류 계약을 격리 테스트에서 기록한다. 기존 테스트의 과거 정책 기대를 먼저 식별한다.
2. 기존 SQL·업무 조건을 별도 조회 서비스로 추출한다. HTTP 핸들러 교체 전후에 DTO·필터·transaction 경계를 대조한다.
3. 일반 상품과 master workspace의 URL별 route를 작성한다. 기존 base URL, `me`·overview 별칭, 네 개의 관리자 별칭을 연결한다.
4. 슈퍼관리자 상품 route를 공통 서비스에 연결한다. URL의 planCode 대조, master 검증, 상품 상태 변경의 별도 유효성 조건을 확인한다.
5. 전체 분리 합의 시 신청·알림 route도 옮기고 `handleSuperAdmin`을 제거한다.
6. 직접 핸들러 호출 테스트를 route export 호출로 전환하고 실제 Next 서버에서 URL 충돌·fallback·메서드 동작을 검증한다.
7. 모든 호출처 전환 후 기존 catch-all과 `handleProductAdmin`·`handleMasterWorkspace` 및 합의 범위의 `handleSuperAdmin`을 제거하고, 7.1절에 따라 수정하면서 사용하지 않게 된 파일을 삭제한다. 임시 호환 처리를 남겼다면 종료 조건을 문서화한다.
8. 코드·DB 변경 내역과 검증 결과는 구현 완료 기록에 별도로 남긴다.

## 10. 검증 방법과 완료 기준

### 10.1 이번 문서 작업의 검증

- 문서 경로가 `docs/history/2026-11-12/작업명.md` 형식인지 확인한다.
- `HISTORY.md`의 기존 목록을 보존하고 상대 경로 링크·작성일 한 줄만 추가했는지 확인한다.
- diff에서 본 문서와 `HISTORY.md`만 이번 작업으로 추가·수정되었는지 확인한다. 시작 시 이미 존재한 `PROMPT.md` 수정은 보존하며 이번 작업 변경으로 포함하지 않는다.
- 테스트 스크립트·Next 서버·마이그레이션을 실행하지 않는다. 테스트용 임시 DB도 생성하지 않는다.

### 10.2 구현 후 구조·정적 검증

- 모든 정상 URL이 목표 route 파일과 메서드에 대응하는지 목록을 대조한다.
- 제거 완료 범위에서 `handleProductAdmin`, `handleMasterWorkspace`, `handleSuperAdmin`, `product-admin-api`의 잔여 참조를 `rg`로 확인한다. 테스트도 포함한다.
- 새 업무 서비스에 `segments`, `request.method`, `Response.json`, `errorResponse` 기반 라우팅이 없는지 확인한다. HTTP 공통 helper가 lib에 존재하는 것 자체를 금지하는 검사는 하지 않는다.
- 변경 파일 ESLint, `pnpm typecheck`, `pnpm test:query-audit`, `pnpm build`를 수행한다. 새 `route.ts`의 async params와 route 충돌은 실제 Next 빌드에서도 확인한다.

### 10.3 구현 후 격리 회귀 검증

테스트는 운영 `.env`·운영 DB를 사용하지 않고 임시 SQLite와 합성 계정에서 실행한다. 구현 시점에만 수행하며, 기존 테스트의 DB 대체 주입과 브라우저 환경변수 격리를 먼저 확인한다.

| 영역 | 필수 확인 |
| --- | --- |
| 인증·범위 | 비로그인 401, 일반 회원 차단, 타 상품 관리자 차단, biz_admin/team_admin의 상품 종류 일치, master workspace 소속 검증 |
| 상품 유효성 | 활성·정지·만료 상품과 계약 기간별 조회 제한. 상태 PATCH는 기존 허용 조건 유지 |
| 정상 URL | 실제 productId·me·workspace·team/business와 표의 각 메서드. `/overview` 포함 |
| Next 라우팅 | 정적 workspace와 동적 productId, 고정 business/requests와 planCode, notifications/count와 notificationId, 독립 plans/ai-guardrails 충돌·fallback |
| 부정 URL·메서드 | 누락 source/id, extra segment, workspace candidates·회원 상세, 알 수 없는 planCode, team 생성, 잘못된 GET/POST/PATCH, HEAD·OPTIONS의 확정된 동작 |
| 후보 | 이메일 정규화·기본 검증, rate limit 키·한도, 자격 없는 회원과 활성 타 상품 소속 제외 |
| 회원·이력 조회 | 검색 특수문자, pageSize 허용값, 마지막 페이지 보정, 미배정·프로젝트 범위, count/목록 일치, 없는 상세 404, 타 범위 상세 유출 차단 |
| 이력 의미 | 기록 이름·현재 이름·이메일·현재 배정 기준, 삭제 계정 이름, before/after JSON, source 구분 유지 |
| 쓰기 보안 | 잘못된 Origin 403, 잘못된 JSON 400·과대 입력 413, 허용하지 않는 필드 400, version 충돌 409, transaction 안의 권한 재확인 |
| 저장 정책 | 중복·정원·동시 지원, 일반 회원 역할 유지, 소유 프로젝트가 있는 회원의 회수 제한, 구독 복구·원자적 이력 기록 |
| 슈퍼관리자 | 상품 종류 불일치 차단, 생성·상태·관리자·매핑 응답과 이력, 알림 수신자 격리·카운터 분리, 신청 상태 처리 |
| Query·화면 | 초기 SSR/hydration, 페이지·검색·상세 모달, workspace 전환, 지원 변경 후 invalidate, 기존 오류 status/code/details 표시, 저장 자동 재시도 없음 |

`pnpm test:product-administration`은 기존처럼 lib dispatcher만 호출하는 방식으로 통과시키지 않는다. URL별 route의 실제 GET/POST/PATCH export와 `context.params`를 호출하여 검증한다. framework가 담당하는 404·405·동적 경로 선택은 단위 호출만으로 확인되지 않으므로 실제 서버 회귀가 필요하다.

`pnpm test:product-administration-browser --production`은 합성 DB로 정상 화면·상세 모달·권한 차단과 실제 URL 선택을 검증한다. API가 달라지지 않는 RFP는 필수 변경 대상 테스트가 아니며, 실제 공유 코드 영향이 발생했을 때 관련 테스트를 추가한다.

### 10.4 구현 완료 판정

- route 파일에서 URL별 메서드, 권한 함수, 호출 업무, 응답 형태를 직접 확인할 수 있다.
- 필수 범위에 경로 배열 기반 lib dispatcher와 HTTP 핸들러 간 재호출이 남지 않는다.
- 수정하면서 사용하지 않게 된 파일은 삭제되었고, 삭제된 파일의 활성 참조가 없으며 대체된 URL·업무가 정상 동작한다.
- 표의 정상 URL·업무 정책·검색 의미·DTO·Query 동작을 보존하고, 합의한 404·405 변경만 발생한다.
- 필요한 구조·API·브라우저 검증이 통과하고 기존 실패·미지원 계약은 구분하여 기록한다.
- DB 스키마와 운영 데이터 변경 없이 완료한다.
