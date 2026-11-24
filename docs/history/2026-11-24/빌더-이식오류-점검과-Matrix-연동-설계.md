# 빌더 이식 오류 점검 및 HAMS Matrix 연동 설계

- 작성일: 2026-11-24 (한국시간, Asia/Seoul)
- 수정일: 2026-11-24 (한국시간). Orkes 제외·Turso 전환·빌더 내부 복사·라이트/다크 적용 요구를 반영했다.
- 상태: 검토용 설계. 사용자 검토·수정 후 별도 구현 요청을 기준으로 진행한다.
- 대상: `hams-matrix/app/(builder)`
- 원본: `hams-baps/app/(siderbar-header)/admin/builder`
- 이번 단계의 변경: 기존 설계 문서만 수정한다. `hams-matrix/HISTORY.md`의 기존 문서 링크와 작성일은 유지한다.
- 이번 단계에서 소스, 설정, 의존성, lockfile, DB, 환경변수는 변경하지 않는다. 의존성 설치·재설치, 마이그레이션, 운영 API 호출도 수행하지 않는다.

## 1. 요구사항과 완료 기준

### 1.1 요구사항

1. BAPS에서 가져온 빌더가 Matrix에서 동작하지 않는 원인을 현재 소스 기준으로 조사한다.
2. 목록, 상세 편집, 버전 조회, 폼 편집과 이들이 사용하는 공통 UI·실행 엔진·저장 계층의 영향 범위를 분석한다.
3. 누락 import, 경로, Provider, 인증, 사용자 타입, 백엔드 호출 계약을 Matrix 구조에 맞게 정리한다.
4. 이미 설치한 의존성을 전제로 하며, 설치 명령으로 문제를 해결하지 않는다.
5. 기존 Matrix 기능과 사용자가 작업 중인 파일을 보존한다.
6. 확정된 오류, 추가 검증 대상, 사용자 결정이 필요한 정책을 구분한다.
7. **`scenario-orkes`는 사용하지 않는다.** 해당 디렉터리를 복사하거나 독립 페이지를 추가하지 않고, 상세 화면의 Orkes import·모드·UI·분기를 제거한다.
8. **저장 백엔드는 현재 프로젝트의 Turso로 확정한다.** 후속 구현에서 테이블을 생성하고 Firebase/FastAPI 저장 호출을 Turso용 SQL CRUD로 전환한다. 이번 문서 수정 단계에서는 테이블을 실제 생성하지 않는다.
9. BAPS 유틸·컴포넌트가 필요하면 **`hams-matrix/app/(builder)` 내부의 역할별 폴더로 복사**하고 import와 전이 의존성을 정리한다. 빌더 전용 코드를 Matrix 루트의 `components`, `providers`, `lib`에 분산하지 않는다.
10. **라이트·다크 테마를 모두 기본 지원**한다. 목록·상세·버전·폼·모달·시뮬레이터까지 적용하며 기존 Matrix 개인 테마 설정에 연동한다. 다크를 강제 초기값으로 정한다는 의미가 아니다.

위 네 가지 추가 요구는 이전 문서의 Orkes 복원안, FastAPI 권고안, 백엔드 선택 유보, 상세 편집에만 한정된 테마 적용안을 대체한다.

### 1.2 후속 구현의 완료 기준

- 실제 빌더 URL에 진입하고 목록 → 편집 → 버전 조회 → 목록 이동이 정상 동작한다.
- 직접 URL 진입과 새로고침에서 대상 선택이 복원되거나 명확한 선택 안내를 제공한다.
- 노드·연결선·그룹·폼 편집, 실행 취소/다시 실행, 저장, 버전 생성, 복원, 배포 상태·이력 조회를 Turso 기반으로 검증한다.
- 빌더 저장에 Firebase SDK·Firestore·원격 FastAPI를 사용하지 않으며, 일반 Flow가 Orkes 코드 없이 동작한다.
- 필요한 BAPS 유틸·컴포넌트의 복사본은 빌더 내부에 위치하고 모든 빌더 화면에서 라이트·다크가 일관되게 동작한다.
- 상세 시뮬레이터와 버전 조회 시뮬레이터가 누락 모듈 없이 실행된다.
- 서버에서 인증·접근 범위를 검사하고, 사용자/workspace 변경 시 이전 편집·실행 데이터가 노출되지 않는다.
- 타입·정적 검사·빌드 및 관련 브라우저 검증이 통과한다. 외부 연동이 확정되지 않은 기능은 완료로 표시하지 않는다.

## 2. 조사 범위와 현재 구조

### 2.1 소스 비교 결과

최초 조사 시점에 의존성 내부 파일을 제외한 Matrix 빌더 파일은 157개다. 원본 빌더의 같은 상대 경로와 대응하는 142개 중 141개가 바이트 기준 동일하고, `layout.tsx`는 메타데이터가 다르다. Matrix에는 `core/scenario-core` 관련 15개 파일이 추가되어 있다. 원본의 `scenario-orkes` 디렉터리는 Matrix에 없으며 추가하지 않는다. 아래 현황 표는 수정 전 소스를 설명하며 구현 목표와 구분한다.

현재 작업 트리에는 사용자가 만든 `PROMPT.md`, `package.json`, `pnpm-lock.yaml` 변경과 미추적 빌더·이미지 디렉터리가 존재한다. 이 상태를 구현 완료 상태나 이번 작업의 변경으로 해석하지 않으며 그대로 보존한다.

| 영역 | 현재 파일/구조 | 책임 및 연결 |
| --- | --- | --- |
| 공통 루트 | `app/layout.tsx`, `app/providers.tsx` | 전역 CSS, 테마 초기 스크립트, React Query Provider |
| 빌더 레이아웃 | `app/(builder)/layout.tsx` | 메타데이터와 children 반환만 수행. 인증·높이 셸·빌더 Provider 없음 |
| 목록 | `react-flow/scenario-list/page.tsx` | 검색, 생성, 수정, 삭제, 상세·버전 화면 이동 |
| 상세 편집 | `react-flow/scenario-flow/page.tsx` | React Flow 편집, 탭별 초안, 속성 패널, Orkes 표시, 실행 및 시뮬레이터 |
| 버전 조회 | `react-flow/scenario-view/page.tsx` | 버전 목록, 배포, 복원, 레거시 시뮬레이터 |
| 폼 편집 | `form-builder/page.tsx`, `form-builder/stores/useFormEditorStore.ts` | 요소·옵션·그리드·API 매핑 편집, `/chat/forms` 저장·조회 |
| 편집 상태 | `store/index.ts`, `historyStore.ts`, `groupActionStore.ts`, `edgeControlActionStore.ts` | 그래프·선택·그룹·이력·저장 데이터 정제 |
| 실행 상태 | `builderExecutionStore.ts`, `components/controllers/hooks/useBuilderExecution.ts` | 캔버스 실행, 슬롯, 분기, API/LLM 처리 |
| 저장 서비스 | `services/backendService.ts`, `firebaseApi.ts`, `fastApi.ts` | Firebase/FastAPI 선택과 시나리오·버전·템플릿 작업 |
| 코어 | `core/scenario-core/src`, `dist` | 프레임워크와 분리된 실행 엔진, 그룹 API 분기 |
| 기존 Matrix 인증/상태 | `lib/auth.ts`, `lib/types.ts`, `stores/workspace.ts` | HttpOnly 세션, Matrix 사용자 DTO, 사용자/workspace 상태 |
| 기존 Matrix 화면 기반 | `app/(workspace)/layout.tsx`, `app/(editor)/planning-board/layout.tsx` | 인증·게스트·온보딩 검사, Query 경계, 개인 테마, 셸 구성의 참고 사례 |

표에서 빌더 내부 경로는 `app/(builder)/` 기준이다.

### 2.2 실제 URL과 원본 URL의 차이

`(builder)`는 route group이므로 URL에 포함되지 않는다. 현재 파일 구조와 대응하는 주소는 다음과 같다.

