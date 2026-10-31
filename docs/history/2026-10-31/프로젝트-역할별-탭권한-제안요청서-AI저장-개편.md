# 프로젝트 역할별 탭 권한 및 제안요청서 AI 저장 개편 설계

- 작성일: 2026-10-31 (한국시간)
- 작업 구분: 현재 소스 분석 및 설계. 이번 작업에서는 소스·DB를 변경하지 않는다.
- 관련 선행 설계: [제안요청서 작성 탭](../2026-10-30/제안요청서-작성탭-설계.md)
- 목적: 프로젝트 owner가 AI로 작성한 제안요청서를 실제 DB에 저장하고, 프로젝트 역할별 탭 권한을 서버·화면·AI에 일관되게 적용한다.

## 1. 요구사항 및 범위

### 1.1 제안요청서 실제 저장

1. 로그인한 사용자의 **현재 프로젝트 역할**을 확인한다. 프로젝트 owner는 제안요청서를 직접 작성하거나 AI에게 작성·저장을 요청하여 DB에 저장할 수 있어야 한다.
2. 저장한 내용은 새로고침·재로그인·다른 구성원의 조회에서도 동일하게 보여야 한다. 브라우저 메모리만 변경한 결과를 저장 성공으로 안내하면 안 된다.
3. 제안요청서의 수동 편집과 AI 편집은 같은 검증·권한·버전 충돌·이력 처리 경로를 사용한다.
4. 기존 원본 요구사항 작성 영역은 제안요청서 문서의 일부로 저장한다. 요구사항 탭에 별도 산출물을 자동 생성하지 않는다.
5. 요청에 나온 ‘프로젝트 제안서’, ‘사업계획서’는 우선 현재 `rfp`/‘제안요청서’ 탭의 구조화 문서를 의미하는 것으로 해석한다. 문서 유형을 추가하거나 탭 이름을 바꾸는 작업은 확정 전 수행하지 않는다.

### 1.2 역할과 소유권

1. 일반 신규 가입자의 계정 역할은 `users.account_role='user'`다. 사용자가 입력한 역할을 가입 API에서 신뢰하지 않는다.
2. 프로젝트 생성자는 계정 역할이 user인 상태로 해당 프로젝트의 owner가 된다. 프로젝트를 만들었다고 플랫폼 관리자가 되지 않는다.
3. 프로젝트 owner는 팀 공유 화면에서 기존 프로젝트 구성원에게 소유권을 양도할 수 있다. 계정 역할과 다른 프로젝트의 역할은 바뀌지 않는다.
4. 프로젝트 초대·추가 구성원은 viewer로 시작한다. 프로젝트 owner가 팀 공유에서 admin/member 등으로 변경한다.
5. 프로젝트 owner만 역할별 탭 권한 정책을 관리한다. 팀 공유의 ‘팀 공유’ 타이틀 바로 옆에 ‘역할별 권한 설정’ 버튼을 제공한다.
6. 역할별 기본 권한은 아래 표를 따른다. 이 정책을 프런트엔드 표시뿐 아니라 직접 API 호출·AI 도구 실행·최종 DB 커밋에서도 검사한다.

### 1.3 역할별 기본 권한표

`CRUD`는 등록(C)·조회(R)·수정(U)·삭제(D), `R`은 조회 전용이다. 읽기와 조회는 동일한 R 권한으로 취급한다.

| 프로젝트 탭/기능 | owner | admin | member | viewer |
| --- | --- | --- | --- | --- |
| 제안요청서 (`rfp`) | CRUD | R | R | R |
| WBS 일정 (`wbs`) | CRUD | CRUD | R | R |
| 아키텍처 (`architecture`) | CRUD | CRUD | R | R |
| 요구사항 (`requirement`) | CRUD | CRUD | CRUD | R |
| 화면 설계 (`screen`) | CRUD | CRUD | CRUD | R |
| DB 설계/ERD (`database`) | CRUD | CRUD | CRUD | R |
| 프로그램 정의 (`program`) | CRUD | CRUD | CRUD | R |
| 검증/검수 (`test`) | CRUD | CRUD | CRUD | R |
| 문서함 (`documents`) | CRUD | CRUD | CRUD | R |
| 개요·추적표·통합 검수·변경 이력·산출물 | 제공 기능 전체 허용 | 제공 기능 전체 허용 | 제공 기능 전체 허용 | 조회 기능만 허용 |

- 위 마지막 행은 CRUD 정책의 적용 범위를 뜻한다. 현재 조회·계산·다운로드만 제공하는 화면에 등록/삭제 API를 새로 만들라는 의미가 아니다. 변경 이력과 확정 WBS 배포본의 불변성은 유지한다.
- 개요에서 다른 탭의 항목을 수정한다면 실제 수정 대상 탭의 권한을 검사한다. 산출물 화면에서 파일을 저장/업로드하는 기능은 문서함의 해당 변경 권한도 필요하다.
- WBS 확정 배포는 기존의 **owner/admin** 제한을 유지하며 WBS 저장/수정 권한도 함께 필요하다. 역할별 CRUD 설정으로 소유권 관리·확정 배포 권한을 자동 부여하지 않는다.
- 기본 정책은 기존 프로젝트에도 적용한다. 기존 admin의 RFP 편집과 member의 RFP/WBS/아키텍처 편집은 제한되는 의도된 변경이다.

