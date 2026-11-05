# 플래닝보드 selectbox 컴포넌트 속성

- 작성일: 2026-11-05 (한국시간)

## 주요 변경사항

- selectbox 요소에 컴포넌트 속성 두 항목을 추가했다: `종류(single/multi)`와 `아이템 라벨`.
- 아이템 라벨은 한 줄에 하나씩 최대 20개를 입력한다. single은 선택 목록으로, multi는 내부 라벨 칩과 우측 화살표로 표시한다.
- multi 칩에 × 버튼을 추가했다. 캔버스에서 클릭하면 해당 아이템과 우측 속성 값이 함께 수정되며 실행 취소할 수 있다. 읽기 전용·잠금 상태에서는 삭제할 수 없다.
- 미리보기도 같은 렌더러를 사용한다. 미리보기의 × 클릭은 미리보기 내 표시만 변경하며 저장 문서를 수정하지 않는다.
- select 종류와 라벨이 문서 저장, 재열기, 프로젝트 템플릿, AI 문서 변환 경로에서 유지되도록 데이터 모델·변환기·AI 스키마를 연결했다. 종류 미지정 시 single로 표시한다.
- 서버 문서 검증에 single/multi 허용 값 검증을 추가했다. 아이템은 기존 `optionItems` JSON 필드를 재사용한다.

## 변경 파일

- `app/(editor)/planning-board/components/types.ts`
- `app/(editor)/planning-board/components/select-element.tsx`
- `app/(editor)/planning-board/components/right-panel.tsx`
- `app/(editor)/planning-board/components/canvas-editor.tsx`
- `app/(editor)/planning-board/components/planning-board-editor.tsx`
- `app/(editor)/planning-board/preview/page.tsx`
- `app/(editor)/planning-board/lib/select-options.ts`
- `app/(editor)/planning-board/lib/document-codec.ts`
- `app/(editor)/planning-board/lib/server/document-validation.ts`
- `app/(editor)/planning-board/lib/server/ai-schema.ts`
- `app/(editor)/planning-board/layout.tsx`
- `app/(editor)/planning-board/styles/select-element.css`
- `scripts/planning-select-browser-checks.mjs`
- `scripts/test-planning-board.mjs`
- `scripts/test-planning-board-browser.mjs`
- 본 문서 및 `WORK_HISTORY.md`

## DB 변경 여부

- 운영 DB·스키마·마이그레이션 변경 없음. 기존 JSON 문서에 속성을 저장한다. 검증은 임시 DB를 사용했다.

## 검증 결과

- `pnpm typecheck`: 통과.
- 변경 TS/TSX 파일 ESLint: 오류·경고 없이 통과.
- `pnpm test:planning-board`: 통과. multi 속성·라벨 변환 및 저장 복원, 잘못된 종류 거부와 기존 문서 허용, 기존 API·템플릿·내보내기 검증 포함.
- `pnpm build`: 통과. 기존과 같은 정적 생성 중 `Request failed Error` 로그 5회가 있으나 정상 종료했다.
- `pnpm test:planning-board-browser`: 최종 통과. 속성 두 항목, single/multi 전환, 여러 줄 라벨, 실제 마우스 × 클릭과 라벨 설정 동기화, 삭제 단독 실행 취소, 저장 후 미리보기 복원·미리보기 내 제거, 읽기 전용 재열기와 삭제 비활성화를 확인했다. 기존 캔버스·템플릿·권한·세션·미리보기 검증도 통과했다.
- 첫 브라우저 검증에서 빠른 연속 편집 후 칩 삭제가 앞선 편집과 같은 실행 취소 묶음으로 처리되는 것을 발견했다. 기존 캔버스 변경 기록 함수를 사용해 삭제를 독립 작업으로 기록하도록 수정한 뒤 빌드와 해당 파일 린트 및 브라우저 검증을 다시 통과했다.
- 미리보기 검사에서는 썸네일과 본문이 같은 요소를 렌더링하므로 검사 범위를 본문으로 한정했다.
- 검증 자료: `C:\Users\9025014\AppData\Local\Temp\matrix-planning-board-browser-cPLvZf` (`planning-select-multi-light.png`, `planning-select-multi-dark.png`, `planning-preview.png`).

## 미완료 사항

- 없음.
