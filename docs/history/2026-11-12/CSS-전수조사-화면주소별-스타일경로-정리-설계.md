# CSS 전수 조사와 화면 주소별 스타일 경로 정리 설계

- 작성일: 2026-11-12 (한국시간, Asia/Seoul)
- 상태: 검토용 설계 문서. 사용자 검토·수정 후 별도 구현 요청에 따라 적용한다.
- 이번 단계의 변경: 본 문서 신규 작성, `HISTORY.md` 링크 추가만 수행한다.
- 이번 단계에서 하지 않는 작업: CSS 이동·수정, import 변경, `styles/README.md` 개정 적용, 소스·DB 변경, 빌드·브라우저 테스트 실행.

## 1. 요구사항

1. 현재 프로젝트의 CSS 파일을 전수 조사하고 화면 소유 CSS를 `styles/pages/[해당화면주소]/` 아래로 이동한다. 공통 CSS는 사용자의 후속 결정에 따라 `styles/`에서 관리한다.
2. 화면 주소 분류에는 login, onboarding, signup, projects, projects/database/erd, projects/database/domains, projects/documents, planning-board, admin, admin/ai-guardrails, admin/plans, admin/settings, dashboard, settings, settings/subscription, super-admin/settings, team, viewer, viewer/md, guest, policies를 사용한다.
3. WBS처럼 쿼리 탭으로 구분되는 프로젝트 컴포넌트의 전용 CSS는 `styles/pages/projects/tabs/[탭명]/`에서 관리한다. 예를 들어 WBS는 `styles/pages/projects/tabs/wbs/`에 둔다. 탭명은 현재 `ProjectTab`의 식별자를 기준으로 하며, 기존 컴포넌트 폴더명과 다르면 실제 탭 식별자를 우선한다.
4. 사용하는 page·layout·컴포넌트의 CSS import를 함께 변경한다. CSS 내부 `@import`와 테스트의 파일 읽기 경로도 포함한다.
5. `styles/README.md`를 새 구조와 관리 규칙에 맞게 개정한다.
6. 이번 변경은 배치와 참조 정리다. 화면 디자인·선택자·선언값·반응형 규칙·테마·권한·API·DB 정책을 함께 개편하지 않는다.

**공통 CSS는 기존 `styles/` 경로를 유지한다.** 2026-11-12 사용자 답변을 반영한 확정 기준이다. 기존 `styles/`의 공통 파일 12개는 이동하지 않고, app·components에 흩어진 공통 기반 CSS 5개는 `styles/`로 모은다. 나머지 화면 소유 CSS 33개는 `styles/pages/` 아래로 이동한다. `styles/pages/_shared/`는 생성하지 않는다. 공통 기반 CSS와 대표 화면을 가진 재사용 컴포넌트 CSS의 구분은 3.3절과 이동표에 명시한다.

## 2. 조사 범위와 결과

### 2.1 조사 기준

- `rg --files`와 Git 추적 목록의 `.css` 파일을 대조하고 app·components·styles 전체를 확인했다.
- 애플리케이션의 정적 CSS import, CSS 내부 `@import`, 테스트의 `readFileSync` 경로, 관련 README를 검색했다.
- `node_modules`, `.next`, `.auth-tests` 등 의존성·빌드·테스트 복사본은 소스 CSS 목록에서 제외한다. 외부 라이브러리의 CSS를 복사하거나 이동하지 않는다.
- route 파일뿐 아니라 실제 사용 컴포넌트와 layout까지 확인했다. 직접 import가 없는 것과 렌더링되지 않는 컴포넌트의 CSS도 구분했다.
- 프로젝트 `AGENTS.md` 및 설치된 Next.js 가이드 `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`를 확인했다. 분석을 위해 서버·테스트·마이그레이션을 실행하지 않았다.

### 2.2 수량

| 항목 | 조사 결과 |
| --- | --- |
| 소스 CSS 전체 | **50개** |
| 현재 위치 | app 6개, components 31개, styles 13개 |
| CSS Modules | **3개**: plans-toggle, subscription-plans, MarkdownViewer |
| 일반 CSS | 47개 |
| 애플리케이션 정적 CSS import | TS/TSX/JS/JSX 56문장 + CSS `@import` 8문장 = **64문장** |
| 정적 import가 있는 파일 | **44개**: 소스 42개 + CSS 진입점 2개 |
| 정적 import가 없는 CSS | **5개**: dashboard-page, deliverables-page, history-page, requirements-page, specifications-page |
| 주석만 있는 CSS | specifications-page.css 1개 |
| 테스트의 CSS 직접 파일 읽기 | 3개 스크립트에서 확인 |
| 후속 결정 반영 후 목표 배치 | 화면 소유 33개는 styles/pages, 공통 17개는 styles |
| 실제 이동·유지 수량 | 38개 이동, 기존 공통 12개는 현 위치 유지 |

이 수량은 현재 소스 기준이다. 실제 구현 직전에는 사용자 후속 변경을 고려해 재조사하고 이동표를 보정한다.

## 3. 현재 구조와 영향

### 3.1 로딩 구조

```text
app/layout.tsx
  ├─ app/globals.css
  └─ styles/themes.css

app/(auth)/layout.tsx
  └─ styles/auth.css
app/policies/page.tsx
  └─ 같은 auth.css

app/(workspace)/layout.tsx, app/guest/[...path]/page.tsx
  └─ styles/workspace.css
      └─ shell → shared-ui → page-heading → table → dialog
         → accessibility → personal-theme 순서의 @import

app/(database)/layout.tsx
  └─ 공통 UI·table·project-tabs·dialog·personal-theme
     + project-workbench.css + database-tools.css

app/(editor)/planning-board/layout.tsx
  └─ 공통 테마·UI·tabs·dialog·personal-theme
     + editor.css → dark-theme.css → select-element.css
planning-board/preview/page.tsx
  └─ preview.css

각 화면 컴포넌트
  └─ components 하위의 일반 CSS 또는 CSS Module
```

