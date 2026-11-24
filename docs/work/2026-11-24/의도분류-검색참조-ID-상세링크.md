# 의도분류 검색 참조 ID 상세 링크

- 작성일: 2026-11-24 (한국시간, Asia/Seoul)
- 상태: 구현 및 관련 검증 완료.

## 주요 변경사항

- 의도분류 상세의 자료 ID·청크 ID에 링크를 적용했다. 클릭하면 공통 대화상자 형태의 읽기 전용 검색 참조 상세창이 열린다.
- 자료 ID는 현재 원본 정보, 청크 ID는 검색 당시 저장된 청크 영역에 포커스를 둔다. 현재 원본과 기록 당시 버전을 구분하며 변경된 버전을 안내한다. 원본 작업 화면도 별도 탭으로 열 수 있다.
- 참조 선택을 URL의 `reference`·`referencePart`에 보존하여 직접 링크와 새 탭 열기를 지원한다. 닫기/Escape 후 기존 검색 조건·목록·선택 이벤트를 유지한다.
- 조회 API는 현재 owner 권한과 이력의 workspace/project 범위를 확인한 뒤 이력에 실제 등록된 참조 인덱스만 조회한다. 임의 자료 ID·청크 ID를 입력받아 조회하지 않는다.
- 기존 RAG 자료 수집기의 현재 원본·탭 READ 검사를 재사용한다. 현재 원본이 삭제되었거나 접근 불가하면 과거 청크 본문도 반환하지 않는다. 청크는 기록 당시 검색본·자료 유형·자료 ID·버전·청크 ID가 모두 일치할 때만 반환한다.
- 저장된 링크는 신뢰하지 않으며 현재 자료 수집기가 만든 내부 작업 화면 주소만 사용한다. 개인 대화·질문·키·암호문·파일 저장소 키와 임베딩은 응답에 추가하지 않는다.
- 기존 프로젝트/제안요청서/산출물/연결/폴더/파일/화면설계/도메인/출처 snapshot을 수집하는 경로를 사용하며 파일을 새로 내려받거나 AI를 호출하지 않는다. 파일의 현재 정보는 메타데이터, 당시 검색 내용은 저장된 청크로 확인한다.

## 변경 파일

- `components/ai/intent-classifications-page.tsx`: ID 링크·참조 선택 URL·상세창 연결.
- `components/ai/intent-reference-dialog.tsx`: 참조 조회·로딩/오류·원본/청크 읽기 전용 화면·초점/닫기.
- `styles/pages/projects/intent-classifications/intent-classifications.css`: 링크와 반응형 상세창 스타일.
- `lib/ai/intent-classifications.ts`, `lib/ai/intent-classification-types.ts`: 참조 상세 조회와 최소 DTO.
- `app/api/projects/[projectId]/intent-classifications/[eventId]/references/[referenceIndex]/route.ts`: owner 전용 GET, `private, no-store`.
- `scripts/test-intent-classifications.mjs`, `scripts/intent-classifications-browser.mjs`: 참조 격리·누락·삭제·버전·링크·청크·직접 진입·닫기 검증.
- `README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md`, 이 작업 기록.

## DB 변경 여부

- 구성 DB 스키마·데이터·마이그레이션 변경 없음. 기존 분류 이력과 RAG 원본/청크 테이블을 읽기 전용으로 사용한다.
- 테스트 데이터는 기존 임시 SQLite·합성 계정에만 추가한다. 구성 DB 대상 변경 명령은 실행하지 않는다.

## 검증 결과

- 통과: `pnpm test:intent-classifications` — 기존 API/권한/KST/커서 회귀와 참조 상세, 현재/당시 버전 구분, 삭제 원본 차단, 자료/버전별 청크 격리, 다른 프로젝트·non-owner 거부.
- 통과: 최종 보완본의 `pnpm test:intent-classifications` — 검색본 불일치·등록되지 않은 인덱스·삭제 원본·다른 자료/버전 청크 차단, 저장된 임의 링크 무시 및 민감 메타데이터 미노출 포함.
- 통과: `pnpm build` 및 빌드의 TypeScript 검사, 변경 파일 ESLint.
- 통과: `pnpm test:intent-classifications-browser` — 자료/청크 ID 링크·각 영역 포커스, 현재/당시 버전 구분, 삭제 안내·본문 숨김, 참조 URL 직접 진입, 닫기/Escape·기존 조건 보존, 320px 상세창 및 기존 콘솔·새창·권한 회귀.
- 통과: 수정 문서의 이력 링크가 각각 1건이며 기존 목록을 보존했는지 확인했다. 수정한 추적 파일의 `git diff --check`도 통과했다.

## 미완료 및 재개 정보

- 요청 범위의 미완료 사항 없음. DB 적용 작업 없음.
- 원본/청크가 삭제·정리되었거나 현재 권한으로 접근할 수 없으면 안내만 제공하며 과거 본문을 복원하지 않는다.
