# Markdown viewer 스타일 격리·아이콘·테마 개선 분석 및 설계

- 작성일: 2026-10-29 (한국시간, Asia/Seoul)
- 상태: 검토용 설계. 사용자가 문서를 검토·수정한 뒤 별도로 구현을 요청할 예정이다.
- 이번 작업의 변경 범위: 본 문서 신규 작성과 `HISTORY.md` 링크 추가만 수행한다. 애플리케이션 소스, 패키지, 설정, 테스트 코드, DB 및 마이그레이션은 변경하지 않는다.
- 분석 기준: 작업 트리의 현재 소스와 설치된 패키지를 확인했다. 기존 미커밋 변경과 신규 viewer 파일도 현재 구현으로 읽었으며 수정하지 않았다. 브라우저 재현, computed style 수집, 빌드 및 실행 테스트는 수행하지 않았다. 확인한 사실과 원인 가설을 아래에서 구분한다.

## 1. 요구사항과 완료 기준

| 번호 | 요구사항 | 구현 단계 완료 기준 |
| --- | --- | --- |
| 1 | `docs`의 Markdown을 표시하는 기존 `/viewer` 화면을 기준으로 개선 | 현재 문서 탐색·열기·탭·검색·목차·원문 표시 기능 유지 |
| 2 | viewer 방문 후 다른 화면까지 스타일이 바뀌는 현상 해결 | 같은 테마에서 다른 페이지의 직접 진입과 viewer 왕복 후 표시가 같고, 공통 셸의 글자·간격·색상·스크롤이 유지됨 |
| 3 | viewer의 MUI 아이콘을 lucide-react로 교체 | 직접 import한 9종과 MUI UI 내부에서 표시되는 기본 아이콘까지 교체하고, 버튼 동작·레이블·키보드 접근성 유지 |
| 4 | viewer에 다크·라이트모드 적용 | 기존 공통 테마 전환과 개인 설정을 따라 본문·컨트롤·상태·팝업이 즉시 함께 전환됨 |

권한 검사, 문서 수집 및 데이터 구조, 검색·탭 상태 관리, Markdown 파싱과 링크 처리, 저장 요청 형식은 유지한다. 아이콘 교체는 `@mui/icons-material` 제거를 뜻하며, `@mui/material` 전체 제거는 별도 설계 선택이다. 이번 요구만으로 다른 화면의 아이콘 체계까지 일괄 변경하지 않는다.

## 2. 현재 구조

### 2.1 페이지와 문서 로딩

`app/(workspace)/viewer/page.tsx`는 서버 컴포넌트다.

1. `requireUser()`와 `requirePlatformAdmin(user)`로 접근을 제한한다.
2. `process.cwd()/docs`를 재귀 탐색해 `.md` 파일을 읽는다.
3. 문서 이름, 상대 경로, 내용, 수정 시각, 바이트 크기를 수집하고 경로순으로 정렬한다.
4. `.viewer-page`로 감싼 `MarkdownViewer`에 전체 문서 목록을 전달한다.
5. 페이지에서 전역 스타일인 `@/styles/viewer.css`를 import한다.

페이지의 `Suspense` fallback은 현재 “관리자 설정을 불러오는 중입니다.”다. viewer용 로딩 문구로 정리할 수 있으나 기능 개선의 필수 조건은 아니다.

### 2.2 클라이언트 화면

`app/(workspace)/viewer/md/MarkdownViewer.tsx`에 다음 기능이 모여 있다.

- `?document=`에 따른 최초 문서 선택, 폴더 트리 구성·접기·펼치기, 파일 경로/내용 검색.
- 여러 문서를 여는 스크롤 탭, 개별 탭 닫기, 현재 문서 외 다른 탭 닫기. 현재 “탭닫기” 버튼은 모든 탭을 닫는 기능이 아니다.
- 문서 이름·경로·크기·한국시간 수정 시각 표시.
- `react-markdown`과 `remark-gfm`으로 미리보기 렌더링, 상대 `.md` 링크 연결, 제목 목차 이동, 표 위험도 셀 강조.
- 원문 편집용 textarea, 문서별 draft, 저장 버튼과 Ctrl/Cmd+S, Markdown 복사.
- 저장 시 `PUT /api/markdown` 호출. 현재 `app/api`에서 해당 route 구현을 찾지 못했고 `next.config.ts`에서도 관련 rewrite를 확인하지 못했다. 저장 성공 여부는 기존 기능의 별도 확인 사항이다.

