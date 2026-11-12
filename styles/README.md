# 스타일 작업 위치

2026-11-12 미사용 컴포넌트 정리 후 CSS 48개를 공통 17개와 화면 소유 31개로 구분합니다. 공통 기반은 `styles/`, 화면 전용은 `styles/pages/[화면주소]/`, 프로젝트 탭 전용은 `styles/pages/projects/tabs/[탭명]/`에서 관리합니다. 파일 위치를 바꿔도 기존 CSS 선언·import 주체·로딩 순서는 유지합니다. 이전 가입 선택 폼과 WBS 로컬 이미지 출력 UI의 전용 CSS 2개를 제거했습니다. [작업 기록](../docs/work/2026-11-12/미사용-컴포넌트-전수조사-정리.md).

## 공통 CSS

아래 경로는 `styles/` 기준입니다. 여러 화면에서 사용하는 기반 스타일은 이 원본을 함께 참조합니다.

| 파일 | 담당 영역·주요 진입점 |
| --- | --- |
| `globals.css` | 색상·간격 토큰, 기본 요소·버튼. app/layout.tsx에서 로드 |
| `themes.css` | 라이트·다크 테마. 루트와 기획 보드 layout |
| `workspace.css` | workspace 공통 CSS 진입점. workspace layout·guest |
| `workspace-shell.css` | 사이드바·상단 헤더·탐색·본문 배치 |
| `shared-ui.css` | 패널·안내·아이콘 버튼·상태·아바타 |
| `page-heading.css` | 페이지 제목·상단 작업 버튼 |
| `table.css` | 필터·검색·표·페이지 이동 |
| `dialog.css` | 공통 다이얼로그·상세 보기·도움말 |
| `accessibility.css` | 모션 감소 설정 대응 |
| `personal-theme.css` | 개인 테마의 공통 컴포넌트 적용 |
| `auth.css` | login·signup·인증 layout·policies |
| `admin-settings.css` | admin/settings·super-admin/settings의 관리자 공통 배치 |
| `project-tabs.css` | 프로젝트 탭 탐색·팀 권한 모달·독립 DB·기획 보드 |
| `project-workbench.css` | 프로젝트·dashboard·독립 DB의 공통 목록/폼/배치 |
| `database-tools.css` | 독립 ERD·domains 도구의 공통 배치 |
| `ai-chatbot.css` | 챗봇·대화 메뉴·가드레일 첨부 UI |
| `ai-workspace-layout.css` | workspace 본문과 AI 채팅 영역의 배치 |

기존 공통 12개는 위치를 유지했습니다. globals·workbench·DB 도구·챗봇·AI layout 5개를 기존 app·components 위치에서 공통 폴더로 모았습니다. `styles/pages/_shared`는 사용하지 않습니다.

## 화면 주소별 위치

아래 위치는 `styles/pages/` 기준입니다. 동적 projectId·fileId와 route group 이름은 폴더에 넣지 않습니다. 전용 CSS가 없는 화면은 공통 파일을 사용하며 빈 CSS나 폴더 유지용 파일을 만들지 않습니다.

| 화면 분류 | 위치·공유 관계 |
| --- | --- |
| login | 전용 파일 없음. styles/auth.css와 루트 테마 사용 |
| onboarding | 전용 CSS 없음. 완료 처리 후 dashboard로 이동하며 이전 가입 선택 폼은 제거함 |
| signup | 전용 파일 없음. styles/auth.css 사용 |
| projects | 탭 전용은 `projects/tabs/[탭명]/`, 탭 간 공유 입력·이미지 동작은 `projects/` |
| projects/database/erd | `projects/database/erd/database-erd-preview.css`, 공통 DB·project·dialog 참조 |
| projects/database/domains | 전용 파일 없음. styles/database-tools.css와 공통 project·dialog 참조 |
| projects/documents | `projects/documents/onlyoffice-editor.css`: 독립 문서 편집기 |
| planning-board | `planning-board/`의 editor·dark-theme·select-element·preview CSS |
| admin | 관리자 분류의 부모. 전용 파일 없음 |
| admin/ai-guardrails | admin/settings의 guardrails 탭으로 redirect. 해당 컴포넌트 CSS 재사용 |
| admin/plans | super-admin/settings의 plans 탭으로 redirect. 별도 CSS 생성 없음 |
| admin/settings | `admin/settings/guardrail-admin.css`, styles/admin-settings.css 공유 |
| dashboard | `dashboard/`의 create-project-dialog·dashboard-page CSS |
| settings | `settings/`의 settings·AI 토큰 통계·plans-toggle module |
| settings/subscription | `settings/subscription/subscription-plans.module.css`, 부모의 토글 module 공유 |
| super-admin/settings | styles/admin-settings.css와 admin/settings의 가드레일 컴포넌트 CSS 공유 |
| team | `team/`의 team-page·team-membership, 공통 project-tabs 참조 |
| viewer | 실제 MarkdownViewer 화면 URL. 아래 viewer/md의 module 사용 |
| viewer/md | `viewer/md/MarkdownViewer.module.css` 보관 분류. 별도 URL을 만들지 않음 |
| guest | 공통 workspace·요금제 컴포넌트 CSS 재사용 |
| policies | styles/auth.css 안의 기존 policy-page 선택자 사용 |