이동 후에도 **기존 import 주체와 실행 순서를 유지**한다. 저장 위치가 pages 아래가 되었다고 해서 컴포넌트 import를 모두 page나 root layout으로 끌어올리지 않는다.

### 3.2 화면 경로와 파일 경로의 차이

- 실제 프로젝트 화면은 `/projects/[projectId]?tab=wbs` 등의 형태다. projectId와 route group은 폴더명에 포함하지 않고, 탭 전용 CSS는 `styles/pages/projects/tabs/wbs/`처럼 정규화한 탭 식별자 아래에 둔다. 다른 쿼리 값으로 폴더를 추가하지 않는다.
- 프로젝트 내부 문서 탭의 `documents-page.css`는 `projects/tabs/documents/`에 둔다. 별도 `/projects/[projectId]/documents/[fileId]` 편집기의 `onlyoffice-editor.css`는 `projects/documents/`에 두어 탭과 독립 편집기를 구분한다.
- `/projects/[projectId]/database/erd`와 `/projects/[projectId]/database/domains`는 별도 화면이다. 공통 `database-tools.css`는 두 화면의 layout에서 로드한다.
- `/admin/ai-guardrails`는 현재 `/admin/settings?tab=guardrails`로 이동한다. `/admin/plans`도 `/super-admin/settings?tab=plans`로 이동한다. 이 리다이렉트 페이지에 CSS import를 새로 만들지 않는다.
- `app/(workspace)/viewer/md/MarkdownViewer.tsx`는 `/viewer`에서 사용하는 컴포넌트다. 현재 `viewer/md/page.tsx`는 없으며 `/viewer/md`를 새 URL로 만들지 않는다. 사용자 지정 분류를 따라 module의 보관 위치는 `viewer/md/`로 정한다.
- `/planning-board/preview`의 CSS는 요청한 상위 화면 분류 `planning-board/`에 함께 둔다.
- `/guest`는 `/guest/dashboard`로 이동한다. guest 하위 체험 페이지는 공통 workspace 및 요금제 컴포넌트를 재사용한다.

### 3.3 공유와 미사용 상태

- `auth.css`에는 인증 화면뿐 아니라 `.policy-page`와 관련 반응형 선택자가 함께 있다. 이번에 정책 화면용 CSS를 분리하는 것은 파일 이동 이상의 내용 변경이므로 기본안에서는 그대로 보존한다.
- `admin-settings.css`는 관리자설정과 슈퍼관리자설정에서 공유하므로 기존 `styles/admin-settings.css`를 유지한다. 가드레일 기능 컴포넌트의 `guardrail-admin.css`는 대표 화면인 admin/settings에 둔다.
- `project-workbench.css`는 프로젝트·대시보드·독립 DB layout에서 사용하는 공통 기반이므로 `styles/project-workbench.css`로 이동한다. DB·프로젝트·팀 권한 모달·기획 보드가 공유하는 `styles/project-tabs.css`는 기존 위치를 유지한다.
- `plans-toggle.module.css`는 요청 예시대로 `settings/`에 두고, 요금제 카드 module은 `settings/subscription/`에 둔다. guest 요금제도 같은 컴포넌트를 사용하며 CSS를 복제하지 않는다.
- AI 챗봇과 AI workspace layout은 여러 workspace 화면에서 사용하고 가드레일 첨부 영역도 챗봇 CSS를 참조한다. 이 두 공통 CSS와 DB 도구 공통 CSS, globals는 `styles/`로 모은다. 사용량 통계 CSS는 settings 화면 전용이다.
- 전역·layout·여러 화면의 기반을 구성하는 CSS는 공통으로 분류한다. 요금제·가드레일처럼 대표 화면을 가진 기능 컴포넌트 CSS는 그 화면 폴더에서 공유하며, WBS·프로젝트 입력/이미지 동작도 projects 계열에 둔다. 컴포넌트를 다른 화면에서 재사용한다고 CSS를 복제하지 않는다.
- 프로젝트 탭 하나에서 사용하는 전용 CSS는 `projects/tabs/[탭명]/`에 둔다. 여러 프로젝트 탭에서 재사용하는 `date-input.css`, `ai-image-actions.css`는 기존 설계대로 `styles/pages/projects/`에 한 번만 두고, 전역·layout 공통 기반 CSS는 `styles/`에 둔다.
- 정적 import가 없는 5개 CSS에도 기존 스타일이 들어 있으며, specifications는 주석만 있다. **이동과 사용 재개는 별개다.** 전수 이동 대상에는 포함하되, 이번 기회에 import를 추가해 기존 화면에 적용하거나 자동 삭제하지 않는다.
- `registration.css`는 `RegistrationChoiceDialog`에서 import하며 이전 `OnboardingForm` 계열에 연결된다. 현재 onboarding page는 가입 완료 상태를 처리하고 dashboard로 이동한다. CSS 이동을 이유로 기존 가입 선택 폼을 다시 노출하지 않는다.

## 4. 폴더·import 관리 원칙

