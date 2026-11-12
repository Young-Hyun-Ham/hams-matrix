# HAMS Matrix

## 프로젝트 문서 관리

WBS·아키텍처·요구사항·화면·DB·프로그램·검증 결과를 관리번호와 버전으로 연결합니다.
프로젝트를 열면 WBS 간트·계층/선행 관계·공수/진척률, DB 컬럼/PK/FK·ERD,
프로그램별 테이블 CRUD, 기술 검토, 버전별 검증 증빙과 통합 검수 점검을 사용할 수 있습니다.
Excel에도 같은 관리번호·버전·관계·검수 결과를 출력합니다.
먼저 `pnpm db:migrate`로 `006_integrated_deliverables.sql`까지 적용하세요.
전체 범위와 규칙은 [통합 산출물 체계](docs/INTEGRATED_DELIVERABLES.md)를 확인하세요.

고객 요구사항, 화면설계서, 프로그램설계서와 팀의 맥락을 연결하는 SaaS 웹앱입니다.

Next.js 16 App Router · TypeScript · React 19 · Zustand 5 · Turso / `@libsql/client`. 정책 테스트의 PDF·DOCX 본문 추출에는 `unpdf`·`fflate`·`saxes`를 사용합니다.

## 실행

```sh
pnpm db:migrate
pnpm dev
```

`http://localhost:3000`에서 시작합니다. 미로그인 사용자는 `/login`, 로그인한 사용자는 `/dashboard`로 이동합니다. 기존 `.env`는 변경하지 않았습니다. 마이그레이션은 기존 데이터를 삭제하지 않으며 재실행할 수 있습니다.

## 구현 범위

팀 가입 승인(member), Free 사용자 직접 추가(viewer), 프로젝트별 권한·소유권 양도, 팀 게시글·댓글·가입 직무 표시는 [팀 공유와 프로젝트 권한](docs/TEAM_COLLABORATION.md)을 참고하세요. `pnpm db:migrate`로 `018_team_collaboration.sql`까지 적용합니다.

AI Chatbot의 관리자 보안 정책은 [AI 가드레일 운영](docs/AI_GUARDRAILS.md)을 참고하세요. `/admin/ai-guardrails`에서 워크스페이스별 초안·적용·테스트·복원을 관리합니다. `pnpm db:migrate`로 `017_ai_guardrails.sql`까지 적용합니다.

- 이메일 회원가입·로그인·로그아웃, user 역할·Free 플랜으로 시작
- owner의 팀 가입 승인(member)·거절, Free 사용자 직접 추가(viewer), 프로젝트별 권한과 소유권 양도
- Google / Naver / Kakao OAuth2 가입·로그인 코드, state 검증, Google PKCE
- 서버 세션, scrypt 비밀번호 해시, HttpOnly 쿠키, 세션 만료·폐기, Origin 검사와 시도 횟수 제한
- 계정 설정에서 이름 변경, 계정 활동 조회 API
- 상세 감사 이력 스키마, 수정·삭제 방지 트리거, 데이터 변경과 이력의 원자적 저장
- 실제 데이터 기반 대시보드와 프로젝트 상세, WBS·아키텍처·요구사항·화면·DB·프로그램·검증 결과 CRUD, 통합 검수 및 산출물 다운로드
- 모바일 메뉴, 메뉴 검색, 프로젝트 선택 유지, 항목 검색·상태 필터

대시보드에서 프로젝트를 생성하거나 열 수 있습니다. 프로젝트별 요구사항·화면·프로그램을 등록·수정·삭제하고 고정 관리번호로 연결합니다. 변경 이력은 삭제 후에도 보존하며 엑셀의 정의서·설계서·추적표에 같은 관리번호를 사용합니다. 팀 공유는 실제 구성원·담당 역할·게시글·댓글을 표시합니다. 기관 지정 원본 서식은 아직 확정되지 않았으며 프로젝트 수정·삭제, 이메일 초대, 결제·구독 및 테스트 자동 실행은 후속 범위입니다.

## OAuth 환경 설정