UI는 `@mui/material`의 AppBar, Toolbar, Paper, Typography, TextField, List, Tabs, Button, Tooltip, Alert 등을 사용한다. 이 파일에서 `@mui/icons-material` 아이콘 9종을 import한다.

### 2.3 스타일 구조와 충돌 지점

| 위치 | 현재 구조 | 영향 |
| --- | --- | --- |
| `app/globals.css` | 전역 body 14px, 기본 글꼴, 버튼·입력·링크·포커스 규칙 | viewer에도 상속/적용됨 |
| `styles/themes.css` | `:root[data-theme="dark"]` 토큰, 전역 입력·표 등의 다크 규칙 | `.markdown th/td` 등 viewer 본문과도 경합할 수 있음 |
| `styles/viewer.css` | 모든 규칙이 `.viewer-page` 아래에 있음 | 전역으로 로드되지만 현재 선택자 자체가 외부 화면을 직접 대상으로 삼지는 않음 |
| `MarkdownViewer.module.css` | 해시된 로컬 클래스, 다수의 라이트 고정 색상, `!important` | viewer 테마 전환 누락과 MUI 스타일 경합 발생 가능 |
| CSS Module의 `:global(.MuiTabs-root)` 등 | `.documentTabs` 하위에서만 MUI 클래스 선택 | 현재 사용은 부모 로컬 클래스로 제한되어 있어 이것만으로 전체 화면 오염을 단정할 수 없음 |
| `styles/viewer.css`의 `.viewer-content` 규칙 | 현재 viewer JSX에 해당 클래스 없음 | 광범위한 12px 규칙이 의도대로 적용되지 않음 |
| `styles/viewer.css`의 textarea·표 규칙 | 일반 요소 대상이지만 `.viewer-page`에 한정 | `.sourceEditor`와 `.markdown th/td`의 배경·글자·padding과 중복 책임 |
| MUI 기본 테마 | viewer를 감싼 ThemeProvider가 없음 | 앱의 `data-theme`와 MUI palette가 연결되지 않음 |

모듈의 `.viewer`, `.workspace`, `.sidebar`, `.brand` 이름은 공통 셸 클래스와 비슷하지만 CSS Modules가 실제 클래스명을 변환한다. 이름이 같다는 이유만으로 전역 충돌로 판단하지 않는다.

`MarkdownViewer.module.css`의 `.viewer`는 `height/min-height:100vh`를 사용한다. 하지만 viewer는 공통 셸의 `.main-content` 안에 들어간다. 셸은 별도 상단바·여백·푸터를 가지므로 viewport 전체 높이를 중첩하면 화면보다 길어지고 내부/외부 스크롤이 동시에 생길 수 있다. 이 문제는 방문 후 스타일 잔류와 구분해 확인한다.

### 2.4 공통 테마 흐름

현재 테마의 기준은 회원 개인 설정이다.

`app/layout.tsx`의 초기 스크립트(light) → `app/(workspace)/layout.tsx`의 DB 개인 설정 조회 → `PreferencesRuntime` 초기화 → `stores/preferences.ts` → `stores/theme.ts`의 `syncTheme()` → `document.documentElement.dataset.theme` → `styles/themes.css`.

공통 상단 `ThemeToggle`은 개인 설정 저장 API를 통해 테마를 바꾼다. Zustand의 `useTheme`가 현재 모드를 제공한다. localStorage는 개인 설정 저장 후 보조 캐시로 사용되며, viewer가 독립적인 저장값을 만들 필요가 없다.

## 3. 전체 화면 스타일 변경 원인 분석

### 3.1 소스에서 확인한 사실

