# 제안요청서 AI 생성 히스토리 모달 추가

- 작성일: 2026-11-03 (한국시간)

## 주요 변경사항

- `AI로 제안 요청서 생성` 버튼 바로 옆에 기존 SVG 히스토리 아이콘을 추가했다. 원본 첨부를 해제한 뒤에도 이력 조회가 가능하다.
- 공통 `workspace-dialog admin-detail-dialog` 스타일을 사용하는 모달에 파일명, 상태, 요청/종료 일시, 모델, 요청 범위, 저장 버전, 오류 코드, 요청 ID를 표시한다.
- 빈 이력·조회 오류·로딩 상태와 새로고침, 20건 단위 더 보기를 지원한다. Escape와 닫기 버튼으로 닫을 수 있다.
- 기존 요청별 조회 정책에 맞춰 현재 프로젝트에서 본인이 실행한 요청만 조회한다. 제안요청서와 문서함 READ 권한을 모두 검사하며 내부 저장 키와 원본 입력 JSON은 응답에 포함하지 않는다.
- 조회는 읽기 전용이며, 실행 기한이 지난 진행 중 요청은 화면에 실패/504로 표시한다. 생성 실행 로직과 가드레일 설정은 변경하지 않았다.

## 변경 파일

- `components/pages/rfp/rfp-source.tsx`: 아이콘과 모달 연결.
- `components/pages/rfp/rfp-generation-history.tsx`: 공통 스타일 이력 모달.
- `components/pages/rfp/rfp-page.css`: 이력 카드와 모바일 줄바꿈 스타일.
- `lib/rfp-source-types.ts`: 이력 응답 타입.
- `lib/rfp-generation-history.ts`: 권한 검사, 본인 이력 조회, 커서 페이지 처리.
- `app/api/projects/[projectId]/rfp/generate/route.ts`: GET 이력 조회 추가.
- `scripts/check-rfp-generation-history.mjs`, `scripts/test-rfp-source.mjs`: 실제 라우트·임시 DB 검증과 `--history-only` 실행 옵션.
- `scripts/test-rfp-source-browser.mjs`: 이력 모달 브라우저 검증 추가.
- `WORK_HISTORY.md`: 작업 기록 링크 추가.

## DB 변경 여부

- 스키마 변경과 운영 데이터 변경 없음. 기존 `project_rfp_generation_requests` 기록을 사용한다.
- 자동 검증은 분리된 임시 SQLite와 모의 AI 응답을 사용하며 유료 AI 호출은 수행하지 않는다.

## 검증 결과

- `node scripts/test-rfp-source.mjs --history-only`: 통과. 저장 범위/상태/버전, 비공개 필드 제외, 25건 커서 페이지 연속성, 다른 사용자 격리, 프로젝트 권한, 비로그인 차단 검증.
- `node scripts/test-rfp-source.mjs --scope-only`: 통과. 기존 프롬프트 입력·저장·요청 동일성 및 권한 회귀 검증.
- 변경 TypeScript 파일 ESLint: 통과.
- `pnpm build`: 타입 검사와 프로덕션 빌드 통과.
- `node scripts/test-rfp-source-browser.mjs`: 통과. 빈 이력, 완료 이력의 파일명/요청 범위/저장 버전, Escape 닫기, 첨부 해제 후 이력 유지, 다른 사용자 이력 격리, 모바일 밝은/어두운 테마의 공통 스타일과 가로 넘침을 검증했다. 기존 업로드·AI 저장·문서함 연결·읽기 전용 권한 검증도 통과했다.

## 미완료 사항

- 없음. 이력은 본인 요청 조회 범위이며, 과거 저장 버전 복원 기능은 이번 작업 범위에 포함하지 않는다.