가입과 팀 승인 관련 문서는 [가입 및 팀 승인 문서](docs/REGISTRATION.md)를 확인하세요. 현재 이메일·신규 소셜 가입은 user 역할·Free 플랜으로 시작하며, `/onboarding`은 완료 상태를 처리한 뒤 대시보드로 이동합니다. 이전 역할·플랜·팀 선택 폼은 사용하지 않습니다.

현재 `.env`에는 Turso 설정만 있으므로 소셜 로그인 사용 전에 `.env.example`의 항목을 추가해야 합니다. 각 서비스 개발자 콘솔에서 웹 앱, 동의 항목 및 다음 콜백 URL을 등록하세요.

| 제공자 | 필요한 환경변수                                                           | 로컬 콜백 URL                                          |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| Google | GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET                                    | `http://localhost:3000/api/auth/oauth/google/callback` |
| Naver  | NAVER_CLIENT_ID, NAVER_CLIENT_SECRET                                      | `http://localhost:3000/api/auth/oauth/naver/callback`  |
| Kakao  | KAKAO_CLIENT_ID(REST API 키), KAKAO_CLIENT_SECRET(콘솔에서 활성화한 경우) | `http://localhost:3000/api/auth/oauth/kakao/callback`  |

`APP_URL=http://localhost:3000`을 로컬 설정에 추가하고, 운영에서는 실제 **HTTPS** 서비스 주소로 지정해야 합니다. 운영 콜백 URL도 같은 주소로 등록합니다. 이 값은 신뢰할 수 있는 OAuth 리다이렉트 및 변경 요청 Origin 검증에 사용합니다. Kakao는 닉네임 프로필 동의를 설정하세요. 이메일을 사용할 경우 해당 동의 항목도 설정해야 합니다. Google은 openid/email/profile 스코프를 요청합니다. Naver는 제공자 ID 기반으로 가입합니다.

기존 이메일 계정과 동일한 검증된 이메일이 반환되면 자동으로 연결하지 않고 기존 로그인 방법을 안내합니다. 소셜 제공자의 실제 코드 교환은 앱 키 및 각 콘솔의 동의/리다이렉트 설정이 있어야 검증할 수 있습니다.

공식 문서: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md), [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api).

## 구조와 디자이너 협업

화면 소스는 `components/pages/<메뉴>/<메뉴>-page.tsx`, 화면 전용 CSS는 `styles/pages/`에서 관리합니다. 공통 UI는 `components/shared`, 서버 인증·조회 이력·로딩 처리는 `components/workspace-section.tsx`에서 담당합니다. 페이지별 작업 위치는 [components/pages/README.md](components/pages/README.md)를 확인하세요.