### 1.4 이번 설계의 경계

- 포함: 제안요청서 DB 영속화·직접 CRUD·AI 저장, 역할 분리 명확화, 신규 구성원 viewer 기본값, 프로젝트별 역할/탭 CRUD 설정 모달과 API, 관련 우회 경로 차단 및 검증.
- 제외: 기존 플랫폼 master/admin 계정 일괄 강등, 계정/워크스페이스 소유권 모델 폐기, 기존 프로젝트 구성원 일괄 viewer 변경, 프로젝트 자체의 삭제 기능 신설, 제안요청서 승인/공고/전자결재, 원본 요구사항 자동 전환, PDF/Word 출력 신설.
- 프로젝트 탭의 CRUD 허용은 기존 요금제·쿼터·자료형/연결 검증을 우회하지 않는다. owner도 다른 프로젝트 데이터에 접근할 수 없다.

## 2. 현재 구조와 원인 분석

### 2.1 제안요청서가 저장되지 않는 이유

| 현재 파일 | 확인한 동작 | 영향 |
| --- | --- | --- |
| `components/pages/rfp/rfp-page.tsx` | `createRfpSample()`로 샘플을 만들고 `useRfpDrafts`로 변경값 보관. `data.canWrite`로 입력 허용 여부 판단 | 편집 UI는 있지만 실제 저장/재조회 API가 없다. |
| `stores/rfp-drafts.ts` | `${workspaceId}:${userId}:${projectId}` 키의 Zustand 메모리 저장소. 서버 미전송이 주석으로 명시되어 있음 | 탭 이동 중 편집은 남을 수 있어도 새로고침 시 사라지며 다른 사용자와 공유되지 않는다. |
| `lib/rfp-types.ts`, `lib/rfp-template.ts` | 기본정보·범위·원본 요구사항·수행관리·제안 안내·평가·부록을 포함하는 `RfpDraft`와 샘플/검증 정의 | 구조화 문서를 저장할 기초 타입은 있지만 DB 저장 메타데이터가 없다. |
| `lib/ai/page-prompts.ts` | `aiPages.rfp`에 브라우저 메모리 전용이며 서버 조회/저장이 불가능하다고 명시. `kind`가 없고 `reads=[]` | 사용자가 받은 답변은 현재 구현에 맞는 안내다. owner 역할을 읽는 것만 고쳐서는 저장되지 않는다. |
| `lib/ai/page-tools.ts` | `page.kind && canWrite`일 때만 `save_artifact` 제공 | RFP는 저장 도구가 제공되지 않는다. |
| `lib/ai/page-data.ts` | 일반 산출물·팀·이력 조회만 존재. RFP 전용 조회가 없고 빈 `reads`에 대한 산출물 조회 경로 사용 | DB의 실제 RFP 문서/버전을 AI에게 공급할 경로도 필요하다. |
| `lib/artifact-types.ts` | `ArtifactKind`는 wbs/architecture/requirement/screen/database/program/test의 7종 | RFP를 일반 artifact 도구로 저장하려면 타입·CHECK·검수/내보내기까지 광범위하게 변경해야 한다. |

따라서 프롬프트의 ‘저장 불가’ 문구만 지우거나 `canWrite=true`를 전달하는 수정은 불충분하다. RFP 전용 영속화 서비스와 AI 조회/저장 도구가 필요하다.

### 2.2 현재 역할 계층

| 구분 | 저장 위치/표현 | 의미 및 현행 동작 |
| --- | --- | --- |
| 계정 역할 | `users.account_role`, `User.accountRole` | master/admin/user/guest. `newUserStatements()`는 신규 가입 시 user를 강제한다. 일반 가입 정책은 이미 충족한다. |
| 워크스페이스 역할 | `workspace_members.role`, 인증 직후 `User.role` | 워크스페이스 소속 역할. 신규 가입자의 개인 워크스페이스 역할은 owner다. 이것은 계정 user와 모순되지 않는다. |
| 프로젝트 소유자 | `projects.owner_id` | 프로젝트 owner 판정의 기준. |
| 프로젝트 구성원 역할 | `project_members.role` | DB CHECK는 admin/member/viewer이며 owner 문자열은 저장하지 않는다. |
| 프로젝트 유효 역할 | `lib/team-permissions.ts`의 `projectRoleSql` | `p.owner_id=m.user_id`이면 owner, 그 외 구성원 role 또는 viewer. |

- `lib/auth.ts`의 인증 DTO `user.role`은 기본적으로 워크스페이스 역할이다. 프로젝트 API에서 이 값을 프로젝트 역할로 오해하면 안 된다. 일부 AI/문서 경로는 프로젝트 조회 후 복제 DTO의 role을 대체하므로 혼동을 줄일 명시적인 프로젝트 접근 객체가 필요하다.
- 사용자가 말한 ‘user 테이블의 role’은 현행 스키마의 `users.account_role`에 대응한다. 새로운 `users.role` 컬럼을 추가하지 않는다.
- 프로젝트 생성 API는 생성자의 `owner_id`를 기록하고 `project_members.role`에는 admin을 저장한다. 표시되는 유효 역할은 owner다. 이 저장 구조는 소유권을 중복 관리하지 않으므로 유지할 수 있다.

