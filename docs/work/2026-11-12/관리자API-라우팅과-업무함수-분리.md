# 관리자 API 라우팅과 업무 함수 분리

- 작성일: 2026-11-12 (한국시간)
- 기준: 최신 [설계 문서](../../history/2026-11-12/관리자API-라우팅과-업무함수-분리-설계.md)를 다시 읽고 권고안 전체를 구현했다.
- 상태: 구현 및 관련 검증 완료.

## 주요 변경사항

- 상품 관리자·master workspace·슈퍼관리자 상품/계약 신청/알림을 URL별 route로 분리했다. 메서드·입력·권한 함수 호출·응답은 각 route에서 확인할 수 있다.
- 권한·조회·저장 업무는 lib 함수로 재사용하며 기존 URL·DTO·검색·트랜잭션·Query 정책을 보존했다. `me`·명시적 overview 별칭도 유지한다.
- 정지·만료 상품의 상태 변경은 조회용 활성 상품 조건과 분리했다. 슈퍼관리자의 상품 종류와 동적 경로의 예약어를 검증한다.
- 검색은 명시적 값으로 업무 함수에 전달하며 기존 페이지 검증 순서·LIKE 이스케이프·현재 프로젝트 배정 기준을 유지한다.
- 대체된 두 catch-all route와 `lib/product-admin-api.ts`, `lib/super-admin-api.ts`를 삭제했다. 활성 소스·테스트의 이전 핸들러 참조도 제거했다.
- workspace POST와 기존 회원 별칭 PATCH는 JSON 405를 유지한다. 나머지 미지원 메서드는 Next의 기본 405, 불완전·추가 경로는 404로 정규화한다.

## 변경 파일

- 신규 route 27개: `app/api/admin/products/[productId]/**/route.ts`, `app/api/admin/products/workspace/**/route.ts`, `app/api/super-admin/[planCode]/products/**/route.ts`, `app/api/super-admin/business/requests/**/route.ts`, `app/api/super-admin/notifications/**/route.ts`. 각 base의 `route.ts`도 포함한다.
- 기존 별칭 route 4개: `app/api/admin/members/route.ts`, `app/api/admin/members/[userId]/route.ts`, `app/api/admin/history/route.ts`, `app/api/admin/history/[source]/[id]/route.ts`.
- `lib/product-admin-service.ts`, `lib/super-admin-service.ts`, `lib/master-workspace-admin.ts`
- `lib/product-access.ts`, `lib/admin-query.ts`, `lib/admin-history-query.ts`
- `scripts/test-product-administration.mjs`, `scripts/test-product-administration-browser.mjs`: 실제 route export 및 Next 서버 검증 보강.
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md`, 본 작업 기록.

삭제한 파일과 대체 위치는 다음과 같다.

| 삭제 파일 | 대체 위치 |
| --- | --- |
| `app/api/admin/products/[...segments]/route.ts` | 명시적 productId·workspace 하위 route |
| `app/api/super-admin/[...segments]/route.ts` | 명시적 상품·계약 신청·알림 route |
| `lib/product-admin-api.ts` | `lib/product-admin-service.ts`, 기존 권한·저장 함수, URL별 route |
| `lib/super-admin-api.ts` | `lib/super-admin-service.ts`, 기존 생성·신청 처리 함수, URL별 route |

계속 사용하는 `lib/master-workspace-admin.ts`의 scope 함수는 유지하고 HTTP 핸들러만 업무별 함수로 교체했다. 기존 미사용 `AdminList` 등 이번 수정으로 새로 미사용이 된 것이 아닌 파일은 범위 밖이므로 유지했다.

## DB 변경 여부

스키마·마이그레이션·운영 DB 변경 없음. 검증은 임시 SQLite와 합성 계정으로 수행한다.

## 검증 결과

- 변경 전 `pnpm test:product-administration`: 통과.
- 변경 전 `pnpm test:team-sharing`: 기존 실패. `scripts/test-team-sharing.mjs:213`에서 이전 관리자 권한 기대 400과 실제 403이 불일치한다. 이번 분리로 권한을 확대하지 않는다.
- 변경 후 `pnpm test:product-administration`: 통과. 41개 route 메서드 인증, 별칭·상세 범위, Origin·JSON·크기 제한, 상태 변경·version 충돌·계약 만료, legacy workspace 연결·이력, 사용자별 공통 후보 조회 제한과 기존 상품 관리자 회귀를 검증했다.
- `pnpm exec next typegen`, `pnpm typecheck`: 통과. 삭제된 catch-all을 참조하던 `.next/dev/types` 생성 캐시만 workspace 내부 경로 확인 후 제거했다. 소스의 타입 오류는 없다.
- 변경 파일 ESLint: 오류 0, 기존 브라우저 스크립트 `openMismatch` 미사용 경고 1건 유지.
- `pnpm test:query-audit`: 통과. 84개 파일·172개 호출, 미분류 0건.
- `pnpm build`: 통과. 새 명시적 route 목록과 독립 plans·ai-guardrails 경로를 확인했다. prerender 중 `Request failed Error` 로그가 출력되지만 빌드 종료 코드는 0이다. 운영 DB 대신 임시 SQLite 경로를 지정했다.
- `pnpm test:product-administration-browser --production`: 통과. 실제 Next 서버에서 정적·동적 URL 우선순위, 예약어·상품 종류 차단, 불완전·추가 경로 404, 미지원 메서드·별칭 PATCH·workspace POST 405, HEAD·OPTIONS·캐시 헤더를 확인했다. 기존 SSR·회원 목록·검색·상세 모달·workspace 전환·알림 카운터/패널·계정/플랜 UI도 통과했다. 독립 가드레일 API는 기존 상품 workspace 정책에 맞춰 검증했고 구현은 변경하지 않았다. 화면 증거: `%TEMP%/matrix-product-browser-2OD48r`.
- 삭제한 파일의 활성 참조 없음, 업무 서비스의 HTTP 라우팅 의존성 없음, 변경 파일 diff 공백 검사 통과. 작업 기록·WORK_HISTORY 링크와 README/AGENTS/CLAUDE 갱신을 확인했다.
- API 보강 초기의 legacy workspace 합성 데이터는 기존 plan CHECK·자동 상품 연결 trigger를 반영하도록 수정한 뒤 재검증했다. DB 제약을 완화하지 않았다.

## 미완료 사항

- 이번 구현 범위의 미완료 사항은 없다. 변경 전부터 실패하던 팀 공유 테스트의 과거 관리자 권한 기대 정리는 별도 작업으로 남긴다.
- 시작 시 기존 `PROMPT.md`, `HISTORY.md`, 설계 문서 변경을 보존했다. 민감정보와 운영 DB 연결은 기록하거나 사용하지 않는다.
