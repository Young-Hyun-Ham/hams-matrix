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

- 이메일 회원가입·로그인·로그아웃, owner/user 역할 및 플랜·팀 선택
- owner의 팀 가입 승인(member)·거절, Free 사용자 직접 추가(viewer), 프로젝트별 권한과 소유권 양도
- Google / Naver / Kakao OAuth2 가입·로그인 코드, state 검증, Google PKCE
- 서버 세션, scrypt 비밀번호 해시, HttpOnly 쿠키, 세션 만료·폐기, Origin 검사와 시도 횟수 제한
- 계정 설정에서 이름 변경, 계정 활동 조회 API
- 상세 감사 이력 스키마, 수정·삭제 방지 트리거, 데이터 변경과 이력의 원자적 저장
- 실제 데이터 기반 대시보드와 프로젝트 상세, WBS·아키텍처·요구사항·화면·DB·프로그램·검증 결과 CRUD, 통합 검수 및 산출물 다운로드
- 모바일 메뉴, 메뉴 검색, 프로젝트 선택 유지, 항목 검색·상태 필터

대시보드에서 프로젝트를 생성하거나 열 수 있습니다. 프로젝트별 요구사항·화면·프로그램을 등록·수정·삭제하고 고정 관리번호로 연결합니다. 변경 이력은 삭제 후에도 보존하며 엑셀의 정의서·설계서·추적표에 같은 관리번호를 사용합니다. 팀 공유는 실제 구성원·담당 역할·게시글·댓글을 표시합니다. 기관 지정 원본 서식은 아직 확정되지 않았으며 프로젝트 수정·삭제, 이메일 초대, 결제·구독 및 테스트 자동 실행은 후속 범위입니다.

## OAuth 환경 설정

역할별 가입, 테스트 플랜과 팀 승인 흐름은 [가입 및 팀 승인 문서](docs/REGISTRATION.md)를 확인하세요. 신규 소셜 가입도 인증 후 역할 선택을 완료해야 합니다.

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

일곱 메뉴는 `components/pages/<메뉴>/<메뉴>-page.tsx`와 같은 폴더의 CSS로 분리되어 있습니다. 공통 UI는 `components/shared`, 서버 인증·조회 이력·로딩 처리는 `components/workspace-section.tsx`에서 담당합니다. 페이지별 작업 위치는 [components/pages/README.md](components/pages/README.md)를 확인하세요.

| 경로                                          | 역할                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/(auth)`                                  | 로그인 / 회원가입 페이지                                                                 |
| `app/(workspace)`                             | 인증이 필요한 공통 레이아웃 및 7개 메뉴                                                  |
| `app/api`                                     | 인증, OAuth 콜백, 프로필, 계정 활동 API                                                  |
| `components`                                  | 인증 폼, 워크스페이스 셸, 메뉴별 화면                                                    |
| `stores/workspace.ts`                         | Zustand의 사용자 표시 정보, 모바일 메뉴, 검색 상태. 토큰은 저장하지 않음                 |
| `app/globals.css`                             | 색상·여백 토큰, 기본 스타일 및 공통 버튼                                                 |
| `styles/auth.css`                             | 로그인·가입·이용 안내 스타일                                                             |
| `styles/workspace.css`                        | 역할별 공통 CSS를 고정 순서로 불러오는 진입점. [스타일 작업 위치](styles/README.md) 참고 |
| `lib/sample-data.ts`                          | 화면 퍼블리싱 전용 샘플                                                                  |
| `lib/auth.ts`, `lib/oauth.ts`, `lib/audit.ts` | 서버 인증 및 감사 기록                                                                   |
| `db/migrations/001_identity_audit.sql`        | 실제 테이블·인덱스·감사 보호 트리거                                                      |

브랜드 포인트 색상 등은 `app/globals.css`의 CSS 변수로 조정합니다. 워크스페이스는 1200/960/700/420px, 인증 화면은 1000/760px 기준으로 반응합니다. 700px 이하에서 사이드바는 오버레이 메뉴로 바뀌고, 긴 표는 가로 스크롤을 제공합니다. 스타일은 별도 CSS로 분리했으며, 진행률처럼 데이터에 따라 바뀌는 값만 CSS 커스텀 속성으로 전달합니다.

## 이력과 후속 확장

`app_settings` 테이블의 `DB_LOGGING_ENABLED` 설정이 JSON boolean `true`일 때만 DB 감사 이력을 저장합니다. 기본값은 현재 설정과 동일한 `false`이며, `.env` 값은 사용하지 않습니다. DB 값을 바꾸면 재시작 없이 다음 요청부터 반영됩니다. 기존 이력은 삭제하지 않습니다. 관리자의 설정 화면/API는 추후 구현 범위이며 현재 설정 변경 API는 공개하지 않습니다.

```sql
UPDATE app_settings
SET value_json = 'true', version = version + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE setting_key = 'DB_LOGGING_ENABLED';
```

`app_settings`는 키, JSON 값, 자료형(boolean/number/string/json), 분류, 화면 표시명, 설명, 버전, 수정자, 생성·수정 시각을 저장합니다. 신규 마이그레이션을 실행해도 기존 설정은 덮어쓰지 않습니다. 서버 조회는 `lib/settings.ts`의 `getAppSetting()` / `getBooleanSetting()`을 사용합니다. 이 테이블에는 일반 운영 설정을 보관하며 OAuth 앱 비밀키 같은 자격증명은 기존 환경변수에서 관리합니다.

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



