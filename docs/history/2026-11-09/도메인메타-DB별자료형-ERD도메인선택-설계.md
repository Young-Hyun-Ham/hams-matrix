# 도메인 메타 DB별 자료형 선택·ERD 컬럼 도메인 검색 설계

- 작성일: 2026-11-09 (한국시간, Asia/Seoul)
- 상태: 사용자 검토용 초안. 사용자가 직접 수정한 문서와 이후 구현 요청을 기준으로 구현한다.
- 분석 기준: 현재 작업 트리의 소스. 기존 미커밋·신규 파일도 확인했으며 이전 설계 문서의 당시 구조와 현재 구현을 구분했다.
- 이번 단계의 변경: 본 문서와 `HISTORY.md` 링크만 작성한다. 소스·DB·마이그레이션·설정은 수정하지 않는다. DB 접속, 마이그레이션 실행, 데이터 변경 테스트도 수행하지 않는다.
- 아래의 **권장안**은 구현 방향 제안이다. 사용자 요청에서 확정되지 않은 정책은 9절에서 별도로 결정한다.

## 1. 요구사항과 완료 기준

| ID | 요구사항 | 구현 단계 완료 기준 |
| --- | --- | --- |
| R1 | 도메인 메타 등록·수정 모달의 자료형 텍스트 입력을 두 개의 selectbox로 변경한다. | 앞에서 DB 종류를 선택하고 뒤에서 해당 DB의 자료형만 선택한다. 등록과 수정 모두 동일하게 동작한다. |
| R2 | DB와 자료형 값을 상수 Object로 관리한다. | `turso`, `postgresql`, `mysql`, `oracle`을 하나의 공통 Object에서 관리하고 화면 옵션과 서버 검증이 이를 함께 사용한다. |
| R3 | ERD 컬럼 편집 영역에 도메인 selectbox를 추가한다. | 각 컬럼에 검색 가능한 도메인 선택 UI를 제공한다. 기존 컬럼의 선택 상태를 다시 열어 확인할 수 있다. |
| R4 | 도메인란을 클릭하면 입력한 컬럼명으로 도메인을 LIKE 검색한다. | 현재 컬럼명을 검색어로 첫 페이지를 조회한다. 등록된 현재 프로젝트의 활성 도메인만 반환한다. |
| R5 | 결과는 10개씩 페이징한다. | 23건이면 10/10/3건으로 조회하며 이전·다음과 현재 페이지·전체 건수를 표시한다. |
| R6 | selectbox에서 검색어를 입력하고 Enter를 누르면 재조회한다. | 검색어를 적용하고 1페이지로 이동한다. 같은 검색어로 Enter를 다시 눌러도 새 요청이 발생한다. 테이블 저장은 실행되지 않는다. |
| R7 | 이번 단계는 문서만 작성한다. | 한국시간 날짜 폴더 아래 작업명 문서와 기존 이력을 보존한 상대 경로 링크를 작성한다. |

요구 해석:

- 첫 번째 selectbox의 “디비명”은 연결 인스턴스명이나 접속 정보가 아닌 **설계 대상 DB 제품 종류**로 해석한다. 앱 저장소를 해당 DB로 교체하거나 실제 업무 DB에 DDL을 실행하는 요구가 아니다.
- 사용자 예시의 `bitint`는 `BIGINT`를 의미하는 것으로 해석한다. 표준 옵션에는 `BIGINT`로 표시하며 오탈자를 새 타입으로 등록하지 않는다.
- 현재 ERD에는 컬럼 전용 독립 모달이 없고 테이블 수정 모달 내부에 컬럼 편집기가 있다. 이 컬럼 영역을 변경 대상으로 삼으며 독립 모달 신설은 기본 범위에 넣지 않는다.
- 네이티브 HTML `select`는 검색어 입력과 목록 내부 페이징을 함께 제공하기 어렵다. 두 DB/자료형 필드는 네이티브 `select`를 사용하고, ERD 도메인은 검색 입력·후보 목록·페이징을 가진 combobox 방식으로 구현하는 것을 권장한다.

## 2. 현재 구조와 소스 분석

### 2.1 도메인 메타 화면·모델·저장

| 확인 파일 | 현재 구조 | 변경 시 영향 |
| --- | --- | --- |
| `components/pages/database/database-domain-form.tsx` | 자료형은 `name="dataType"` 텍스트 input이고 길이/정밀도는 별도 `length` input이다. `FormData`를 POST/PATCH로 보내며 수정 시 `version`을 포함한다. 미저장 변경과 권한 재검사를 처리한다. | DB select 추가, 자료형 종속 옵션, 수정 초기값과 DB 변경 시 초기화, `databaseType` 전송이 필요하다. |
| `components/pages/database/database-domain-page.tsx` | 도메인 목록·등록·수정·삭제를 제공한다. 검색과 페이지를 GET에 전달하며 목록 페이지 크기는 20이다. | DB 종류를 목록에도 표시하면 같은 자료형의 DB 구분을 확인할 수 있다. ERD의 10건 정책과 관리 목록 20건 정책은 구분한다. |
| `lib/database-domain-types.ts` | `DatabaseDomain`에 논리명·물리명·자료형·길이·설명·version 등이 있다. `DomainBinding`은 AI 생성 당시 도메인 ID/버전·catalogRevision·ruleVersion·적용 이름/자료형/길이 스냅샷이다. | 도메인에는 DB 종류를 추가해야 한다. AI 생성 근거와 새 수동 선택 관계는 의미를 구분해야 한다. |
| `lib/database-domain-validation.ts` | `validateDatabaseDomain()`은 허용 키를 제한하므로 `databaseType`을 보내면 현재는 거부한다. `domainDataType()`은 단일 토큰 타입과 괄호 길이를 대문자로 정규화한다. 타입별 DB 소속 검사는 없다. | 허용 키·DB/타입 조합 검증을 함께 변경한다. 지금의 정규식은 `DOUBLE PRECISION` 같은 공백 타입을 받지 못한다. |
| `lib/database-domains.ts` | 행 변환, CRUD SQL, 낙관적 version 검사, 프로젝트 권한, catalog revision 증가, 감사 기록을 담당한다. PATCH는 기존 필드와 요청을 병합해 검증한다. | DB 종류의 읽기·병합·저장·응답·감사 기록을 일관되게 확장해야 한다. |
| `db/migrations/037_database_domains.sql` | `project_database_domains`에는 DB 종류가 없다. 활성 도메인의 논리명은 `(workspace_id, project_id, logical_key)` 기준 유일하다. | DB 선택값을 영속화하려면 후속 마이그레이션이 필요하다. DB별 동일 논리명 허용은 현재 제약과 충돌한다. 적용된 037 파일을 수정하는 방식은 피한다. |