- viewer 전용 전역 CSS를 페이지 진입 시 로드한다.
- 설치된 Next.js 16.4.2의 로컬 CSS 가이드는 App Router에서 경로 이동 시 스타일시트가 제거되지 않을 수 있고 CSS 순서가 개발/프로덕션에서 다를 수 있음을 설명한다. 따라서 페이지를 벗어나면 CSS가 자동 해제될 것이라는 전제로 설계하면 안 된다.
- 현재 viewer 전역 CSS는 `.viewer-page`로 제한되어 있고, viewer의 코드에는 body/html 스타일이나 전역 테마를 직접 바꾸는 처리가 없다.
- 현재 앱 소스 검색에서 viewer 외 MUI 사용, 전역 `CssBaseline`, `GlobalStyles`, MUI ThemeProvider 사용을 확인하지 못했다.
- 설치된 MUI InputBase는 자동완성용 전역 keyframes를 주입한다. 확인한 해당 규칙은 body/html 글자·색상을 바꾸는 reset이 아니다. MUI를 사용한다는 사실만으로 전역 reset이 원인이라고 단정하지 않는다.
- 라이트 색상 고정과 MUI 테마 미연결은 viewer 자체의 다크모드 누락을 설명하지만, 다른 페이지에서 계속 스타일이 달라지는 현상의 직접 원인까지 증명하지는 않는다.

