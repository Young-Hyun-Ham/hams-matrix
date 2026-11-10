# 도메인 메타 DB별 자료형 선택·ERD 도메인 검색 구현

- 작성일: 2026-11-09 (한국시간, Asia/Seoul)
- 기준: [최신 설계 문서](../../history/2026-11-09/도메인메타-DB별자료형-ERD도메인선택-설계.md)를 다시 읽고 구현했다. 설계 문서와 기존의 다른 변경사항은 보존했다.
- 상태: 소스 구현, 필요한 DB 마이그레이션 적용 및 관련 검증 완료.

## 주요 변경사항

- 도메인 메타 등록·수정 모달에 DB 종류와 자료형 select를 추가했다. `turso`, `postgresql`, `mysql`, `oracle`의 지원 자료형과 길이/정밀도 정책을 공통 Object에서 관리하고 화면과 서버가 함께 사용한다. DB 변경 시 자료형·길이를 초기화하며 수정 시 저장값을 복원한다.
- 도메인에 `databaseType`을 저장하고 목록에도 표시한다. 신규 등록에는 유효한 DB/자료형을 요구한다. 기존 DB 미지정 데이터는 NULL로 보존하며 새 UI에서 DB를 선택해 보완할 수 있다. 기존 미지정 도메인의 DB 생략 PATCH는 호환을 위해 허용하지만 명시적인 NULL 지정이나 지정된 DB를 NULL로 바꾸는 요청은 거부한다.
- 도메인 목록 조회를 SQL LIKE·COUNT·LIMIT/OFFSET으로 변경했다. 논리키/물리명 부분 일치를 지원하고 `%`, `_`, escape 문자는 문자 그대로 검색한다. 관리 목록은 기존 20건, ERD 검색은 10건 단위이며 AI의 전체 사전 조회는 유지한다.
- ERD 및 프로젝트 DB 등록·수정의 공통 컬럼 편집기에 도메인 선택기를 추가했다. 현재 물리 컬럼명 우선 검색, 논리명 대체, 빈 이름 전체 조회, Enter 재검색, 동일 검색어 재조회, 이전·다음 페이지, 한글 조합 Enter 보호, Escape로 목록 닫기와 요청 취소를 제공한다.
- 도메인을 선택하면 논리명·물리명·자료형·길이를 적용하고 해당 필드는 읽기 전용으로 표시한다. 해제하면 입력값을 유지한 채 수동 편집으로 전환한다. 컬럼 ID, 설명, 기본값, PK/NULL/UNIQUE/FK는 보존한다.
- 수동 선택은 서버가 검증·생성하는 `domainReference`로 저장한다. 요청 전용 `domainSelection`은 저장하지 않는다. 선택 ID의 프로젝트/workspace·활성 상태·버전을 확인하고, 스냅샷 위조·무단 변경·메타 수정/삭제 충돌을 차단한다. 기존 AI의 `domainBinding` 생성 이력은 별도로 보존한다.
- 검색·페이징·목록 열기만으로 미저장 경고를 만들지 않으며 실제 선택·해제만 변경으로 처리한다. 저장은 기존 트랜잭션·중복 컬럼·FK 그래프 검증을 사용한다. 기존 테이블을 메타 수정/삭제로 자동 변경하지 않는다.

## 변경 파일

| 구분 | 파일 |
| --- | --- |
| 공통 상수·모델·검증 | `lib/database-data-types.ts`, `lib/database-domain-types.ts`, `lib/database-domain-validation.ts` |
| 도메인 조회·선택 적용 | `lib/database-domains.ts`, `lib/database-domain-selection.ts` |
| 테이블 모델·저장 검증 | `lib/artifact-types.ts`, `lib/artifact-validation.ts`, `lib/artifacts.ts` |
| 도메인 화면 | `components/pages/database/database-domain-form.tsx`, `components/pages/database/database-domain-page.tsx`, `components/pages/database/database-domain-select.tsx` |
| 컬럼 편집·공통 모달 | `components/pages/database/database-structure-editor.tsx`, `components/pages/database/database-tool-page.tsx`, `components/shared/artifact-structure-editor.tsx`, `components/shared/artifact-dialogs.tsx` |
| 스타일 | `components/project-workbench.css` |
| DB 마이그레이션·적용 도구 | `db/migrations/038_database_domain_database_type.sql`, `scripts/apply-database-domain-types.mjs` |
| 검증 | `scripts/check-database-domain-selection.mjs`, `scripts/check-database-domains.mjs`, `scripts/check-database-domains-browser.mjs`, `scripts/test-database-domain-type-migration.mjs` |
| 기록 | 본 문서, `WORK_HISTORY.md` |