### 2.2 조회 API와 검색·페이징

- 목록 API: `GET /api/projects/{projectId}/database/domains?q=...&page=...&pageSize=...`.
- 상세 API: `GET /api/projects/{projectId}/database/domains/{domainId}`. 등록은 목록 POST, 수정·삭제는 상세 PATCH/DELETE다.
- `app/api/projects/[projectId]/database/domains/route.ts`가 검색 인자를 `readDatabaseDomains()`에 전달한다. 인증·권한과 `Cache-Control: no-store`가 적용된다.
- 현재 `readDatabaseDomains()`는 `domainCatalog()`로 프로젝트 전체 메타를 조회한 뒤 `logicalDomainKey(q)`와 논리키/물리명의 `includes()`로 부분 일치 검색하고 배열을 자른다. **현재 SQL LIKE·DB LIMIT/OFFSET 조회는 아니다.**
- 현재 응답은 `items`, `total`, `page`, `pageSize`, `catalogRevision`, `ruleVersion`이며 기본 크기는 20, 허용 크기는 1~100이다. 페이지는 1부터 시작하고 초과 요청은 마지막 페이지로 보정한다.
- `logicalDomainKey()`는 NFC 정규화, 앞뒤 공백 제거, 공백/밑줄 묶음의 밑줄 통일, 소문자화를 수행한다. 현재 결과 정렬은 `logical_key, id`다.
- 전체 사전은 AI resolver에도 필요하다. 검색 최적화를 이유로 `domainCatalog()` 자체를 10건으로 제한하면 기존 AI 생성이 깨진다. 검색용 조회 경로와 전체 사전 조회 경로를 분리해야 한다.

### 2.3 ERD 편집·저장·AI 메타

| 확인 파일 | 현재 동작 | 설계상 주의점 |
| --- | --- | --- |
| `components/pages/database/database-tool-page.tsx` | ERD에서 테이블 수정 시 최신 자료를 읽고 `ArtifactDialogContent`를 연다. 외부 변경 통지와 포커스 복귀 시 갱신하되 편집 중 입력을 보존한다. | 도메인 조회에 현재 `projectId`를 명시적으로 전달해야 한다. 미저장 보호를 유지한다. |
| `components/shared/artifact-dialogs.tsx` | 공통 산출물 모달 안에서 `StructureEditor`를 사용한다. 폼 전체 `onChange`와 `.matrix-structure button` 클릭을 변경으로 표시한다. | 검색어 입력·드롭다운 열기·페이징은 데이터 수정이 아니므로 dirty 판정에서 제외해야 한다. 실제 도메인 선택·해제만 dirty로 반영한다. |
| `components/shared/artifact-structure-editor.tsx` | DB 종류 산출물에 `DatabaseStructureEditor`를 렌더링한다. props에는 `artifact`, `artifacts`만 있고 `projectId`는 없다. | 신규 등록에도 쓸 수 있도록 부모에서 projectId를 전달한다. ERD 독립 페이지에 없는 context에 의존하지 않는다. |
| `components/pages/database/database-structure-editor.tsx` | 컬럼 배열을 state로 관리하고 hidden `columns` JSON으로 직렬화한다. 논리 컬럼명, 컬럼명, 자료형, 길이 등을 직접 편집한다. `domainBinding`은 생성 당시 정보로 읽기만 한다. | 각 컬럼 ID별 검색 상태·선택 상태를 추가한다. 컬럼 삭제·순서 변경 시 인덱스로 비동기 결과가 섞이지 않게 한다. |
| `components/shared/use-artifact-actions.ts` | hidden JSON을 파싱해 `/api/projects/{projectId}/artifacts` POST 또는 상세 PATCH의 `structure.columns`로 전송한다. | 새 선택 요청 계약도 이 직렬화 경로로 전달할 수 있다. 저장 endpoint 신설은 필수가 아니다. |
| `lib/artifact-validation.ts` | `prepareStructure()`가 허용 필드로 컬럼을 재구성한다. 클라이언트의 `domainBinding`은 기존 값과 다른 경우 거부하고, 생략 시 기존 값을 보존한다. 컬럼 ID·이름 중복과 FK 자료형/길이 등을 검증한다. | 타입 선언/UI만 변경하면 새 선택 정보가 사라진다. 새 관계의 서버 생성·보존·해제 로직을 명시해야 한다. |
| `lib/artifacts.ts` | `mutateArtifact()`의 권한·version 검사 및 트랜잭션에서 구조 검증, 전체 그래프 검증, 저장, 이력을 처리한다. 기존 메타 준비 결과는 DB CREATE에서만 사용한다. | 수동 UPDATE의 도메인 적용은 현재 존재하지 않는다. 같은 트랜잭션에 선택 검증·적용 단계를 추가해야 한다. |
| `lib/database-domain-generation.ts`, `lib/database-domain-resolver.ts` | AI 신규 생성은 전체 사전을 읽어 논리명으로 물리명·자료형·길이를 결정한다. resolver는 논리키 단일 Map을 사용하고 서버가 binding을 생성한다. | 수동 선택을 자동 논리명 매칭과 혼동하지 않는다. DB별 중복 논리명을 허용하면 단일 Map이 모호해진다. |