| 현재 Matrix URL | 소스에 남은 원본 이동 주소 |
| --- | --- |
| `/react-flow/scenario-list` | `/admin/builder/react-flow/scenario-list` |
| `/react-flow/scenario-flow` | `/admin/builder/react-flow/scenario-flow` |
| `/react-flow/scenario-view` | `/admin/builder/react-flow/scenario-view` |
| `/form-builder` | 폼 편집의 현재 진입점 |

Matrix에 원본 `/admin/builder/...` 페이지나 이를 연결하는 rewrite는 없다. 루트와 워크스페이스 레이아웃은 빌더 그룹의 부모·형제 관계가 다르므로, `(workspace)` 안의 인증·셸을 자동으로 상속하지 않는다.

### 2.3 원본에서 빌더 밖에 있던 전제

- 원본 `app/layout.tsx`는 `ModalProvider`를 제공하지만 Matrix 루트는 제공하지 않는다.
- 원본 `@/store`는 SSO/Firebase 사용자, 테마, 관리자 사이드바 상태를 포함한다. Matrix는 `stores/workspace.ts`와 개인 설정 저장소를 사용한다.
- 원본 `lib/api/apiClient.ts`는 Axios 기반으로 `/api/v1`에 요청하고, 응답 본문만 반환하며, 브라우저 `localStorage.authToken`을 Bearer 헤더로 사용한다.
- Matrix는 `lib/auth.ts`의 `hams_session` HttpOnly 쿠키와 서버 `currentUser()`를 사용한다. 원본 토큰 방식을 복사하는 것으로 두 인증 체계가 연결되지 않는다.
- 원본 상세 시뮬레이터는 빌더 밖 `app/(content-header)/chatbot/components/emulator`와 챗봇 store·타입·UI·runner에 의존한다.
- 원본 빌더의 backend는 `firebase | fastapi`다. Matrix의 libSQL DB나 원본 포털의 PostgreSQL 선택과 같은 개념이 아니다.
- Matrix의 `lib/db.ts`는 이미 `@libsql/client`로 Turso에 연결하며 `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`을 서버에서 사용한다. 새 DB 연결이나 별도 Firebase 설정을 만들지 않는다.
- 기존 스키마는 `db/migrations/*.sql`, 적용 이력은 `schema_migrations`, 실행기는 `scripts/migrate.mjs`로 관리한다. `workspaces`, `users`, `workspace_members`, `projects`의 범위·관계와 `lib/audit.ts`의 감사 기록 패턴을 재사용한다.

## 3. 확인한 오류와 위험

### 3.1 import 및 모듈 누락: 확정

TypeScript AST로 실제 import/export 구문을 읽고 상대 경로와 `@/*`의 로컬 파일 존재를 조사했다. 주석은 제외했다. 해석되지 않는 로컬 경로는 **21종, 참조 55건**이다. 이는 모듈 경로 조사 결과이며 전체 TypeScript 검사 결과는 아니다.

| 분류 | 누락 경로 | 영향과 수정 방향 |
| --- | --- | --- |
| 공통 상태·사용자 | `@/store`, `@/types/user` | 목록·상세·버전·폼·빌더 store에서 참조. Matrix 사용자 DTO와 빌더 설정 DTO를 분리해 연결 |
| 공통 모달 | `@/providers/ModalProvider` | 14개 파일에서 참조. 빌더 범위의 모달 Provider와 호환 훅 제공 |
| 공통 UI | `@/lib/constants/color`, `@/components/common/Input`, `Select`, `AppLoadingOverlay`, `SectionArea` | 필요한 BAPS 코드를 빌더의 `constants`, `components/common`에 복사하고 테마 대응 |
| API 클라이언트 | `@/lib/api/apiClient` | 7개 파일에서 참조. Matrix 세션과 응답 규약에 맞는 빌더 전송 계층 설계 필요 |
| 이미지 | `@/assets/icon-left-panel-open.svg`, `icon-left-panel-close.svg` | NodesTreeUI·VersionsTreeUI import 실패. 설치된 lucide 아이콘으로 대체 가능 |
| Firebase | `@/lib/firebase`, `@/lib/firebaseScenarioRef` | Turso 서버 쿼리로 대체하고 Firebase import·서비스·백엔드 분기 제거 |
| 코어 | `@/core/scenario-core/src/index`, `@/core/scenario-core/src/engine/groupApiRouting` | 실제 코어는 빌더 아래에 있음. 실행 훅과 레거시 시뮬레이터 경로 수정 필요 |
| Orkes | `../../scenario-orkes/components/FlowCanvas`, `BuildTopDownFlow` | 상세 페이지의 import·모드·UI 제거. 일반 Flow에 필요한 연결선 생성 함수만 빌더 유틸로 분리 |
| 상세 시뮬레이터 | `@/app/(content-header)/chatbot/components/emulator/ScenarioEmulator` | 현재 활성 상세 시뮬레이터 자체가 없음. 전이 의존성까지 이식·분리해야 함 |
| 레거시 잔여 | `../../NodeController.module.css`, `@/lib/hooks/useAlert`, `../context/AlertProvider` | 각각 DefaultNodeController·구형 FormNodeController·구형 useAlert에서 참조. 실제 진입 참조를 확인해 수정 또는 별도 정리 |

마지막 행은 조사 시점에 활성 화면에서 직접 연결된 참조를 찾지 못한 잔여 파일이다. 활성 경로의 오류와 우선순위를 구분하고, 참조 조사 없이 삭제하거나 기능을 다시 연결하지 않는다. `DefaultNodeController.jsx`의 CSS는 현재 위치 기준 `../NodeController.module.css`가 대응 경로다.

`public/images`에는 저장·시뮬레이터·아바타 이미지가 존재한다. 이 경로의 파일을 모두 누락으로 판단해서 다시 복사할 필요는 없다. `public/layout/builder`도 이미 존재한다.

### 3.2 설치 없는 대응이 필요한 패키지 참조

현재 `package.json` 선언과 Node 해석을 함께 확인했다. 사용자 지시대로 설치·재설치는 수행하지 않았다.

| 참조 | 현재 상태 | 설치 없이 제안하는 대응 |
| --- | --- | --- |
| `date-fns` | 미선언, 루트 Node 해석 실패. 목록·ScenarioEditModal에서 현재 시각 표시 | 기존 날짜 유틸 또는 `Intl.DateTimeFormat` 사용. 필요한 표시 형식과 시간대를 명시 |
| `ag-grid-react`, `ag-grid-community` | 미선언, 해석 실패. DeployHistoryModal에서 사용 | 설치된 MUI Table 등으로 이력 목록·선택·페이지 기능 유지 |
| `firebase/firestore` | `firebase` 미선언, 해석 실패 | Turso 단일 저장 계층으로 전환하며 Firebase 정적 의존과 사용 코드를 제거 |
| `@dagrejs/dagre`, `@xyflow/react` | 미선언, 해석 실패. `autoLayout.ts`에서 참조 | 현재 진입 참조가 확인되지 않은 유틸. 사용 여부를 확정하고 `reactflow` 타입 및 기존 정렬 로직으로 정리 |
| `i18next` | 루트 직접 의존성 미선언·해석 실패. `react-i18next`는 해석 가능 | 새 설치를 전제하지 않고 빌더 번역 훅을 로컬 어댑터로 통일하는 방안 검토 |

패키지가 미선언이라는 사실과 설치 전체가 실패했다는 판단은 다르다. Node 루트 해석은 브라우저 번들·peer dependency 전체 검증도 아니다. 위 결과는 현재 참조를 유지할 수 있는지 판단하는 근거로만 사용한다.

### 3.3 라우팅·직접 진입·상태 연결

- `scenario-list/page.tsx:354,361,369`, `scenario-view/page.tsx:912,941`의 이동 주소는 Matrix의 실제 주소와 맞지 않는다.
- 대상 시나리오는 Zustand 메모리로 전달한다. URL만 새로 열거나 새로고침하면 선택 대상을 잃을 수 있다. 주소에 `scenarioId`·필요 시 `versionId`를 넣고 서버 접근 확인 후 복원하는 방향이 필요하다.
- 상세의 `router.back()`은 직접 진입 시 목록으로 돌아간다는 보장이 없다. 목록으로 가는 명시 경로와 미저장 변경 확인을 함께 둔다.
- Matrix 메뉴에는 빌더 연결이 없다. 독립 도구로 열지, 워크스페이스 메뉴에 넣을지 결정해야 한다.
- 원본의 `setAdminSidebarCollapsed`, `theme`, `roles[]`를 Matrix store에 그대로 대입할 수 없다. Matrix는 `accountRole`, `role`, `workspaceId` 등을 사용하며 같은 이름의 상태·액션을 제공하지 않는다.

