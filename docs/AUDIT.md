# 인증 및 감사 이력 설계

통합 산출물의 구조·일정·컬럼·버전 기준은 [통합 산출물 체계](INTEGRATED_DELIVERABLES.md)를 참조하세요.

## 범위

회원가입, 이메일/소셜 로그인, 로그아웃, 프로필 이름 변경, 계정 활동 조회와 프로젝트 문서 관리를 제공합니다. 요구사항·화면·프로그램 CRUD와 추적성·Excel 출력은 [추적성 문서](TRACEABILITY.md)를 참조하세요. 팀 게시글, 결제, AI 호출은 미구현이며 팀 공유 화면은 샘플입니다.

## 테이블

프로젝트 생성은 `POST /api/projects`, 내 프로젝트 조회는 `GET /api/projects`, 팀원 조회는 `GET /api/team/members`로 제공합니다. 팀은 현재 세션의 워크스페이스를 기준으로 하며 생성자는 자동으로 참여합니다. 가입 역할이 owner이고 멤버십이 owner/admin/member인 계정만 생성할 수 있으며 user는 조회만 가능합니다. 프로젝트 목록은 현재 워크스페이스에서 자신이 참여한 프로젝트만 반환합니다. 승인된 user는 팀의 기존·신규 프로젝트에 자동 포함됩니다. 프로젝트와 참여자, 이름·설명·참여자 ID를 포함한 CREATE 이력은 같은 트랜잭션으로 저장합니다. 이력 활성화 여부는 기존 DB 설정을 따릅니다. 가입·승인의 상세 규칙은 [가입 및 팀 승인](REGISTRATION.md)을 확인하세요.

`003_projects.sql`의 `projects`는 프로젝트 기본 정보와 생성자·생성/수정 시각을 저장하고, `project_members`는 참여자를 저장합니다. 복합 외래키는 프로젝트와 참여자가 같은 워크스페이스에 속하도록 보장합니다. 프로젝트 수정·삭제 및 팀원 초대 UI는 후속 범위입니다.

| 테이블            | 역할                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| users             | 사용자 ID, 이메일(소셜은 null 가능), 이름, scrypt 해시, 생성·수정 시각 |
| workspaces        | SaaS의 테넌트 경계, 이름, 플랜, 소유자                                 |
| workspace_members | 사용자와 테넌트의 관계 및 owner/admin/member/viewer 역할               |
| oauth_accounts    | 제공자 + 제공자의 고유 사용자 ID의 복합키, 연결 사용자 ID              |
| sessions          | 난수 세션 토큰의 SHA-256 해시, 사용자·테넌트, 만료·폐기 시각           |
| auth_rate_limits  | 해시된 버킷 키, 시도 횟수, 15분 윈도 종료 시각                         |
| audit_logs        | 수정 및 삭제할 수 없는 작업 이력                                       |

## audit_logs 필드

| 필드                               | 의미                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| id / occurred_at                   | UUID / UTC ISO 8601 시각. 화면에는 한국 시간으로 표시                                |
| request_id                         | 한 요청에서 발생한 사용자·권한·워크스페이스·세션 이력의 상관관계 UUID                |
| workspace_id                       | 테넌트 ID. 로그인 전 익명 이벤트는 null                                              |
| actor_id / actor_name / actor_type | 작업자 ID 및 당시 이름 스냅샷, user/anonymous/system                                 |
| action                             | CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT, LOGIN_FAILED, OAUTH_START, OAUTH_FAILED |
| resource_type / resource_id        | 대상 종류 및 대상 ID                                                                 |
| outcome / error_code               | success/failure와 내부 오류 코드                                                     |
| source                             | web/oauth/system                                                                     |
| http_method / route                | 요청 메서드 및 경로. 쿼리스트링·OAuth 인증 코드는 저장하지 않음                      |
| changed_fields_json                | 허용된 필드 중 변경된 필드 이름 배열                                                 |
| before_json / after_json           | 변경 전후 스냅샷. 허용 목록 외 필드는 제거                                           |
| metadata_json                      | 개발자가 명시한 페이지 종류, 조회 개수, 정책 버전 등 부가 정보                       |

비밀번호·비밀번호 해시·세션 토큰·소셜 액세스 토큰·이메일·요청 원문을 기록하지 않습니다. 스냅샷 허용 필드는 `lib/audit.ts`에서 관리합니다. 메타데이터는 개발자가 지정한 값만 전달하고 사용자 입력 전체를 전달하지 않습니다. 사용자 이름은 추적을 위해 저장되므로 운영 단계에서 이력 보유 기간과 개인정보 비식별화 절차를 정해야 합니다.

## 일관성과 접근 통제