### 2.3 현재 공통 권한 검사의 한계

- `lib/artifacts.ts`의 `projectAccess(..., write=true)`는 프로젝트 소속을 확인한 후 `requireWriter({...user, role: row.role})`를 호출한다.
- `lib/auth.ts`의 `requireWriter()`는 owner/admin/member를 모두 허용한다. 탭이나 CREATE/UPDATE/DELETE를 구분하지 않는다.
- `projectData()`는 프로젝트 전체에 대해 하나의 `canWrite`만 반환한다. 기존 화면 대부분이 이 값에 의존한다.
- `app/api/ai/chats/route.ts`는 프로젝트 컨텍스트가 있으면 `projectAccess(..., true)`를 호출한다. 따라서 viewer의 프로젝트 AI 조회도 시작 단계에서 막힐 수 있다. 조회 권한과 AI 변경 권한을 분리해야 한다.
- 일반 산출물 CRUD 외에도 WBS 일괄 저장·배포, Mermaid 코드 저장, AI 이미지 저장, 문서함 업로드/폴더/파일 변경, ONLYOFFICE 편집 및 callback이 존재한다. 이 경로까지 같은 정책을 적용해야 한다.

### 2.4 신규 멤버와 소유권 이전

- `app/api/team/members/route.ts`의 직접 추가는 이미 프로젝트 viewer를 저장한다. 프로젝트 owner/admin이 추가할 수 있고 역할 변경/양도는 프로젝트 owner만 가능하다.
- `app/api/projects/route.ts`는 프로젝트 생성 시 함께 선택한 다른 구성원을 member로 저장한다. 신규 기본 viewer 정책에 맞게 변경할 대상이다.
- `app/api/team/requests/route.ts`의 가입 승인은 워크스페이스 member를 만들고 해당 워크스페이스의 프로젝트에 member를 자동 추가하며 기존 viewer도 member로 올린다. 이 자동 승격은 새 정책과 충돌한다.
- 팀 공유의 `TeamMembership`은 권한 변경과 양도 모달을 이미 제공한다. 프로젝트 양도 시 이전 owner는 member가 되고 `projects.owner_id`가 변경되며 계정 역할은 변경되지 않는다.
- `requireProjectOwner()`는 `owner_id`와 프로젝트 멤버십을 검증한다. 신규 권한 정책 관리 API에서도 재사용한다. workspace owner라는 이유만으로 다른 사람이 소유한 프로젝트의 정책을 변경할 수 없다.

## 3. 수정 방향: 권한 공통화

### 3.1 역할 객체와 단일 정책 서비스

- `ProjectAccess`에 `projectRole`, `ownerId`, `permissionVersion`, `permissionsByTab`을 명시한다. `User.accountRole`, workspace role과 별도로 유지한다.
- 신규 공통 모듈 `lib/project-permissions.ts`에 기본 권한표, 탭별 지원 액션, kind→tab 매핑, 정책 읽기와 `requireProjectPermission(executor,user,projectId,tab,action)`을 둔다.
- `action`은 CREATE/READ/UPDATE/DELETE로 구분한다. 미등록 role/tab/action은 거부하고 클라이언트가 보낸 역할·권한 객체를 신뢰하지 않는다.
- 순서는 인증/온보딩 → 워크스페이스 소속 → 프로젝트 소속 → 프로젝트 유효 역할 → 탭별 권한 → 기존 검증/쿼터다. 플랫폼 관리 권한은 프로젝트 쓰기 권한의 대체 조건으로 사용하지 않는다.
- 프로젝트 owner의 지원 작업은 항상 허용하고 owner의 권한 관리/양도 권한은 일반 CRUD 정책과 별도로 고정한다. viewer는 기본 읽기 전용이다.
- 모든 프로젝트 구성원에게 모든 탭 조회를 허용하는 요청에 맞춰 초기안에서는 R을 고정한다. 탭 숨김이나 접근 자체 차단 정책은 추가하지 않는다.

### 3.2 역할별 권한 설정의 편집 범위

요청의 ‘역할별 기본 권한’과 ‘권한 설정’이 함께 있으므로 기본값과 변경 가능 범위를 분리한다.

- 모달에는 모든 탭과 네 역할의 CRUD를 표시한다. owner의 지원 작업 전체와 viewer의 R은 잠금 상태로 표시한다.
- admin/member의 C/U/D를 각각 설정할 수 있다. 설정은 구성원 개인이 아닌 **선택 프로젝트의 해당 역할 전체**에 적용한다.
- **검토 전 권고안은 기본 권한을 상한으로 두고 회수만 허용하는 방식**이다. 즉 admin의 RFP 쓰기, member의 RFP/WBS/아키텍처 쓰기, viewer의 쓰기는 저장 요청을 조작해도 허용하지 않는다.
- owner가 기본 제한을 넘겨 admin/member에게 권한을 부여할 수도 있어야 하는지는 결정 사항이다. 그 방식을 선택하면 위 표는 초기값이 되고 변경된 실제 정책이 우선한다는 점을 화면과 설계에 명시해야 한다. 확정 없이 제한 탭을 임의로 편집 가능하게 만들지 않는다.
- 지원하지 않는 작업(예: 불변 이력 삭제)은 체크박스를 비활성화하고 이유를 표시한다.