### 3.4 Provider·레이아웃·표시

- 현재 빌더 layout은 children만 반환한다. 인증·게스트·온보딩 검사가 없고 모달 Provider도 없다. import 파일만 복사해도 `useModal must be used within <ModalProvider/>` 오류가 이어질 수 있다.
- `useTranslation()` 호출이 다수 존재하지만 Matrix에서 해당 번역 초기화·리소스를 찾지 못했다. 경고·원문 key 표시와 Provider 초기화 여부를 확인해야 한다.
- 빌더 CSS의 `height: 100%`, `min-height: 0`은 높이가 정해진 부모 셸을 전제로 한다. Matrix의 현재 빌더 부모에는 전용 높이 셸이 없어 캔버스·내부 스크롤을 브라우저에서 검증해야 한다.
- 현재 `BuilderAppearanceContext`와 CSS는 주로 상세 Flow를 대상으로 한다. 이번 요구에 따라 목록·버전·폼·내부 모달·시뮬레이터까지 라이트·다크 기본 테마를 확장한다. 적용 범위와 portal 대응은 4.7절을 따른다.
- 원본 의존성을 선언한 것만으로 현재 MUI 버전에서 모든 props가 호환된다고 볼 수 없다. 설치 버전 기준 타입·화면 검증이 추가로 필요하며, 이 단계에서 호환 오류 개수를 확정하지 않는다.

### 3.5 백엔드 호출 계약: 소스상 확정된 불일치

| 기능 | 호출/구현의 현재 차이 | 예상 결과와 수정 방향 |
| --- | --- | --- |
| 초기 백엔드 | `store/index.ts:470`은 `firebase`, 서비스의 null 기본값은 `fastapi` | 화면 초기 경로가 미설정 Firebase로 연결. 초기화 지점을 하나로 통일하고 미지원 값을 조기에 거부 |
| 상세 조회 | store는 `{ scenarioId }` 전달, `fastApi.fetchScenarioData`는 문자열 기대 | ID 대신 객체가 URL 문자열로 변환될 수 있음. 공통 입력 DTO와 각 어댑터 변환 통일 |
| 삭제 | 목록·store는 `string[]`, Firebase는 `{ scenarioId }` 기대 | Firebase에서 유효 ID를 받지 못함. 단건/다건 계약 명시 |
| Firebase 복제 | 원본 조회 ID를 새 UUID로 생성하고 새 문서 ID에는 `newName` 사용 | 실제 원본 대신 존재하지 않는 문서를 조회. 원본 ID와 신규 UUID를 분리 |
| FastAPI 검색 | type이 있어도 `category_id` 값은 항상 빈 문자열. URL 전체 공백 제거 사용 | 타입 필터 무효, 이름의 공백 손실·특수문자 query 혼동 가능. `URLSearchParams`와 실제 지원 필터 사용 |
| 서비스 메서드 | wrapper가 노출하는 복원·최근 사용일·템플릿 메서드 중 FastAPI 미구현 존재 | `any`로 인해 컴파일에서 놓치고 실행 중 undefined 함수 호출 가능. 명시적 인터페이스와 지원 기능 목록 도입 |
| 폼 저장 응답 | 원본 apiClient는 본문을 반환하지만 폼 store는 `res.data.form_id` 기대 | 상위 API 본문이 `{ data: ... }`인지 확인 필요. 무조건 오류로 단정하지 않고 모의·실제 계약으로 고정 |
| 저장 범위 | FastAPI 저장에 고정 tenant/stage, Firebase는 전역 `scenarios` 컬렉션 사용 | Matrix 사용자/workspace/프로젝트 범위와의 연결이 없음. 서버에서 확인한 범위로 매핑 필요 |
| 실패 처리 | 조회 실패 catch에서 그래프를 비우거나 오류를 삼키고, 삭제·복제도 성공 여부를 반환하지 않음 | 화면이 빈 목록·성공처럼 동작할 수 있음. 구조화된 오류를 상위로 전달하고 초안 보존 |

Matrix에는 현재 `/api/v1/chat/builder/...`, `/api/v1/chat/forms`를 처리하는 route/rewrite가 없다. 원본 저장 API와의 불일치를 개별 보수하는 대신 Matrix의 `/api/builder/...`와 Turso 쿼리 계약으로 전환한다. 위 표는 전환 대상인 기존 오류를 설명하며 Firebase/FastAPI 호환을 유지하라는 의미가 아니다.

### 3.6 시뮬레이터·외부 실행

- 상세 시뮬레이터는 누락된 `ScenarioEmulator`를 사용한다. 원본 컴포넌트는 챗봇 store, ScenarioNodeControls, graph·form·condition 함수, hooks, API/LLM runner까지 참조한다. 해당 파일 하나만 복사하는 방식으로 해결할 수 없다.
- 버전 조회는 이미 복사된 `ChatbotSimulator.jsx` → `useChatFlow.js`를 사용한다. 코어 import가 잘못되어 있고 상세와 실행 경로도 다르다. 양쪽의 분기·슬롯·폼·초기화 동작을 함께 검증해야 한다.
- `useBuilderExecution.ts`의 LLM 실행은 prompt 생성 구문이 주석 처리되어 있고 모델 경로·인증도 완성되지 않았다. 현재 Matrix AI API를 그대로 호출하면 빌더 노드 실행 계약과 다를 수 있다. 별도의 서버 실행 계약 또는 미지원 처리 방식을 결정한다.
- 상세 페이지, `ChatbotSimulator.jsx`, `CustomElementPropertyEditor.tsx`에 고정 API 인증 헤더·tenant 값이 있다. 값은 이 문서에 전재하지 않는다. 새 기본값은 일반 JSON 헤더로 제한하고 실제 서비스 인증은 서버 설정·허용된 연동 방식으로 처리한다.
- 사용자 URL API 테스트는 실제 외부 쓰기를 일으킬 수 있다. 후속 검증은 모의 서버를 사용하고 CORS·실패 분기·취소를 검사한다. 서버 중계를 선택할 경우 허용 대상과 인증 전달 범위를 명시한다.

## 4. 수정 방향

### 4.1 경로와 인증 셸

1. 최소 변경 기본안은 현재 URL(`/react-flow/...`, `/form-builder`)을 유지하고 공통 경로 상수를 사용한다. `/builder/...`로 옮기는 안은 사용자 결정 후 적용한다.
2. 빌더 layout에 Suspense를 둔 서버 인증 경계를 구성한다. `currentUser()` 및 기존 미인증·게스트·온보딩 처리를 재사용한다.
3. 빌더 접근 정책은 서버와 UI가 동일하게 사용한다. 관리자 전용인지 프로젝트 역할 기반인지 결정 전에는 일반 회원 전체에 권한을 확장하지 않는다.
4. 인증된 최소 사용자 DTO와 개인 설정만 클라이언트로 전달한다. 기존 `WorkspaceQueryBoundary`, `PreferencesRuntime`을 활용하고 전체 WorkspaceShell 사용 여부는 독립 화면 정책에 맞춘다.
5. 고정 높이·내부 스크롤을 소유하는 빌더 루트를 두고 전용 CSS 범위를 제한한다.
6. URL의 ID는 선택 정보다. 서버의 현재 workspace·대상 접근 검사를 거쳐 로드하며, 대상 없음/권한 없음/미선택 상태를 구분한다.

### 4.2 Matrix 연결 어댑터와 빌더 내부 코드 배치

