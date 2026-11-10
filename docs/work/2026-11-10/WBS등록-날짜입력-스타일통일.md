# WBS 등록 모달 날짜 입력 스타일 통일

- 작성일: 2026-11-10 (한국시간)
- 대상: 프로그램정의 → 개발 WBS 등록 모달의 계획 시작일·계획 종료일·실제 시작일·실제 종료일.

## 주요 변경사항

- WBS 등록·수정의 날짜 입력을 일정 편집에서 사용하는 `WbsDatePicker`로 통일했다. 날짜 표시와 달력 버튼, 선택·선택 해제 방식이 동일해진다.
- 날짜 선택기와 달력 CSS를 차트 전용 파일에서 분리하고 날짜 선택기에서 직접 불러오도록 변경했다. WBS 탭을 먼저 방문하지 않아도 등록 모달에 스타일이 적용된다.
- 달력 버튼의 기본 테두리를 명시하고 날짜 셀 테두리 선택자를 보강해 차트 스타일 로딩 순서에 따른 차이를 방지했다.
- 기존 필드명과 날짜 값, 필수/선택 구분 및 마일스톤 날짜 동기화 로직은 유지했다. 다른 종류 산출물의 날짜 입력은 변경하지 않았다.

## 변경 파일

- `components/artifact-fields.tsx`
- `components/pages/wbs/wbs-date-picker.tsx`
- `components/pages/wbs/wbs-date-picker.css` (신규 공통 스타일)
- `components/pages/wbs/wbs-schedule-chart.css`
- 본 작업 기록과 `WORK_HISTORY.md` 링크.

## DB 변경 여부

- 없음. 스키마·데이터·API 변경 없이 화면 컴포넌트와 스타일만 수정했다.

## 검증 결과

- TypeScript 검사: 통과.
- 변경 TSX 파일 ESLint: 통과.
- `node scripts/test-wbs-view.mjs`: 통과.
- 변경 TSX·공통 CSS의 Prettier 검사: 통과.
- 실제 컴포넌트를 React로 렌더링한 임시 HTML을 헤드리스 Chrome에서 비교: 네 날짜 필드의 크기·글꼴·패딩·아이콘 정렬 일치, 입력 영역 넘침 없음. 달력 최대 너비 320px 및 7열 배치 확인. 운영 DB나 테스트 서버를 사용하지 않았다.
- 기존 작업의 변경사항은 보존했다. 기능 범위 내 미완료 사항 없음.