참고한 로컬 근거: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`, `node_modules/@mui/material/InputBase/InputBase.js`, `node_modules/@mui/material/Alert/Alert.js`, `node_modules/@mui/material/TabScrollButton/TabScrollButton.js`.

### 3.2 구현 전에 확인할 가설

| 가설 | 확인 방법 | 원인으로 확인됐을 때 수정 원칙 |
| --- | --- | --- |
| 경로별 CSS 로딩 순서 변화로 공통 규칙의 승자가 달라짐 | 방문 전후 동일 요소의 computed style과 승리한 파일/선택자/명시도 비교 | 해당 선택자 책임을 좁히고 viewer 규칙을 모듈화. import 순서 변경만으로 마무리하지 않음 |
| MUI/Emotion 스타일 주입 순서와 기존 규칙이 경합 | head의 stylesheet·`style[data-emotion]`, 적용 대상 선택자 및 삽입 순서 기록 | viewer 로컬 override 또는 확인된 주입 충돌만 수정. 전역 reset 추가 금지 |
| 페이지 이동 과정의 공통 개인 설정 재초기화로 테마가 달라짐 | `html[data-theme]`, `useTheme.theme`, 설정 초기화 시점과 값 비교 | 재현된 경우에만 공통 초기화 로직을 별도 대상으로 확대 |
| 중첩된 viewport 높이/스크롤로 전체 화면이 달라 보임 | body·공통 main·viewer main의 높이/overflow/scrollTop과 sticky 위치 비교 | viewer 내부의 높이·스크롤 책임 정리 |

일반 페이지 직접 진입 → viewer 진입 → 같은 페이지 복귀를 라이트/다크 각각 수행한다. 링크 이동, 뒤로/앞으로, 새로고침을 구분한다. 가능하면 viewer 링크 prefetch 전후도 비교한다. 바뀐 속성이 확인되면 해당 속성을 만드는 실제 CSS/상태 변경 경로를 먼저 특정한다. 현재 문서는 정적 분석이므로 “전역 스타일 변경 원인 확정”으로 표시하지 않는다.

## 4. 수정 방향

### 4.1 viewer 스타일의 책임을 한곳으로 모음

1. `styles/viewer.css`에서 실제 사용 중인 규칙을 `MarkdownViewer.module.css`의 로컬 루트 아래로 이전한다.
2. 페이지의 전역 viewer CSS import를 제거하고, `.viewer-page` 래퍼 스타일이 필요하면 모듈 클래스 또는 기존 viewer 루트에서 맡는다. 기존 전역 파일은 사용처가 없어진 것을 확인한 뒤 삭제하는 방향이다.
3. 사용하지 않는 `.viewer-content`, `.admin-visually-hidden` 등의 복제 규칙은 제거한다. 본문 제목과 문단까지 일괄 12px로 만드는 선택자를 되살리지 않는다.
4. 입력, 원문 편집기, 본문 표, 버튼의 스타일을 구체적인 로컬 클래스에 배정한다. 모든 textarea/th/td를 한 번에 덮는 규칙을 줄인다.
5. `.documentTabs :global(.MuiTabs-root)`처럼 필요한 MUI 하위 선택자는 로컬 부모를 유지한다. 독립적인 `.Mui*`, `body`, `html`, `:root`, 태그 선택자를 viewer 전용 스타일로 추가하지 않는다.
6. MUI의 `sx`, 로컬 CSS, 전역 viewer CSS에 나뉜 중복 값을 정리하고 `!important`는 실제 충돌이 남는 항목만 검토한다. 공통 CSS가 나중에 로드되어도 viewer가 독립적으로 표시되게 한다.

공통 `globals.css`, `themes.css`의 값을 전체적으로 바꾸는 방식은 기본안에 포함하지 않는다. 브라우저에서 공통 규칙의 결함이 확인된 경우에만 영향 범위를 다시 검토한다.

### 4.2 MUI 아이콘 → lucide-react 매핑

`lucide-react`는 이미 `package.json`에 `^1.62.0`으로 있고 다른 프로젝트 화면에서도 사용 중이다. 다음 export는 설치된 타입 선언에서도 확인했다. 새 라이브러리 설치가 필요하지 않다.

| 현재 아이콘 | 현재 용도 | lucide 교체안 |
| --- | --- | --- |
| `Close` | 문서 탭 닫기 | `X` |
| `ContentCopy` | Markdown 복사 | `Copy` |
| `DeleteSweepOutlined` | 현재 문서 외 다른 탭 닫기 | `ListX` |
| `DescriptionOutlined` | 문서 파일 표시 | `FileText` |
| `ExpandLess` | 열린 폴더 접기 | `ChevronUp` |
| `ExpandMore` | 닫힌 폴더 펼치기 | `ChevronDown` |
| `FolderOutlined` | 폴더 표시 | `Folder` |
| `SaveOutlined` | 원문 저장 | `Save` |
| `Search` | 검색 입력 장식 | `Search` |
| MUI Tabs의 기본 좌/우 스크롤 아이콘 | 열린 탭 목록 가로 이동 | `ChevronLeft` / `ChevronRight` |
| MUI Alert의 기본 info 아이콘 | 문서 없음/열린 문서 없음 안내 | `Info` |

`@mui/icons-material` import를 제거하고 lucide의 named import를 사용한다. MUI의 `fontSize="small"`은 lucide의 `size`로 바꾼다. 탭 닫기는 약 16px, 일반 아이콘은 18px를 초안으로 하고 strokeWidth는 1.75~2 범위에서 검토한다. 색상은 `currentColor`를 기본으로 한다.

MUI UI를 유지할 경우 Alert의 `icon`, Tabs의 `slots.startScrollButtonIcon`/`slots.endScrollButtonIcon`을 명시한다. 스크롤 아이콘 slot은 MUI가 전달하는 props/ref와 lucide SVG props의 타입 차이를 확인해 작은 어댑터가 필요하면 viewer 안에서 처리한다. 화면에서 보이는 내부 기본 아이콘도 교체 대상이다. 라이브러리 내부 파일에 아이콘 코드가 있다는 이유만으로 패키지 수정까지 하지는 않는다.

- 아이콘 전용 버튼에는 동작을 설명하는 `aria-label`과 필요한 tooltip을 제공한다. 복사 버튼은 현재 Tooltip만 있으므로 명시적 레이블을 추가하는 방향이다.
- 텍스트와 함께 쓰는 아이콘은 `aria-hidden`으로 중복 읽기를 막는다.
- 탭 닫기의 이벤트 전파 방지, 다른 탭 닫기의 비활성 조건, 저장 중 비활성, 폴더의 `aria-expanded`를 보존한다.
- “탭닫기”는 “다른 탭 닫기”로 문구를 명확히 하는 안을 검토한다. 문서를 삭제하는 버튼으로 오해하지 않게 한다.

### 4.3 MUI UI 컴포넌트 처리안

**기본 제안: `@mui/material`은 유지하고 아이콘·스타일·테마 연결을 개선한다.** Tabs, Collapse, Tooltip, 입력 컨트롤을 모두 재구현할 필요 없이 요구 범위를 좁힐 수 있다.

- 공통 `useTheme`의 모드를 읽어 viewer 내부에만 일반 MUI `ThemeProvider`를 둔다. 테마 객체는 모드가 바뀔 때만 생성한다.
- palette의 모드와 primary, background, text, divider를 공통 토큰의 라이트/다크 팔레트와 맞춘다. MUI palette에 색상 가공이 필요한 값은 기존 팔레트의 실제 색상값을 사용하고, 표면/테두리 등의 스타일에는 CSS 변수를 사용한다.
- `CssBaseline`, 전역 `GlobalStyles`, html/body를 바꾸는 테마 초기화 코드는 도입하지 않는다. 별도 document 전역 속성을 쓰는 테마 공급자로 확대하지 않는다.
- Tooltip이 portal로 렌더링되는 경우에도 같은 React 테마를 적용한다. portal 스타일은 MUI 테마 override 또는 slot class로 지정하고, viewer DOM의 자손이라는 가정에만 의존하지 않는다.

**대안: viewer의 MUI UI까지 제거한다.** `Box/Paper/Typography`는 HTML과 CSS Modules로, 입력·버튼은 표준 요소로 바꾼다. Tabs, Collapse, Tooltip도 대체하므로 키보드 탐색, 탭 선택/포커스, 가로 이동, 접기 상태와 tooltip 동작을 다시 설계해야 한다. 전역 스타일 재현 결과 MUI 유지 비용이 크거나 사용자가 전체 제거를 선택하면 채택한다. 아이콘 교체만으로 스타일 잔류가 해결된다고 가정하지 않는다.

`@mui/icons-material` 의존성 제거는 전체 사용처를 다시 검색한 후 결정한다. 현재 검색 범위에서 직접 사용처는 viewer뿐이므로 교체 후 정리 후보지만, 이번 문서 단계에서는 `package.json`/lockfile을 수정하지 않는다. `@mui/material`/Emotion 의존성은 기본안에서 유지하며 대안 채택 시에만 별도로 정리한다.

### 4.4 다크·라이트 테마 적용

테마의 단일 기준은 기존 `useTheme` 및 `html[data-theme]`다. viewer 전용 설정·localStorage 키·독립 모드 토글은 만들지 않는다. 공통 상단 토글로 전환하고 저장된 회원 테마를 그대로 따른다.

| 영역 | 적용 방향 |
| --- | --- |
| viewer 바탕·본문 카드·사이드바·헤더·탭 | `--canvas`, `--surface`, `--ink`, `--muted`, `--line` 사용 |
| 선택 문서·선택 탭·모드 버튼·hover | `--primary`, `--primary-soft`와 모드별 보조 토큰 사용 |
| 검색창·placeholder·저장/복사 버튼 | MUI palette 및 로컬 스타일 일치, disabled/focus 포함 |
| Markdown 제목·문단·링크·인용·구분선 | 고정된 라이트 색상을 의미별 토큰으로 교체 |
| 표 헤더·셀·짝수 행·hover | 전역 다크 표 규칙과 경합하지 않도록 로컬 범위에서 명시 |
| inline code·코드 블록·원문 textarea | 각 모드에서 읽을 수 있는 배경/전경/테두리 쌍 지정 |
| 위험도 A/B/C/D·X 및 S/M/L/XL | 등급 매핑은 유지하고 모드별 전경/배경을 함께 조정 |
| 빈 화면·검색 결과 없음·저장 안내·tooltip | 상태 문구와 아이콘이 모두 테마를 따르게 함 |
| 목차 | 고정된 밝은 녹색 `#14e05b`를 테마에 맞는 색상으로 교체 |