- `@/store`를 흉내 내는 전역 호환 store를 새로 만드는 대신, 빌더 전용 runtime/context에 사용자·테마·허용 동작을 전달한다.
- Matrix 사용자 타입(`lib/types.ts`)과 노드 색상·숨김 목록 같은 빌더 설정 타입을 분리한다. BAPS의 `roles[]`를 캐스팅하여 권한으로 쓰지 않는다.
- 알림·확인 모달은 원본 Promise API를 유지하는 빌더 전용 Provider로 구성한다. 닫기·취소·언마운트 시 대기 Promise와 포커스를 처리한다.
- 필요한 BAPS 색상 상수·입력·로딩·섹션·모달·훅·시뮬레이터는 아래 역할별 폴더에 복사한다. 원본 파일명과 외부 import를 그대로 유지하기 위한 루트 호환 파일은 만들지 않는다.
- 빌더 번역은 한국어 고정 표시를 기본 검토안으로 삼아 `t(key, options)` 호출을 지원하는 로컬 훅으로 통일한다. 보간·복수형 등 실제 호출 옵션을 조사해 누락 없이 변환한다. 다국어가 필요하면 번역 리소스·초기화와 설치 금지 조건을 먼저 조정한다.
- 빌더 전용 복사본의 CSS도 이번 사용자 지정에 맞춰 `app/(builder)/styles` 또는 해당 컴포넌트의 Module CSS로 함께 배치한다. 기존 Matrix 공통 테마·스타일은 현재 위치에서 재사용한다. 이전 설계의 빌더 CSS `styles/pages/` 분산안은 이 배치안으로 대체한다.

| 빌더 내부 경로 | 배치 대상 |
| --- | --- |
| `components/common/` | Input, Select, AppLoadingOverlay, SectionArea 등 복사한 공통 UI |
| `components/modals/`, `providers/` | 빌더 모달 UI, ModalProvider, runtime·MUI 테마 Provider |
| `utils/`, `constants/`, `hooks/`, `types/` | 날짜·연결선·직렬화 유틸, 색상·경로 상수, 로컬 번역 훅, 빌더 DTO |
| `components/emulator/` | 필요한 ScenarioEmulator·하위 hooks/runners/UI 복사본 |
| `services/` | 브라우저용 `/api/builder` 전송과 DTO 변환. SQL·DB 비밀값 포함 금지 |
| `server/` | `server-only` 경계를 둔 Turso repository·서비스·검증·권한 연결 함수 |
| `styles/`, 컴포넌트별 `*.module.css` | 빌더 공통 light/dark 토큰과 복사 컴포넌트 전용 스타일 |

경로는 `app/(builder)/` 기준이다. 필요하면 폴더를 새로 만든다. import는 빌더 내부 상대 경로나 `@/app/(builder)/...`로 바꾸고 재귀적으로 의존성을 점검한다. 기존 Matrix 인증·DB·Query·개인 테마는 복제하지 않고 기존 공개 함수·타입을 참조한다. HTTP route는 Next 라우팅에 따라 `app/api/builder`에, SQL 마이그레이션은 기존 `db/migrations`에 둔다. 이 두 곳은 BAPS 유틸·컴포넌트 복사본이 아니다.

### 4.3 누락된 Flow·실행 모듈

- `scenario-orkes` 디렉터리는 복사하지 않는다. `scenario-flow/page.tsx`의 FlowCanvas import, `viewMode: "flow" | "orkes"`, Orkes 선택 버튼·렌더 분기·모드에 따른 노드 라이브러리 접힘 처리를 제거하고 일반 React Flow 편집만 유지한다.
- `createWorkflowEdge`는 같은 페이지의 일반 Flow 노드 추가·그룹·연결선 처리에서도 반복 사용한다. 호출부를 통째로 삭제하지 않고 필요한 순수 연결선 생성 로직만 `utils/edgeFactory.ts` 등으로 옮긴다. `BuildTopDownFlow`나 Orkes types·상수를 import하지 않도록 의존성을 함께 분리한다.
- Orkes 표현 전용 노드·핸들·레이아웃을 새로 도입하지 않는다. 일반 Flow의 그룹 노드·연결선·캔버스 실행은 계속 지원한다.
- 코어는 현재 존재하는 `app/(builder)/core/scenario-core/src`를 단일 원본으로 사용하도록 참조를 통일한다. `package.json`의 의존성 키는 `@chatbot/scenario-core`, 내부 package name은 `@clt-chatbot/scenario-core`로 다르므로 재설치 없이 사용할 참조 방식을 검증한다.
- 코어 알고리즘 변경은 이식 작업과 분리한다. `dist`만 수정하지 않고 기존 분기 테스트를 보존한다.
- 상세 시뮬레이터는 원본의 활성 emulator와 필요한 UI를 빌더 전용 영역으로 가져오되, 포털 챗봇 저장·사용자 상태는 어댑터로 분리한다. Matrix의 일반 AI 대화방에 빌더 실행 이력을 섞지 않는다.
- `definitionOverride`를 유지해 미저장 그래프도 실행한다. 모달 닫기는 실행 취소·언마운트, 재열기는 새 실행, 크기 변경은 현재 실행 유지로 검증한다.
- 버전 조회의 레거시 시뮬레이터를 즉시 교체하는 것은 기본 범위에서 제외한다. API 성공/실패, 그룹 순서, slot 동기화의 결과가 두 경로에서 일치하도록 보완한다.

### 4.4 저장·API 연결: Turso로 확정

**빌더 저장은 기존 Matrix Turso DB에 새 테이블을 만들고 SQL CRUD로 구현한다.** 기존 FastAPI 중계 권고안과 Firebase 지원 유지안은 폐기한다. 클라이언트는 같은 출처의 Matrix Route Handler를 호출하고, 서버가 기존 `lib/db.ts`를 통해 쿼리를 실행한다.

```text
빌더 화면/상태
  → 빌더 서비스 인터페이스
  → Matrix requestJson + 사용자/workspace별 Query
  → /api/builder/... 개별 Route Handler
  → 서버 세션·권한·Origin·대상 범위 검사
  → app/(builder)/server의 업무 서비스·repository
  → 기존 lib/db.ts → Turso SQL·트랜잭션
```

- DB 연결 정보는 기존 서버 환경변수만 사용하며 새 연결 설정을 추가하지 않는다.
- `firebaseApi.ts`, `fastApi.ts`와 `firebase | fastapi` 선택 타입·초기값을 정리하고 Turso API 서비스로 교체한다. 브라우저에서 Turso에 직접 연결하거나 auth token을 내려주지 않는다.
- 기능별 route에 HTTP 메서드·입력·Origin·응답·오류 처리를 두며 repository에 URL 세그먼트 기반 dispatcher를 만들지 않는다.
- 목록·상세·쓰기 모두 서버 세션의 workspace를 사용한다. payload의 workspace/tenant/작성자 값을 권한 근거로 쓰지 않는다.
- `BuilderService`의 공통 입력은 조회 `{scenarioId}`, 삭제 `{scenarioIds, expectedRevisions}`, 복제 `{sourceScenarioId,newName}` 등으로 통일한다. Turso 조회 결과를 `nodes`, `edges`, `startNodeId`, `revision` 등 명시적 DTO로 변환한다.
- 날짜는 서버 UTC ISO 문자열로 저장하고 UI에서 KST 등 표시 정책에 따라 변환한다. Firestore Timestamp·`toDate()` 의존을 제거한다.
- 폼 저장 응답은 `{form: {id, revision, ...}}`처럼 명시하고 `res.data.form_id` 등 원본 응답 가정을 함께 수정한다. 시나리오도 `{scenario: ...}`, 목록은 `{items, nextCursor}`로 규약을 통일한다.
- 저장 실패·존재하지 않는 ID·revision 충돌을 실제 상태 코드로 반환한다. 상세 계약과 테이블 설계는 4.6절을 따른다.

### 4.5 오류·캐시·초안 보호