기존 도메인·산출물 API 경로와 테스트 실행 명령을 재사용했다. 패키지 의존성 추가, AI 프롬프트·resolver 변경, 기존 037 마이그레이션 수정은 수행하지 않았다.

## DB 변경 여부

- **변경 있음.** 설정된 연결 DB에 `038_database_domain_database_type.sql`만 트랜잭션으로 적용하고 `schema_migrations`에 기록했다. 다른 미적용 마이그레이션은 실행하지 않았다.
- `project_database_domains.database_type`을 nullable TEXT와 네 DB 키의 CHECK 제약으로 추가했다. 기존 행은 NULL이며 DB 종류를 추정해 일괄 지정하지 않았다.
- 적용 전후 기존 도메인 ID·논리명·물리명·자료형·길이·version 보존을 확인했다. 실제 DB에 테스트 메타를 삽입하지 않았다.
- 적용 도구를 다시 실행해 이미 적용된 경우 변경 없이 건너뛰는 것을 확인했다. 기존 프로젝트 단위 논리명 유일 제약은 유지했다.
- 수동 선택 스냅샷은 기존 산출물 `structure_json`에 저장하므로 별도 관계 테이블은 추가하지 않았다.

## 검증 결과

- `pnpm typecheck`: 통과. 초기 샌드박스의 의존성 파일 접근 실패 후 전체 비증분 타입 검사와 최종 프로젝트 타입 검사 모두 통과했다.
- 변경 소스·검증 스크립트 대상 ESLint: 통과.
- `pnpm test:database-domains`: 통과. 기존 CRUD·AI 단건/일괄·이력 검증과 새 DB/타입 검증, NULL 호환, 특수문자 검색, 23건의 10/10/3 페이징, 선택/해제·재선택, 스냅샷 보존·위조 차단, 범위 격리, 변경/삭제 충돌, 중복 컬럼·FK 오류의 원자적 롤백을 확인했다.
- `node scripts/test-database-domain-type-migration.mjs`: 통과. 기존 행이 있는 임시 SQLite에 038을 적용해 NULL 기본값·기존 값 보존·DB CHECK·기존 유일 인덱스·외래키를 확인했다.
- `pnpm test:ai-tool-execution`: 통과. 모의 제공자로 기존 100개 테이블의 실제 임시 DB 저장·FK 매핑·rollback·권한 회귀를 확인했다.
- `pnpm build`: 통과. 컴파일·타입 검사·정적 페이지 생성 완료, 종료 코드 0. 사전 렌더 중 `Request failed Error` 메시지가 출력됐지만 빌드는 성공했다.
- `pnpm test:database-domains-browser`: 최종 실행 통과. 네 DB의 옵션 전환·초기화·수정값 복원, 현재 컬럼명 검색, 10건 페이징, 동일 검색어 Enter 재조회, 합성 한글 조합 이벤트 보호, Escape, 저장 방지, 조회만 한 경우 dirty 경고 없음, 실제 선택·저장, 기존 ERD/FK·조회 전용·모바일·다크테마·통지 채널 차단 회귀를 확인했다.
- 브라우저 검증 초기 실행은 추가한 23건 때문에 기존 첫 페이지 표시 단언이 맞지 않아 실패했다. 저장 결과를 임시 DB에서 확인하도록 단언을 수정한 뒤 전체 브라우저 검증을 통과했다.
- 실제 DB의 038 적용·재실행: 통과. 공백 검사, 기록 링크, 기존 작업 이력 접두부 보존도 확인했다.

## 적용한 정책과 미완료 사항

- 요청한 구현 범위의 미완료 사항 없음.
- 문서 권장안에 따라 동일 논리명은 프로젝트 내에서 하나만 허용하며 검색은 프로젝트의 모든 DB 종류를 대상으로 한다. 테이블별 DB 종류 신설이나 DB별 동일 논리명 중복 허용은 포함하지 않았다.
- 기존 DB 미지정 메타는 목록/기존 AI 생성에서 계속 읽을 수 있지만 신규 수동 선택 후보로는 선택할 수 없다. DB를 지정한 뒤 선택한다.
- 자료형은 공통 Object에 명시된 제한된 지원 목록과 파라미터 규칙을 따른다. DB 버전별 확장형, 배열·사용자 정의형·ENUM/SET 값 목록·UNSIGNED·시간대·문자 길이 단위, Oracle 음수/정밀도 초과 scale 등 확장 문법은 지원 범위에 넣지 않았다. 문자열의 실제 저장 가능 길이는 문자셋·행 크기 등 실제 대상 DB의 추가 제한을 받을 수 있다.
- UI/API 검증은 합성 사용자와 격리된 임시 SQLite·로컬 브라우저를 사용했다. 실제 대상 PostgreSQL/MySQL/Oracle 서버에 DDL을 실행하거나 유료 AI 모델을 호출하지 않았다.
