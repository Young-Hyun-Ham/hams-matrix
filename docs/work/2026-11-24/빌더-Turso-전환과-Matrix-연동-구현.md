# 빌더 Turso 전환 및 Matrix 연동 구현

- 작성일: 2026-11-24 (한국시간)
- 기준: [최신 설계](../../history/2026-11-24/빌더-이식오류-점검과-Matrix-연동-설계.md)를 다시 읽고 구현했다.
- 상태: 구현 완료. 기능 검증을 수행했으며 전체 빌드·타입·린트의 제한 사항은 아래에 기록했다.

## 주요 변경

- Firebase/FastAPI 저장 계층을 Matrix API → 빌더 서버 서비스 → 기존 Turso 연결의 SQL CRUD로 전환했다. 브라우저에 DB 연결 정보나 BAPS 토큰을 전달하지 않는다.
- 시나리오·버전·배포 지정 이력·폼·템플릿·개인 빌더 설정을 추가했다. revision 충돌, workspace 범위, 쓰기 중 권한 재확인, 불변 이력, 논리 삭제·다건 삭제 rollback과 감사 기록을 구현했다.
- Orkes 모드·import·UI를 제거하고 일반 Flow에서도 필요한 연결선 생성 함수를 빌더 유틸로 분리했다.
- 필요한 BAPS 공통 UI·모달·유틸·활성 시뮬레이터를 `app/(builder)` 안에 복사하고 의존성을 정리했다. 기존 Matrix AI 대화방과 시뮬레이터 실행 메모리를 분리했다.
- 실제 URL과 시나리오 ID를 연결하고 인증·초기화 경계, 미선택/권한 오류 안내, 사용자 범위 변경 시 상태 정리를 추가했다.
- 그래프의 메모·캔버스 메모를 보존하고 상세 편집의 미저장 변경 확인을 추가했다. 시뮬레이터 종료·초기화 시 실행을 취소하며 API 응답 매핑·빈 응답·HTTP 오류를 처리한다.
- 기존 개인 설정의 라이트·다크와 MUI/빌더 토큰·모달·시뮬레이터를 연결했다. MUI 9에서 제거된 스타일 props와 slots도 수정했다.
- 의존성 설치, Firebase 자료 이전, 기존 Matrix 산출물 스키마 변경은 하지 않았다. 기존 package.json·lockfile·PROMPT 변경을 보존한다.

## 변경 파일

| 파일/영역 | 내용 |
| --- | --- |
| `db/migrations/053_builder_storage.sql` | 신규 6개 테이블·FK·인덱스·불변 트리거 |
| `app/api/builder/**/route.ts` | 기능별 시나리오·버전·배포 지정·폼·템플릿·설정 API |
| `app/(builder)/server/{access,repository}.ts` | 접근 검사와 Turso 쿼리·트랜잭션 |
| `app/(builder)/services/{transport,tursoApi,apiClient,backendService}.ts` | scoped Query·전송·호환 DTO, 기존 Firebase/FastAPI 어댑터 제거 |
| `app/(builder)/layout.tsx`, `providers/**`, `styles/**` | 인증·개인 테마·모달·클라이언트 초기화·빌더 셸 |
| `app/(builder)/react-flow/*/{page,ScenarioList,ScenarioFlow,ScenarioView}.tsx` 중 해당 파일 | 서버 route config 경계, 실제 URL·직접 진입, Orkes 제거, 저장·조회 연결 |
| `app/(builder)/form-builder/**` | Turso 폼 저장·목록·불러오기와 revision·부가 설정 보존 |
| `app/(builder)/components/common/**`, `components/emulator/**`, `hooks/**`, `constants/**`, `utils/**` | BAPS 복사본과 빌더 전용 어댑터 |
| 빌더 `components/**`, `store/**`, `types/**` | 내부 import·코어 경로·MUI 9·테마·실패 전파·사용자 설정·상태 정리 |
| `lib/query/keys.ts` | 사용자/workspace별 빌더 Query key |
| `scripts/test-builder*.mjs` | 임시 DB 및 브라우저 회귀 검증 |
| `README.md`, `AGENTS.md`, `CLAUDE.md`, `WORK_HISTORY.md` | 사용·유지보수 기준과 작업 기록 링크 |

## DB 변경