감사 이력 저장은 `app_settings`에서 `setting_key='DB_LOGGING_ENABLED'`, `value_type='boolean'`, `value_json`이 JSON boolean `true`인 경우에만 활성화됩니다. 초기값은 `false`이며 `.env` 값은 읽지 않습니다. 설정 행이 없거나 false면 이력 행을 추가하지 않습니다. SQL의 `INSERT … SELECT … WHERE EXISTS`가 같은 트랜잭션에서 설정을 확인하므로 별도 캐시나 설정 조회에 대한 재귀 이력 없이 변경 직후부터 반영됩니다. 실제 사용자·세션 데이터 처리는 계속 수행하며 기존 이력은 삭제하지 않습니다. 단독 기록은 `audit()`, 배치 기록은 `...auditStatements()`를 사용합니다. 트랜잭션 내 단독 기록은 `audit(request, input, tx)`로 같은 트랜잭션에 저장합니다.

- 회원가입/소셜 신규가입의 사용자·워크스페이스·소유권·세션과 모든 생성 이력을 단일 write batch로 커밋합니다.
- 이름 변경은 write transaction 안에서 이전 이름을 읽고 수정 및 이력 INSERT를 함께 커밋합니다. 이력 기록 실패 시 변경도 롤백합니다.
- 로그아웃은 세션 폐기와 LOGOUT/DELETE 이력을 함께 저장하고 쿠키를 만료시킵니다. 다른 기기의 세션은 유지합니다.
- 인증 확인용 내부 사용자/멤버십/세션 조회와 rate limit 카운터는 재귀·과도한 기록을 막기 위해 각각 별도 이력으로 기록하지 않습니다. 업무 데이터 조회와 페이지 진입은 READ로 남깁니다. 페이지 이력은 서버 렌더 요청 기준이므로 Next.js 프리페치·재요청도 포함될 수 있습니다.
- 프로젝트 문서 변경은 `artifact_revisions`에 항상 보존되며 감사 로그 설정과 독립적입니다. CRUD·연결과 버전 이력은 하나의 트랜잭션으로 저장하고 이력 수정/삭제를 차단합니다.
- `/api/activity`는 현재 세션의 사용자 ID **및** 워크스페이스 ID로 제한하고 최신 50개만 반환합니다. 클라이언트가 전달한 사용자·테넌트 ID는 신뢰하지 않습니다.
- 이력 조회 자체도 READ로 기록합니다. 이 기록은 다음 조회부터 표시됩니다.
- audit_logs는 외래키를 두지 않아 향후 원본 데이터 삭제 후에도 당시 이력을 보존합니다. UPDATE/DELETE 차단 트리거를 적용했습니다. DB 관리자 수준의 변조까지 막는 외부 WORM 저장소/서명 체인은 이번 범위에 포함하지 않습니다.
- 인덱스는 테넌트+시간, 작업자+시간, 테넌트+대상+시간, 요청 ID에 적용했습니다.

## 후속 업무 CRUD 구현 규칙

1. 세션으로 사용자를 확인한 뒤 DB에서 현재 워크스페이스 멤버십 및 역할을 확인합니다.
2. 모든 조회·수정·삭제 조건에 `workspace_id`를 포함합니다. URL의 리소스 ID만으로 접근하지 않습니다.
3. READ는 조회 조건의 종류와 반환 개수만 기록하며 개인정보를 포함한 검색어·결과 원문은 저장하지 않습니다.
4. CREATE/UPDATE/DELETE는 실제 변경과 `...auditStatements(request, input)`를 동일 write batch에 넣거나, write transaction에서 `audit(request, input, tx)`로 기록합니다. UPDATE/DELETE의 이전 값도 해당 트랜잭션 안에서 읽습니다.
5. 기존 `Request` 객체를 공유해 하나의 작업 안에서 동일한 request_id를 사용합니다.
6. 스냅샷 허용 목록을 검토하고 비밀정보가 들어갈 수 있는 필드는 기록하지 않습니다.
7. 복구·정정은 새 이력으로 남기며 기존 감사 행을 수정하지 않습니다.

## 인증 보호

scrypt + 사용자별 16바이트 salt, timingSafeEqual 비교, 256비트 난수 세션, 7일 만료, HttpOnly/SameSite=Lax 쿠키(프로덕션 Secure), 변경 요청 Origin 검사, 파라미터 바인딩 SQL, DB 기반 시도 횟수 제한을 사용합니다. 제한은 계정과 브라우저 쿠키 기준이므로 운영 환경에서는 신뢰할 수 있는 프록시의 IP 제한도 병행해야 합니다.

OAuth는 10분 state 쿠키와 서버 측 코드 교환을 사용합니다. Google은 PKCE S256도 적용합니다. 액세스/리프레시 토큰은 저장하지 않습니다. 기존 이메일과 일치한다고 자동 계정 연결을 하지 않습니다. Google/Kakao는 검증된 이메일만 사용하며, Naver는 제공자 고유 ID로 가입하고 이메일은 저장하지 않습니다. 계정 연결과 이메일 인증/비밀번호 재설정은 후속 범위입니다.