추가 토큰이 필요하면 `.viewer`에 `--viewer-*`로 정의하고 `:global([data-theme="dark"]) .viewer` 같은 제한된 규칙에서만 덮어쓴다. 전역 테마 토큰을 viewer에서 재정의하지 않는다. 코드/위험도 색상은 일반 글자 대비 4.5:1을 목표로 검증하고, 위험도는 텍스트 값도 그대로 유지해 색만으로 의미를 전달하지 않게 한다. 이미지 자체의 색상은 반전하지 않는다.

원문 편집기는 현재 두 모드 모두 어두운 배경값을 가지며 `styles/viewer.css`의 textarea 배경 규칙과도 경합한다. 기본 제안은 두 테마에 맞춰 편집기 배경·글자색도 함께 바꾸는 것이다. 미리보기 글자 크기와 제목 계층은 현재 읽기 중심 구성을 유지하고, 전체 12px 강제 적용은 하지 않는다.

### 4.5 높이·스크롤·반응형

- 공통 워크스페이스 셸 안에 포함된 화면이라는 전제를 유지한다. 독립 전체 화면 레이아웃으로 이동하는 변경은 기본안에 없다.
- `height/min-height:100vh` 중첩을 해소하고 viewer 컨테이너가 사용할 수 있는 실제 높이를 기준으로 한다. 셸 상단바·여백·푸터를 고정 숫자로 여러 곳에 복제하지 않는다.
- 내부 스크롤을 유지할지 문서 스크롤을 사용할지 결정한 뒤 main, sticky 탭/헤더, 목차, `scroll-margin-top`의 기준을 함께 맞춘다. 기존 `mainRef.scrollTo` 동작도 같은 스크롤 컨테이너를 가리켜야 한다.
- 현재 1000px 이하 목차 숨김, 720px 이하 문서 트리 상단 배치를 기본으로 유지한다. 원문·긴 표·긴 파일명·많은 탭에서 가로 넘침과 헤더 액션 줄바꿈을 확인한다.
- viewer 내부가 공통 main 안에서 다시 `<main>`을 출력하는 구조도 검토한다. 지역 콘텐츠를 section/div로 정리하더라도 스크롤 ref와 접근성 레이블은 유지한다.