1. TS/TSX/JS/JSX에서 화면 CSS는 `@/styles/pages/...`, 공통 CSS는 `@/styles/파일명.css` 절대 별칭으로 참조한다. 이미 올바른 공통 import는 유지한다.
2. 일반 CSS는 기존처럼 side-effect import를 유지한다. CSS Modules는 `.module.css` 확장자와 `import styles from ...` 형식을 유지한다. 47개 일반 CSS를 Modules로 일괄 전환하지 않는다.
3. CSS 내부 `@import`는 이동 후 파일을 기준으로 올바른 상대 경로를 사용한다. TS 경로 별칭을 CSS resolver에서도 지원한다고 가정하지 않는다.
4. 같은 CSS를 여러 화면에서 사용하면 대표 위치의 원본 하나를 참조한다. 화면마다 복사하거나 `@import`만 있는 빈 wrapper를 자동으로 추가하지 않는다.
5. 루트 globals·테마와 각 layout의 공통 CSS 로딩 범위를 유지한다. 경로를 옮기는 것만으로 CSS가 페이지 안에 격리되지는 않는다.
6. 파일명 대소문자와 `.module.css`를 보존한다. 예를 들어 `MarkdownViewer.module.css`를 임의로 소문자화하지 않는다.
7. 실제 이동은 복사본을 남기지 않고 수행한다. 이전 경로에 호환용 재수출 CSS를 남기지 않으며 모든 활성 참조를 새 경로로 전환한다.
8. 파일 이동 후에 빈 폴더가 생기면 소스 관리 기준에 따라 정리한다. CSS가 없는 화면에 보여주기용 빈 CSS나 `.gitkeep`을 자동 생성하지 않는다.
9. 프로젝트 탭 전용 CSS는 `projects/tabs/[ProjectTab 식별자]/`에 둔다. requirements·screens·specifications·deliverables 컴포넌트는 각각 requirement·screen·program·export 탭 폴더에 대응한다. 파일명과 URL·탭 동작은 변경하지 않는다.

예시:

```tsx
import styles from "@/styles/pages/settings/plans-toggle.module.css";
import "@/styles/pages/projects/tabs/wbs/wbs-page.css";
import "@/styles/dialog.css";
```

CSS Module의 생성 클래스명은 경로 변경에 따라 달라질 수 있다. 검증은 화면과 export된 class key를 기준으로 하며 생성된 해시 문자열이 이전과 같아야 한다고 가정하지 않는다.

## 5. CSS 50개 전체 배치표

모든 경로는 `hams-matrix/` 기준이다. **화면 소유 33개는 `styles/pages/`, 공통 17개는 `styles/`에 배치한다.** 아래 표는 분할·통합 없는 1:1 배치를 전제로 하며, 현재 파일과 최종 경로가 같은 12개는 이동하지 않는다.

| 번호 | 현재 파일 | 최종 경로 (동일 경로는 유지) |
| --- | --- | --- |
| 01 | `app/globals.css` | `styles/globals.css` |
| 02 | `app/(editor)/planning-board/styles/dark-theme.css` | `styles/pages/planning-board/dark-theme.css` |
| 03 | `app/(editor)/planning-board/styles/editor.css` | `styles/pages/planning-board/editor.css` |
| 04 | `app/(editor)/planning-board/styles/preview.css` | `styles/pages/planning-board/preview.css` |
| 05 | `app/(editor)/planning-board/styles/select-element.css` | `styles/pages/planning-board/select-element.css` |
| 06 | `app/(workspace)/viewer/md/MarkdownViewer.module.css` | `styles/pages/viewer/md/MarkdownViewer.module.css` |
| 07 | `components/admin/guardrail-admin.css` | `styles/pages/admin/settings/guardrail-admin.css` |
| 08 | `components/ai/ai-chatbot.css` | `styles/ai-chatbot.css` |
| 09 | `components/ai/ai-token-statistics.css` | `styles/pages/settings/ai-token-statistics.css` |
| 10 | `components/ai/ai-workspace-layout.css` | `styles/ai-workspace-layout.css` |
| 11 | `components/pages/acceptance/acceptance-page.css` | `styles/pages/projects/tabs/acceptance/acceptance-page.css` |
| 12 | `components/pages/architecture/architecture-page.css` | `styles/pages/projects/tabs/architecture/architecture-page.css` |
| 13 | `components/pages/dashboard/create-project-dialog.css` | `styles/pages/dashboard/create-project-dialog.css` |
| 14 | `components/pages/dashboard/dashboard-page.css` | `styles/pages/dashboard/dashboard-page.css` |
| 15 | `components/pages/database/database-erd-preview.css` | `styles/pages/projects/database/erd/database-erd-preview.css` |
| 16 | `components/pages/database/database-tools.css` | `styles/database-tools.css` |
| 17 | `components/pages/deliverables/deliverables-page.css` | `styles/pages/projects/tabs/export/deliverables-page.css` |
| 18 | `components/pages/documents/documents-page.css` | `styles/pages/projects/tabs/documents/documents-page.css` |
| 19 | `components/pages/documents/onlyoffice-editor.css` | `styles/pages/projects/documents/onlyoffice-editor.css` |
| 20 | `components/pages/history/history-page.css` | `styles/pages/projects/tabs/history/history-page.css` |
| 21 | `components/pages/project-overview/project-overview-page.css` | `styles/pages/projects/tabs/overview/project-overview-page.css` |
| 22 | `components/pages/requirements/requirements-page.css` | `styles/pages/projects/tabs/requirement/requirements-page.css` |
| 23 | `components/pages/rfp/rfp-page.css` | `styles/pages/projects/tabs/rfp/rfp-page.css` |
| 24 | `components/pages/screens/screens-page.css` | `styles/pages/projects/tabs/screen/screens-page.css` |
| 25 | `components/pages/specifications/specifications-page.css` | `styles/pages/projects/tabs/program/specifications-page.css` |
| 26 | `components/pages/team/team-membership.css` | `styles/pages/team/team-membership.css` |
| 27 | `components/pages/team/team-page.css` | `styles/pages/team/team-page.css` |
| 28 | `components/pages/wbs/wbs-date-picker.css` | `styles/pages/projects/tabs/wbs/wbs-date-picker.css` |
| 29 | `components/pages/wbs/wbs-page.css` | `styles/pages/projects/tabs/wbs/wbs-page.css` |
| 30 | `components/pages/wbs/wbs-schedule-chart.css` | `styles/pages/projects/tabs/wbs/wbs-schedule-chart.css` |
| 31 | `components/pages/wbs/wbs-schedule-image.css` | `styles/pages/projects/tabs/wbs/wbs-schedule-image.css` |
| 32 | `components/plans-toggle.module.css` | `styles/pages/settings/plans-toggle.module.css` |
| 33 | `components/project-workbench.css` | `styles/project-workbench.css` |
| 34 | `components/registration/registration.css` | `styles/pages/onboarding/registration.css` |
| 35 | `components/shared/ai-image-actions.css` | `styles/pages/projects/ai-image-actions.css` |
| 36 | `components/shared/date-input.css` | `styles/pages/projects/date-input.css` |
| 37 | `components/subscription-plans.module.css` | `styles/pages/settings/subscription/subscription-plans.module.css` |
| 38 | `styles/accessibility.css` | `styles/accessibility.css` |
| 39 | `styles/admin-settings.css` | `styles/admin-settings.css` |
| 40 | `styles/auth.css` | `styles/auth.css` |
| 41 | `styles/dialog.css` | `styles/dialog.css` |
| 42 | `styles/page-heading.css` | `styles/page-heading.css` |
| 43 | `styles/personal-theme.css` | `styles/personal-theme.css` |
| 44 | `styles/project-tabs.css` | `styles/project-tabs.css` |
| 45 | `styles/settings.css` | `styles/pages/settings/settings.css` |
| 46 | `styles/shared-ui.css` | `styles/shared-ui.css` |
| 47 | `styles/table.css` | `styles/table.css` |
| 48 | `styles/themes.css` | `styles/themes.css` |
| 49 | `styles/workspace-shell.css` | `styles/workspace-shell.css` |
| 50 | `styles/workspace.css` | `styles/workspace.css` |

