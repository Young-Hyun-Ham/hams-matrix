# Viewer MUI 제거 및 화면 여백 수정

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: viewer의 MUI 컴포넌트와 테마 제공자를 기본 HTML 요소 및 CSS 모듈로 교체했다. 버튼·상태 아이콘은 `lucide-react`를 사용하고, 탭의 키보드 이동, 문서 검색, 원문 편집, 복사 기능을 유지했다. 필요한 아이콘이 모두 lucide에 있어 `components/icon.tsx`에는 SVG를 추가하지 않았다. viewer 경로의 공통 셸 패딩과 최대 폭을 제거하고 viewer 테두리를 없애 화면을 이어 붙였다. 설정 화면 CSS가 라우트 전환 후 패딩을 재적용하는 경우도 막았다.
- 변경 파일: `app/(workspace)/viewer/md/MarkdownViewer.tsx`, `app/(workspace)/viewer/md/MarkdownViewer.module.css`, `components/workspace-shell.tsx`, `styles/workspace-shell.css`, `package.json`, `pnpm-lock.yaml`, `scripts/test-viewer.mjs`, 이 문서.
- DB 변경 여부: 없음.
- 검증 결과: TypeScript 검사와 수정 파일 ESLint 검사 통과. 프로덕션 빌드 통과. 잠금 파일의 MUI/Emotion 직접·간접 항목 제거 후 오프라인 고정 잠금 파일 검사 통과. 격리된 임시 DB·문서를 이용한 브라우저 회귀 검사 통과(라이트·다크 모드, 라우트 복귀 후 스타일, 검색, 탭, 원문 편집, 1440/1000/720/390px). 브라우저에서 viewer와 `main`의 경계가 일치하고 패딩이 `0px`임을 확인했다.
- 미완료 사항: 없음.

## 후속 수정 (2026-10-29)

- 좌측 문서 헤더에서 문서 수 배지를 오른쪽 끝으로 정렬했다.
- viewer 본문 글자와 제목, 목록 아이콘, 검색창, 버튼, 탭 높이와 간격을 공통 화면의 작은 크기에 맞췄다.
- 변경 파일: `app/(workspace)/viewer/md/MarkdownViewer.module.css`. DB 변경 없음.
- 검증: 격리된 브라우저 회귀 검사 통과. 라이트·다크 모드, 탭·검색·원문 편집, 1440/1000/720/390px 화면을 확인했다.

## AI 가드레일 차단 문구 입력 UI 개선

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 여러 줄 텍스트 입력을 문구별 칩 목록으로 변경했다. 단일 입력란에서 Enter 또는 입력 버튼으로 문구를 등록하고, 개별 삭제 버튼과 검색 필터를 제공한다. 공통 관리자 화면의 색상 토큰·입력·버튼 크기를 사용한다. 쉼표는 분리하지 않고 문구의 일부로 보관한다.
- 저장 방식: UI는 `blockedTerms: string[]`를 그대로 정책 상태에 반영한다. 기존 초안 저장·게시 API가 해당 배열을 JSON 객체 안에 직렬화하므로 DB 스키마와 저장 API 변경은 없다. 기존 문구도 배열 항목별로 표시한다.
- 변경 파일: `components/admin/blocked-terms-editor.tsx`, `components/admin/guardrail-admin.tsx`, `components/admin/guardrail-admin.css`, `scripts/test-admin-compact.mjs`, `docs/work/2026-10-29/simple-work.md`, `HISTORY.md`.
- DB 변경 여부: 없음.
- 검증 결과: TypeScript·ESLint·프로덕션 빌드 통과. 격리된 DB·브라우저 검사(`node scripts/test-admin-compact.mjs --guardrail-only`)에서 Enter·버튼 등록, 검색·삭제, 쉼표를 포함한 단일 문구의 초안·게시 JSON 배열 저장, 1440/1024/768/390px 배치를 확인했다.
- 미완료 사항: 기존 관리자 전체 회귀 검사에는 개인 설정 버튼 높이를 42px로 기대하지만 현재 실제 값은 26px인 별도 불일치가 남아 있다. 차단 문구 전용 검사는 통과했다.

## AI 가드레일 차단 문구 목록 사용성 개선

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 차단 문구 한도를 UI와 서버 검증에서 50개에서 1000개로 늘렸다. 검색 input의 내부 테두리와 포커스 outline을 제거해 바깥 검색창에만 포커스 표시가 남는다. 차단 문구 목록은 칩 세 줄 높이(111px)로 고정하고 초과 항목은 세로 스크롤한다. 최대 변경 건수 위 구분선은 공통 `--line` 색상을 사용한다.
- 변경 파일: `components/admin/blocked-terms-editor.tsx`, `components/admin/guardrail-admin.css`, `lib/ai/guardrail-policy.ts`, `scripts/test-admin-compact.mjs`, 이 문서, `HISTORY.md`.
- DB 변경 여부: 없음. 기존 정책 JSON의 `blockedTerms` 배열 구조를 유지한다.
- 검증 결과: TypeScript·ESLint·프로덕션 빌드 통과. 격리된 브라우저·DB 검사에서 1000개 저장, 1001개 거절, 세 줄 스크롤, 검색 input 단일 포커스 표시, 라이트·다크 구분선과 1440/1024/768/390px 배치를 확인했다.
- 미완료 사항: 없음.