- 일반 조회는 기존 Query 정책과 사용자/workspace별 key를 사용한다. `lib/query/keys.ts`에 빌더용 key를 추가한다면 대상 ID·버전도 포함한다.
- 저장·삭제·복원·배포는 자동 재시도하지 않는다. `RequestError`의 status/code/details를 보존하고 401·403·404·409·연결 실패를 구분한다.
- 조회 실패가 현재 편집 초안을 지우지 않도록 store catch 처리를 수정한다. 성공한 작업만 목록·버전·이력 Query를 무효화한다.
- 사용자/workspace 변경, 로그아웃에는 그래프·열린 탭·클립보드·undo 이력·슬롯·실행 상태를 정리한다. 진행 중 이전 범위 응답이 새 상태에 들어오지 않게 취소 또는 generation 검사를 둔다.
- 같은 사용자·같은 범위에서 탭 전환할 때의 미저장 캐시는 원본 동작을 유지한다. 저장 자료 재조회로 초안을 자동 덮어쓰지 않는다.

### 4.6 Turso 테이블·쿼리·트랜잭션 설계

다음은 후속 구현에서 작성할 스키마와 SQL의 설계안이다. 문서 안의 SQL은 실행하지 않았다. 기존 `db/migrations`에 새 마이그레이션을 추가하고 이미 적용한 파일은 수정하지 않는다. 현재 마지막 파일은 `052_ai_conversation_turns.sql`이므로 후보명은 `053_builder_storage.sql`이며 구현 직전에 번호 중복을 다시 확인한다.

#### 4.6.1 신규 테이블

| 테이블 | 주요 컬럼 | 제약·용도 |
| --- | --- | --- |
| `builder_scenarios` | `id`, `workspace_id`, `name`, `description`, `job`, `scenario_type`, `definition_json`, `revision`, `latest_version`, `deployed_version`, `created_by`, `updated_by`, `created_at`, `updated_at`, `last_used_at`, `deleted_at` | 현재 작업본. UUID PK, `(workspace_id,id)` UNIQUE, workspace FK, JSON 유효성 검사, revision 양수. 이름 변경이 ID·이력에 영향 없음 |
| `builder_scenario_versions` | `id`, `workspace_id`, `scenario_id`, `version_number`, `snapshot_json`, `created_by`, `created_at`, `request_id`, `request_hash` | Publish 시 불변 snapshot. `(workspace_id,scenario_id,version_number)` UNIQUE, 시나리오 복합 FK, 동일 시나리오의 request_id UNIQUE |
| `builder_scenario_deployments` | `id`, `workspace_id`, `scenario_id`, `version_number`, `memo`, `created_by`, `created_at`, `request_id`, `request_hash` | 배포 버전 지정 이력. 해당 workspace·시나리오·버전의 복합 FK, 요청 중복 방지, 추가 전용 |
| `builder_forms` | `id`, `workspace_id`, `title`, `elements_json`, `revision`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` | 폼 저장·조회·수정·삭제. 요소 ID·옵션·그리드·기본값·API 매핑 구조를 보존하고 JSON 유효성 검사 |
| `builder_templates` | `id`, `workspace_id`, `kind`, `name`, `content_json`, `revision`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` | API·폼 템플릿. kind는 `api` 또는 `form`, 각각의 payload를 서버에서 검증 |
| `builder_user_settings` | `workspace_id`, `user_id`, `settings_json`, `revision`, `created_at`, `updated_at` | `(workspace_id,user_id)` PK 및 workspace_members 복합 FK. 숨김 노드·요소·노드 색상 등 개인 빌더 설정. 라이트/다크는 기존 user_preferences 사용 |

- `definition_json`에는 정제한 nodes·edges·startNodeId와 기존 저장 대상 속성을 넣는다. 선택·드래그 중 상태·실행 로그·런타임 슬롯·클립보드 같은 임시 상태는 저장하지 않는다. 기존 메모 등 지속 대상은 누락하지 않도록 serializer의 실제 필드를 확정한다.
- `snapshot_json`에는 버전 당시 이름·설명·타입·job·그래프를 함께 저장한다. 작업본 변경이 발행된 snapshot을 바꾸지 않는다.
- 작업본 수정용 `revision`과 Publish의 `version_number`를 구분한다. UI의 기존 `ltst_ver_id`, `depn_ver_id`, `version_yn`은 전환 어댑터에서만 호환하며 DB에는 명확한 정수·nullable 버전 필드를 쓴다.
- 버전·배포 이력의 UPDATE/DELETE는 불변 트리거로 막는 안을 적용한다. 삭제는 작업본의 `deleted_at`을 기록하는 논리 삭제를 기본안으로 두고 이력을 보존한다. 최종 보존 정책은 7절에서 검토한다.
- 기존 user FK와 workspace FK를 사용하며, 생성자·수정자는 서버가 현재 사용자로 지정한다. workspace를 넘는 ID 참조를 복합 FK와 쿼리 조건으로 막는다.
- 기본 저장 범위는 workspace다. 프로젝트 귀속 여부가 확정되면 `project_id`와 `(project_id,workspace_id)` FK·권한 검사를 함께 추가한다. 결정 전 임의 프로젝트를 자동 배정하지 않는다.
- 목록용 `(workspace_id,deleted_at,updated_at DESC,id)`와 최근 사용일 인덱스, 버전용 `(workspace_id,scenario_id,version_number DESC)`, 배포 이력용 `(workspace_id,scenario_id,created_at DESC,id)`를 둔다. 폼·템플릿 목록도 workspace와 삭제 여부를 선두 조건으로 삼는다.

핵심 작업본 테이블 DDL 초안:

```sql
CREATE TABLE builder_scenarios (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '',
  job TEXT NOT NULL DEFAULT 'Process',
  scenario_type TEXT NOT NULL DEFAULT 'sub',
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  latest_version INTEGER NOT NULL DEFAULT 0 CHECK(latest_version >= 0),
  deployed_version INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  deleted_at TEXT,
  UNIQUE(workspace_id, id),
  CHECK(deployed_version IS NULL OR deployed_version > 0)
);
```

이 DDL은 실행 가능한 마이그레이션 전체가 아니다. 후속 SQL 파일에는 나머지 테이블·FK·인덱스·불변 트리거도 포함한다. 기존 `ScenarioType`의 agent/unit 표기 차이는 UI의 실제 정규화 함수와 함께 정리하고, 타입 분류를 새 의미로 변경하지 않는다.

#### 4.6.2 CRUD 쿼리 원칙과 예시

모든 값은 `execute({sql, args})`의 바인딩으로 전달한다. 정렬 컬럼·방향은 서버 허용 목록에서 고르고, 검색 문자열을 SQL에 이어 붙이지 않는다. SQL 실행 전 인증·범위·쓰기 권한을 검사하며, 쓰기는 트랜잭션 안에서도 현재 권한과 revision을 재확인한다.

```sql
-- Create: UUID·현재 사용자·workspace·UTC 시각은 서버에서 결정한다.
INSERT INTO builder_scenarios
  (id,workspace_id,name,description,job,scenario_type,definition_json,
   created_by,updated_by,created_at,updated_at,last_used_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?);

-- Read: JSON 본문은 상세에서 읽고 목록은 필요한 메타데이터만 반환한다.
SELECT id,name,description,job,scenario_type,revision,latest_version,
       deployed_version,updated_at,last_used_at
FROM builder_scenarios
WHERE workspace_id=? AND deleted_at IS NULL
ORDER BY updated_at DESC,id DESC
LIMIT ?;

SELECT * FROM builder_scenarios
WHERE workspace_id=? AND id=? AND deleted_at IS NULL;

-- Update: expectedRevision으로 동시 편집을 감지한다.
UPDATE builder_scenarios
SET name=?,description=?,job=?,scenario_type=?,definition_json=?,
    updated_by=?,updated_at=?,revision=revision+1
WHERE workspace_id=? AND id=? AND deleted_at IS NULL AND revision=?
RETURNING id,revision,latest_version,deployed_version;

-- Delete: 이력을 남기는 논리 삭제. 실물 DELETE는 기본 CRUD에서 사용하지 않는다.
UPDATE builder_scenarios
SET deleted_at=?,updated_at=?,updated_by=?,revision=revision+1
WHERE workspace_id=? AND id=? AND deleted_at IS NULL AND revision=?
RETURNING id,revision;
```