### 5.1 지정한 화면 분류와의 대응

| 화면 분류 | 배치·참조 방식 |
| --- | --- |
| login | 공통 auth·globals·themes 사용. 현재 전용 파일 없음 |
| onboarding | registration.css의 소유 위치. 현재 redirect 동작과 이전 컴포넌트 미노출 상태 유지 |
| signup | 공통 auth 사용. 현재 전용 파일 없음 |
| projects | 탭 전용 CSS는 tabs/[탭명]에 배치. 탭 간 공유 입력/이미지 동작 CSS는 projects에 유지하고 workbench·탭 탐색 UI는 styles 공통 원본 참조 |
| projects/database/erd | ERD preview 전용 CSS, 공통 database-tools·project 스타일 참조 |
| projects/database/domains | 공통 database-tools·dialog·project 스타일 사용. 별도 전용 파일 없음 |
| projects/documents | 별도 OnlyOffice 문서 편집기 CSS |
| planning-board | 편집기·다크 테마·선택 요소·독립 preview CSS |
| admin | 관리자 공통 분류의 부모 경로. 새 화면·CSS를 만들지 않음 |
| admin/ai-guardrails | 현재 redirect 경로. 실제 소유 위치 admin/settings의 guardrail CSS 사용 |
| admin/plans | 현재 redirect 경로. super-admin/settings의 기존 요금제 관리 컴포넌트 사용 |
| admin/settings | guardrail-admin CSS, styles/admin-settings.css 공통 참조 |
| dashboard | create-project-dialog 및 현재 import가 없는 dashboard-page CSS |
| settings | settings·AI 사용량·요청 예시의 plans-toggle module |
| settings/subscription | subscription-plans module, settings의 plans-toggle 재사용 |
| super-admin/settings | styles/admin-settings.css와 admin/settings의 가드레일 컴포넌트 CSS 재사용 |
| team | team-page·team-membership, styles/project-tabs.css 재사용 |
| viewer | MarkdownViewer 컴포넌트를 사용하는 실제 URL 분류 |
| viewer/md | MarkdownViewer CSS Module 보관 위치. 새 route 생성 없음 |
| guest | 공통 workspace CSS와 settings/subscription 요금제 CSS 재사용 |
| policies | 공통 auth.css 안의 기존 `.policy-page` 스타일 사용 |

전용 파일이 없는 분류도 `styles/README.md`의 화면 주소 표에는 명시한다. 모든 분류에 파일을 채우기 위해 CSS를 복제하지 않는다.

### 5.2 프로젝트 탭별 폴더

`lib/project-tabs.ts`와 `components/project-workbench.tsx`의 현재 탭 식별자를 기준으로 한다. 아래 14개 탭 중 전용 CSS가 있는 11개 탭에 기존 파일 14개를 배치한다. 폴더명이 바뀌어도 쿼리 값·컴포넌트 이름·CSS 파일명은 바꾸지 않는다.