`projects/date-input.css`와 `projects/ai-image-actions.css`는 여러 프로젝트 탭이 공유합니다. 파일을 각 탭에 복제하지 않습니다.

## 프로젝트 탭별 위치

`lib/project-tabs.ts`의 실제 ProjectTab 식별자를 사용합니다. 예를 들어 `/projects/[projectId]?tab=wbs`의 CSS는 `projects/tabs/wbs/`에 둡니다. 기존 컴포넌트 디렉터리명이 requirements·specifications여도 탭 폴더는 requirement·program입니다.

| 탭 | projects/tabs 아래 위치·파일 |
| --- | --- |
| overview | `overview/project-overview-page.css` |
| rfp | `rfp/rfp-page.css` |
| wbs | `wbs/`의 wbs-page·wbs-date-picker·wbs-schedule-chart CSS |
| architecture | `architecture/architecture-page.css` |
| requirement | `requirement/requirements-page.css` (현재 미import) |
| screen | `screen/screens-page.css` |
| database | 현재 전용 파일 없음. 독립 database/erd·database/domains와 구분 |
| program | `program/specifications-page.css` (현재 주석 전용·미import) |
| test | 현재 독립 CSS 파일 없음 |
| trace | 현재 독립 CSS 파일 없음. 기존 style jsx 유지 |
| acceptance | `acceptance/acceptance-page.css` |
| history | `history/history-page.css` (현재 미import) |
| export | `export/deliverables-page.css` (현재 미import) |
| documents | `documents/documents-page.css`: 프로젝트 문서 탭. 독립 편집기와 구분 |

11개 탭의 전용 파일 13개를 이 구조로 관리합니다. 탭 폴더 배치는 CSS를 탭 선택 시에만 로드한다는 뜻이 아닙니다. 기존 정적 import와 로딩 범위를 유지합니다.

## import와 로딩 순서

TS/TSX/JS/JSX는 절대 별칭을 사용합니다. 일반 CSS는 side-effect import, CSS Modules는 기존 default import를 유지합니다.

```tsx
import "@/styles/dialog.css";
import "@/styles/pages/projects/tabs/wbs/wbs-page.css";
import styles from "@/styles/pages/settings/plans-toggle.module.css";
```

CSS 내부는 해당 파일 기준의 상대 경로를 사용합니다. 예를 들어 styles/project-workbench.css는 `@import "./project-tabs.css";`를 사용합니다.

- 루트 layout: globals → themes.
- workspace.css: workspace-shell → shared-ui → page-heading → table → dialog → accessibility → personal-theme.
- 독립 DB layout: shared-ui → table → project-tabs → dialog → personal-theme → project-workbench → database-tools.
- 기획 보드 layout: themes → shared-ui → project-tabs → dialog → personal-theme → editor → dark-theme → select-element. preview 화면은 기존 위치에서 preview.css를 추가합니다.

자동 import 정렬이나 모든 CSS의 루트 일괄 로딩을 피합니다. `.module.css` 확장자·class key를 유지하고 일반 CSS를 일괄 Modules로 바꾸지 않습니다. 경로가 달라지면 Module의 생성 클래스 해시는 바뀔 수 있습니다. 일반 CSS는 폴더 위치만으로 화면 범위에 격리되지 않으며 화면 전환 후에도 충돌 여부를 확인해야 합니다.

## 변경과 검증

1. 소유 화면·실제 탭 식별자를 정하고 기존 공유 원본의 재사용 여부를 확인합니다.
2. CSS 이동과 함께 소스 import·CSS @import·파일 읽기 경로를 갱신합니다. export 템플릿의 `./style.css`는 다운로드 산출물 경로이므로 바꾸지 않습니다.
3. CSS 선언·반응형·테마·로딩 순서를 보존합니다. 현재 미import인 dashboard-page·requirements-page·specifications-page·history-page·deliverables-page는 이동만으로 활성화하지 않습니다.
4. 기존 CSS 직접 읽기 테스트인 test-wbs-form-browser·test-ai-chat-pagination-browser·test-architecture-mermaid-browser의 경로를 함께 확인합니다.
5. 타입 검사·변경 소스 ESLint·프로덕션 빌드 후, 직접 URL 진입과 화면 전환을 데스크톱/모바일·라이트/다크에서 검증합니다.

DB 변경은 없습니다. 구현 범위와 실제 검증 결과는 [작업 기록](../docs/work/2026-11-12/CSS-화면주소별-스타일경로-정리.md)에 정리합니다.

2026-11-12 대시보드 개편: `dashboard/dashboard-page.css`를 `.matrix-dashboard` 범위의 문서 흐름 화면 스타일로 정리하고 `DashboardPage`에서 명시 import합니다. 기존 미import welcome 스타일을 그대로 활성화하지 않습니다. 그리드는 viewport 대신 본문 container 폭에도 반응하여 AI 패널 열림 상태에 대응합니다. 기존 개인 테마 토큰을 사용하며 공통 panel/table 스타일을 전역 덮어쓰지 않습니다. [작업 기록](../docs/work/2026-11-12/대시보드-퍼플화면-개편.md).