### 3.3 UI와 실제 저장 경로 적용

- `ProjectData`에 프로젝트 유효 역할과 탭별 액션 권한을 추가한다. 하나의 `data.canWrite`로 모든 탭을 제어하지 않는다.
- 각 화면은 생성·저장/수정·삭제 버튼을 각각 C/U/D로 제어한다. ‘수정 가능하지만 삭제 불가’ 같은 정책이 화면에 반영되어야 한다.
- 이전 코드 호환용 `canWrite`를 임시 유지한다면 공통 Context에서 현재 탭 권한으로 파생하고, 최종적으로 모든 액션은 개별 검사로 전환한다. 프로젝트 전체 boolean을 보안 근거로 남기지 않는다.
- 일반 산출물은 요청 body의 kind가 아니라 서버에서 확인한 대상 kind로 권한을 결정한다. 수정 요청으로 kind를 바꿔 제한을 우회하지 못하게 한다.
- 수동 저장, AI 임시 검증/최종 커밋, WBS 일괄 저장, Mermaid PATCH, 이미지 생성/저장 및 파일 변환/업로드에서 해당 탭의 액션을 검사한다.
- AI는 read 권한으로 대화를 시작한다. 도구 제공 여부와 실행/커밋 시 현재 권한을 별도로 검사하여 조회 전용 사용자의 AI 조회·설명을 허용한다.
- ONLYOFFICE 편집 설정·편집용 토큰 발급·callback 저장 시 문서함 U 권한을 검사한다. 편집기가 열린 후 권한이 회수되면 늦게 도착한 저장 callback도 거부해야 한다.
- 배치 요청의 어느 한 작업이 금지되면 전체를 롤백한다. 연결 변경이 다른 문서를 직접 수정하는 경우 그 대상의 변경 권한도 검사한다. 파생 표시/집계값 갱신은 사용자 CRUD와 구분한다.
- 권한 변경 후 프로젝트 데이터와 팀 공유 데이터를 재조회한다. 이미 열린 화면/AI 작업도 커밋 시 DB의 최신 역할과 정책을 확인하므로 오래된 클라이언트 상태가 권한을 유지하지 않는다.

## 4. 제안요청서 영속화 및 AI 설계

### 4.1 저장 모델 권고

RFP는 구조가 크고 기존 7종 산출물과 필드 구성이 달라 **전용 문서 테이블과 서비스**를 권고한다. `ArtifactKind`/산출물 CHECK와 검수 계산을 넓히지 않는다.

- 프로젝트당 활성 제안요청서 한 건을 기본으로 한다. 문서 ID·프로젝트/워크스페이스 ID·문서 schemaVersion·내용 JSON·저장 version·생성/수정자·시각·삭제 시각을 관리한다.
- 내용은 기존 `RfpDraft` 구조를 사용하되 URL/접근 객체의 projectId를 기준으로 검증한다. body의 projectId를 그대로 저장 범위로 사용하지 않는다.
- DB에 실제 문서가 없으면 ‘저장된 문서 없음’을 표시한다. 샘플은 ‘샘플 불러오기’ 등 명시적 동작으로만 불러오며 샘플을 실제 저장본으로 오인시키지 않는다.
- 기존 메모리 초안은 자동 DB 이관하지 않는다. 화면에 남아 있는 편집본이 있다면 권한을 확인하고 ‘이 초안 저장’으로 사용자가 선택하여 저장한다.
- 초안 저장은 누락된 업무 필수값을 허용하되 자료형·길이·배열 개수·고유 ID·날짜 순서·허용 분류 등 구조 검증은 서버에서 수행한다. 작성률과 누락 경고는 기존 작성 도우미를 활용한다. AI가 미확인 예산/기관/기한을 사실처럼 채우지 않는다.
- 현재 문서에 서버 관리번호 발급 체계가 없으므로 우선 서버 ID/version을 사용한다. `RFP-001` 같은 관리번호는 채택 여부와 형식을 별도 결정한다. 번호를 발급하지 않았다면 AI가 발급됐다고 답하지 않는다.

### 4.2 직접 편집 API 및 상태

제안 경로: `/api/projects/{projectId}/rfp`. 실제 이름은 구현 시 기존 라우팅 규칙에 맞춰 확정한다.

| 요청 | 동작 | 권한/충돌 조건 |
| --- | --- | --- |
| GET | 현재 활성 문서와 ID/version·수정 정보·권한 조회. 문서가 없으면 null 반환 | R |
| POST | 명시적으로 신규 초안 생성 | C, 활성 문서가 이미 있으면 409 |
| PATCH | 지정한 장/필드 또는 검증한 전체 문서 수정 | U, ID와 expectedVersion 필수 |
| DELETE | 현재 문서 논리 삭제 | D, ID와 expectedVersion 및 사용자 확인 필수 |