## 5. 변경 대상 파일과 영향 범위

모든 경로는 `hams-matrix/` 기준이다. 아래는 향후 구현 대상이며 이번 단계의 수정 내역이 아니다.

| 구분 | 파일 | 예정 변경/확인 |
| --- | --- | --- |
| 필수 | `app/(workspace)/viewer/page.tsx` | 전역 viewer CSS import·래퍼 정리, 서버 문서 로딩/권한 유지 |
| 필수 | `app/(workspace)/viewer/md/MarkdownViewer.tsx` | lucide 아이콘, 기본 내부 아이콘 override, 접근성, 공통 테마와 로컬 MUI ThemeProvider 연결 |
| 필수 | `app/(workspace)/viewer/md/MarkdownViewer.module.css` | 스타일 책임 통합, 의미별 색상 토큰, 양 테마·상태·스크롤·반응형 정리 |
| 필수 | `styles/viewer.css` | 실사용 규칙을 모듈로 이전하고 사용처가 없으면 삭제 |
| 조건부 | `package.json`, `pnpm-lock.yaml` | 전체 사용처 재검색 후 미사용 아이콘 패키지 제거. MUI UI 전체 제거 시에만 관련 의존성 추가 정리 |
| 조건부 | `components/workspace-shell.tsx`, `styles/workspace-shell.css`, `components/ai/ai-workspace-layout.tsx`, 해당 CSS | viewer 높이 연동에 부모 지원이 필요할 때만 경로 한정으로 검토. 공통 셸 배치 회귀 확인 |
| 원인 확인 시에만 | `app/globals.css`, `styles/themes.css`, `components/preferences-runtime.tsx`, `stores/preferences.ts`, `stores/theme.ts`, `lib/theme.ts` | 실제 공통 규칙/초기화 결함이 재현된 경우만 변경 범위 확대 |
| 참조·회귀 확인 | `app/layout.tsx`, `app/(workspace)/layout.tsx`, `components/theme-toggle.tsx`, `components/icon.tsx` | 테마 초기화·개인 설정·셸 아이콘 유지 여부 확인. 기본안은 변경하지 않음 |
| 별도 과제 | `app/api/markdown/route.ts` (현재 없음) | 저장 기능 구현 여부는 별도 결정. 이번 스타일/아이콘 작업에서 임의로 생성하지 않음 |