| 탭 식별자 | CSS 보관 경로 | 현재 전용 파일 |
| --- | --- | --- |
| overview | `styles/pages/projects/tabs/overview/` | project-overview-page.css |
| rfp | `styles/pages/projects/tabs/rfp/` | rfp-page.css |
| wbs | `styles/pages/projects/tabs/wbs/` | wbs-page.css, wbs-date-picker.css, wbs-schedule-chart.css, wbs-schedule-image.css |
| architecture | `styles/pages/projects/tabs/architecture/` | architecture-page.css |
| requirement | `styles/pages/projects/tabs/requirement/` | requirements-page.css (현재 미import 상태 유지) |
| screen | `styles/pages/projects/tabs/screen/` | screens-page.css |
| database | `styles/pages/projects/tabs/database/` | 현재 전용 파일 없음. 독립 ERD·domains 스타일과 구분 |
| program | `styles/pages/projects/tabs/program/` | specifications-page.css (현재 주석 전용·미import 상태 유지) |
| test | `styles/pages/projects/tabs/test/` | 현재 독립 CSS 파일 없음 |
| trace | `styles/pages/projects/tabs/trace/` | 현재 독립 CSS 파일 없음. 기존 style jsx 추출은 범위 밖 |
| acceptance | `styles/pages/projects/tabs/acceptance/` | acceptance-page.css |
| history | `styles/pages/projects/tabs/history/` | history-page.css (현재 미import 상태 유지) |
| export | `styles/pages/projects/tabs/export/` | deliverables-page.css (현재 미import 상태 유지) |
| documents | `styles/pages/projects/tabs/documents/` | documents-page.css |

CSS가 없는 탭은 관리 분류만 README에 안내하고 빈 CSS·폴더 유지용 파일을 추가하지 않는다. 탭 전용 CSS를 이 경로로 옮겨도 현재 정적 import의 로딩 범위는 바꾸지 않는다. 탭 선택 시에만 로드하는 동적 import나 CSS Modules 전환은 별도 작업이다.

## 6. 변경 대상 파일과 구체적인 참조 변경

### 6.1 layout·page 진입점

| 대상 파일 | 향후 변경 |
| --- | --- |
| `app/layout.tsx` | globals만 styles/globals.css로 변경. themes 경로와 로딩 순서 유지 |
| `app/(auth)/layout.tsx` | 기존 styles/auth.css import 유지. 점검 대상이며 수정 불필요 |
| `app/(workspace)/layout.tsx` | 기존 styles/workspace.css import 유지. 점검 대상이며 수정 불필요 |
| `app/(database)/layout.tsx` | workbench·database-tools의 2개 경로만 변경. 공통 5개 경로와 전체 순서 유지 |
| `app/(editor)/planning-board/layout.tsx` | editor·dark-theme·select-element의 3개 경로만 변경. 기존 공통 5개 경로와 전체 순서 유지 |
| `app/(editor)/planning-board/preview/page.tsx` | preview.css 경로 변경 |
| `app/(workspace)/admin/settings/page.tsx` | 기존 styles/admin-settings.css import 유지. 수정 불필요 |
| `app/(workspace)/super-admin/settings/page.tsx` | 기존 styles/admin-settings.css import 유지. 수정 불필요 |
| `app/(workspace)/settings/page.tsx` | settings 경로 변경 |
| `app/policies/page.tsx` | 기존 styles/auth.css import 유지. 수정 불필요 |
| `app/guest/[...path]/page.tsx` | 기존 styles/workspace.css import 유지. 수정 불필요 |

### 6.2 컴포넌트의 직접 import

다음 **31개 컴포넌트 소스**를 점검한다. `project-permissions-dialog.tsx`의 기존 styles/project-tabs.css import는 유지하고 나머지 30개의 경로를 전환한다. 6.1절도 11개 중 5개만 변경하므로, 전체 42개 점검 대상 중 실제 import 변경 대상은 **35개 소스**다.

- `components/admin/guardrail-admin.tsx`, `components/admin/guardrail-test-attachments.tsx`
- `components/ai/ai-chatbot.tsx`, `components/ai/ai-conversation-menu.tsx`, `components/ai/ai-token-statistics.tsx`, `components/ai/ai-workspace-layout.tsx`
- `components/plans-toggle.tsx`, `components/subscription-plans.tsx`, `components/project-workbench.tsx`
- `components/registration/registration-choice-dialog.tsx`
- `components/shared/ai-image-actions.tsx`, `components/shared/date-input.tsx`
- `components/pages/acceptance/acceptance-page.tsx`
- `components/pages/architecture/architecture-page.tsx`
- `components/pages/dashboard/dashboard-page.tsx`, `components/pages/dashboard/create-project-dialog.tsx`
- `components/pages/database/database-erd-preview.tsx`
- `components/pages/documents/documents-page.tsx`, `components/pages/documents/onlyoffice-editor.tsx`
- `components/pages/project-overview/project-overview-page.tsx`
- `components/pages/rfp/rfp-page.tsx`, `components/pages/screens/screens-page.tsx`
- `components/pages/team/team-page.tsx`, `components/pages/team/team-member-add-dialog.tsx`, `components/pages/team/team-membership.tsx`, `components/pages/team/project-permissions-dialog.tsx`
- `components/pages/wbs/wbs-date-picker.tsx`, `components/pages/wbs/wbs-page.tsx`, `components/pages/wbs/wbs-schedule-chart.jsx`, `components/pages/wbs/wbs-schedule-image.tsx`
- `app/(workspace)/viewer/md/MarkdownViewer.tsx` (viewer 컴포넌트 1개도 이 목록에 포함)

목록의 실제 수량과 정적 검색 결과는 구현 시 다시 대조한다. 이 목록에 있는 dashboard-page.tsx는 기존 project-workbench import의 경로를 바꾸는 것이며, 현재 빠져 있는 dashboard-page.css import를 추가한다는 의미가 아니다.