- 조회 응답은 사용자/프로젝트별 private/no-store로 처리한다. 서버 공용 캐시에 사용자 권한이나 문서를 공유하지 않는다.
- `lib/rfp-server.ts`의 공통 저장 서비스에서 권한·버전 확인과 본문/이력 저장을 하나의 트랜잭션으로 실행한다.
- 화면에는 조회/저장, 저장 상태, 마지막 저장 시각/사용자, 변경사항 있음, 삭제를 제공한다. 미저장본과 DB 저장본을 구분하고 조회·프로젝트 전환 시 편집값 유실을 확인한다.
- 현재 ‘샘플 초기화’는 DB 삭제와 분리한다. 조회 전용 사용자는 저장본 조회와 미리보기만 가능하다.
- 409 발생 시 최신본 다시 불러오기와 편집본 보존을 제공한다. 자동 덮어쓰지 않는다. 저장 중 권한 상실은 403으로 안내하고 성공 표시를 하지 않는다.
- AI 변경 후 기존 `aiDataVersion` 갱신 흐름에 RFP 재조회를 연결한다. 로컬 편집 중이면 AI 저장본을 무조건 덮어쓰지 않고 충돌/차이를 안내한다.

### 4.3 AI 조회·작성·저장 흐름

1. `aiPages.rfp`의 메모리 전용 안내를 실제 DB 문서 작성 안내로 변경하고 전용 조회 소스를 지정한다.
2. `read_page`의 RFP 분기에서 저장된 문서의 ID/version과 허용된 범위의 내용을 읽는다. 다른 탭에서 만든 예시를 저장본이라고 반환하지 않는다.
3. `save_rfp_document` 등 RFP 전용 도구를 추가한다. 일반 `save_artifact`와 같은 권한/검증/최종 커밋 원칙을 적용하되 ArtifactKind로 위장하지 않는다.
4. 도구 스키마는 허용 필드와 작업을 제한한다. 섹션 단위 변경을 지원하여 AI가 작성하지 않은 장과 목록 항목을 보존한다. 수정/삭제는 조회한 실제 ID/version을 사용한다.
5. 요청한 사용 경험에 맞춰 **현재 RFP 탭에서 owner의 ‘제안요청서를 작성해줘’는 새 초안 작성 및 DB 초안 저장 의도로 처리하는 안**을 제안한다. ‘저장하지 말고’, ‘예시만’, ‘분석/추천’ 요청은 저장하지 않는다. 이미 문서가 있으면 작성 대상 장을 식별하고, 전체 교체가 모호하면 먼저 확인한다. ‘작성’ 의도 확장은 RFP에 한정하며 기존 다른 탭의 의도 검사를 무작정 완화하지 않는다.
6. owner 이외는 실제 RFP 쓰기 권한이 없으면 저장 도구를 제공하지 않는다. 조회·텍스트 초안 제안은 가능하지만 저장 불가 사유를 현재 역할 기준으로 안내한다.
7. 기존 `createPageAgent`의 preview 롤백 → 최종 출력 가드레일 검사 → 최종 트랜잭션 커밋 구조를 RFP에도 적용한다. 커밋 시 프로젝트 역할과 정책 version을 다시 읽는다.
8. 취소·가드레일 차단·권한 회수·버전 충돌 시 임시 변경안은 실제 DB에 반영하지 않는다. 재시도/동일 요청이 문서를 중복 생성하지 않도록 기존 AI generation request와 연결된 실행 식별자로 중복 커밋을 방지한다.
9. AI 액션 결과 타입에 RFP 대상 구분을 추가해 artifact ID로 오인하지 않게 한다. 최종 커밋 결과의 ID/version으로 ‘초안 저장 완료’를 표시하고, 임시 검증 단계에서는 완료라고 말하지 않는다.
10. 제안요청서 작성은 사업 승인·배포가 아니다. 문서함 저장이나 요구사항 산출물 생성도 명시적으로 요청한 별도 작업이 없으면 수행하지 않는다.

## 5. 팀 공유의 역할별 권한 설정 모달

### 5.1 화면 구성

- 위치: `components/pages/team/team-page.tsx`의 `<h1>팀 공유</h1>` 바로 옆.
- 버튼: ‘역할별 권한 설정’. 프로젝트 선택 완료 및 해당 프로젝트 owner일 때 표시한다. 목록 로딩 중/프로젝트 전환 중에는 사용할 수 없다.
- 공통 모달 클래스 `workspace-dialog admin-detail-dialog workspace-form-dialog`, 공통 header/body/footer 및 액션 버튼 크기·그림자 스타일을 재사용한다.
- header: ‘프로젝트 역할별 권한 설정’, 프로젝트명, 닫기 버튼.
- body: owner/admin/member/viewer 역할 탭과 메뉴별 C/R/U/D 표, 잠금 이유, 기본값 대비 변경 표시. 읽기 전용인 메뉴에는 의미 없는 액션을 제공하지 않는다.
- footer: ‘기본값 복원’, ‘취소’, ‘저장’. 복원은 화면 초안만 바꾸고 저장해야 DB에 반영한다.
- ‘구성원의 역할 변경’과 ‘역할별 메뉴 권한 변경’을 구분한다. 기존 소유권 양도는 기존 확인 모달을 사용한다.
- 키보드 포커스·Escape·바깥 클릭·미저장 확인·호출 버튼 포커스 복귀를 공통 모달 방식에 맞춘다. 저장 중 중복 실행을 막는다.

### 5.2 정책 API