서버 문서 수집 알고리즘, Markdown 파서, 문서 링크 해석, 위험도 판별, 인증·권한, API 계약 및 DB 스키마는 변경할 필요가 없다. 원문 저장의 기존 결손은 스타일 개선과 분리한다.

## 6. 구현 순서 제안

1. 같은 회원·같은 테마에서 viewer 방문 전후 현상을 재현하고 변경된 속성/승리한 CSS/테마 상태를 기록한다.
2. viewer의 전역 CSS를 로컬 모듈로 통합하고, 확인된 스타일 잔류 원인을 수정한다.
3. 직접 사용 및 MUI 기본 표시 아이콘을 lucide로 교체하고 레이블·상태·이벤트를 확인한다.
4. 기존 테마와 viewer의 CSS/MUI palette를 연결한다.
5. 결정된 스크롤 정책에 따라 높이·sticky·목차 이동·모바일 배치를 정리한다.
6. 전체 사용처 검색 후 의존성 정리 여부를 결정하고 아래 검증을 수행한다.

원인을 확인하지 않은 상태에서 전역 CSS 로드 순서나 Next.js 설정을 바꿔 현상만 가리는 방식은 피한다. viewer에서 테마 값을 바꿨다가 unmount 시 되돌리는 임시 처리도 필요하지 않다.

## 7. 검증 방법

### 7.1 스타일 잔류 회귀

라이트/다크 각각에서 관리자 설정, 개인 설정, 대시보드 또는 실제 접근 가능한 프로젝트 화면을 대상으로 한다.

1. 대상 페이지를 직접 열어 기준 스크린샷과 computed style을 기록한다.
2. viewer에 진입해 검색·탭 열기·원문 전환을 수행한 뒤 같은 페이지로 이동한다.
3. 메뉴 이동, 뒤로/앞으로, 새로고침을 각각 확인한다.
4. 공통 셸과 대상 페이지의 body/main/sidebar/topbar, 버튼, 입력, 표의 글꼴·크기·행간·배경·색·padding·border·overflow를 비교한다.
5. `html[data-theme]`, 루트 변수, body inline style, 스타일시트 및 Emotion 규칙의 변화와 적용 대상을 확인한다.

판정: 테마를 바꾸지 않은 왕복에서는 대상 페이지의 주요 스타일·높이·스크롤 동작이 기준과 같다. viewer에서 의도적으로 테마를 바꾼 경우에는 변경된 공통 테마가 이동 후에도 정상 유지되어야 한다.

### 7.2 viewer 기능·테마 매트릭스

| 검증 영역 | 시나리오/기대 결과 |
| --- | --- |
| 양 테마 | 저장된 라이트/다크로 최초 진입, 상단 토글 왕복, 다른 페이지 이동 후 유지. MUI 표면·텍스트·tooltip과 CSS 본문이 같은 모드 |
| 문서 트리·검색 | 중첩 폴더 접기/펼치기, 문서 선택, 경로/내용 검색, 검색 결과 없음. 선택·hover·포커스 구분 |
| 탭 | 여러 탭, 긴 파일명, 가로 스크롤, 개별 닫기, 다른 탭 닫기, 마지막 탭 닫기, 키보드 선택/포커스 |
| 아이콘 | 직접 9종과 탭 좌우·안내 아이콘이 lucide로 표시. 닫기·검색·저장·복사 크기/색상·정렬과 레이블 확인 |
| Markdown | h1~h3·목차·중복 제목, 상대 md 링크와 해시 이동, 외부 링크, 표·리스트·인용·inline code·코드 블록·이미지 |
| 위험도 | A/B/C/D/X 및 S/M/L/XL 셀의 값·분류 유지, 양 모드의 전경/배경 대비 |
| 원문·복사 | draft 유지, textarea 입력/선택/포커스, 복사 내용과 완료 안내, 저장 버튼 활성/비활성 |
| 상태 | 빈 docs, 열린 문서 없음, 잘못된 `?document=`, 저장 중/실패 안내 |
| 레이아웃 | 넓은 화면, 1000px/720px 경계와 좁은 모바일, 긴 문서·표·코드, 확대 200%, sticky·목차 스크롤 위치 |
| 권한 | 플랫폼 관리자 접근 유지. 비관리자·미로그인 흐름에 회귀가 없는지 확인 |