테이블 산출물에는 현재 구조화된 대상 DB 종류 필드가 없다. 따라서 도메인 검색을 테이블의 DB 종류로 자동 제한하는 전제는 현재 소스로 성립하지 않는다.

## 3. DB 종류·자료형 상수와 저장 구조 권장안

### 3.1 하나의 상수 Object

신규 `lib/database-data-types.ts`에 브라우저·서버가 모두 import할 수 있는 순수 Object를 둔다. DB 연결 모듈과 `server-only`를 import하지 않는다. 예시 구조는 다음과 같다. 아래 코드는 문서 예시이며 실제 소스 추가가 아니다.

```ts
export const DATABASE_DATA_TYPES = {
  turso: {
    label: "Turso",
    types: {
      TEXT: { label: "TEXT", parameter: "none" },
      INTEGER: { label: "INTEGER", parameter: "none" },
    },
  },
  postgresql: {
    label: "PostgreSQL",
    types: {
      BIGINT: { label: "BIGINT", parameter: "none" },
      VARCHAR: { label: "VARCHAR", parameter: "length" },
    },
  },
  mysql: {
    label: "MySQL",
    types: {
      BIGINT: { label: "BIGINT", parameter: "none" },
      DECIMAL: { label: "DECIMAL", parameter: "precisionScale" },
    },
  },
  oracle: {
    label: "Oracle",
    types: {
      VARCHAR2: { label: "VARCHAR2", parameter: "length" },
      NUMBER: { label: "NUMBER", parameter: "precisionScale" },
    },
  },
} as const;
```

- DB 키는 소문자, 저장 자료형 키는 대문자로 통일한다. `DatabaseType`은 Object의 key에서 유도하고 DB별 배열을 화면·서버에 중복 작성하지 않는다.
- `parameter`는 길이 입력의 표시·허용 여부를 결정하는 정책이다. 길이 필수 여부·허용 범위·기본값이 필요한 타입에는 같은 Object에 추가 속성을 둔다. DB별 검증은 타입 이름만으로 판정하지 않는다.
- 이 단계의 후보 목록은 아래와 같다. 전체 DB 문법 지원이나 모든 별칭 지원을 약속하는 목록은 아니다.

| DB 키 | 1차 자료형 후보 | 설계상 범위 |
| --- | --- | --- |
| `turso` | `INTEGER`, `REAL`, `TEXT`, `BLOB`, `NUMERIC` | SQLite 호환 일반 테이블의 대표 선언형을 기준으로 하는 권장안이다. STRICT 테이블 정책 및 Turso 고유 확장형은 별도 결정한다. |
| `postgresql` | `SMALLINT`, `INTEGER`, `BIGINT`, `NUMERIC`, `DECIMAL`, `REAL`, `VARCHAR`, `CHAR`, `TEXT`, `BOOLEAN`, `DATE`, `TIME`, `TIMESTAMP`, `UUID`, `JSON`, `JSONB`, `BYTEA` | 배열·사용자 정의형·ENUM 값 목록·공백이 있는 확장 문법은 1차 제외를 권장한다. |
| `mysql` | `TINYINT`, `SMALLINT`, `MEDIUMINT`, `INT`, `BIGINT`, `DECIMAL`, `FLOAT`, `DOUBLE`, `BIT`, `CHAR`, `VARCHAR`, `TEXT`, `BLOB`, `DATE`, `TIME`, `DATETIME`, `TIMESTAMP`, `JSON` | `UNSIGNED`, ENUM/SET 값 목록 등 추가 문법은 별도 속성 설계 전까지 제외한다. |
| `oracle` | `CHAR`, `NCHAR`, `VARCHAR2`, `NVARCHAR2`, `NUMBER`, `FLOAT`, `BINARY_FLOAT`, `BINARY_DOUBLE`, `DATE`, `TIMESTAMP`, `CLOB`, `NCLOB`, `BLOB`, `RAW` | 19c 문서의 공통 내장형을 참고한 후보이며 버전별 확장형·시간대·문자 길이 단위는 별도 결정한다. |