- 제안 경로: `/api/projects/{projectId}/permissions`.
- GET: 서버가 계산한 기본/현재 정책과 지원 액션, 잠금 이유, version 반환. 일반 프로젝트 데이터에는 본인의 유효 권한만 포함하고 정책 관리 화면은 owner로 제한한다.
- PATCH: 최신 expectedVersion과 전체 정책 또는 검증된 변경 목록을 받아 owner 확인 후 원자적으로 저장한다. 알 수 없는 탭/role, 금지된 권한 확대, owner 권한 회수, 정책 누락으로 인한 암묵적 허용을 거부한다.
- 권한 변경은 CSRF/Origin 검사와 감사 로그를 적용한다. 저장 직전 owner가 양도되었거나 version이 달라지면 403/409를 반환한다.
- 정책은 프로젝트에 귀속된다. 소유권 양도 후에도 유지되고 새 owner가 관리한다. 기존 owner는 member의 현재 정책을 적용받는다.

## 6. DB 변경 설계안

이번 단계에서는 아래 테이블을 생성하거나 실제 데이터를 수정하지 않는다. 구현 시 최신 마이그레이션 순번 뒤에 추가하며 기존 001~029를 수정하지 않는다.

| 신규 테이블(제안명) | 주요 컬럼/제약 | 용도 |
| --- | --- | --- |
| `project_permission_policies` | workspace_id/project_id 복합 범위, project_id별 한 행, version≥1, updated_by FK, 생성/수정 시각 | 정책 충돌 검사 및 수정 메타데이터 |
| `project_role_tab_permissions` | workspace_id/project_id, role, tab_key, can_create/read/update/delete(0/1), 프로젝트/role/tab UNIQUE | 프로젝트별 역할 권한. role/tab 허용값·잠금 규칙은 서버와 DB CHECK 가능한 범위에서 검증 |
| `project_rfp_documents` | id PK, workspace_id/project_id 복합 FK, schema_version, document_json CHECK(json_valid), version≥1, created_by/updated_by FK, 시각, deleted_at | 프로젝트 공유 RFP 저장본. 프로젝트별 활성 문서 한 건을 부분 UNIQUE 인덱스로 보장 |
| `project_rfp_revisions` | id PK, document_id, workspace_id/project_id, document_version, CREATE/UPDATE/DELETE, actor_id/name, snapshot_json, occurred_at | RFP 저장/삭제 이력. UNIQUE(document_id,document_version), 기존 이력처럼 수정/삭제 금지 |

- 기존 프로젝트는 기본 정책을 초기 등록하거나 정책이 없는 경우 고정 기본값으로 계산한다. 첫 저장의 동시성까지 정의해야 하므로 **정책 헤더와 기본 행을 기존 프로젝트에 백필하고 신규 프로젝트 생성 트랜잭션에도 생성하는 안**을 권고한다.
- 정책 조회 중 누락 행이 있으면 해당 탭의 기본값으로만 보완한다. 허용값 전체로 확대하는 fallback을 두지 않는다.
- `project_members.role`에 owner를 추가할 필요는 없다. `owner_id`로 유효 owner를 계산하는 현재 방식과 소유권 보호 트리거를 유지한다.
- 기존 프로젝트 구성원의 저장된 역할은 변경하지 않는다. 새 기본 정책에 따른 권한만 달라진다.
- 회원 가입 승인 경로는 기존 viewer를 member로 자동 승격하는 UPDATE를 제거해야 한다. 프로젝트 자동 참여 여부는 아래 결정 사항이며, 참여시켜야 한다면 신규 프로젝트 역할은 viewer다. 기존 admin/member를 viewer로 덮어쓰지도 않는다.
- RFP 변경 이력은 전용 업무 이력으로 트랜잭션에 포함한다. 플랫폼 감사 로그는 `admin_setting.DB_LOGGING_ENABLED` 조건을 기존대로 적용하고, 이력을 보여주는 요금제 정책도 유지한다. 전체 문서 내용을 로그에 중복 기록하는 방식은 피한다.
- 실제 DB의 기존 023 토스트 migration 적용 이력 불일치는 이전 작업 기록에 남아 있다. 구현 전 스키마와 적용 목록을 읽어 확인하고, 이번 변경과 무관한 컬럼 추가/기록 보정은 묶어서 실행하지 않는다.

## 7. 변경 대상 파일과 영향 범위

