# Markdown viewer 스타일 격리·아이콘·테마 개선

- 작성일: 2026-10-29 (Asia/Seoul)
- 기준 문서: [viewer 스타일 격리·아이콘·테마 개선 설계](../../history/2026-10-29/viewer-style-isolate-icon-theme-improvement.md)

## 주요 변경사항

- `next.config.ts`의 Tailwind CSS 로더가 `.module.css`를 일반 CSS로 변환해 viewer의 `sidebar`, `workspace`, `brand` 등의 선택자를 전역으로 출력하고 모듈 클래스 매핑을 비우는 문제를 확인했다. 해당 로더에서 CSS Modules를 제외해 Next.js의 기본 모듈 처리를 사용한다.
- viewer 페이지의 전역 `styles/viewer.css`를 제거하고 실제 필요한 스타일을 `MarkdownViewer.module.css`로 통합했다. 공통 테마 토큰과 viewer 전용 토큰으로 라이트·다크 색상, Markdown 본문·표·위험도·코드·원문 편집기 및 상태 스타일을 조정했다.
- viewer의 MUI 아이콘 직접 사용 9종과 Alert/탭 스크롤의 기본 표시 아이콘을 lucide-react로 교체했다. 공통 테마 상태를 viewer 내부 MUI ThemeProvider에 연결하고 복사·검색·탭 컨트롤의 접근성 이름을 보강했다.
- 공통 셸의 실제 사용 가능 높이에 맞춰 viewer 높이를 측정하고 문서 읽기 영역만 스크롤하게 했다. 내부 `<main>` 중복을 없애고 목차 이동을 읽기 영역에 맞췄다.
- 전체 소스의 사용처가 없어진 `@mui/icons-material` 직접 의존성을 제거하고 lockfile을 정리했다. `@mui/material`은 유지했다.

## 변경 파일

- `next.config.ts`, `package.json`, `pnpm-lock.yaml`
- `app/(workspace)/viewer/page.tsx`, `app/(workspace)/viewer/md/MarkdownViewer.tsx`, `app/(workspace)/viewer/md/MarkdownViewer.module.css`
- 삭제: `styles/viewer.css`
- 검증: `scripts/test-viewer.mjs`
- 기록: 이 문서와 `WORK_HISTORY.md`

## DB 변경 여부

DB 스키마·마이그레이션·운영 데이터 변경 없음. 브라우저 검증은 임시 SQLite와 임시 Markdown 문서만 사용했다.

## 검증 결과

- 변경 전 개발 빌드 출력에서 CSS Module export가 빈 객체이고 `.viewer` 등의 선택자가 전역으로 생성되는 것을 확인했다. 변경 후 프로덕션 CSS에는 해시된 viewer 클래스가 생성되었다. 변경 전 격리 브라우저에서는 일반 설정 화면의 방문 전후 스타일 차이는 재현되지 않았으나 viewer 화면 자체의 레이아웃과 다크 색상 오류를 확인했다.
- `pnpm typecheck` 통과. `pnpm lint` 오류 0건, 기존 `integration-overview.tsx`의 미사용 변수 경고 1건.
- `pnpm install --lockfile-only --offline --ignore-scripts --frozen-lockfile` 통과. 아이콘 패키지 사용처 검색 결과 없음.
- 최종 `pnpm build` 통과. 격리된 개발 서버와 최종 프로덕션 서버의 headless Edge에서 라이트·다크 왕복 후 공통 설정 화면의 측정 스타일이 같았다. 문서 링크, 탭·스크롤 아이콘, 원문 draft, 저장 실패 안내, 브라우저 뒤로/앞으로 및 1440·1000·720·390px 화면 검증 통과.

## 미완료 사항

- 현재 `/api/markdown` 저장 route가 없어 저장 성공은 검증할 수 없다. 기존 API 부재에 대한 별도 구현 범위가 필요하다. 저장 실패 안내와 임시 문서가 변경되지 않음은 확인했다.