### 6.3 CSS 내부 의존성

- `styles/workspace.css`와 7개 상대 `@import` 대상은 현재 위치·순서를 그대로 유지한다.
- `project-workbench.css`의 `@import "../styles/project-tabs.css"`는 두 파일이 styles 안에서 만나므로 `@import "./project-tabs.css"`로 변경한다.
- 현재 CSS의 `url(...)`는 `themes.css` 안의 data URI 1곳만 확인했다. 이동에 따른 로컬 상대 이미지·폰트 경로 재작성 대상은 현재 없지만 구현 직전 다시 검색한다. data URI의 내용을 변경하지 않는다.
- `@reference`, `@source`, `composes`, `@value`의 파일 의존성은 현재 조사에서 발견되지 않았다.
- 주석의 경로는 실제 이동한 파일만 갱신한다. 그대로 유지하는 `styles/workspace.css`, `styles/dialog.css` 안내를 불필요하게 바꾸지 않는다. 선언과 선택자는 보존한다.

### 6.4 테스트의 직접 파일 읽기

| 파일 | 기존 경로 | 기본안의 새 경로 |
| --- | --- | --- |
| `scripts/test-ai-chat-pagination-browser.mjs` | app/globals.css, components/ai/ai-chatbot.css | styles/globals.css, styles/ai-chatbot.css |
| `scripts/test-wbs-form-browser.mjs` | styles/dialog.css, components/pages/wbs/wbs-date-picker.css | styles/dialog.css는 유지, picker만 styles/pages/projects/tabs/wbs/wbs-date-picker.css로 변경 |
| `scripts/test-architecture-mermaid-browser.mjs` | components/pages/architecture/architecture-page.css | styles/pages/projects/tabs/architecture/architecture-page.css |

이 스크립트들은 CSS를 파일 시스템에서 읽어 합성 HTML을 만든다. TS import만 고치면 테스트가 파일을 찾지 못하므로 함께 변경해야 한다. 일반 `.css` 문자열 전체를 자동 치환하지 않고 실제 저장소 파일 참조만 갱신한다.

### 6.5 문서·설정

- `styles/README.md`: 7절 내용으로 개정하는 필수 대상. 이번 설계 단계에서는 파일 자체를 수정하지 않는다.
- 루트 `README.md`: app/globals.css를 styles/globals.css로 갱신하고 화면 CSS의 새 구조를 안내한다. styles/auth.css·styles/workspace.css·styles/themes.css는 기존 경로 설명을 유지한다.
- `components/pages/README.md`: “스타일은 각 컴포넌트 폴더에 있다”는 설명과 공통 CSS 위치를 갱신한다.
- `app/(editor)/planning-board/README.md`: 이전 `styles/dark-theme.css` 등 기획 보드 CSS 경로를 갱신한다.
- `next.config.ts`: 일반 CSS에 Tailwind Turbopack loader를 적용하고 `.module.css`를 제외하는 현재 규칙은 경로에 종속되지 않는다. 이동만을 위해 loader 설정을 바꿀 필요는 없다.
- `tsconfig.json`: 기존 `@/*` → `./*` 별칭을 사용할 수 있으므로 별칭 추가는 필요하지 않다.
- `package.json`: 의존성 추가나 스크립트 이름 변경은 필요하지 않다. 기존 테스트 명령을 유지한다.
- AGENTS·CLAUDE의 스타일 관련 경로 안내가 구현 시점에 추가되어 있다면 해당 부분만 함께 갱신한다. 기존 관리자 API 구현 기록과 사용자 미커밋 변경을 덮어쓰지 않는다.

### 6.6 이동 대상이 아닌 CSS 형태

- `components/super-admin/plan-admin.tsx`, `components/pages/project-overview/project-traceability.tsx`의 `<style jsx>`는 독립 CSS 파일이 아니다. 추출·변환은 이번 기본 범위에 포함하지 않는다.
- 기획 보드의 export 템플릿 안 `./style.css` 문자열은 사용자가 내려받는 산출물의 경로다. 저장소 CSS를 가리키지 않으므로 이동 대상 경로로 치환하지 않는다.
- 문서 편집기 외부 서비스가 제공하는 내부 CSS와 런타임 style prop·CSS 변수는 그대로 유지한다.

## 7. styles/README.md 개정 설계

현재 README는 페이지 CSS를 `components/pages/<메뉴>/`에서 관리하도록 안내하고 있어 이번 구조와 충돌한다. 향후 구현에서는 다음 내용을 포함하도록 교체한다.

1. **위치 규칙**: 화면 CSS는 styles/pages, 프로젝트 탭 전용 CSS는 styles/pages/projects/tabs/[탭명], 공통 기반 CSS는 기존 styles에서 관리한다. 동적 ID·route group은 제외하고 tab 값은 실제 ProjectTab 식별자로 정규화한다.
2. **화면·탭 표**: 5.1절의 21개 화면 분류와 5.2절의 14개 탭 분류, 실제 CSS 소유 위치·공유 참조·redirect/컴포넌트 전용 분류 설명.
3. **공통 CSS 표**: styles에 유지·배치하는 17개 파일의 역할과 실제 import 주체. 기존 12개 유지와 globals·AI layout·챗봇·DB 도구·workbench 5개 추가를 구분한다.
4. **import 예시**: 화면 CSS는 `@/styles/pages/...`, 공통 CSS는 `@/styles/...`, CSS 내부는 상대 경로를 사용하는 예시. 일반 CSS와 CSS Module을 각각 제시한다.
5. **로딩 순서**: globals → themes의 루트 순서, workspace의 7개 내부 순서, 독립 DB·기획 보드 layout의 현재 순서 유지.
6. **공유 원칙**: 한 파일을 여러 화면에서 재사용하되 복사하지 않는 기준. 페이지 폴더 이동은 global CSS 격리와 다르다는 설명.
7. **변경·검증 절차**: 새 파일의 소유 화면 결정, import·@import·직접 파일 읽기 검색, 개발/프로덕션·직접 진입/화면 전환·테마/반응형 확인.
8. **특이사항**: 미import 5개는 재활성화하지 않음, 주석 전용 specifications 유지 여부, CSS Modules 생성 클래스명 변화 가능성.