| 대상 | 변경 방향 |
| --- | --- |
| `lib/project-permissions.ts` (신규), `lib/team-permissions.ts` | 역할/탭/액션 공통 정책, 소속·owner 판정 분리 |
| `lib/plan-types.ts`, `lib/types.ts`, `lib/project-types.ts`, `lib/artifact-types.ts` | 명시적 projectRole과 액션별 권한 DTO. RFP를 일반 ArtifactKind에 추가하는 안은 기본안에서 제외 |
| `lib/auth.ts`, 가입/온보딩 관련 API | 신규 계정 user 강제 유지, workspace role과 프로젝트 role의 혼용 점검 |
| `lib/artifacts.ts`, artifacts CRUD API | 실제 kind/액션별 권한 검사, 응답 권한 매트릭스 제공, 모든 mutation 내부 재검사 |
| `app/api/projects/route.ts` | 생성자 owner 유지, 함께 추가한 구성원 viewer, 신규 프로젝트 기본 정책 생성 |
| `app/api/team/members/route.ts`, `app/api/team/requests/route.ts` | 직접 추가 viewer 유지, 승인 자동 member 부여/승격 정리, owner 역할 변경·양도 보장 |
| `app/api/projects/[projectId]/permissions/route.ts` (신규) | owner 전용 권한 정책 조회/저장 및 version 충돌 |
| `components/pages/team/team-page.tsx`, `team-membership.tsx`, 관련 CSS | 타이틀 옆 버튼, 유효 role 표시, 변경 후 재조회 |
| `components/pages/team/project-permissions-dialog.tsx` (신규), `styles/dialog.css` | 공통 모달 패턴 사용. 공통 CSS는 필요한 경우에만 보완 |
| `lib/rfp-types.ts`, `lib/rfp-template.ts`, `lib/rfp-server.ts` (신규) | 문서 메타데이터·서버 구조 검증·권한/충돌/이력 공통 저장 서비스 |
| `app/api/projects/[projectId]/rfp/route.ts` (신규) | RFP CRUD API |
| `components/pages/rfp/rfp-page.tsx`, `rfp-page.css`, `stores/rfp-drafts.ts` | 서버 저장본·로컬 편집본 분리, 저장/조회/삭제/충돌 UI, 권한별 액션, 샘플 안내 정리 |
| `components/shared/project-page-context.tsx`, `use-project-data.ts`, `use-artifact-actions.ts`, `components/project-workbench.tsx` | 탭별 권한 및 데이터 갱신 전파 |
| `components/pages/wbs/*`, `architecture/*`, 요구사항/화면/DB/프로그램/검증/문서함 및 공유 산출물 UI | 전체 boolean 대신 해당 탭 C/U/D, 읽기 전용 입력/액션 정리 |
| `lib/wbs-schedule-server.ts`, `lib/wbs-publications.ts`, WBS/배포 API | 일괄 저장 권한 및 owner/admin 배포 정책 결합 |
| Mermaid PATCH API, `lib/ai/architecture-images.ts`, `lib/ai/wbs-images.ts`, 관련 이미지 API | 제한 탭의 우회 저장/생성 차단 |
| 문서함 API, `lib/documents.ts`, `lib/onlyoffice.ts` 및 editor/callback API | C/U/D와 실제 쓰기 callback 시 최신 권한 검사 |
| `app/api/ai/chats/route.ts`, `lib/ai/page-prompts.ts`, `page-data.ts`, `page-tools.ts`, `lib/ai-context.ts` | RFP 조회/저장 도구, 역할별 도구 제한, viewer 조회 허용, 최종 커밋 재검사 |
| `lib/ai/background-response.ts`, AI 액션을 표시하는 UI, `stores/workspace.ts` | RFP 액션 결과/재조회 이벤트 영향 점검. 실제 호출 구조상 필요한 부분만 변경 |
| 신규 DB 마이그레이션, 관련 `scripts/test-*.mjs` 및 `check-*.mjs` | 기본 정책·RFP 테이블 추가, 기존 기대 권한 변경, 통합 회귀 검증 |

실제 구현 전에 변경된 최신 소스를 다시 읽고 경로·순번을 확정한다. 파일 목록은 영향 범위이며 열거된 모든 파일의 수정이 반드시 필요하다는 뜻은 아니다.

## 8. 검증 방법 및 수용 기준

### 8.1 역할/정책

1. 일반 가입·OAuth 온보딩에서 account_role이 user임을 확인하고 owner/admin 요청값 주입이 무시/거부되는지 검증한다. 기존 master/admin은 보존한다.
2. 계정 user가 프로젝트를 만들면 유효 projectRole=owner이며 다른 사용자 포함 시 viewer인지 확인한다. 별도 프로젝트에서는 독립된 역할이 적용되어야 한다.
3. owner/admin/member/viewer × 전체 탭 × 지원 C/R/U/D를 API로 검사한다. 특히 admin RFP 변경, member RFP/WBS/아키텍처 변경, viewer의 모든 변경은 기본 정책에서 403이어야 한다.
4. owner의 정책 모달 버튼 노출, 다른 역할의 버튼 미노출 및 API 직접 호출 차단을 확인한다. 같은 workspace의 다른 project owner도 접근 불가여야 한다.
5. 권한 저장·취소·기본값 복원·409 충돌·프로젝트 전환·미저장 이탈·키보드 포커스를 검증한다. C/U/D 개별 회수와 실제 화면/서버 동작이 일치해야 한다.
6. owner 양도 후 새 owner만 정책 변경 가능하고 이전 owner는 member 정책을 적용받는지 확인한다. 동시 양도 요청·역할변경 충돌·마지막 owner 보호와 계정/다른 프로젝트 역할 보존을 검증한다.
7. 직접 추가·프로젝트 생성 시 선택·가입 승인 경로를 각각 검사한다. 신규 참여는 viewer이고 기존 구성원이 자동 승격/강등되지 않아야 한다.

### 8.2 RFP 저장과 AI

