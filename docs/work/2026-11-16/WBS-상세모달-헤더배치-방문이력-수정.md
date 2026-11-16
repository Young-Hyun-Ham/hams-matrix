# WBS 상세 모달 헤더 배치·방문 이력 수정

작성일: 2026-11-16 (한국시간)

## 주요 변경사항
- 상세 모달 헤더 오른쪽에 수정·닫기 버튼을 하나의 묶음으로 배치한다. 수정은 닫기의 바로 왼쪽이며 이전·다음 이동 버튼은 헤더 왼쪽을 유지한다.
- 기존에는 상세 모달을 닫거나 목록에서 다른 문서를 열 때 방문 이력을 초기화하여 이전·다음 이동이 불가능했다. 닫기와 방문 이력 초기화를 분리하고 목록에서 여는 문서도 방문 기록에 추가하도록 변경했다.
- 같은 문서를 다시 열면 중복 방문 기록을 만들지 않는다. 이전으로 돌아간 뒤 다른 문서를 방문하면 기존 이후 기록을 새 방문으로 대체한다.
- 방문 기록을 workspace와 프로젝트로 구분한다. 다른 범위의 문서는 현재 상세 모달과 이동 버튼에 표시하지 않는다.
- 첫 방문 시 이전 버튼, 방문 기록의 마지막에서는 다음 버튼이 비활성화된다. 이 버튼은 방문 이력 이동이며 WBS 정렬 순서상 이웃 항목 이동은 아니다.
- 공통 상세 모달을 수정하므로 다른 산출물과 출처 문서 상세에도 같은 배치와 기록 처리가 적용된다. 기존 권한·조회·원문 연결을 유지한다.

## 변경 파일
- components/shared/artifact-detail-dialog.tsx: 수정·닫기 버튼 묶음.
- styles/dialog.css: 상세 모달 헤더 제목의 가변 폭과 오른쪽 버튼 묶음 배치.
- components/shared/use-document-navigation.ts: 닫기 후 방문 기록 유지, 범위 구분, 이동 경계 처리.
- components/project-workbench.tsx: workspace·프로젝트 방문 범위 전달.
- scripts/test-document-navigation.mjs: 닫기/재열기·이전/다음·분기·중복·범위 분리 회귀 테스트.
- scripts/test-artifact-detail-navigation-browser.mjs: 일정 미정 WBS 2건의 목록 진입·버튼 배치·닫기 후 이전/다음 브라우저 검증 추가.
- README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md: 작업 기록 추가.

## DB 변경 여부
- DB 변경 없음. 방문 기록은 현재 브라우저 화면의 메모리에서 관리한다.

## 검증 결과
- node scripts/test-document-navigation.mjs: 통과.
- TypeScript --noEmit 및 변경 소스 ESLint: 통과.
- Next.js 프로덕션 빌드: 통과. 기존 사전 렌더링의 Request failed 로그는 있었으며 종료 코드는 0이다.
- node scripts/test-artifact-detail-navigation-browser.mjs: 통과. 실제 Chrome에서 일정 미정 WBS 2건 표시, 수정·닫기 순서와 오른쪽 배치, 닫기 후 WBS 이전/다음 이동을 확인했다. 기존 출처·분기·모바일·편집·일괄 생성 완료 탐색 회귀 테스트도 통과했다.
- 추가 테스트 파일 ESLint 및 git diff --check: 통과.

## 미완료 사항
- 없음.