- 위 예시는 최소 조건이다. 실제 목록에는 이름·타입·배포 여부·기간 필터와 안정적인 커서 페이지 처리를 추가한다. 한글·공백·`&`를 보존하고 LIKE 검색을 쓰면 `%`, `_` 등의 와일드카드 처리 정책도 고정한다.
- UPDATE/DELETE 결과가 0행이면 같은 workspace 안의 존재 여부를 검사해 404와 revision 충돌 409를 구분한다. 다른 workspace의 존재 여부는 노출하지 않는다.
- 폼·템플릿도 동일하게 INSERT/SELECT/UPDATE/논리 DELETE와 revision 조건을 적용한다. 설정은 GET에서 행을 생성하지 않고, 명시 저장에서만 INSERT 또는 revision 조건 UPDATE를 수행한다.
- 다건 삭제는 각 대상의 접근·revision을 확인한 뒤 한 트랜잭션으로 처리한다. 일부 대상 실패 시 전체 rollback하여 화면에서 부분 성공으로 오인하지 않게 한다.
- 기존 `lib/audit.ts`의 `auditStatements`를 동일 쓰기 트랜잭션에 포함한다. 변경 대상 ID·revision 등 최소 메타데이터만 기록하고, 그래프의 인증 헤더·개인 입력·키를 감사 로그에 넣지 않는다.

#### 4.6.3 저장·복제·Publish·복원·배포 계약

| 작업 | SQL·트랜잭션 처리 |
| --- | --- |
| 일반 저장 | 권한·expectedRevision 확인 → 작업본 UPDATE → 감사 기록 → commit. `latest_version`은 증가하지 않음 |
| 복제 | 현재 범위의 원본 SELECT → 새 UUID로 작업본 INSERT. nodes·edges 내부 ID 관계는 유지하고 원본 시나리오 ID를 신규 ID로 오인하지 않음. 발행·배포 이력은 복제하지 않고 버전은 0부터 시작 |
| Publish | 권한·expectedRevision 확인 → 작업본 저장 및 `latest_version+1`, `revision+1` → 같은 그래프·메타데이터 snapshot을 새 버전 INSERT → 감사 기록 → commit. 실패하면 작업본/버전 모두 rollback |
| 버전 조회 | workspace·scenarioId·versionNumber로 snapshot SELECT. 현재 그래프나 최근 버전으로 조용히 대체하지 않음 |
| 복원 | 같은 범위의 snapshot 조회 → expectedRevision 조건으로 작업본 복원 → revision 증가·감사 기록. 기존 snapshot·발행 최대 번호·배포 버전은 변경하지 않음 |
| 배포 버전 지정 | 존재하는 불변 버전 확인 → 시나리오의 deployed_version·revision 갱신 → deployments INSERT → 감사 기록 → commit. 실제 외부 런타임 배포는 별도 실행 계약이며 DB 지정만으로 외부 배포 완료라 표시하지 않음 |
| 최근 사용일 | 명시적으로 시나리오를 여는 작업에서 범위를 확인하고 last_used_at 갱신. 일반 목록·상세 GET의 자동 재조회에는 쓰기를 섞지 않음 |

Publish·배포 요청은 request_id UNIQUE와 트랜잭션으로 중복 이력 생성을 막는다. 동일 요청 ID로 다른 payload가 오면 충돌 처리하고, 결과 조회가 필요하면 저장된 요청과 payload hash를 대조한다. 네트워크 실패 후 프런트엔드가 자동으로 쓰기를 재시도하지 않는 원칙도 유지한다.

#### 4.6.4 Matrix API 구성안

| 경로 | 메서드·책임 |
| --- | --- |
| `/api/builder/scenarios` | GET 목록·필터, POST 신규 생성 |
| `/api/builder/scenarios/[scenarioId]` | GET 상세, PATCH 메타데이터·작업본, DELETE 논리 삭제 |
| `/api/builder/scenarios/delete` | POST 다건 논리 삭제 |
| `/api/builder/scenarios/[scenarioId]/clone` | POST 복제 |
| `/api/builder/scenarios/[scenarioId]/versions` | GET 버전 목록, POST Publish |
| `/api/builder/scenarios/[scenarioId]/versions/[versionNumber]` | GET 불변 버전 |
| `/api/builder/scenarios/[scenarioId]/restore` | POST 작업본 복원 |
| `/api/builder/scenarios/[scenarioId]/deployments` | GET 배포 지정 이력, POST 배포 버전 지정 |
| `/api/builder/scenarios/[scenarioId]/last-used` | POST 최근 사용일 갱신 |
| `/api/builder/forms`, `/api/builder/forms/[formId]` | GET/POST 목록·생성, GET/PATCH/DELETE 단건 CRUD |
| `/api/builder/templates`, `/api/builder/templates/[templateId]` | kind별 목록·생성 및 단건 CRUD |
| `/api/builder/settings` | GET 현재 사용자 설정, PUT 명시 저장, DELETE 개인 설정 초기화 |

경로별 `route.ts`를 작성한다. DB 쿼리·업무 함수는 `app/(builder)/server`에 둔다. GET에는 Origin 검사를 강제로 요구하지 않되 인증·범위 검증은 항상 적용하고, 상태 변경 메서드는 기존 `checkOrigin`을 적용한다. 상세 DTO 크기·JSON 구조·그래프 node/edge 참조·폼 요소·템플릿 payload도 서버에서 제한하고 검증한다.

### 4.7 라이트·다크 공통 테마

- 초기 테마는 기존 `user_preferences.default_theme`와 `theme_preset`, `PreferencesRuntime`, `stores/theme.ts`를 사용한다. 저장값이 없으면 현재 Matrix 기본값(light)을 유지한다. 별도 빌더 테마 DB 컬럼·localStorage 키·전역 변경 이벤트를 추가하지 않는다.
- 빌더 layout의 클라이언트 Provider에서 `useTheme`를 구독하고 MUI `ThemeProvider`의 palette.mode를 동기화한다. 빌더 루트의 `data-builder-theme`와 CSS 토큰도 같은 값을 사용한다. ThemeToggle이 필요하면 기존 컴포넌트를 재사용한다.
- 기존 `BuilderAppearance.module.css`의 light/dark 토큰을 빌더 공통 표면 토큰으로 정리한다. 목록, 상세, 버전, 폼, 노드 속성, 툴바, 슬롯, 메모, 로딩, 오류, 읽기 전용 UI에 함께 적용한다.
- `BuilderAppearanceContext`를 상세 화면에만 한정한 원본 정책은 이번 요구에 맞춰 확장한다. 일반 Flow 노드·속성 패널·내부 Flow 모달도 기본 light/dark를 지원하고 Orkes 분기는 제거한다. 노드 타입 구분과 사용자가 설정한 노드 색상은 보존하되 텍스트·경계·선택·오류 표시의 가독성을 검증한다.
- MUI Dialog/Menu/Popover와 `createPortal` 알림은 CSS 조상의 토큰이 자동 전달된다고 가정하지 않는다. paper/portal 루트에 테마 속성·클래스·필요 토큰을 전달하거나 빌더 컨테이너를 지정한다. Provider context와 CSS 상속을 각각 검증한다.
- 흰색·회색 등 고정 표면색을 테마 토큰으로 전환하고 입력·select·코드/JSON·그리드·날짜 팝업·스크롤바까지 확인한다. 전역 CssBaseline 변경으로 다른 Matrix 화면의 외형을 바꾸지 않는다.
- 최초 표시에서 잘못된 테마가 보이는 현상, 새로고침·직접 진입·새 창·다른 사용자 전환·개인 설정 preview와 복원의 일관성을 검증한다. 테마 전환으로 그래프 초안·폼 입력·실행 상태를 초기화하지 않는다.

## 5. 변경 대상 파일과 영향 범위

아래는 **후속 구현 후보 목록**이다. 이번 문서 수정에서는 설계 파일만 변경한다. `HISTORY.md`의 기존 링크는 유지한다. 신규 파일명은 구현 시 저장소 구조와 사용자 결정에 맞춰 확정한다.