- 구성된 DB에 **053_builder_storage.sql만 선택 적용 완료**했다. 다른 마이그레이션은 실행하지 않았다.
- `builder_scenarios`, `builder_scenario_versions`, `builder_scenario_deployments`, `builder_forms`, `builder_templates`, `builder_user_settings` 6개 테이블과 관련 인덱스·불변 트리거를 생성했다.
- migration 이력과 6개 테이블 존재를 읽기 검증했고 `PRAGMA foreign_key_check` 위반은 0건이었다.
- 폼의 요소 외 데이터 소스·API 매핑 등 전체 정의를 보존하기 위해 `builder_forms.definition_json`도 저장한다.
- 기존 자료를 복사·삭제하지 않았다. 구성 DB에 회귀용 테스트 자료를 넣지 않았다.

## 적용한 기본 정책

- 현재 workspace의 owner/admin 멤버이면서 계정 역할이 master/admin/biz_admin/team_admin인 사용자만 빌더에 접근한다. 프로젝트 역할만으로 빌더 권한을 부여하지 않는다.
- 자료는 workspace 범위다. 프로젝트 귀속·기존 Firebase 자료 이전·영구 삭제는 추가하지 않았다.
- DB의 배포 버전 지정과 외부 런타임 배포를 구분한다. 실제 외부 배포를 수행했다고 표시하지 않는다.
- Agent/Multi/Sub 표시를 보존하고 기존 unit 표기는 Agent 별칭으로 정규화한다. 발행 버전 번호와 작업본 revision은 분리한다.
- 빌더 LLM 실행은 별도 공급자·권한 계약이 확정되지 않아 명시적 미설정 오류로 처리한다. 실제 AI 호출을 임의 연결하지 않는다.

## 검증

| 검사 | 결과 |
| --- | --- |
| 임시 DB/API·repository 및 API 실행 회귀 | 29개 검사 통과: 접근·Origin·CRUD·workspace 격리·409·동시 쓰기·Publish 중복/불변/실패 rollback·복원·배포 지정·다건 삭제 rollback·설정·메모·FK/integrity·API 응답 매핑/오류/취소 |
| 신규 서버/API 및 Query key ESLint | 오류 0개, 경고 0개 |
| 빌더 전체 ESLint | 오류 922개로 실패. 이식 코드와 추가 어댑터의 any, JSX escape, Hook 등 규칙 위반이 남아 있으며 전체 린트 통과로 보고하지 않음 |
| 기존 코어 분기 | `node --test "app/(builder)/core/scenario-core/group-api-routing.test.mjs"` 7개 통과 |
| 타입 검사 | 빌더 오류 0개. 전체 검사는 기존 MarkdownViewer의 react-markdown 누락 및 관련 암시적 any 오류 9개로 실패 |
| 전체 Next build | 기존 `app/(workspace)/viewer/md/MarkdownViewer.tsx`의 react-markdown 미해결로 실패. 의존성 설치 금지에 따라 변경하지 않음 |
| 브라우저 | 임시 DB·합성 계정·Chrome으로 인증·목록·직접 진입·저장/발행 버튼·테마 전환/새로고침·버전·폼·시뮬레이터·권한 차단 검사 15개 통과. 브라우저 런타임 예외 0개 |

검사 시 설치된 선언·실행 파일 읽기에 추가 권한이 필요하여 검사 도구를 해당 권한으로 실행했다. 패키지를 설치·재설치하지 않았다. 비밀번호·API 키·토큰·DB 접속 정보는 이 기록에 포함하지 않는다.

## 남은 작업 및 재개 정보

- 전체 빌더 린트의 규칙 위반은 남아 있다. 후속 정리 시 이식 코드와 신규 어댑터 모두를 대상으로 처리해야 한다.
- 전체 빌드의 기존 react-markdown 누락은 빌더 외 범위다. 임의 의존성 설치나 뷰어 기능 제거로 우회하지 않는다.
- 외부 LLM/런타임 배포·기존 Firebase 자료 이전은 미구현 범위로 유지한다.
- 재개 시 최신 설계와 이 기록을 읽고 `node scripts/test-builder.mjs`, `node scripts/test-builder-browser.mjs` 및 설치된 TypeScript 검사로 확인한다. DB migration 053은 이미 적용했으므로 다른 migration을 일괄 실행하지 않는다.
