# 아키텍처 구성도·Mermaid 탭 및 등록 모달 개편 구현

- 작업일: 2026-10-30 (한국시간)
- 기준: [최신 설계 문서](../../history/2026-10-30/아키텍처-구성도-Mermaid-탭-개편.md)를 다시 읽고 권장안을 적용했다.

## 주요 변경사항

- 선택기를 공유하는 아키텍처 구성도/Mermaid 탭과 키보드 이동을 추가했다. 구성도는 기존 SVG 렌더러로 구성요소·연결을 표시하며 신규 등록·수정 후 해당 항목 선택을 유지한다.
- 등록·수정 입력을 명칭, 상태, 시스템 구성 개요, 담당자, 비고로 줄였다. 기존 구성요소·연결 편집기는 유지하고 아키텍처 모달에 공통 compact 헤더·본문 스크롤·하단 버튼 UI를 적용했다. 다른 산출물의 폼 DOM 구조는 유지한다.
- 숨겨진 과거 기술·보안·성능 필드는 서버의 허용 목록으로 보존한다. 엑셀의 기존 컬럼과 AI 이미지용 과거 데이터도 보존한다.
- 저장 전 rollback 전용 검증을 수행하고, 쓰기 트랜잭션 밖에서 AI가 배치 순서를 제안하도록 했다. 서버는 원본 노드·연결과 정확히 일치하는 ID 목록을 검증하고 제한된 Mermaid 문법으로 직렬화한다. 노드 이름·모양·영역·연결 방향과 라벨은 AI가 바꿀 수 없다.
- 제목·개요·topology의 정규화 해시로 코드 재사용 여부를 판단한다. 담당자·비고는 생성 입력에서 제외하며 상태 등 표현과 무관한 변경은 재호출하지 않는다. 모델은 기존 aiModels 설정의 첫 사용 가능 모델을 사용한다.
- 생성 실패·시간 초과·출력 검증 실패 시 원본과 코드 모두 저장하지 않는다. 최종 트랜잭션에서 권한·version을 재검사하고 기존 이력·감사 기록에 코드도 포함한다. AI 채팅 저장도 동일 생성 단계를 사용한다.
- 기존 가드레일, 토큰 사용량·한도 및 생성 중 취소 확인을 연결했다. 생성 결과는 서버 내부에서만 전달하며 요청 본문의 임의 Mermaid 메타데이터는 저장하지 않는다.
- Mermaid 탭에 읽기 전용 코드/복사와 지연 로딩 미리보기를 추가했다. 허용 문법 검사, strict 렌더링, SVG 요소·속성 정제 및 늦은 비동기 결과 폐기로 안전성과 선택 일관성을 확보했다.
- 코드가 없는 기존 문서는 조회만으로 생성하지 않는다. 저장 시 기존 기술 정보에서 표시하던 fallback 구성요소를 확정하며 연결은 추정하지 않는다. 빈 구성은 AI 호출 없이 빈 flowchart를 저장하고 안내를 표시한다.

## 변경 파일

- 화면: `components/pages/architecture/architecture-diagram.tsx`, `architecture-mermaid.tsx`(신규), `architecture-page.css`.
- 공통 폼·선택 상태: `components/shared/artifact-dialogs.tsx`, `artifact-field-inputs.tsx`, `project-page-context.tsx`, `use-artifact-actions.ts`, `components/project-workbench.tsx`.
- 데이터·저장: `lib/artifact-types.ts`, `lib/artifact-validation.ts`, `lib/artifacts.ts`, `lib/architecture-mermaid.ts`(신규), `lib/workbook.ts`.
- AI: `lib/ai/architecture-mermaid.ts`(신규), `architecture-image-prompt.ts`, `page-prompts.ts`, `page-tools.ts`.
- 검증: `scripts/test-architecture-mermaid.mjs`(신규), `package.json`의 `test:architecture-mermaid` 명령.
- 기록: 이 문서 및 `WORK_HISTORY.md`.

기존 RFP·WBS·설정 등 다른 작업의 변경사항은 보존했다. 기존 API는 중앙 저장 함수를 사용하므로 라우트 파일 자체를 변경할 필요가 없었다.

## DB 변경 여부