## AI 가드레일 허용 외부 도메인 편집기 개선

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 허용 외부 도메인 textarea를 등록 입력창, 입력 버튼, 개별 삭제 버튼이 있는 칩 목록으로 교체했다. Enter와 버튼으로 등록하며 중복과 형식을 검사하고 소문자로 정규화한다. 검색창은 두지 않았고 도메인 목록의 시작 위치와 높이를 왼쪽 사용자 지정 차단 문구 목록에 맞췄다. 기존 정책의 `allowedDomains: string[]` 저장 방식을 유지한다.
- 변경 파일: `components/admin/allowed-domains-editor.tsx`, `components/admin/guardrail-admin.tsx`, `components/admin/guardrail-admin.css`, `scripts/test-admin-compact.mjs`, `docs/work/2026-10-29/simple-work.md`, `HISTORY.md`.
- DB 변경 여부: 없음.
- 검증 결과: `pnpm typecheck`, 변경 컴포넌트 ESLint, `pnpm build`, `node scripts/test-admin-compact.mjs --guardrail-only` 통과. 분리 DB와 브라우저에서 도메인 등록·삭제, 초안·게시 JSON 배열 저장, 양쪽 목록 정렬, 반응형 화면을 확인했다.
- 미완료 사항: 없음.

### 후속 수정: 허용 외부 도메인 검색

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 허용 외부 도메인 편집기에 등록된 도메인 검색 입력란을 추가했다. 검색은 대소문자를 구분하지 않고 목록만 필터링하며, 검색 결과에서 삭제해도 원본 배열의 해당 도메인만 제거한다. 검색 결과 건수와 전체 등록 건수를 표시한다.
- 변경 파일: `components/admin/allowed-domains-editor.tsx`, `components/admin/guardrail-admin.css`, `scripts/test-admin-compact.mjs`, `docs/work/2026-10-29/simple-work.md`.
- DB 변경 여부: 없음.
- 검증 결과: TypeScript·ESLint·프로덕션 빌드 통과. 격리 브라우저·DB 검사에서 검색 필터, 검색 결과에서 삭제, 초안·게시 저장 및 목록 정렬을 확인했다.
- 미완료 사항: 없음.

## 글로벌 규제 준수 베이스라인 및 관리자 탭

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: EU AI Act 제14조, GDPR 제22조, NIST AI RMF, OWASP Agentic Applications 기준과 제품 통제를 `docs/AI_GUARDRAILS.md`에 정리했다. 관리자 AI 가드레일 화면에 규약 탭과 샘플 체크 버튼을 추가했다. 별도 서버 모듈에서 명시적인 인간 검토 우회 자동결정 요청과 신뢰하지 않는 자료의 권한 우회 지시를 검사한다. 정책 테스트와 실제 AI Chatbot 경로가 같은 규칙을 사용한다.
- 변경 파일: `docs/AI_GUARDRAILS.md`, `lib/ai/global-compliance.ts`, `lib/ai/guardrails.ts`, `components/admin/global-compliance-panel.tsx`, `components/admin/guardrail-admin.tsx`, `components/admin/guardrail-admin.css`, `scripts/check-ai-guardrails.mjs`, `scripts/test-admin-compact.mjs`, `docs/work/2026-10-29/simple-work.md`, `HISTORY.md`.
- DB 변경 여부: 없음. 기존 검사 이벤트에 규칙 ID와 판정을 기록한다.
- 검증 결과: TypeScript, ESLint, 프로덕션 빌드, `pnpm test:ai`, 관리자 격리 브라우저 검사 통과. 감시 모드·선택 검사 해제 상태의 차단, 일반 요청 허용, 실제 AI 요청 차단, 규약 탭과 샘플 이동을 확인했다.
- 미완료 사항: 없음. 법령 적용 판단과 조직 승인·RACI·감사 운영 절차는 수동 검토 대상이다.