1. owner가 전체 장과 표 항목을 저장한 뒤 새로고침/재로그인/다른 브라우저 조회에서 동일한 데이터를 확인한다. viewer도 저장된 문서를 조회할 수 있어야 한다.
2. POST 중복·문서 삭제·재생성·expectedVersion 누락/충돌·교차 프로젝트 ID·변조 JSON·배열 과다·불명확한 값·이력 실패 시 롤백을 검증한다.
3. RFP AI 테스트는 모델 응답을 모킹하여 최신 문서 조회→변경안 검증→최종 커밋→반영 재조회까지 검증한다. 실제 유료 API나 운영 문서를 테스트 데이터로 사용하지 않는다.
4. ‘제안요청서 작성해줘’의 신규 초안 저장, ‘배경만 수정해줘’의 나머지 필드 보존, ‘저장하지 말고 초안만’의 무저장, 애매한 전체 교체의 확인 요청을 검증한다.
5. admin/member/viewer의 RFP 저장 도구 미제공과 직접 도구 호출 거부, owner의 실제 성공 ID/version 표시, 실패 시 허위 완료 안내 방지를 검사한다.
6. AI 실행 중 owner 양도·권한 회수·다른 사용자 저장·취소·가드레일 차단·재시도를 발생시켜 최종 커밋에서 거부/충돌하고 중복 문서가 생성되지 않는지 확인한다.
7. 일반 요구사항 탭 산출물이 RFP 저장만으로 추가/변경되지 않는지, 샘플 데이터가 첫 조회나 마이그레이션으로 저장되지 않는지 확인한다.

### 8.3 우회 경로/회귀/DB

- member의 WBS 일괄 저장·아키텍처 Mermaid PATCH·이미지 저장, viewer의 파일 업로드/이름변경/삭제·ONLYOFFICE callback을 직접 호출해 거부되는지 확인한다.
- 읽기 전용 사용자의 AI 조회는 허용하고 권한 없는 변경은 차단한다. 요금제·가드레일·쿼터 제한은 유지한다.
- 신설 권한/RFP 테스트와 기존 계정·팀·AI·WBS·아키텍처·문서함 테스트를 실행하고 타입 검사·관련 ESLint·프로덕션 빌드를 수행한다.
- 빈 DB 순차 migration과 기존 DB 업그레이드 양쪽에서 FK/UNIQUE/CHECK, 기존 user/role/owner/산출물/전역 설정/개인 설정 보존을 확인한다. 신규 정책 백필 외 기존 권한 데이터의 임의 갱신이 없어야 한다.
- 실제 DB 적용 시 변경 전후 건수·핵심 무결성·migration 목록을 확인한다. 로그 활성/비활성 양쪽에서 권한 변경과 RFP 저장의 트랜잭션 결과가 올바른지 검증한다.
- 기존 인증 테스트의 `/requirements` 라우트 기대값 불일치와 기존 023 적용 이력 불일치는 별도 이슈로 구분한다. 이번 변경에서 발생한 실패와 혼동하거나 전체 검증 통과로 기재하지 않는다.

## 9. 결정이 필요한 사항

| 항목 | 권고안/현재 설계 가정 | 검토할 내용 |
| --- | --- | --- |
| 문서 명칭 | 현재 제안요청서 RFP를 저장 대상으로 사용 | 제안서·사업계획서가 별도 유형이라면 양식/탭/권한 키를 분리해야 한다. |
| 권한 모달의 확대 범위 | 요청 8~10을 기본 상한으로 고정하고 admin/member의 C/U/D 회수만 허용. owner 전체, viewer R 고정 | owner가 admin의 RFP나 member의 WBS/아키텍처 쓰기까지 허용할 수 있어야 하는지. 허용 시 기본표는 초기값으로 명확히 변경한다. |
| AI ‘작성’의 저장 의도 | 현재 RFP에서 명시적 문서 작성 요청은 DB 초안 저장까지 수행. 예시/저장 금지는 제외 | 반드시 ‘저장해줘’가 있어야만 저장하는 기존 정책을 유지할지. 후자를 선택하면 작성 후 저장 여부를 안내해야 한다. |
| 신규 구성원 유입 | 직접 추가·생성 시 선택 구성원은 viewer. 승인으로 프로젝트에 추가할 때도 viewer, 자동 member 승격 제거 | 팀 가입만으로 모든 프로젝트에 자동 참여시키는 현행 동작을 유지할지, 프로젝트 owner의 개별 추가로 한정할지. 권고는 개별 추가다. |
| 멤버 추가 주체 | 기존 owner/admin의 viewer 추가 허용을 유지하고 역할변경/양도/정책변경은 owner 전용 | 멤버 추가까지 owner만 하도록 제한할지. 요청에는 명시가 없어 추가 제한을 단정하지 않는다. |
| RFP 문서 수/관리번호 | 프로젝트당 활성 한 건, 서버 ID/version 사용 | 여러 제안요청서 관리가 필요한지, 별도 관리번호가 필요한지. |
| 소유권 양도 후 이전 owner | 기존 동작인 member 유지 | 양도 후 admin 또는 viewer가 되어야 한다면 역할과 안내를 함께 변경한다. |
| 조회 및 다운로드 | 모든 구성원 R 고정, 기존 조회성 산출물 다운로드 허용 | 역할별 조회 차단·다운로드 제한은 이번 기본 요구에 없으며 필요하면 별도 액션 정책으로 설계한다. |

검토 후 문서에서 확정한 요구사항과 선택안을 기준으로 구현한다. 이 문서 작성 시점에는 DB·애플리케이션 동작의 변경은 없다.