| 구분 | 수정·신규 후보 | 변경 내용/영향 |
| --- | --- | --- |
| 빌더 진입 | `app/(builder)/layout.tsx`, 신규 인증 경계·클라이언트 runtime·경로 상수 | 인증·Provider·높이·사용자·테마 초기화 |
| 화면 이동 | `app/(builder)/react-flow/{scenario-list,scenario-flow,scenario-view}/page.tsx` | 실제 URL, 대상 ID 복원, 오류·미선택 안내, 전송 연결 |
| 폼 편집 | `app/(builder)/form-builder/page.tsx`, `stores/useFormEditorStore.ts`, `components/modals/SavedFormContentModal.tsx` | 폼 API, 응답 정규화, 미저장 상태, 사용자 전환 |
| 공통 UI | `app/(builder)/components/common/**`, `providers/**`, `hooks/**`, `constants/**`, `utils/**` | 필요한 BAPS 코드 복사, 빌더 내부 import, 누락 UI·모달·색상·아이콘·번역 연결 |
| 외부 패키지 대체 | `components/modals/DeployHistoryModal.tsx`, `ScenarioEditModal.tsx`, 목록 페이지, `react-flow/scenario-flow/autoLayout.ts` | MUI 이력 표, 날짜 표시, 필요 없는 외부 타입·정렬 의존 정리 |
| 상태 | `store/index.ts`, `types/types.ts`, `builderExecutionStore.ts`, `builderClipboardStore.ts`, `historyStore.ts` | Firebase/FastAPI backend 분기 제거, 사용자 설정 타입, revision·버전 DTO, 실패 전파·범위별 정리 |
| 서비스 | `services/backendService.ts`, `fastApi.ts`, `firebaseApi.ts`, 신규 빌더 Turso API 전송·DTO 모듈 | 기존 저장 어댑터 교체·미사용 파일 정리, CRUD·폼·버전·설정 계약 |
| 실행 훅 | `components/controllers/hooks/useBuilderExecution.ts`, `useChatFlow.js`, `components/ChatbotSimulator.jsx`, `form-builder/components/CustomElementPropertyEditor.tsx` | 코어 경로, API/LLM 실행, 고정 헤더 제거, 취소·분기·슬롯 |
| Orkes 제외 | `react-flow/scenario-flow/page.tsx`, 신규 `app/(builder)/utils/edgeFactory.ts` 등 | Orkes import·모드·UI 제거, 일반 Flow에 필요한 연결선 생성 함수만 분리. scenario-orkes 디렉터리 신설 없음 |
| 상세 시뮬레이터 | `components/modals/ScenarioSimulatorModal.tsx`, 신규 `app/(builder)/components/emulator/**` | 활성 시뮬레이터 이식, 포털 상태 의존 분리, 빌더 내부 전이 코드 복사 |
| 테마·스타일 | `app/(builder)/providers/**`, `styles/**`, `components/BuilderAppearance.tsx`, 관련 Module CSS·MUI sx | 전체 빌더 light/dark·portal 동기화, 캔버스 높이·레이아웃·모달, 기존 공통 테마 연동 |
| 서버·쿼리 | 신규 `app/api/builder/**/route.ts`, `app/(builder)/server/**` | 세션·권한·Origin·workspace 범위, Turso CRUD·트랜잭션·감사 기록 |
| 스키마 | 신규 `db/migrations/053_builder_storage.sql` 후보 | 6개 테이블·FK·인덱스·불변 트리거. 번호는 구현 시 재확인 |
| Query: 연결 시 | `lib/query/keys.ts`, 신규 빌더 Query 훅 | 사용자/workspace/대상 범위 조회와 성공 후 무효화 |
| 메뉴: 결정 후 | 실제 메뉴 정의·`components/workspace-shell.tsx` 관련 부분 | 워크스페이스 진입점 및 권한 노출 정책 |
| 잔여 파일: 참조 확인 후 | `DefaultNodeController.jsx`, `FormNodeController_20260527.jsx`, `hooks/useAlert.js`, store의 미사용 slice 후보 | 잘못된 참조 수정 또는 사용 여부에 따른 정리. 일괄 삭제 제외 |
| 문서 | 이 설계 문서, `HISTORY.md`, 후속 구현 기록 | 결정·검증 결과와 미완료 사항 기록 |

영향 경계:

- 루트 `app/providers.tsx`에 빌더 전용 Provider를 전역 추가하는 것은 기본안에 포함하지 않는다.
- 기존 인증·개인 설정·Query 유틸은 우선 재사용하고 전역 동작 변경을 최소화한다.
- 기존 Matrix 프로젝트/산출물/AI 챗봇의 저장 구조와 권한 정책은 변경하지 않는다.
- `package.json`, `pnpm-lock.yaml`, `.env`는 기본 변경 대상이 아니다. 의존성 설치도 수행하지 않는다.
- **후속 구현에서는 Turso 테이블 생성과 CRUD에 따른 DB 변경이 명시적 범위에 포함된다.** 현재 단계는 문서만 수정하므로 DB 접속·DDL 실행·자료 변경을 하지 않는다.
- Firebase/BAPS의 기존 데이터 자동 이전·공유는 포함하지 않는다. 이전이 필요하면 export 범위·ID 매핑·형식 변환·검증·실행 시점을 별도 설계하며 기존 DB를 변경하지 않는다.

## 6. 구현 순서 제안

1. 사용자가 수정한 최신 설계를 다시 읽고 Turso·Orkes 제외·빌더 내부 복사·양쪽 테마를 구현 기준으로 고정한다. 7절의 남은 접근·소유 정책을 확정한다.
2. 빌더 인증·레이아웃·사용자 어댑터·모달·번역·실제 URL을 연결한다.
3. Orkes 모드·import를 제거하고 공통 연결선 유틸을 분리한다. 필요한 BAPS UI·시뮬레이터를 빌더 내부에 복사하고 코어 경로·외부 패키지 참조를 정리한다.
4. Turso migration·repository·서비스·개별 API route를 구현하고 임시 DB에서 DDL·쿼리·트랜잭션을 검증한다. 승인된 구현 범위와 적용 대상에 맞춰 신규 migration만 선택 적용한다.
5. CRUD·버전/복원/배포 지정·폼·설정·실행을 연결하고 오류·초안·범위 전환 보호를 검증한다.
6. 빌더 전체 light/dark·MUI·portal·시뮬레이터 테마를 연결한다.
7. 타입·정적 검사·빌드·브라우저·관련 Matrix 회귀 및 migration 적용 결과를 구현 기록에 남긴다.

임시 DB의 쿼리 테스트와 실제 Turso 적용 결과를 구분한다. 모의 API만 통과한 상태는 실제 저장 연동 완료로 보고하지 않는다. 현재 문서 수정 단계에는 위 구현·migration 적용을 수행하지 않는다.

## 7. 결정이 필요한 사항

| 항목 | 권고안 | 결정이 필요한 이유/대안 |
| --- | --- | --- |
| 접근 대상 | 원본 관리자 도구 성격을 보수적으로 유지 | Matrix 상품 관리자/슈퍼관리자와 프로젝트 owner/admin은 서로 다름. 허용 역할을 명시해야 함 |
| 자료 소유 범위 | workspace별 저장, 프로젝트 연계 여부 명시 | 프로젝트별 도구로 운영하면 project_id·복합 FK·현재 배정 검사를 함께 추가해야 함 |
| URL·진입점 | 기존 `/react-flow/...`, `/form-builder` 유지 + ID query | `/builder/...` 정규화나 새 창·메뉴 추가를 원하면 경로·셸 설계를 함께 변경 |
| 기존 BAPS 자료 이전 | 기본은 새 Turso 테이블에서 시작 | 기존 Firebase 자료 이전 필요 여부·대상·ID/버전 매핑은 별도 결정 |
| 삭제·이력 보존 | 작업본 논리 삭제, 발행/배포 이력 보존 | 실제 영구 삭제·보존 기한이 필요하면 불변 이력과 충돌하지 않게 별도 정책 필요 |
| 다국어 | 한국어 UI와 로컬 번역 어댑터 | BAPS 다국어 리소스까지 유지하려면 초기화·리소스·의존성 조건 재검토 |
| API/LLM 실행 | 모의 실행 검증 후 허용된 서버 연동으로 연결 | 대상 URL·인증·모델·요금·권한 계약이 미정. 미정 기능을 정상 실행으로 표시할 수 없음 |