- 스키마 변경 및 신규 마이그레이션 없음. 운영 DB 마이그레이션·일괄 데이터 갱신을 실행하지 않았다.
- 실제 저장 요청부터 기존 `project_artifacts.structure_json`에 `mermaid.code/sourceHash/generatedAt/generatorVersion`을 저장한다. 기존 이력 스냅샷에도 같은 버전으로 포함한다.
- 자동 검증은 임시 로컬 SQLite DB 및 mock AI 제공자로 수행했다.

## 검증 결과

| 검증 | 결과 |
| --- | --- |
| `pnpm typecheck` | 통과. 초기 기존 .next 라우트 타입 오류는 `next typegen` 재생성 후 해소 |
| 변경한 TS/TSX 및 신규 테스트 대상 ESLint | 통과, 오류·경고 없음 |
| `pnpm build` | 통과. sandbox의 worker spawn EPERM 발생 후 허용된 실행으로 재검증 |
| `pnpm test:architecture` | 통과: topology 검증, fallback, 긴 라벨 배치, SVG/PNG. Fontconfig 캐시 경고는 있었으나 출력 성공 |
| `pnpm test:architecture-mermaid` | 통과: 축소 입력 저장, 과거 필드·엑셀 보존, 코드 저장/재조회/이력, 토큰 기록, 재사용, AI 실패/시간 초과/잘못된 JSON·ID 목록, 권한·버전 충돌, 빈 구성, 안전 문법, AI 채팅 저장 |
| `pnpm test:architecture-images` | 통과: 아키텍처 이미지 및 WBS 이미지 회귀. 오류 응답 시나리오에서 서버 오류 로그 출력 |
| `pnpm test:ai` | 통과: 실제 HTTP 기반 AI CRUD, 대화·사용량·취소·가드레일·권한·원자적 저장 회귀. 임시 DB와 mock 제공자 사용 |
| `git diff --check` | 통과 |
| 전체 `pnpm lint` | 기존 `components/pages/wbs/wbs-schedule-chart.jsx:239`의 `react-hooks/set-state-in-effect` 오류 1개와 개요/WBS 파일의 기존 미사용 변수 경고 6개로 실패. 해당 기존 작업은 변경하지 않음 |

## 미완료 및 확인 제한

- 구현상 남겨 둔 필수 기능은 없다. 실제 유료 AI 호출은 실행하지 않았으며 배포 환경의 모델 접근·사용 한도는 실제 저장 시 확인이 필요하다.
- 로그인된 실제 화면의 모바일/다크 테마·포커스·탭 전환을 직접 조작하는 브라우저 검증은 수행하지 못했다. 임시 로컬 HTML로 headless Edge 렌더링도 시도했으나 DOM 결과를 얻지 못했으므로 통과로 판단하지 않았다. 이 항목은 UI 수동 확인 대상으로 남긴다.
- 코드 직접 편집과 부분 성공/백그라운드 저장은 설계의 권장 범위에 따라 제공하지 않는다. 사용자는 저장된 코드 복사를 사용할 수 있다.

## 후속 수정 — 두 구성도 미리보기의 현재 테마 적용

- 작업일: 2026-10-30 (한국시간).
- 구성도 SVG의 배경·본문·부가 글자·노드·영역·연결선·화살표에 현재 라이트/다크 테마 팔레트를 적용했다. SVG에 실제 색상을 기록하므로 SVG/PNG 출력에서도 색상이 유지된다.
- Mermaid의 고정 neutral 테마를 base 및 현재 테마 팔레트로 변경했다. 테마 상태를 구독하여 전환 시 다시 렌더링하고, 렌더 ID를 매번 구분하여 이전 결과와 충돌하지 않도록 했다.
- 미리보기 컨테이너의 고정 밝은 배경을 공통 surface/ink 테마 변수로 변경했다.
- 변경 파일: `components/pages/architecture/architecture-theme.ts`(신규), `architecture-diagram-svg.tsx`, `architecture-mermaid.tsx`, `architecture-page.css`.
- DB 변경 없음. 기존 코드 스니펫 재생성 및 AI 재호출 없이 화면 렌더링에만 적용한다.
- 검증: `pnpm typecheck`, 변경한 TS/TSX 파일 ESLint, `pnpm test:architecture`, `pnpm test:architecture-mermaid` 통과. SVG/PNG 테스트의 Fontconfig 캐시 경고는 기존과 동일하며 출력은 성공했다.
- 기능상 미완료 없음. 실제 브라우저에서 테마 전환·화면 표시를 직접 확인하는 수동 검증은 미실시.
