# 페이지별 소스 구조

각 탭은 이 디렉터리의 해당 폴더에서 화면을 구성합니다. 페이지 컴포넌트는 `ProjectWorkbench`를 다시 호출하지 않습니다.

| 폴더 | 화면과 전용 컴포넌트 |
| --- | --- |
| dashboard | 프로젝트 목록, 통계, 최근 활동, 프로젝트 생성 |
| project-overview | 프로젝트 개요, 통합 흐름, 개요 전용 스타일 |
| wbs | WBS 목록·간트, 부모/선행 작업 편집, 마일스톤 날짜 동기화, AI 로드맵 이미지 생성·암호화 저장·미리보기·다운로드·재생성 |
| architecture | 아키텍처 목록·구성 요약 카드, AI 이미지 모델/프롬프트 선택·암호화 저장·미리보기·PNG 다운로드·재생성, 구성요소/연결 편집 |
| requirements | 요구사항 목록 |
| screens | 화면 설계 목록 |
| database | DB 설계 목록·ERD, 테이블 컬럼·PK/FK 편집 |
| specifications | 프로그램 목록, 개발 WBS 등록, 테이블 CRUD·기술 검토 편집 |
| verification | 검증 결과 목록, 검증 버전 확인 편집 |
| traceability | 요구사항 추적표 |
| acceptance | 통합 검수 점검, 검수 전용 스타일 |
| history | 프로젝트 버전/변경 이력 |
| deliverables | Excel 산출물 다운로드 |
| team | 팀 공유 및 가입 승인 |

`components/project-workbench.tsx`는 프로젝트 선택·탭 전환·페이지 연결만 담당합니다.
`app/(workspace)/.../page.tsx`는 인증용 `WorkspaceSection`과 워크스페이스를 조합하는 진입점입니다.
실제 화면은 이 디렉터리의 페이지 컴포넌트에서 수정하세요.

## 공통 처리

- `shared/project-page-context.tsx`: 현재 프로젝트 데이터와 등록/수정/삭제 동작을 페이지에 전달합니다.
- `shared/use-project-data.ts`: 프로젝트 및 문서 조회, 로딩·오류·새로고침과 선택 프로젝트의 sessionStorage 저장.
- `shared/use-artifact-actions.ts`: 공통 저장/삭제 API와 편집 상태.
- `shared/artifact-list.tsx`: 반복되는 검색·상태 필터·목록·기본 버튼. 프로그램 전용 버튼은 specifications 페이지에서 전달합니다.
- `shared/artifact-dialogs.tsx`: 공통 편집/삭제 다이얼로그와 문서 연결 UI.
- `shared/artifact-field-inputs.tsx`: 공통 필드 렌더링. WBS의 날짜 동기화 규칙은 `wbs/wbs-fields.tsx`에 있습니다.
- `shared/artifact-structure-editor.tsx`: 문서 종류에 맞는 페이지 전용 구조 편집기를 선택합니다.
- `shared/date-input.tsx`: 공통 연·월·일 입력, 자동 포커스 및 달력 선택.

공통 목록/폼/레이아웃 스타일은 `components/project-workbench.css`, 전역 테마는 `styles/themes.css`입니다.
간트·프로젝트 흐름·검수 전용 스타일은 각 페이지 폴더에서 관리합니다.

필드 정의는 `lib/artifact-types.ts`, 관계 검증은 `lib/artifact-validation.ts`,
공수·버전·검수 집계는 `lib/integration.ts`, 추적 경로는 `lib/traceability.ts`,
서버 CRUD는 `lib/artifacts.ts`, Excel 출력은 `lib/workbook.ts`에서 관리합니다.
전체 규칙은 [통합 산출물 체계](../../docs/INTEGRATED_DELIVERABLES.md)를 참조하세요.
