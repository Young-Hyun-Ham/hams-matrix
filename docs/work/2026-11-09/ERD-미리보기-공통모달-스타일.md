# ERD 미리보기 공통 모달 스타일 적용

- 작성일: 2026-11-09 (한국시간, Asia/Seoul)

## 주요 변경사항

- ERD 미리보기에 공통 `admin-detail-dialog`, `dialog-header`, `admin-detail-header`, `admin-detail-close`, `admin-detail-body`, `project-registration-footer` 클래스를 적용했다.
- 제목·버튼의 글자 크기, 헤더·본문·하단 여백, 둥근 모서리, 그림자, 다크테마와 본문 스크롤을 기존 공통 모달 규칙으로 통일했다.
- 설명 문구를 본문으로 이동하고 중복된 전용 헤더·본문·하단 스타일과 높이 제한을 제거했다. 이미지용 넓은 폭과 이미지 확대·축소/스크롤 스타일은 유지했다.
- 이미지 재사용·재생성·다운로드 로직은 변경하지 않았다.

## 변경 파일

- `components/pages/database/database-erd-preview.tsx`
- `components/pages/database/database-erd-preview.css`
- 본 문서와 `WORK_HISTORY.md`

## DB 변경 여부

- 없음.

## 검증 결과

- Prettier·변경 컴포넌트 ESLint: 통과.
- 빌드 및 브라우저 검증: 진행 중.

## 미완료 사항

- 빌드·기존 브라우저 검증과 스크린샷 확인 후 결과를 갱신한다.
