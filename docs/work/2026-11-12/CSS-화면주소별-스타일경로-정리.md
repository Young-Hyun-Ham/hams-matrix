# CSS 화면 주소별 스타일 경로 정리

- 작성일: 2026-11-12 (한국시간)
- 기준: 최신 [설계 문서](../../history/2026-11-12/CSS-전수조사-화면주소별-스타일경로-정리-설계.md)를 다시 읽고 구현했다.
- 상태: 경로 정리 완료. 아래에 통과 결과와 검증 제한을 구분한다.

## 주요 변경사항

- CSS 50개 중 화면 소유 33개를 `styles/pages/`로, 흩어진 공통 5개를 `styles/`로 이동했다. 기존 공통 12개를 유지하여 최종 공통 17개·화면 소유 33개다. 이동한 이전 경로의 파일과 비게 된 기존 폴더는 제거했다.
- 프로젝트 탭 전용 14개를 `projects/tabs/[ProjectTab 식별자]/`의 실제 탭 11개 폴더로 정리했다. WBS는 `tabs/wbs/`, 프로그램은 `tabs/program/`, 산출물은 `tabs/export/`다. 탭 공용 입력·이미지 CSS는 `projects/`에 둔다.
- 독립 ERD는 `projects/database/erd/`, 별도 문서 편집기는 `projects/documents/`, 프로젝트 문서 탭은 `projects/tabs/documents/`로 구분했다. 전용 CSS가 없는 화면에는 빈 파일을 만들지 않았다.
- 소스 import 35개 파일, workbench CSS 내부 `@import` 1곳, CSS를 직접 읽는 테스트 3개의 경로를 변경했다. 소스는 `@/styles/...`, CSS 내부는 상대 경로를 사용한다.
- CSS 선언·import 주체와 순서·3개 CSS Modules의 형식·대소문자·미import CSS 5개의 미로드 상태를 보존했다. inline style jsx·export 템플릿·업무/API 로직은 이번 작업에서 변경하지 않았다.

## 변경 파일

- CSS: 설계 문서의 전체 배치표 50개 중 이동 38개. 최종 파일별 역할·위치는 [styles/README.md](../../../styles/README.md)에 기록했다.
- import 소스 35개: `app/layout.tsx`, database·planning-board layout/preview, settings·MarkdownViewer, `components/project-workbench.tsx`, plans-toggle·subscription-plans, admin·AI·프로젝트 각 화면·team·registration·shared 컴포넌트.
- 직접 CSS 읽기 테스트: `scripts/test-ai-chat-pagination-browser.mjs`, `scripts/test-wbs-form-browser.mjs`, `scripts/test-architecture-mermaid-browser.mjs`의 경로만 수정했다.
- 안내·이력: `styles/README.md`, `README.md`, `components/pages/README.md`, `components/ai/README.md`, `app/(editor)/planning-board/README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md`, 본 기록. 기존 이력 항목은 보존했다.

## DB 변경 여부

DB 스키마·마이그레이션·운영 DB 변경 없음. 빌드와 브라우저 검증에는 합성 계정·임시 SQLite·별도 Chrome 프로필만 사용했다. 설정 파일·의존성도 변경하지 않았다.

## 검증 결과

- 파일·참조 검증 통과: CSS 50개, 화면 33개/공통 17개, 이동 38개, import 관계 64개, 미로드 5개를 대조했다. CSS는 workbench의 상대 `@import` 경로 외에는 원본 바이트가 같으며, import 주체·순서와 이번 작업 외 소스의 해시도 보존했다.
- 프로덕션 빌드: `node node_modules/next/dist/bin/next build` 통과. `node node_modules/typescript/bin/tsc --noEmit` 통과. 설치된 CLI를 직접 실행했다.
- 변경 소스·fixture ESLint 통과(오류 0, 기존 `project-overview-page.tsx` 미사용 변수 경고 2). 변경 범위 `git diff --check` 통과.
- `test-architecture-mermaid-browser.mjs`: 이동 전·후 통과. `test-planning-board-browser.mjs`, `test-personal-preferences-browser.mjs`, `test-product-administration-browser.mjs --production` 통과. 기획 보드 편집/preview, 개인 설정/테마, 관리자 탭·상세·저장 등 기존 시나리오를 확인했다.
- 이동 전후 프로덕션 스타일 표본 82개를 수집했다. 81개는 URL·계산 스타일이 정확히 같았다. 팀→구독 이동의 다크 표본 1개는 이전 기준값이 로딩 중 상태여서 직접 비교에서 제외하고, 로딩 완료 후 이전 구독 도착 화면과 일치함을 별도 확인했다. 데스크톱·모바일과 라이트·다크를 포함한다. 초기 프로젝트 표본은 멤버 배정 전 오류 화면을 포함하므로 정상 프로젝트 본문 검증으로 계산하지 않는다.
- 정상 프로젝트 멤버를 배정하여 별도 38개 화면 표본을 추가 확인했다. 실제 프로젝트 14개 탭의 라이트/다크 본문(오류 안내가 아님), 독립 ERD·domains 직접 진입, 별도 문서 편집기 오류 안내, WBS 모바일 라이트/다크를 확인했다. WBS 데스크톱·모바일 스크린샷도 확인했다. 이동 전후 비교와 별개의 정상 콘텐츠 렌더링 검증이다.
- 임시 브라우저 증적은 `%TEMP%/matrix-product-browser-1GCwcf`(이동 후 비교), `%TEMP%/matrix-product-browser-o9vvZE`(정상 프로젝트), `%TEMP%/matrix-product-browser-8XJvDp`(관리자), `%TEMP%/matrix-planning-board-browser-74LEmR`, `%TEMP%/matrix-personal-browser-abA2Ru`, `%TEMP%/matrix-mermaid-editor-u41AOM`에 남겼다. 증적 JSON·스크린샷은 저장소에 추가하지 않았다.

검증 제한:

- WBS 폼·채팅 페이지네이션의 독립 fixture는 이동 전부터 bundler의 `@tanstack/query-core` 모듈 해석 실패로 실행되지 않았다. CSS 직접 읽기 경로는 수정했지만 무관한 bundler·의존성은 고치지 않았다.
- `test-database-domains-browser.mjs`는 관리자 도메인/ERD 생성·편집·모달·테마·모바일 단계 이후 `reader domain list`에서 시간 초과로 실패했다. 테스트 소스상 조회자 세션은 `nav-free-ws`, 대상 프로젝트는 `nav-ws`여서 workspace가 다르다. 이 fixture는 이번 변경 대상이 아니며 전체 통과로 기록하지 않는다.
- 외부 OnlyOffice 내부 편집 기능, 운영 계정의 onboarding 상태 변경, WBS 날짜 picker·채팅 페이지네이션 전체 동작까지 통과했다고 보장하지 않는다. OnlyOffice 연결은 외부 서비스 없이 오류 안내 범위만 확인한다.

## 미완료 사항 및 재개 정보

- 구현 미완료 사항은 없다. 검증 제한은 위와 같다.
- 위 독립 fixture·조회자 workspace 조건은 별도 검증 도구 개선 대상으로 남긴다. 재검증 시 WBS/채팅 bundler의 pnpm 모듈 해석과 DB 조회자의 세션 workspace를 먼저 확인한다. 앱의 권한 정책을 변경하여 테스트를 통과시키지 않았다.
- 기존 관리자 API 구현과 PROMPT·설계/작업 기록 등 다른 변경을 보존했다. CSS 이동 검증용 임시 스크립트·드라이버는 workspace에서 제거했다.