| 경로                                          | 역할                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/(auth)`                                  | 로그인 / 회원가입 페이지                                                                 |
| `app/(workspace)`                             | 인증이 필요한 공통 레이아웃 및 7개 메뉴                                                  |
| `app/api`                                     | 인증, OAuth 콜백, 프로필, 계정 활동 API                                                  |
| `components`                                  | 인증 폼, 워크스페이스 셸, 메뉴별 화면                                                    |
| `stores/workspace.ts`                         | Zustand의 사용자 표시 정보, 모바일 메뉴, 검색 상태. 토큰은 저장하지 않음                 |
| `styles/globals.css`                          | 색상·여백 토큰, 기본 스타일 및 공통 버튼                                                 |
| `styles/auth.css`                             | 로그인·가입·이용 안내 스타일                                                             |
| `styles/workspace.css`                        | 역할별 공통 CSS를 고정 순서로 불러오는 진입점. [스타일 작업 위치](styles/README.md) 참고 |
| `lib/auth.ts`, `lib/oauth.ts`, `lib/audit.ts` | 서버 인증 및 감사 기록                                                                   |
| `db/migrations/001_identity_audit.sql`        | 실제 테이블·인덱스·감사 보호 트리거                                                      |

브랜드 포인트 색상 등은 `styles/globals.css`의 CSS 변수로 조정합니다. 워크스페이스는 1200/960/700/420px, 인증 화면은 1000/760px 기준으로 반응합니다. 700px 이하에서 사이드바는 오버레이 메뉴로 바뀌고, 긴 표는 가로 스크롤을 제공합니다. 스타일은 별도 CSS로 분리했으며, 진행률처럼 데이터에 따라 바뀌는 값만 CSS 커스텀 속성으로 전달합니다.

## 이력과 후속 확장

`admin_setting` 테이블의 `DB_LOGGING_ENABLED` 설정이 JSON boolean `true`일 때만 DB 감사 이력을 저장합니다. 기본값은 현재 설정과 동일한 `false`이며, `.env` 값은 사용하지 않습니다. DB 값을 바꾸면 재시작 없이 다음 요청부터 반영됩니다. 기존 이력은 삭제하지 않습니다. 관리자의 설정 화면/API는 추후 구현 범위이며 현재 설정 변경 API는 공개하지 않습니다.

```sql
UPDATE admin_setting
SET value_json = 'true', version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE setting_key = 'DB_LOGGING_ENABLED';
```

`admin_setting`는 키, JSON 값, 자료형(boolean/number/string/json), 분류, 화면 표시명, 설명, 버전, 수정자, 생성·수정 시각을 저장합니다. 신규 마이그레이션을 실행해도 기존 설정은 덮어쓰지 않습니다. 서버 조회는 `lib/settings.ts`의 `getAppSetting()` / `getBooleanSetting()`을 사용합니다. 이 테이블에는 일반 운영 설정을 보관하며 OAuth 앱 비밀키 같은 자격증명은 기존 환경변수에서 관리합니다.

상단 헤더의 알림 왼쪽에 라이트/다크 모드 토글이 있습니다. Zustand로 테마 상태를 관리하고 브라우저 localStorage에 선택을 저장합니다. 로그인·회원가입을 포함한 모든 화면에 동일한 테마가 적용되며 새로고침 시 초기 스크립트로 먼저 적용합니다. 스타일은 `styles/themes.css`에 분리했습니다.

전체 설계 및 업무 CRUD 구현 규칙은 [docs/AUDIT.md](docs/AUDIT.md)를 확인하세요. 감사 이력은 변경 전후 스냅샷, 변경 필드, 사용자·워크스페이스, 동일 요청의 상관관계 ID, 시각, 경로, 결과를 포함합니다. 비밀번호·토큰 등 비밀정보는 기록하지 않습니다.

`/policies`는 초기 개발 버전의 실제 처리 범위를 설명합니다. 출시 전 운영자·문의처·보유기간 등 운영 정책을 확정해야 합니다. 이메일 소유권 인증, 비밀번호 재설정, 다중 인증 및 소셜 계정 연결은 이번 구현 범위에 포함되지 않습니다.

## 검증

```sh
pnpm typecheck
pnpm build
pnpm test:auth
pnpm test:migration
pnpm test:auth:dev
pnpm test:auth:no-logs
```

`test:auth`는 **빌드 완료 후** 실행합니다. OS 임시 디렉터리의 독립 DB와 별도 포트(기본 3107)의 프로덕션 서버를 사용하며 `.env`의 DB 접속 정보는 테스트 프로세스에서 덮어씁니다. 실제 Turso DB에 테스트 계정이나 이력을 만들지 않습니다. 테스트 DB는 진단을 위해 OS 임시 디렉터리에 남깁니다.

회원가입, 비밀번호 해시, 정상/실패 로그인, 쿠키, 접근 통제, 프로필 전후 이력, 이력 실패 시 롤백, 이력 변조 방지, 테넌트 분리, 7개 화면 응답, 로그아웃, 세션 만료, 요청 제한과 미설정 OAuth 안내를 검증합니다. 제공자의 실제 소셜 계정 로그인은 앱 키 설정 후 별도 확인이 필요합니다.

`test:auth:dev`는 소스를 `.auth-tests/`의 별도 복사본에 준비하고 개발 모드에서도 같은 테스트를 실행합니다. 기존 개발 서버의 잠금 파일과 DB를 공유하지 않습니다. 새로고침·반복 페이지 요청 중 발생하는 Next.js 프리렌더링 경고와 서버/클라이언트 간 객체 직렬화 경고도 검사합니다. 두 테스트는 같은 기본 포트를 사용하므로 순서대로 실행하세요.

기본 인증 테스트는 테스트 DB의 로깅을 활성화합니다. 실행 중 DB 설정을 껐다 켜서 재시작 없이 반영되는지도 확인합니다. `test:auth:no-logs`는 DB 로깅을 끄고 회원가입·프로필 수정·로그인·로그아웃이 정상 동작하면서 감사 행이 하나도 생성되지 않는지 확인합니다. 테스트의 기존 환경변수는 DB와 반대 값으로 넣어 환경변수에 의존하지 않음을 검증합니다. 실제 `.env`와 Turso 데이터는 변경하지 않습니다.




## workspace 시스템설정과 Query 전환 (2026-11-11)

`043_workspace_system_settings.sql`은 workspace별 조회 유지 시간·재시도·오류 문구를 저장합니다. 관리자설정의 시스템설정 탭에서 현재 공간만 수정하며, 설정이 없으면 60초·추가 재시도 3회와 공통 문구를 사용합니다. 읽기 권한과 쓰기/충돌 검증은 각 API에서 유지합니다.

일반 조회는 사용자·workspace별 Query/IQ, 변경은 Mutation으로 관리합니다. 서버 초기 데이터는 hydration으로 공유하며, 다운로드·생성 스트림·외부 서버 전송은 기존 전송 방식을 유지합니다. 편집 중인 초안과 권한·버전 검증은 기존 계약을 따릅니다. 구현 및 DB 적용·검증 결과는 [작업 기록](docs/work/2026-11-11/fetch-ReactQuery-전환-구현.md)을 확인하세요. 검증 명령은 `pnpm test:system-settings`, `pnpm test:system-settings-api`, `pnpm test:query-audit`입니다.

### 관리자 이력 검색·상세보기 (2026-11-11)

이력관리는 회원관리와 같은 이름·이메일/프로젝트 검색을 제공하며 작업자의 현재 프로젝트 배정 상태로 필터링합니다. 상세보기는 공통 모달에서 변경 전·후를 표시합니다. [작업 기록](docs/work/2026-11-11/관리자-이력관리-검색조건-상세모달.md).

### 헤더 알림 카운터·패널 (2026-11-11)

일반/계약 알림은 카운터만 15초마다 갱신하고 목록은 패널을 열 때 조회합니다. 우측 상단 빨간 배지를 표시하며 바깥 클릭과 Escape로 닫힙니다. 일반 알림은 팀 가입 검토 대기 건수, 계약알림은 미확인 계약 건수입니다. [작업 기록](docs/work/2026-11-11/헤더알림-카운터조회-패널분리.md).

### AI·프로젝트 권한 조회 (2026-11-11)

권한 10초 폴링을 제거했습니다. 챗봇 열기·프로젝트 변경 시 UI 권한을 조회하고 AI 실행·대상 변경 및 일반 등록·수정·삭제 직전에 최신 권한을 확인합니다. 실제 서버 작업의 권한 검증은 유지합니다. [작업 기록](docs/work/2026-11-11/AI-프로젝트권한-폴링제거-작업직전확인.md).

### 인터페이스 테마 선택 (2026-11-11)

기본테마 select를 라이트·다크 각 3개 스와치와 커스텀 버튼으로 바꿨습니다. 프리셋의 강조 색상은 고정되며 커스텀에서만 색상/HEX를 편집합니다. 기존 개인 색상은 커스텀으로 보존합니다. [작업 기록](docs/work/2026-11-11/인터페이스-테마프리셋-커스텀색상.md).

2026-11-11 추가: 커스텀도 라이트·다크로 분리해 각 프리셋 행 오른쪽에 배치했습니다. [작업 기록](docs/work/2026-11-11/커스텀테마-라이트다크-버튼분리.md).

2026-11-11: 테마 커스텀 버튼 문구를 10px 한 줄로 표시합니다. [작업 기록](docs/work/2026-11-11/커스텀버튼-글자-한줄표시.md).

### 관리자 API 라우팅과 업무 함수 (2026-11-12)

상품 관리자·현재 workspace·슈퍼관리자 상품/계약 신청/알림 API는 URL별 `app/api/**/route.ts`에서 HTTP 메서드와 응답을 처리합니다. 권한 검사는 `lib/product-access.ts`와 `lib/master-workspace-admin.ts`, 조회·저장 업무는 `lib/product-admin-service.ts`, `lib/super-admin-service.ts`와 기존 저장 함수로 분리했습니다. 대체된 catch-all과 lib HTTP 핸들러는 삭제했습니다.

기존 화면 URL·검색·응답·Query 정책을 유지하며, workspace POST와 `/api/admin/members` PATCH는 기존 JSON 405로 거절합니다. 불완전·추가 경로는 404, 그 외 미지원 메서드는 Next의 기본 405를 사용합니다. DB 변경은 없습니다. 검증과 변경 파일은 [작업 기록](docs/work/2026-11-12/관리자API-라우팅과-업무함수-분리.md)을 참고하세요.

### 화면·프로젝트 탭별 CSS 위치 (2026-11-12)

공통 기반 CSS 17개는 `styles/`, 화면 소유 CSS 31개는 `styles/pages/[화면주소]/`에서 관리합니다. 프로젝트 탭 전용 CSS는 `styles/pages/projects/tabs/[ProjectTab 식별자]/`에 두며 WBS는 `tabs/wbs/`, 프로그램은 `tabs/program/`, 산출물은 `tabs/export/`를 사용합니다. 기존 공통 파일과 CSS 선언·로딩 순서는 유지했고 이동 전 경로의 복사본은 남기지 않았습니다. [스타일 작업 위치](styles/README.md)와 [CSS 정리 기록](docs/work/2026-11-12/CSS-화면주소별-스타일경로-정리.md)을 참고하세요. 미사용 UI의 전용 CSS 2개는 후속 소스 정리에서 제거했습니다.

### 미사용 컴포넌트 정리 (2026-11-12)

현재 화면에 연결되지 않는 컴포넌트·훅·유틸리티 18개와 전용 CSS 2개, 샘플 데이터·프로젝트 store 2개를 제거했습니다. 현재 14개 프로젝트 탭, 가입·온보딩, 공개 API, 동적 아이콘과 공통 스타일은 유지합니다. 테스트가 직접 호출하는 `lib/admin-history.ts`도 유지하며 DB·의존성 변경은 없습니다. 상세 범위와 검증 결과는 [작업 기록](docs/work/2026-11-12/미사용-컴포넌트-전수조사-정리.md)을 확인하세요.

## 대시보드 개편 (2026-11-12)

`/dashboard`는 문서 작업 흐름 배너, 프로젝트 필터, 요약 4종, 프로젝트 카드, 최근 산출물과 재검증 후보를 표시합니다. `GET /api/dashboard`는 현재 사용자/workspace의 배정 프로젝트와 READ·이력 플랜 범위를 적용한 요약만 반환합니다. 최근 변경은 오늘 포함 한국시간 7일의 UPDATE 횟수이며, 문서함 파일과 RFP 원본은 관리 항목 수에 포함하지 않습니다. 전체 상태의 작업 버튼은 프로젝트를 먼저 고르며 RFP 시작 의도로 프로젝트를 생성한 경우 해당 프로젝트의 제안요청서 탭으로 이동합니다.

기존 개인 테마를 따르고 대시보드 전용 스타일은 `styles/pages/dashboard/dashboard-page.css`에서 관리합니다. DB 스키마·운영 데이터·의존성 변경은 없습니다. `pnpm test:dashboard`는 임시 SQLite와 합성 계정으로 집계·권한/API를 검사합니다. `pnpm build` 후 `pnpm test:dashboard-browser`는 별도의 임시 DB와 headless Chrome으로 SSR·필터·반응형·RFP 진입을 검증합니다. [작업 기록](docs/work/2026-11-12/대시보드-퍼플화면-개편.md).
