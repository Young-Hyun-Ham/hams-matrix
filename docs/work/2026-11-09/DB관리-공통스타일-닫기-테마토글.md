# DB 관리 화면 공통 스타일·닫기·테마 토글

- 작성일: 2026-11-09 (한국시간, Asia/Seoul)
- 상태: 구현 및 관련 검증 완료.

## 주요 변경사항

- ERD 테이블 관리와 도메인 메타 관리 화면에 기존 프로젝트 탭의 공통 스타일을 적용했다. 텍스트는 12px, 일반 버튼은 기본 높이 26px, 모바일·터치 환경은 32px 규격을 사용한다.
- 버튼·입력·테이블·제목 스타일을 `components/project-workbench.css`의 같은 규칙으로 관리하도록 선택자를 확장했다. 독립 화면의 별도 제목 크기와 ERD 버튼의 11px 예외를 제거했다.
- 두 화면의 `DB설계로 돌아가기` 링크를 제거하고 새 탭을 닫는 `닫기` 버튼을 추가했다.
- 기존 `ThemeToggle`을 재사용해 라이트/다크 전환 및 개인 테마 설정 저장을 제공한다. 토글의 아이콘 버튼 크기도 공통 규격에 맞췄다.

## 변경 파일

- `components/pages/database/database-tool-page.tsx`: 공통 헤더 닫기·테마 버튼.
- `components/project-workbench.css`: 프로젝트 탭과 독립 DB 화면의 공통 규격.
- `components/pages/database/database-tools.css`: 화면별 크기 예외 제거.
- `scripts/check-database-domains-browser.mjs`: 두 화면의 공통 크기, 돌아가기 제거, 닫기 호출, 테마 전환·저장 검증 추가.
- 본 문서와 `WORK_HISTORY.md`.

## DB 변경 여부

스키마·마이그레이션 변경 없음. 테마 전환은 기존 개인 설정 API를 사용한다. 검증은 임시 DB와 합성 사용자로 수행한다.

## 검증 결과

- 변경 파일 형식 정리 완료.
- `pnpm build`: 통과. 최종 공통 스타일과 헤더의 컴파일·타입 검사 완료.
- 변경 TSX 및 브라우저 검증 스크립트 대상 ESLint, `node --check`, `git diff --check`: 통과.
- `pnpm test:database-domains-browser`: 통과. 두 화면의 12px 텍스트·26px 버튼·테마 아이콘 간격, 돌아가기 링크 제거, 닫기 함수 호출, 라이트/다크 전환과 개인 설정 저장을 확인했다. 기존 메타 등록·수정, ERD 수정·삭제·FK 제한, 미저장 보호, 조회 전용·모바일 동작도 통과했다.

## 미완료 사항

- 미완료 사항 없음.
- 닫기는 기존 독립 편집기와 동일하게 `window.close()`를 사용하며, 브라우저에서 직접 연 탭의 자동 닫기는 브라우저 정책에 따른다.
