# Form Builder 목록 화면 및 저장 콘텐츠 모달 테마 개선

작성일 2026-11-26 (Asia/Seoul)

[설계](../../history/2026-11-26/form-builder-목록화면-저장콘텐츠모달-테마개선-설계.md)의 권고안으로 구현했다. 폼 메뉴는 `/form-builder/list`를 열고 기존 편집 URL도 유지한다. 목록은 제목 조회, 수정일/제목 정렬, 10개 단위 페이지, 신규 작성과 편집을 제공한다. 검색과 페이지는 URL에 저장한다.

편집기는 상세 응답의 저장 ID와 내부 ID, revision을 구분해 복원한다. 목록 이동과 다른 폼 불러오기에서 미저장 변경을 확인하며 신규 저장 결과를 편집 URL에 반영한다. 저장 콘텐츠 모달의 검색 영역과 테이블은 빌더 테마 변수를 사용한다. 모달 자체에 테마 범위를 지정해 시나리오 폼 노드의 body portal에서도 적용한다.

| 변경 파일 | 내용 |
| --- | --- |
| `app/(builder)/form-builder/list/` | 목록 route, 조회 폼, 결과 표, 페이지 이동, 스타일 |
| `app/(builder)/services/forms.ts` | 폼 목록·상세 조회와 정의 변환 |
| `app/(builder)/form-builder/FormBuilder.tsx`, `stores/useFormEditorStore.ts` | 편집 대상 로딩, 저장 결과·초안 상태 |
| `app/(builder)/form-builder/components/modals/SavedFormContentModal.*` | 조회와 테마 경계 |
| `app/(builder)/providers/runtime.tsx`, `services/draftGuard.ts` | 폼 메뉴와 미저장·저장 중 이동 확인 |
| `scripts/test-builder-browser.mjs` | 목록에서 상세 진입 및 다크 모드 검색 검증 |
| `README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md` | 사용 방법, 유지보수 기준과 이력 |

DB 변경은 없다. 기존 조회·저장 API와 스키마를 재사용했다.

## 검증 결과

- 임시 DB API·저장소 회귀 29건 통과.
- 폼 전용 Chrome 회귀 2건 통과. 제목 검색과 페이지 보정, 기존 폼 열기, 열린 모달에서 다크 테마 적용을 확인했다.
- 타입 검사 통과. 목록·모달·편집기·조회 및 이동 유틸의 ESLint 통과. 기존 런타임과 폼 store까지 포함하면 기존 effect 및 `any` 규칙 위반이 남는다.
- 프로덕션 번들 컴파일은 통과했다. 전체 빌드는 생성된 `.next/dev/types`·`.next/types`의 라우트 타입 검사에서 실패했다.
- 전체 빌더 브라우저 첫 실행은 시나리오 상세 초기화에서 시간 초과했다. 재실행은 시나리오 상세·검색·테마 검증을 지나 기존 에뮬레이터 표시 대기에서 시간 초과했다.

## 남은 확인

시나리오 폼 노드의 실제 Templates portal과 모든 프리셋 조합은 폼 전용 브라우저 테스트의 범위 밖이다. 브라우저 뒤로·앞으로 이동 취소는 탐색 항목 인덱스를 제공하는 브라우저에서 지원한다. 새로고침·닫기는 기존 beforeunload 확인을 사용한다.