저장은 현재 API 구현이 확인되지 않아 성공 검증이 막힐 수 있다. 이 경우 UI 변경 실패와 기존 API 부재를 구분해 기록한다. 렌더링·클릭·비활성·실패 표시를 검증하려고 실제 docs나 DB를 임의로 수정하지 않는다. 저장 성공 통합 검증은 API 범위가 결정된 뒤 격리한 테스트 문서에서 수행한다.

### 7.3 정적·프로덕션 검증

향후 구현 단계에서 프로젝트 스크립트 기준 `pnpm typecheck`, `pnpm lint`, `pnpm build`를 수행한다. 기존 변경으로 발생한 실패와 이번 변경의 실패를 구분한다. 운영 DB 대상 마이그레이션이나 데이터 변경 명령은 필요하지 않다.

- viewer 소스에 `@mui/icons-material` import가 남지 않았는지 검색한다.
- MUI UI를 유지하면 기본 내부 아이콘 override를 렌더링으로 확인한다. 단순 import 검색만으로 완료 판정하지 않는다.
- `.viewer-page` 전역 규칙의 사용처 제거와 모듈의 전역 선택자 범위를 확인한다.
- 개발 실행뿐 아니라 프로덕션 빌드 실행에서 viewer 왕복을 반복해 CSS 순서 차이도 검증한다.
- 필요하면 스타일 회귀를 재현하는 좁은 브라우저 테스트를 추가한다. 아이콘 import나 CSS 선언을 그대로 반복하는 테스트는 추가하지 않는다.

이번 문서 단계에서는 문서 경로·필수 항목·HISTORY 링크·기존 이력 보존과 소스 파일 미변경만 확인한다. 위 런타임/빌드 검증은 아직 수행하지 않았다.

## 8. 결정이 필요한 사항

| 항목 | 제안 기본값 | 결정에 따른 차이 |
| --- | --- | --- |
| MUI 제거 범위 | 아이콘 전체 교체, `@mui/material` 유지 + viewer 로컬 ThemeProvider | UI까지 제거하면 의존성은 줄지만 탭·접기·tooltip 및 접근성 재구현 범위가 커짐 |
| 스타일 잔류의 최종 원인 | 구현 시작 시 computed style로 확정 | 공통 CSS/테마 초기화 결함이면 조건부 대상 파일까지 확대 가능 |
| viewer 높이와 스크롤 | 셸 내부에서 사용 가능한 높이에 맞추고 문서 영역 스크롤 유지 | 문서 전체 스크롤 선택 시 sticky 기준과 목차 이동 코드를 함께 조정 |
| 본문 밀도 | 현재 Markdown 읽기 크기와 제목 계층 유지 | 전체 12px 통일을 원하면 별도 디자인 결정 필요 |
| 원문/코드 배경 | 각 테마에 맞는 배경·글자색 쌍 적용 | 라이트에서도 코드 블록을 어둡게 유지할지는 선택 가능 |
| 다른 탭 닫기 버튼 | 동작 유지, 문구를 “다른 탭 닫기”로 명확화 | 전체 닫기로 변경하려면 별도 동작 요구 확정 필요 |
| 미사용 MUI 아이콘 패키지 | 구현 완료 후 전체 사용처가 없으면 제거 | 다른 변경에서 사용하는 경우 의존성 유지 |
| 현재 저장 API 부재 | 이번 개선과 분리하고 기존 결손으로 기록 | 저장 기능까지 구현하려면 API·파일 쓰기 권한·테스트 문서 범위를 별도 설계 |

문서 검토 시 위 기본값을 수정할 수 있다. 실제 소스 변경은 검토가 끝난 뒤 사용자의 구현 요청을 받은 단계에서 진행한다.