저장 백엔드(Turso), Orkes 미사용, BAPS 코드 복사 위치(빌더 내부), 라이트·다크 기본 지원은 사용자 지시로 확정되었으므로 결정 대기 항목이 아니다. 별도 BAPS 토큰·원격 저장 서버 인증은 Turso CRUD의 전제에서 제외한다.

위 항목은 이번 단계에서 질문으로 작업을 중단하기 위한 목록이 아니다. 문서를 사용자가 검토·수정한 뒤 구현 범위를 확정하기 위한 의사결정 목록이다.

## 8. 검증 방법과 이번 단계의 실제 결과

### 8.1 최초 설계 작성 때 수행한 검증

| 검증 | 결과 | 해석 범위 |
| --- | --- | --- |
| 원본/이식 파일 비교 | 대응 파일 141개 동일, layout 1개 상이, 코어 15개 추가 | 이식된 공통 파일 대부분이 Matrix 전용 수정 전 상태임을 확인 |
| AST 구문 분석 | node_modules·dist 제외 TS/TSX/JS/JSX 132개, parse diagnostic 0 | 구문 파싱만 정상. 타입·import·실행 성공을 의미하지 않음 |
| 로컬 import 조사 | 누락 경로 21종·참조 55건 | alias/상대 파일의 실제 존재 검사. 활성·잔여 경로를 별도 구분 |
| 패키지 선언·Node 해석 | 3.2절 결과 | 설치 명령 실행 없음, 설정·lockfile 변경 없음 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | 실패: TS6053, `node_modules/@types/node/index.d.ts`를 찾지 못함 | 현재 환경에서 전체 타입 검사 시작 조건을 충족하지 못함. 빌더 타입 오류 없음으로 해석할 수 없음 |
| `node --test "app/(builder)/core/scenario-core/group-api-routing.test.mjs"` | 7개 통과, 0개 실패 | 기존 dist 엔진의 그룹 API 성공·실패·종료 분기만 확인. src/dist 동기화나 화면 연동까지 증명하지 않음 |
| 운영 데이터·API | 연결·변경하지 않음 | 모의 테스트 외 외부 실행 없음 |

문서 단계에서는 전체 빌드·개발 서버를 실행하지 않았다. 누락 모듈이 확인되었고, 개발 스크립트는 산출물 작업자도 함께 실행하므로 문서 조사 중 불필요한 런타임 부작용을 만들지 않았다. 전체 lint·브라우저·실제 CRUD 검증은 미수행이며 후속 구현 검증 항목이다. 타입 검사 장애는 기록만 하고 의존성 재설치는 하지 않았다.

이번 수정에서는 `lib/db.ts`, `lib/audit.ts`, 기존 DB migration·실행기, `stores/preferences.ts`, `stores/theme.ts`, 빌더 테마 및 Orkes 참조를 읽고 설계의 일관성을 점검했다. 위 타입·코어 테스트 결과는 최초 작성 때의 기록이며 이번 수정에서 재실행한 결과가 아니다. 새로운 테이블·쿼리 예시는 아직 실행·검증하지 않았다.

### 8.2 후속 구현 시 정적·계약 검증

- 설치된 환경의 타입 선언 접근 문제가 해결된 상태에서 위 tsc 명령과 변경 파일 ESLint를 실행한다. 의존성 재설치는 자동으로 수행하지 않는다.
- `pnpm build`로 모든 진입점과 Server/Client 경계·Suspense·정적 import를 확인한다. 필요 시 배포용 환경·테스트 출력 경로를 분리한다.
- 동일 AST 조사로 활성 경로의 누락 import가 0인지 확인하고, 레거시 파일 처리 결과도 별도로 남긴다.
- 임시 SQLite/libSQL DB와 합성 계정으로 migration 적용·중복 적용 방지·FK·JSON 제약·인덱스·불변 트리거를 검증한다. 기존 Matrix 테이블·자료가 보존되는지 확인한다.
- Turso repository와 실제 route export를 함께 검증한다: 시나리오·폼·템플릿·설정 CRUD, 검색의 공백/한글/`&`·특수문자, ID 배열, 사용자/workspace 격리, revision 충돌 409, 잘못된 입력, 미존재 버전, 빈 그래프.
- Publish 중 실패 시 rollback, 동시 발행 버전 유일성, 동일 request_id 재요청과 payload 불일치, 복원 시 이전 snapshot 보존, 다건 삭제 전체 rollback, 감사 기록의 원자성을 검사한다.
- Firebase/FastAPI 저장 호출·SDK import·`scenario-orkes` import·모드 UI가 활성 소스에 남지 않는지 정적으로 검사한다. 일반 Flow의 연결선 생성·그룹 기능은 유지되는지 별도로 검사한다.
- 필요한 BAPS 복사본이 `app/(builder)` 내부에만 배치되고 브라우저 번들에 server/DB 코드·비밀값이 포함되지 않는지 확인한다.
- 쓰기 중복 클릭·timeout·네트워크 단절에 자동 재전송이 발생하지 않고, 실패한 저장·삭제가 성공으로 표시되지 않는지 확인한다.

### 8.3 후속 구현 시 브라우저 검증

| 시나리오 | 확인 사항 |
| --- | --- |
| 접근 | 미인증·게스트·온보딩 미완료·일반 사용자·허용 관리자, 직접 API 접근, 만료 세션 |
| 목록/이동 | 목록 검색·정렬·생성·이름 수정·복제·삭제, 상세/버전/목록 이동, 직접 진입·새로고침 |
| 그래프 편집 | 노드 추가·연결·드래그·그룹·해제·복사/붙여넣기·메모·undo/redo·import/export |
| 탭/초안 | 탭 전환 시 초안 보존, 저장 실패 시 초안 보존, 나가기 확인, 사용자/workspace 변경 시 이전 상태 제거 |
| 버전 | Turso 저장과 Publish 구분, 버전 조회, 복원, 배포 버전 지정·이력, 미존재 버전·충돌·중복 요청 |
| Orkes 제외 | Orkes 버튼·모드·누락 import가 없고, 일반 Flow 노드 추가·연결·그룹·실행이 계속 동작 |
| 시뮬레이터 | 미저장 그래프 실행, message/form/branch/setSlot/delay/scenario/API 성공·실패, 초기화·닫기·재열기·크기 변경 |
| 폼 | 요소·옵션·그리드·날짜·기본값, 저장/불러오기, API 응답 매핑, 불완전 응답·잘못된 JSON |
| 테마 | 목록·상세·버전·폼·시뮬레이터·Dialog/Menu/Popover·노드·입력·JSON·그리드의 라이트/다크, 기존 개인 설정 연동, 전환 중 초안·실행 유지 |
| 표시/접근성 | 좁은 화면, 캔버스 높이·내부 스크롤, 모달 포커스·ESC·취소, 콘솔 오류·누락 이미지·대비 |

서버 관련 회귀는 임시 DB·합성 계정·모의 외부 API를 사용한다. Turso 신규 migration의 실제 적용·테이블/인덱스 확인은 후속 구현 단계의 적용 대상에 맞춰 별도 기록한다. 공통 인증·Query·테마·메뉴를 수정한 경우 관련 Matrix 화면의 회귀를 추가한다. 실사용 DB에 회귀 자료를 넣거나 원본 BAPS 자료로 삭제·배포 시험을 하지 않는다.

## 9. 이번 문서 작업의 산출물

1. `docs/history/2026-11-24/빌더-이식오류-점검과-Matrix-연동-설계.md` — 네 가지 추가 요구에 맞춰 요구사항·수정 방향·Turso 테이블/SQL/API·파일·테마·검증·결정 사항을 수정했다.
2. `HISTORY.md` — 최초 작성 때 추가한 상대 경로 링크와 작성일을 유지한다. 같은 문서 수정으로 목록을 중복 추가하지 않는다.

이 문서는 이식 오류를 수정했다는 완료 보고가 아니다. 소스·DB 수정과 실제 API 연결은 사용자가 검토한 최신 문서를 기준으로 별도 구현 요청 시 진행한다.
