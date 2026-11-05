# AI 아키텍처 이미지 생성 공통 모달 스타일 적용

- 작성일: 2026-11-03 (한국시간)
- 주요 변경: 이미지 생성 화면에 `workspace-dialog admin-detail-dialog workspace-form-dialog`를 적용하고 공통 헤더·스크롤 본문·하단 버튼 영역으로 정리했다. 공통 520px 최대 폭, 10px 모서리, 테마 색상과 본문/푸터 스타일을 사용한다. 모델 선택 및 추가 요청 입력은 공통 폼 스타일을 따른다.
- 공통 이미지 생성 컴포넌트이므로 이를 사용하는 WBS 등에도 동일하게 적용된다. 이미지 미리보기·다운로드 화면과 생성 요청 로직은 유지한다. 하단 취소 버튼을 추가했다.
- 변경 파일: `components/shared/ai-image-actions.tsx`, `components/shared/ai-image-actions.css`, `WORK_HISTORY.md`, 본 기록.
- DB 변경: 없음.
- 검증: 전체 TypeScript 및 변경 TSX ESLint 통과. 실제 컴포넌트의 생성 상태 마크업과 CSS를 임시 Chrome 화면에서 렌더링하여 넓은/좁은 창에서 공통 스타일 적용, 헤더·본문·푸터 구성 및 가로 넘침 없음을 확인했다. diff 공백 검사 통과. 외부 이미지 생성 호출은 수행하지 않았다.
- 미완료 사항: 없음.
