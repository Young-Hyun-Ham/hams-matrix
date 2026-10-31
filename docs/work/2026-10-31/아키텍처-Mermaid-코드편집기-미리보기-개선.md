# 아키텍처 Mermaid 코드 편집기 및 미리보기 개선

- 작업일: 2026-10-31 (한국시간)
- 기준: 사용자가 첨부한 코드 편집기/구성도 이미지와 직접 편집·정상 미리보기 요청.

## 주요 변경사항

- 좌측 읽기 전용 pre를 줄 번호가 있는 코드 편집기로 교체했다. 직접 입력·붙여넣기·Tab 들여쓰기·복사·되돌리기·코드 저장 및 Ctrl/Cmd+S를 지원한다. Esc로 편집기에서 미리보기로 포커스를 이동할 수 있다.
- 우측에는 입력 후 300ms 대기하여 렌더링하는 실시간 미리보기를 제공한다. 문법 오류를 같은 영역에 표시하며 잘못된 현재 코드를 이전 성공 그림처럼 표시하지 않는다.
- 이미지와 같은 `graph TD`, 사용자 노드 ID, 주석, subgraph, classDef/style 사용을 허용했다. 렌더링 설정 지시문·HTML·외부 리소스/클릭 실행 형태는 제한하고 Mermaid strict 모드 및 SVG 정제를 유지한다.
- SVG를 실제 크기로 렌더링해 작은 패널에 강제로 축소하지 않게 했다. 확대·축소, 화면에 맞추기, 1:1, 전체 화면, 스크롤·드래그 이동을 제공한다. 작은 화면에서는 두 패널을 위아래로 배치한다.
- 점무늬 배경과 공통 테마를 적용했다. root/flowchart 모두 HTML 라벨을 끄고 native SVG text를 사용한다. 밝은 사용자 지정 노드 배경에는 어두운 글자, 어두운 배경에는 밝은 글자를 적용하여 이미지의 흐린 글자 문제를 해결했다.
- 내부 구성도/Mermaid 탭 전환 중 초안을 유지한다. 다른 아키텍처 선택·프로젝트/프로젝트 내부 탭 이동·새로고침 시 미저장 변경을 확인하며, 외부 버전 변경 시 편집 초안을 유지하고 충돌을 안내한다.

## 저장 동작

- PATCH `/api/projects/[projectId]/artifacts/[artifactId]/mermaid`를 추가했다. 쓰기 권한과 최신 version을 검사하고 기존 산출물 mutation/이력/감사 기록을 사용해 저장한다. 오류·409 시 편집 입력은 유지한다.
- 수동 코드는 `structure.mermaid.generatorVersion=manual-flowchart-v1`로 구분한다. 같은 코드를 저장하면 버전을 불필요하게 증가시키지 않는다. 코드 저장에 AI를 호출하지 않는다.
- 코드 편집은 Mermaid 표현에만 적용하고 기존 topology 구성요소·연결은 역변환하지 않는다. 일반 상태/담당자 등 수정 시 수동 코드를 보존한다. 제목·개요·topology 등 생성 원본 변경 시 기존 규칙대로 AI가 코드를 재생성하며 화면에도 이를 안내한다.
- 클라이언트에서 실제 Mermaid parse/render 성공 후 저장할 수 있다. 서버에서도 길이·허용 흐름도 종류·제한된 구문을 검증하지만 서버에서 브라우저 Mermaid 파서를 실행하지는 않는다.

## 변경 파일

- `components/pages/architecture/architecture-mermaid.tsx`
- `components/pages/architecture/architecture-diagram.tsx`
- `components/pages/architecture/architecture-page.css`
- `components/pages/architecture/mermaid-preview.ts` (신규)
- `components/project-workbench.tsx` (미저장 안내 문구 공통화)
- `lib/architecture-mermaid.ts`, `lib/ai/architecture-mermaid.ts`, `lib/artifacts.ts`
- `app/api/projects/[projectId]/artifacts/[artifactId]/mermaid/route.ts` (신규)
- `scripts/test-architecture-mermaid.mjs`, `scripts/test-architecture-mermaid-browser.mjs` (신규), `package.json`
- 이 문서 및 `WORK_HISTORY.md`

## DB 변경 여부

- 스키마·마이그레이션 변경 없음. 기존 structure_json 및 변경 이력에 수동 편집 코드를 저장한다. 운영 데이터의 일괄 수정이나 실제 AI 호출은 실행하지 않았다.

## 검증 결과

- `pnpm typecheck`, 변경 파일 ESLint, `pnpm build`, `git diff --check`: 통과.
- `pnpm test:architecture-mermaid`: 기존 생성·권한·일관성 테스트와 수동 graph/classDef/subgraph 저장·재조회, topology 불변, AI 미호출, 동일 코드 저장, 충돌·권한·프로젝트 격리, 제한 구문 거부, 수동 코드 유지·원본 변경 재생성 테스트 통과.
- `pnpm test:architecture-images`: 기존 아키텍처/WBS 이미지 회귀 통과.
- `pnpm test:architecture-mermaid-browser`: 별도 임시 프로필의 실제 headless Chrome에서 이미지와 비슷한 스타일/영역/DB 노드 예제를 렌더링했다. native SVG 라벨, 밝은 노드 글자 대비, 정상 좌표·크기 및 HTML 라벨 부재를 검증하고 생성한 스크린샷을 직접 확인했다. 실제 계정·DB·유료 AI는 사용하지 않는다.
- 브라우저 테스트는 Chrome 설치 경로를 기본 사용하며 `MERMAID_TEST_BROWSER` 환경 변수로 브라우저 경로를 지정할 수 있다.

## 미완료·검증 제한

- 요청한 기능 구현의 미완료 사항 없음. 실제 로그인된 전체 앱에서 저장 버튼·선택 전환·전체 화면을 직접 조작하는 E2E 검증은 미실시이며, 브라우저 검증은 실제 렌더러와 SVG 처리 함수의 독립 화면 기준이다.
- 코드→topology 역변환 및 이미지의 별도 Config/Docs/AI 편집 버튼은 요청 범위에 포함하지 않았다. 기존 다른 변경사항은 보존했다.