`styles/README.md`는 파일 트리를 찾는 현재 기준 문서로 사용한다. 과거 docs/history·docs/work의 경로는 당시 사실이므로 일괄 고치지 않고 새 작업 기록에서 변경을 안내한다.

## 8. 구현 순서와 검증 방법

### 8.1 구현 순서 제안

1. 최신 설계와 소스를 다시 읽고 공통 CSS의 styles 유지 결정을 적용한다. 9절의 남은 선택 항목과 기존 변경사항·현재 화면의 기준 상태를 기록한다.
2. CSS 50개와 import 관계를 다시 수집하고 모든 파일의 목적지·활성 여부를 확정한다. 탭 전용 14개는 실제 탭 식별자별 tabs 하위 경로를 적용한다.
3. CSS 38개를 이동하고 기존 공통 12개는 유지한다. 소스 42개를 점검해 35개의 import를 전환하고 CSS `@import` 1곳과 테스트 3개의 파일 읽기 경로를 함께 반영한다. 기존 import 순서를 유지한다.
4. 미import CSS는 새 위치에 보존하고 기존에 없던 import를 추가하지 않는다. 분할·통합·디자인 변경을 섞지 않는다.
5. 현재 안내 문서 4개의 위치 설명을 갱신한다. 이동 완료 후 이전 파일과 불필요해진 빈 CSS 폴더를 정리한다.
6. 정적·프로덕션·브라우저 검증을 수행하고 구현 기록에 결과와 미완료 사항을 남긴다.

### 8.2 정적·구조 검증

- 배치표의 원본 50개와 최종 경로 50개를 비교한다. 33개는 styles/pages, 17개는 styles이며 누락·복제·경로 충돌이 없어야 한다. 기존 위치 유지 12개를 삭제된 파일로 오판하지 않는다.
- 프로젝트 탭 전용 CSS 14개는 `projects/tabs/[탭명]/`에 있으며 실제 ProjectTab과 일치해야 한다. 탭 간 공유 CSS·독립 DB 화면·별도 문서 편집기의 경로를 탭 폴더로 잘못 옮기지 않는다.
- 세 CSS Module이 `.module.css`로 남고 export된 class key가 유지되는지 확인한다.
- import·@import·직접 파일 읽기의 모든 실제 파일 경로가 존재하는지 확인한다. 화면·공통 CSS의 두 절대 별칭 규칙을 따르고 기존 공통 import는 유지한다.
- 실제 이동한 38개 파일의 이전 경로를 활성 소스·테스트·현재 안내 문서에서 검색한다. 유지하는 12개 경로·export 템플릿·속성명 `.css`·과거 작업 기록을 잘못된 잔여 참조로 판정하지 않는다.
- 이동 전후 선언을 비교한다. 허용하는 차이는 경로를 포함한 `@import`·주석이며, 선택자·선언값·media query·keyframes가 바뀌면 별도 변경으로 점검한다.
- 미import 5개는 기존 미로드 상태를 유지한다. 주석 파일을 옮긴 것을 사용 중 CSS로 잘못 집계하지 않는다.
- 변경 소스 ESLint, `pnpm typecheck`, `pnpm build`를 수행한다. 빌드는 import 순서와 프로덕션 CSS chunk 처리를 함께 확인한다.

설치된 Next.js 가이드는 CSS Modules의 `.module.css` 사용과 import 순서에 따른 프로덕션 CSS 병합을 설명한다. 개발 화면만 확인하지 않고 프로덕션 빌드와 실제 화면을 검증한다.

### 8.3 화면 검증

| 영역 | 확인할 내용 |
| --- | --- |
| login·signup·policies | 인증 패널·브랜드·폼·이용 안내, 라이트/다크, 모바일 반응형 |
| onboarding | 현재의 가입 완료 처리·redirect가 유지되는지 확인. 이전 폼을 새로 노출하지 않음 |
| dashboard | 프로젝트 목록·생성 모달, 이동 전과 같은 CSS 로딩 상태 |
| projects 탭 전체 | overview·WBS·RFP·architecture·요구사항·화면·DB·프로그램·검증·추적·검수·이력·산출물·문서 탭 전환 |
| WBS·이미지 동작 | 날짜 입력·간트·로드맵·이미지 미리보기·다운로드 버튼·모달 |
| 독립 ERD·domains | 새 탭 직접 진입, 테이블/도메인 폼·미리보기, 공통 dialog와 테마 |
| 별도 문서 편집기 | 도구 모음·프레임 높이·연결 오류 안내. 외부 편집기 내부 CSS는 별도 서비스 소유 |
| planning-board·preview | 편집기·선택 요소·공유 모달·라이트/다크·preview 직접 진입과 편집기에서 전환 |
| admin·super-admin | 회원·이력·가드레일·요금제 탭, 공통 상세 모달, 관리자 글꼴·간격 유지 |
| settings·subscription | 개인 테마 6종과 custom, 요금제 토글·카드, AI 토큰 통계 |
| team | 가입·회원·권한 모달, project-tabs 재사용 |
| viewer | MarkdownViewer module의 목차·본문·코드·이미지·테마 |
| guest | dashboard·project·subscription·정책 링크 및 공통 스타일 |
| 화면 간 전환 | 직접 URL 진입과 client navigation을 모두 확인. 앞 화면의 global CSS가 남아 생기는 충돌·순서 변화 점검 |