자료형 후보의 근거는 [SQLite 자료형·affinity 문서](https://www.sqlite.org/datatype3.html), [PostgreSQL 자료형 문서](https://www.postgresql.org/docs/current/datatype.html), [MySQL 8.4 자료형 문서](https://dev.mysql.com/doc/refman/8.4/en/data-types.html), [Oracle 19c 자료형 문서](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Data-Types.html)다. SQLite의 affinity와 저장 클래스는 구분되며 `NUMERIC`은 위 목록에서 선언형/affinity 정책으로 제안한 값이다. 이 목록을 Turso의 모든 버전·모드 지원 보장으로 해석하지 않는다. 최종 지원 목록과 파라미터 범위는 대상 DB 버전을 정한 뒤 구현 검증에 고정한다.

### 3.2 선택값 영속화와 기존 데이터

- 도메인 API·`DatabaseDomain`에 `databaseType`을 추가하고 `project_database_domains.database_type`에 저장하는 방식을 권장한다. 화면 state에만 보관하면 수정 모달 재진입 시 DB를 복원할 수 없다.
- 새 도메인에는 DB와 자료형을 필수로 받는다. 기존 자료형 문자열을 `oracle:VARCHAR2`처럼 합쳐 저장하지 않고 DB, 자료형, 길이를 각각 유지한다.
- 기존 행의 DB 종류는 타입만으로 확정하지 않는다. 예를 들어 `TEXT`, `DATE`, `BIGINT`만 보고 DB를 추정하면 오분류할 수 있다. **기존 행은 NULL을 “DB 미지정”으로 읽는 호환안을 권장한다.**
- 수정 모달에서 미지정 값을 표시하고 DB를 명시적으로 선택하도록 안내한다. 새 UI에서 저장할 때는 유효한 DB/타입 조합을 요구한다. 구 API의 DB 누락 요청을 일정 기간 허용할지는 9절에서 결정한다.
- 기존 타입이 새 목록에 없으면 현재 값을 읽기 전용으로 표시하고 지원 타입 재선택을 요구한다. 임의의 첫 옵션으로 바꾸거나 무조건 `turso`를 지정하지 않는다.
- 마이그레이션은 구현 단계에 신규 순번으로 추가한다. 기존 037은 수정하지 않고 기존 데이터의 논리명·자료형·길이·version을 일괄 변환하지 않는다. 운영 적용 및 기존 행의 DB 지정은 별도 구현 승인 범위다.
- 기본안에서는 현재 프로젝트 단위 논리명 유일 제약을 유지한다. “동일한 논리명을 DB별로 여러 건 등록”까지 허용하려면 인덱스, 중복 검사, 검색 필터, AI resolver의 키와 대상 DB 선택 계약을 함께 설계해야 한다.

### 3.3 폼과 서버 검증

1. 등록 모달: `DB 선택` 다음 `자료형 선택`을 표시한다. DB 미선택 시 자료형을 비활성화하고 임의 선택 없이 시작한다.
2. 수정 모달: 저장된 `databaseType`, `dataType`, `length`를 복원한다. 미지정/미지원 레거시 값은 별도 안내로 표시한다.
3. DB 변경 시 자료형과 길이를 초기화해 재선택하도록 한다. 다른 DB의 동일 이름 타입을 자동 유지하는 정책은 기본으로 넣지 않는다.
4. 자료형 변경 시 길이/정밀도 정책을 다시 적용한다. 길이 불가 타입으로 바꾸면 기존 길이를 제거하고, 필수 길이가 필요한 타입에는 필수 입력을 안내한다.
5. 서버는 `databaseType` 허용 키와 해당 DB의 타입 membership을 먼저 확인하고 길이를 검증한다. 화면 옵션 제한만으로 유효성을 보장하지 않는다.
6. 기존 괄호 타입 파싱의 호환 범위를 유지하더라도 정규화 결과가 해당 DB 상수에 포함되는지 검사한다. 미등록 타입·오탈자·알 수 없는 필드는 400으로 거부한다.
7. 날짜·시간의 소수초 정밀도는 0이 유효한 경우가 있어 현재의 “양의 정수” 공통 검사로 처리하면 안 된다. 숫자 precision/scale의 DB별 범위도 별도 정책으로 검증한다. 이번 요구에서 지원할 파라미터 범위를 먼저 확정한다.
8. 현재 version 충돌 409, CRUD 권한 검사, catalog revision 증가와 감사 기록을 보존한다. DB 변경도 도메인 변경으로 기록한다.

## 4. ERD 도메인 검색·선택 UI

### 4.1 조회 동작

- 각 컬럼 영역의 컬럼명 옆에 `도메인` combobox를 배치한다. 기존 논리 컬럼명·자료형·길이 필드는 유지한다.
- 도메인란을 열 때 **현재 `c.name.trim()`을 우선 검색어로 사용**한다. 이름이 비었으면 `c.logicalName`을 보조로 사용하고 둘 다 비었으면 전체 1페이지를 조회하는 것을 권장한다. 논리명 우선 여부는 결정 사항이다.
- 첫 열기와 다시 열기는 현재 컬럼명으로 새로 조회한다. 이전 검색어를 계속 보존하는 방식은 기본안에 넣지 않는다. 저장된 선택값은 검색 결과에 없더라도 별도로 표시한다.
- 입력 중 문자열인 `draftQuery`와 실제 조회에 사용한 `appliedQuery`를 분리한다. 입력만으로 서버를 호출하지 않고 Enter 또는 검색 버튼을 눌렀을 때 반영한다.
- Enter는 `preventDefault()`로 부모 폼의 submit을 막고 `page=1`, `pageSize=10`으로 요청한다. 같은 검색어·같은 페이지에서도 강제 재조회되도록 요청 순번/재시도 카운터를 사용한다.
- 한글 조합 중 Enter는 검색으로 처리하지 않는다. `isComposing`과 조합 종료 시점의 Enter를 고려해 “작업” 입력 확정만으로 저장·조회가 실행되지 않도록 검증한다.
- 이전/다음은 마지막으로 적용한 검색어를 유지한다. 검색어를 변경해 Enter를 누르면 페이지를 1로 초기화한다. 페이지 버튼은 모두 `type="button"`이다.
- 후보는 `논리명 / 물리명 / DB / 자료형(길이)`로 표시하고 ID로 선택한다. 설명은 보조 정보로 제공한다.
- 로딩, 결과 없음, 조회 실패 및 재시도 상태를 표시한다. 실패한 요청의 옛 결과를 새 검색 결과처럼 선택하게 두지 않는다.

요청 예시:

```text
GET /api/projects/{projectId}/database/domains?q=job&page=1&pageSize=10
```

응답은 기존 목록 형식을 재사용한다. `items`에 DB 종류가 추가되며, ERD에서만 `pageSize=10`을 명시한다. 관리 목록의 기본 20건과 AI 도구의 가변 pageSize는 유지한다. 현재 테이블에 대상 DB 필드가 없으므로 기본 검색은 프로젝트 전체 DB 종류를 대상으로 한다.

### 4.2 검색 상태와 모달 이벤트

- 검색 상태는 컬럼 배열 인덱스가 아닌 `column.id`에 연결한다. 검색 UI는 신규 `DatabaseDomainSelect` 컴포넌트로 분리하고 현재 프로젝트·컬럼명·선택값·읽기 전용 여부를 props로 받는다.
- 모달 닫기, 컬럼 삭제, 프로젝트 변경, 새 검색 시 이전 요청을 취소한다. `AbortController`와 요청 순번을 함께 사용해 늦은 응답이 최신 결과를 덮어쓰지 않게 한다. 기존 `jsonRequest()`는 `RequestInit.signal`을 전달할 수 있어 재사용 가능하다.
- 외부 갱신 시 편집 내용을 보존하고, 드롭다운 재열기/재검색과 저장 직전 검증으로 최신 메타를 확인한다. 드롭다운 검색 결과를 장기 캐시하지 않는다.
- 공통 모달의 dirty 감지는 검색 UI를 구분하도록 조정한다. 검색·이동은 dirty를 만들지 않고 도메인 선택·해제 등 실제 컬럼 변경은 명시적 변경 callback으로 알린다. 다른 산출물 편집기의 변경 감지는 유지한다.
- combobox/listbox의 label, 펼침 상태, 활성 후보 및 키보드 탐색을 제공한다. Escape는 열린 목록부터 닫고 모달 취소까지 전파하지 않는다. Enter는 후보 탐색 중 명시적 활성 후보가 있을 때만 선택하고, 검색 입력에서는 재조회한다.
- `dialog` 내부에서 잘리지 않게 목록 레이어와 스크롤 영역을 구성한다. 모바일에서는 목록 폭을 모달 안으로 제한하고, 조회 전용/저장 중에는 데이터 선택을 막는다.

### 4.3 선택 후 적용 정책 권장안

사용자 요구는 검색·선택 UI까지 명시되어 있다. 다음 적용 규칙은 구현 전에 검토할 권장안이다.

| 항목 | 도메인 선택 시 처리 |
| --- | --- |
| 논리 컬럼명 | 도메인의 `logicalName` 적용 |
| 컬럼명 | 도메인의 `physicalName` 적용 |
| 자료형·길이 | 도메인의 `dataType`, `length` 적용 |
| DB 종류 | 선택 관계의 메타로 보존하고 후보·선택값에 표시 |
| 컬럼 ID | 기존 ID 유지. FK·참조 연결 식별자가 바뀌지 않게 한다. |
| 설명·기본값·NULL·PK·UNIQUE·FK | 사용자가 입력한 값을 유지한다. 도메인만으로 추론해 바꾸지 않는다. |

- 선택은 모달의 초안에만 적용하고 테이블 저장 성공 시 영속화한다. 선택 클릭 자체가 도메인이나 테이블을 저장하지 않는다.
- 선택 후 도메인 관리 항목과 연결되는 논리명·물리명·자료형·길이는 읽기 전용으로 두는 안을 권장한다. 직접 수정하려면 `도메인 선택 해제`를 누른다.
- 해제 시 이미 채운 컬럼값은 유지하고 관계만 제거해 수동 편집으로 전환한다. 취소하면 저장 전 상태로 돌아간다.
- 같은 물리명을 가진 도메인을 다른 컬럼에서 선택하면 저장 시 기존 중복 검사로 차단한다. 자료형/길이가 달라져 FK가 맞지 않으면 기존 그래프 검증으로 저장을 거부하며 연결된 다른 테이블을 자동 변경하지 않는다.
- 기존 AI의 복합명 `작업_아이디 → job_id` 생성 규칙은 수동 선택에 자동 적용하지 않는다. 수동 선택은 선택한 단일 도메인의 값 적용을 기본으로 하며 접미어 보존 여부는 별도 결정한다.

## 5. 검색 API와 SQL 변경 방향

1. `readDatabaseDomains()`의 목록 분기를 전용 SQL 조회로 변경한다. 전체 사전 로더와 분리해 `COUNT(*)`와 10건 SELECT만 수행한다. 상세 조회도 ID 조건으로 조회할 수 있다.
2. 현재 `database READ` 권한을 먼저 검사하고 모든 SQL에 `workspace_id`, `project_id`, `deleted_at IS NULL` 조건을 적용한다. 클라이언트가 전달한 workspace 값은 신뢰하지 않는다.
3. 검색어를 기존 `logicalDomainKey()`로 정규화한다. `logical_key` 또는 소문자 물리명에 `%검색어%` 부분 일치를 적용해 현재 검색 대상을 유지한다. 설명·자료형 검색은 요청 범위에 추가하지 않는다.
4. `%`, `_`, escape 문자는 검색 패턴에 넣기 전에 escape하고 바인딩한다. 컬럼명 `job_id`의 밑줄은 한 글자 wildcard가 아닌 문자 그대로 검색한다. 사용자가 wildcard를 직접 작성하는 정책은 기본안에서 제외한다.
5. COUNT와 목록을 같은 읽기 트랜잭션·동일 조건으로 실행한다. `ORDER BY logical_key, id`, `LIMIT`, `OFFSET`을 사용하고 페이지 초과 보정과 빈 결과의 page=1을 유지한다.
6. `q` 최대 100자, page 양의 안전한 정수, pageSize 1~100 검증과 no-store 응답을 유지한다. ERD 클라이언트는 항상 10을 보내고 반환된 page를 표시 기준으로 사용한다.
7. DB 종류 필터는 필수 요구가 아니므로 기본안에서는 추가하지 않는다. 필요하다면 `databaseType` query를 선택적으로 추가하고 공통 Object의 키로 검증한다.
8. `%...%` LIKE는 일반 인덱스로 완전히 최적화되지 않는다. 이번 개선은 프로젝트 전체를 앱 메모리에 적재하는 비용과 전송량을 줄이는 목적이며, 대규모 사전의 전문 검색/색인은 별도 측정 후 검토한다.

## 6. 도메인 선택값 저장 계약과 서버 적용

### 6.1 생성 당시 근거와 수동 선택 관계 구분

현재 `domainBinding`은 생성 당시 근거이며 클라이언트가 새 값을 만들 수 없다. 이를 선택 UI에서 직접 바꾸면 기존 위조 방지 검증에 걸린다. 기본안은 **기존 binding은 보존하고 수동 선택은 별도 필드로 처리**하는 것이다.

- 저장된 컬럼에 `domainReference`를 추가한다. 서버가 생성하는 현재 수동 선택 스냅샷으로 `domainId`, `domainVersion`, `databaseType`, `catalogRevision`, `ruleVersion`, `logicalName`, `physicalName`, `dataType`, `length`를 담는다.
- 저장 요청에는 컬럼별 임시 필드 `domainSelection`을 사용한다. `{ domainId, domainVersion }`은 선택/재선택, `null`은 명시적 해제, 필드 생략은 기존 관계 보존이다.
- `domainSelection`은 요청용이며 저장된 `structure_json`과 응답에는 남기지 않는다. 반환된 `domainReference`를 다음 편집 초기값으로 사용한다.
- 클라이언트가 기존 `domainReference`를 다시 보내는 경우에는 이전 저장값과 같은 값만 허용한다. 임의 신규 reference 또는 수정된 스냅샷은 거부한다. 실제 변경은 `domainSelection` 요청을 통해서만 수행한다.
- 기존 AI binding은 계속 “생성 당시 메타”로 표시하고 manual reference와 구분한다. 선택 해제가 과거 AI 생성 이력을 지우는 의미가 되지 않도록 한다.
- 기존 데이터의 `domainReference` 누락은 정상으로 처리한다. binding만 있는 컬럼은 생성 근거를 보조 표시하고 새 수동 선택을 임의로 만들지 않는다.

### 6.2 서버 저장 순서

1. 기존 산출물 CREATE/UPDATE 권한과 테이블 version을 확인한다.
2. 동일 트랜잭션에서 컬럼별 `domainSelection` 형식과 도메인 ID/버전을 확인한다. 여러 선택 ID는 중복 제거 후 필요한 행을 묶어 조회해 컬럼별 쿼리 반복을 피한다.
3. 현재 사용자 workspace·프로젝트의 활성 도메인만 선택 가능하다. 다른 범위 ID는 대상 없음으로 거부하고, 삭제·수정된 도메인은 409와 재조회 안내를 반환한다. DB 미지정/미지원 조합은 신규 선택에서 차단한다.
4. 요청에 포함된 미리보기 값을 신뢰하지 않고 서버 도메인 값으로 논리명·물리명·자료형·길이를 재구성한다. `domainReference`도 서버가 생성한다.
5. `domainSelection: null`이면 수동 관계만 제거한다. 기존 `domainBinding` 위조 방지와 생성 이력 보존 규칙은 유지한다.
6. 선택 요청이 생략되면 기존 reference와 값은 보존한다. reference가 있는 컬럼의 연결 대상 필드를 임의 변경한 요청은 해제/재선택을 안내하며 거부한다. 단순 설명 변경 때문에 이미 저장된 도메인 스냅샷을 최신 값으로 강제 갱신하지 않는다.
7. `prepareStructure()`로 허용 필드를 재구성하고 ID·이름 중복, PK/NULL 조건, 전체 FK 그래프를 검증한다. 이후 산출물·이력 저장을 함께 커밋한다.
8. 다른 컬럼에서 실패해도 일부 선택만 저장되지 않아야 한다. 저장 성공 후 기존 ERD 갱신·변경 통지 경로를 사용한다.

메타 수정/삭제는 기존 테이블을 자동 변경하지 않는다. 이미 저장한 reference는 적용 당시 스냅샷으로 남고 새 선택·재적용 때 최신 버전을 확인한다. 수동 선택의 충돌 범위는 선택한 도메인 version을 기본으로 하며 무관한 도메인 변경만으로 저장을 막지 않는다. AI의 기존 catalogRevision 충돌 검사는 그대로 유지한다.

## 7. 변경 대상 파일과 영향 범위

아래는 **이후 구현 단계의 예상 대상**이며 이번 문서 작성에서 변경한 소스 목록이 아니다.

| 구분 | 파일 | 예상 변경/검토 |
| --- | --- | --- |
| 신규 공통 상수 | `lib/database-data-types.ts` | DB·자료형·파라미터 정책 Object와 파생 타입/조회 함수 |
| 도메인 모델 | `lib/database-domain-types.ts` | databaseType, 수동 선택 스냅샷/요청 타입 추가. 기존 binding 호환 |
| 도메인 검증 | `lib/database-domain-validation.ts` | 허용 키·DB/타입 조합·파라미터 검증과 레거시 입력 정책 |
| 도메인 저장/조회 | `lib/database-domains.ts` | 행 매핑/CRUD SQL, PATCH 병합, 검색 SQL·COUNT·페이지 처리 |
| 도메인 API | `app/api/projects/[projectId]/database/domains/route.ts`, `app/api/projects/[projectId]/database/domains/[domainId]/route.ts` | 기존 경로 재사용. 응답 확장/선택 필터를 채택하면 인자 처리 변경 |
| 도메인 폼/목록 | `components/pages/database/database-domain-form.tsx`, `components/pages/database/database-domain-page.tsx` | 두 select, 초기화·레거시 표시, 목록 DB 표시 |
| 신규 도메인 선택기 | `components/pages/database/database-domain-select.tsx` | 검색 combobox, Enter/IME, 10건 페이징, 요청 취소, 상태 표시 |
| 컬럼 편집기 | `components/pages/database/database-structure-editor.tsx` | 컬럼별 선택 초안, 적용/해제, hidden JSON 직렬화, 실제 변경 통지 |
| 공통 모달/구조 | `components/shared/artifact-dialogs.tsx`, `components/shared/artifact-structure-editor.tsx` | projectId/dirty callback 전달, 검색 UI 이벤트 구분. 모든 호출부 확인 |
| ERD 독립 화면 | `components/pages/database/database-tool-page.tsx` | 공통 모달에 projectId 전달 및 갱신 연계 |
| 테이블 모델/저장 | `lib/artifact-types.ts`, `lib/artifact-validation.ts`, `lib/artifacts.ts` | reference 보존·위조 거부, selection 처리, 서버 적용 후 기존 검증 |
| 저장 액션 | `components/shared/use-artifact-actions.ts` | 현재 JSON 경로 재사용. 요청 전용 필드와 저장 후 초기화 확인 후 필요한 변경만 적용 |
| 스타일 | `components/pages/database/database-tools.css`, 필요 시 `components/project-workbench.css` | DB 두 select 배치, 목록 레이어·모바일·테마. 공통 DB 편집 화면도 적용 범위 확인 |
| DB 스키마 | `db/migrations/<구현 시 다음 순번>_database_domain_database_type.sql` | nullable DB 종류 필드와 유효값 제약 등. 037 원본 보존. 이번에는 생성/실행하지 않음 |
| AI 호환 | `lib/database-domain-generation.ts`, `lib/database-domain-resolver.ts`, `lib/ai/page-data.ts`, `lib/ai/page-tools.ts`, `lib/ai/page-prompts.ts`, `lib/ai/database-batch-commit.ts` | 새 메타 속성 읽기, 기존 미지정 메타·자동 생성 회귀 검증. DB별 중복을 채택하면 resolver/AI 계약까지 변경 |
| 표시·내보내기 | `components/pages/database/database-diagram.tsx`, `lib/workbook.ts` | 적용된 이름·자료형/길이가 기존 표시·내보내기에 반영되는지 확인. DB/도메인 추가 열은 별도 결정 |
| 기존 통지 | `components/pages/database/use-database-events.ts` | 기존 메타 변경 통지 재사용. 수정은 필요성이 확인될 때만 수행 |
| 검증 코드 | `scripts/check-database-domains.mjs`, `scripts/check-database-domains-browser.mjs` | API/임시 DB/브라우저의 검증 사례와 기존 텍스트 입력 fixture 변경 |
| 테스트 진입점 | `scripts/test-database-domains.mjs`, `scripts/test-database-domains-browser.mjs` | 기존 실행 명령 재사용. 새 의존성·명령 추가는 기본적으로 불필요 |

공통 DB 편집기를 사용하므로 ERD 외 프로젝트 DB설계 목록의 등록·수정에도 영향이 있다. 신규 등록에도 같은 선택 기능을 제공하는 것을 권장하며, ERD에만 제한하려면 기능 플래그를 명시적으로 전달해야 한다. 다른 종류 산출물의 폼·권한·저장 동작은 회귀 확인 대상이다.

## 8. 검증 방법

### 8.1 구현 단계 기능·회귀 검증 계획

| 영역 | 검증 사례 | 기대 결과 |
| --- | --- | --- |
| DB/타입 select | 네 DB 전환, 수정 재진입, 선택 초기화 | DB에 맞는 타입만 표시하고 저장값 복원, 다른 DB의 타입 잔류 없음 |
| 조합·길이 검증 | `oracle/VARCHAR2/16`, `mysql/BIGINT/빈값`, DB 미등록 타입, 길이 불가 타입 | 허용 조합 정상 저장, 잘못된 조합/길이 400. UI와 서버가 같은 정책 사용 |
| 기존 데이터 | DB NULL·미지원 타입·기존 괄호 타입 | 임의 DB/타입 변환 없이 표시, 명시적 변경 흐름 제공 |
| LIKE 검색 | 논리명/물리명 부분 일치, 한글 NFC, 대소문자, 공백, `%`, `_`, escape 문자 | 정규화 정책과 문자 검색 일관성. wildcard 문자로 결과가 과도하게 확대되지 않음 |
| 페이징 | 0/1/10/11/23건, 마지막·초과 페이지, 같은 논리키 정렬 | 최대 10건, total/이전·다음 상태 정확, 안정된 정렬, 초과 페이지 보정 |
| Enter 재조회 | 검색 입력 후 Enter, 같은 검색어 반복, 2페이지에서 검색 | 매번 GET 요청, 새 검색은 1페이지. 테이블 POST/PATCH 발생 없음 |
| IME·키보드 | 한글 확정 Enter, 화살표, Escape, 포커스 이동 | 조합 중 오조회 없음. 목록부터 닫히고 모달 편집 상태 유지 |
| 비동기 상태 | 빠른 검색 변경·열기/닫기·컬럼 삭제·프로젝트 이동 | 이전 응답 혼입, 해제 후 상태 갱신, 다른 컬럼에 결과 적용 없음 |
| 선택 적용 | 도메인 선택·교체·해제·취소·저장 후 재진입 | 적용 필드만 변경, 컬럼 ID/PK/FK 등 보존, 저장된 reference 복원 |
| 권한·범위 | READ 전용, UPDATE 철회, 다른 프로젝트/workspace ID | 선택/저장 제한과 서버 차단. 다른 프로젝트 메타 노출 없음 |
| 충돌·변조 | 선택 후 메타 수정·삭제, 테이블 version 변경, 스냅샷 위조 | 충돌 409 또는 검증 오류, 부분 저장 없음, 입력 보존·재조회 안내 |
| FK·중복 | 같은 물리명 중복, 참조 컬럼과 다른 자료형/길이 선택 | 기존 중복/FK 검사 유지. 테이블 ID·컬럼 ID·관계선 보존 |
| 변경 감지 | 열기/검색/페이징만 수행, 실제 선택 후 모달 닫기 | 조회만 한 경우 미저장 경고 없음. 선택 변경은 경고·외부 갱신 보호 적용 |
| AI·스냅샷 | 기존 binding만 있는 데이터, 단건/일괄 AI 신규 생성, 사전 변경 | 기존 자동 매칭·위조 방지·revision 검증 유지. 기존 테이블 자동 변경 없음 |
| 공통 화면·표시 | 프로젝트 목록 등록/수정, ERD, 내보내기, 모바일·다크테마 | 공통 편집기 오류 없음. 저장값 표시·레이어·가로폭 정상 |

구현 완료 후 `pnpm typecheck`, 변경 파일 ESLint, `pnpm test:database-domains`, `pnpm test:database-domains-browser`를 기본 검증으로 사용한다. AI 경로까지 변경했다면 `pnpm test:ai-tool-execution`과 관련 AI 회귀를 추가하고 빌드로 최종 통합을 확인한다. 마이그레이션은 기존 행이 있는 임시 SQLite에서 신규 컬럼·NULL 호환·기존 유일 제약 보존을 검사한다. 테스트 데이터는 격리된 임시 DB를 사용하며 실제 업무 DB로 검증하지 않는다.

### 8.2 이번 문서 작성 단계 검증

- 문서 경로가 `docs/history/2026-11-09/작업명.md`이고 파일명이 날짜 자체가 아닌지 확인한다.
- 필수 항목인 요구사항·현재 구조·수정 방향·변경 파일·검증 방법·결정 사항의 포함 여부를 확인한다.
- `HISTORY.md` 기존 내용을 바이트 기준 접두부로 보존하고 상대 링크를 한 번만 추가했는지 확인한다.
- 작성 전후 소스·설정·마이그레이션 등 비대상 파일의 해시를 비교한다. 소스/DB 구현 테스트는 이번 단계에 실행하지 않는다.

## 9. 결정이 필요한 사항

| 결정 항목 | 권장안 | 다른 선택 시 영향 |
| --- | --- | --- |
| DB 종류의 의미·저장 | 제품 종류를 `databaseType` 별도 필드로 저장 | 연결 인스턴스 선택이면 접속 대상 모델·권한·연결 관리가 추가로 필요 |
| 기존 도메인의 DB 종류 | NULL=미지정 유지, 새 UI 저장 시 명시 선택 | 일괄 기본 DB 지정은 잘못된 분류 가능. 구 API에서 DB 생략을 언제까지 허용할지 결정 필요 |
| 동일 논리명의 DB별 중복 | 현 프로젝트 단위 유일 제약 유지 | 허용하려면 DB별 유일키, 대상 DB 필드/필터, AI resolver·일괄 생성 계약까지 확장해야 함 |
| DB 버전·타입 목록 | 3절의 제한된 후보를 검토 후 고정 | Oracle BOOLEAN 등 버전별 타입, Turso 확장/STRICT, 배열·ENUM·timezone·길이 단위는 별도 정책 필요 |
| 최초 검색어 | 물리 컬럼명 우선, 비었을 때 논리명, 둘 다 없으면 전체 조회 | 논리명 우선 또는 빈 이름 조회 금지를 원하면 초기화와 검증 사례 변경 |
| 검색 필드·wildcard | 논리키/물리명 부분 일치, `%`/`_`는 일반 문자 | 논리명만 검색하거나 wildcard를 허용하면 기존 검색과의 호환·사용자 안내 변경 |
| 선택 시 적용할 값 | 논리명·물리명·자료형·길이 적용 | 자료형/길이만 적용하면 기존 이름 보존 가능. 사용자 예시의 복합명 접미어 보존 여부도 함께 결정 |
| 선택 후 직접 편집 | 연결 필드는 읽기 전용, 해제 후 편집 | 직접 편집을 허용하면 reference가 최신 도메인과 다른 상태를 표시하는 별도 정책 필요 |
| 수동 관계 저장 방식 | `domainReference` 신규 + `domainSelection` 요청, 생성 binding 보존 | 기존 binding을 통합 재사용하려면 “생성 당시” 의미·위조 방지·해제·AI 보존 정책을 모두 수정해야 함 |
| 미지정 레거시 메타의 AI 사용 | 기존 AI 자동 생성의 호환을 우선 유지, 신규 수동 선택에서는 DB 지정 요구 | AI에서도 즉시 차단하면 기존 사전 기반 생성이 실패할 수 있어 데이터 보완 및 명시적 전환 필요 |
| 기능 제공 화면 | 공통 편집기이므로 ERD와 프로젝트 DB 등록/수정에 함께 제공 | ERD만 제공하려면 공통 props에 사용 범위를 추가하고 화면별 차이를 검증해야 함 |
| 검색 결과의 DB 자동 제한 | 현재 프로젝트의 모든 DB 종류 표시 | 테이블별 DB 제한을 원하면 테이블 대상 DB 모델부터 추가해야 함 |

위 사항은 검토 가능한 제안이며 이 문서 작성만으로 DB 스키마 변경·데이터 보정·구현 적용이 승인된 것으로 보지 않는다.

## 10. 관련 문서

- [기존 DB설계 ERD·도메인 메타·AI 생성 설계](DB설계-ERD새탭-도메인메타-AI테이블생성-설계.md)
- [현재 기능 구현 기록](../../work/2026-11-09/DB설계-ERD새탭-도메인메타-AI테이블생성-구현.md)
