# 첨부 문서 일괄 생성 RFP 선택 오류 수정

- 작성일: 2026-11-14 (한국시간)
- 원인: 저장 RFP가 없는 프로젝트에서도 생성 창의 RFP 체크박스가 기본 선택되어 원본 확인 단계에서 400이 발생했다. 시작 전에 sessionStorage에 기록한 요청 ID가 실패 후 남아 다음 조회에서 404가 발생했다.
- 확인: 보고된 프로젝트의 저장 RFP 0건, DOCX 첨부 1건, 보고된 생성 요청 행 없음. 문서 내용과 민감정보는 기록하지 않았다.
- 주요 변경: RFP를 명시적으로 선택하도록 기본 해제하고, 권한과 저장 여부를 확인하여 없는 RFP 선택을 차단한다. 사업계획서 등 첨부 선택 안내와 원본 없는 생성 방지를 추가했다. 시작이 4xx로 거절되면 해당 ID를 정리하고, 네트워크 장애처럼 접수 여부가 불확실하면 복구 ID를 보존한다. 기존의 없는 요청 ID도 조회 후 정리한다. 서버 오류 사유를 생성 창에 표시한다.
- 변경 파일: components/shared/deliverable-generation-dialog.tsx, app/api/projects/[projectId]/deliverable-generations/route.ts, scripts/test-deliverable-generation.mjs, scripts/test-artifact-detail-navigation-browser.mjs, README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md 및 이 기록.
- DB 변경: 없음. 원인 진단 시 설정 DB를 읽기만 했으며, 회귀 테스트는 임시 DB에서 실행한다.
- 검증: 저장 RFP 삭제 상태에서 RFP 혼합 요청의 400 및 첨부 단독 요청의 생성 완료를 포함한 test:deliverable-generation 통과. 타입 검사(tsc --noEmit), 변경 파일 ESLint, 프로덕션 빌드 및 git diff --check 통과. test:artifact-detail-browser 통과: 저장 RFP 없음 안내, RFP 체크박스 비활성/해제, 근거 미선택 시 생성 차단 및 기존 상세 탐색 회귀 확인. 초기 브라우저 검증은 개요 화면에서 표를 기다리는 테스트 조건 때문에 실패하여 화면별 준비 조건을 수정한 뒤 통과했다. 빌드 중 기존 Request failed Error 로그가 출력되지만 빌드는 정상 완료했다.
- 미완료: 실제 사용자 DOCX를 이용한 유료 AI 생성은 실행하지 않음. 문서가 이미지 위주이거나 추출 불가능하면 별도 오류가 발생할 수 있으며 이번 원인과는 별개다.