## 요금제 할인 가격 및 가격표 표시 개선

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 요금제 화면의 월간·년간 표시 금액을 두 배 크기로 확대했다. 관리자 요금제 설정에 월간·연간 할인 가격 입력란을 추가하고, 할인 가격이 있으면 선택된 기간의 할인가를 강조하고 기존 가격에는 취소선을 표시한다. 할인가는 기존 가격보다 낮은 0 이상의 정수만 허용한다.
- 변경 파일: `db/migrations/024_plan_discount_prices.sql`, `lib/plan-types.ts`, `lib/plans.ts`, `lib/admin-history.ts`, `app/api/admin/plans/route.ts`, `components/admin/plan-admin.tsx`, `components/subscription-plans.tsx`, `components/subscription-plans.module.css`, `scripts/test-accounts-plans.mjs`, `docs/work/2026-10-29/simple-work.md`, `HISTORY.md`.
- DB 변경 여부: 있음. `plans`에 `monthly_discount_price`, `yearly_discount_price` nullable 컬럼을 추가하는 마이그레이션을 작성했다. 기존 요금제의 할인가는 `NULL`로 유지된다. 운영 DB에는 마이그레이션을 아직 실행하지 않았다.
- 검증 결과: TypeScript·ESLint·프로덕션 빌드 통과. 임시 DB 통합 테스트에서 마이그레이션, 할인가 저장, 기존 가격 이상 할인 거절, 기존 요금제 동작을 확인했다.
- 미완료 사항: 배포 시 운영 DB에 `pnpm db:migrate` 적용 필요.

### 요금제 페이지 렌더링 및 NaN 경고 수정

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: `/settings/subscription`의 인증·DB 조회를 `Suspense` 경계 안으로 이동해 Next.js 동적 데이터 프리렌더링 오류를 해결했다. 요금제 DB 값이 없는 경우 `null`로 변환하고, 관리자 숫자 입력에는 유한한 숫자만 `defaultValue`로 전달해 `NaN` 경고를 방지한다.
- 변경 파일: `app/(workspace)/settings/subscription/page.tsx`, `lib/plans.ts`, `components/admin/plan-admin.tsx`, `docs/work/2026-10-29/simple-work.md`.
- DB 변경 여부: 연결된 DB에는 할인 컬럼과 제약조건이 이미 적용되어 있었다. 누락된 `024_plan_discount_prices.sql` 적용 이력만 기록했다. 요금제 데이터는 변경하지 않았다.
- 검증 결과: TypeScript·ESLint·프로덕션 빌드·분리 DB 요금제 통합 테스트 통과. 연결된 DB의 컬럼·제약조건과 마이그레이션 이력도 확인했다.
- 미완료 사항: 없음.

### 요금제 카드 태그 및 할인율 배치

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 모든 요금제 카드에 같은 높이의 태그 영역을 두어 추천 태그가 있는 Plus와 다른 카드의 이름·가격 시작 위치를 맞췄다. 현재 선택한 월간·년간 가격에 할인 가격이 있으면 할인 태그를 표시하고, `(기존 가격-할인 가격)/기존 가격`을 반올림한 할인율을 요금제 이름 옆에 빨간색으로 표시한다.
- 변경 파일: `components/subscription-plans.tsx`, `components/subscription-plans.module.css`, `docs/work/2026-10-29/simple-work.md`.
- DB 변경 여부: 없음.
- 검증 결과: TypeScript·ESLint·프로덕션 빌드 통과.
- 미완료 사항: 없음.

### 요금제 제목의 현재 플랜 배지 수정

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: 제목 안에 중첩된 블록 요소를 제거하고 현재 플랜 이름을 공통 배지로 요금제 제목 옆에 배치했다. 제목과 배지의 정렬·간격을 전용 스타일로 설정했다.
- 변경 파일: `components/subscription-plans.tsx`, `components/subscription-plans.module.css`, `docs/work/2026-10-29/simple-work.md`.
- DB 변경 여부: 없음.
- 검증 결과: TypeScript·ESLint 통과.
- 미완료 사항: 없음.

## WBS 일정 차트 스타일 통합

- 작성일: 2026-10-29 (Asia/Seoul)
- 주요 변경사항: WBS 차트가 사용하던 독립 유틸리티 클래스에 차트 범위 전용 CSS를 추가했다. 프로젝트의 `--surface`, `--canvas`, `--ink`, `--muted`, `--line`, `--primary` 변수를 사용해 라이트·다크 테마에 맞추고, 표·타임라인·입력·버튼·스크롤 영역의 배치를 복원했다. 차트 높이를 작업 공간에 맞추고 좁은 화면은 차트 내부에서 가로 스크롤한다.
- 변경 파일: `components/pages/wbs/wbs-schedule-chart.jsx`, `components/pages/wbs/wbs-schedule-chart.css`, `docs/work/2026-10-29/simple-work.md`.
- DB 변경 여부: 없음.
- 검증 결과: TypeScript·프로덕션 빌드 통과. ESLint는 기존 차트의 `useEffect` 내부 즉시 `setTasks` 호출에서 실패했으며 스타일 변경과 무관하다.
- 미완료 사항: 기존 차트 상태 계산 로직의 ESLint 경고는 별도 개선 대상이다.