데스크톱·모바일과 라이트·다크를 대표 조합으로 확인하며, 스타일을 실제 사용하는 화면은 합성 데이터로 연다. 특히 현재 onboarding GET은 사용자 상태를 변경하므로 운영 계정·운영 DB로 회귀 검증하지 않는다.

### 8.4 관련 기존 검증의 활용

- `node scripts/test-wbs-form-browser.mjs`: 수정한 CSS 직접 파일 읽기와 날짜 picker·폼 확인.
- `node scripts/test-ai-chat-pagination-browser.mjs`: globals·챗봇 CSS 파일 읽기와 채팅 영역 확인.
- `pnpm test:architecture-mermaid-browser`: 아키텍처 CSS의 경로·Mermaid preview 확인.
- `pnpm test:planning-board-browser`: 편집기·preview·다크 테마 확인.
- `pnpm test:database-domains-browser`: 독립 DB 도구의 공유 스타일 확인.
- `pnpm test:product-administration-browser --production`: 관리자·알림·검색·상세 모달 회귀.
- `pnpm test:personal-preferences-browser`: 설정·테마 관련 화면 확인.

각 스크립트가 모든 스타일을 검증하는 것은 아니다. 기존 실패와 이번 이동으로 생긴 실패를 구분하고, 위 화면 표에서 남은 부분은 직접 브라우저로 보완한다. API·DB 정책을 바꾸지 않는 경로 이동이므로 관련 없는 전체 DB 회귀나 운영 마이그레이션을 추가하지 않는다.

### 8.5 이번 문서 단계의 확인

- 이동표가 현재 CSS 50개를 정확히 한 번씩 포함하는지 대조한다.
- `HISTORY.md`의 기존 목록을 보존하고 본 문서의 상대 경로·2026-11-12 작성일을 한 줄 추가한다.
- 조사 후 소스와 `styles/README.md`가 바뀌지 않았는지 확인한다. 기존 관리자 API 구현 변경 등 다른 미커밋 작업을 보존한다.
- 실제 테스트 실행·DB 접속·CSS 이동은 하지 않는다. 위 검증 항목은 향후 구현의 방법이며 이번 단계의 통과 결과가 아니다.

## 9. 확정 기준과 결정이 필요한 사항

공통 CSS를 `styles/`에 유지하고 프로젝트 탭 전용 CSS를 `styles/pages/projects/tabs/[탭명]/`에 배치하는 기준은 사용자 답변으로 확정했다. 배치표는 이를 반영했으며 `_shared` 추가 여부를 다시 결정할 필요가 없다.

| 항목 | 검토 기본안 | 대안·영향 |
| --- | --- | --- |
| 공통 CSS 위치 (확정) | 기존 styles 공통 12개 유지, app·components의 공통 기반 5개를 styles로 이동 | 공통 17개는 화면 폴더 배치의 예외. styles/pages/_shared는 만들지 않음 |
| 프로젝트 탭 CSS 위치 (확정) | 탭 전용 14개는 projects/tabs/[ProjectTab 식별자]에 배치. WBS는 tabs/wbs | 탭 간 공유 CSS는 projects, 전역·layout 공통 기반은 styles에 유지. 실제 URL과 로딩 정책은 변경하지 않음 |
| DB 두 화면의 공통 database-tools | `styles/database-tools.css` 하나를 기존 DB layout에서 로드 | 공통 CSS를 styles에 모으는 확정 기준을 따름. ERD·domains에 복사하지 않음 |
| 가드레일 CSS의 화면 소유 | 실제 렌더링 URL인 admin/settings에 배치 | admin/ai-guardrails 폴더로 기능별 배치할 수도 있으나 redirect 별칭과 실제 URL 분류의 차이를 README에 명시해야 함 |
| 기반 CSS와 기능 컴포넌트 CSS 경계 | admin-settings·project-tabs·workbench는 styles 공통, 가드레일·요금제·프로젝트 입력/이미지는 대표 화면 소유 | 구현 직전 새로운 사용처가 생겼다면 분류를 다시 대조하되 공통 보관 경로 자체는 styles로 유지 |
| 현재 import가 없는 5개 CSS | 모두 이동하되 미로드 상태 보존 | 삭제·새 import 추가는 별도 개선. 이번 경로 정리와 섞으면 화면 동작이 달라짐 |
| auth와 policies 스타일 분할 | styles/auth.css 위치·내용과 기존 두 import 주체 유지 | policies 전용 파일 분리는 선택자·media query 이동 검증이 추가되는 별도 범위 |
| 전용 CSS가 없는 화면 폴더 | 분류는 README에 기재하되 빈 파일·복제 CSS 미생성 | 모든 폴더를 Git에 표시해야 한다면 `.gitkeep` 정책을 별도로 결정 |
| `<style jsx>`까지 외부 파일로 추출 | 현재 `.css` 파일 50개만 대상으로 함 | 모두 외부화하려면 scoped 동작·selector·생성 클래스 변화가 추가되어 별도 설계 필요 |

**DB 변경은 필요하지 않다.** 공통 CSS의 styles 유지 결정을 반영했으며, 이번 문서를 검토한 뒤 남은 선택 항목을 반영하여 구현 범위를 확정한다.
