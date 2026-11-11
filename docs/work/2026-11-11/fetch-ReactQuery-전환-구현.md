# fetch React Query 전환 및 workspace 시스템설정 구현

- 작성일: 2026-11-11 (한국시간)
- 상태: 요청 범위 구현·DB 적용·관련 검증 완료. 기존 검증 실패와 외부 연동 미검증은 아래에 별도 기록.
- 기준: 최신 [설계 문서](../../history/2026-11-11/fetch-전수조사-ReactQuery-전환-설계.md)를 재독하고 구현했다.

## 주요 변경사항

- workspace별 staleTime·retryCount·HTTP/네트워크 오류 문구를 저장하는 서비스와 구성원 GET·관리자 GET/PATCH, 관리자설정 system 탭 추가. 기본값 60초·추가 재시도 3회, 초↔ms 변환, 입력/본문 크기·버전 충돌·권한·감사 검증 적용.
- 사용자/workspace Query key, 요청별 서버 QueryClient와 브라우저 singleton, SSR hydration, 설정 Runtime·창 간 알림·포커스 재확인 구현. 설정 변경 시 활성 조회 정책과 기존 오류 문구를 갱신한다.
- 공통 사용자·구독·알림·프로젝트, 관리자·팀·문서함·DB·WBS·RFP·이미지·AI 대화 이력·개인 설정·플래닝보드를 Query/IQ·Mutation으로 전환. 쓰기 자동 재시도 금지, Retry-After와 일시적 읽기 실패만 재시도한다.
- 편집 초안·보드 version/screenVersion·expectedVersion·requestId·권한 이벤트·생성 복구 폴링·개인 설정 generation/owner를 보존했다. 보드는 Query 구독과 명령형 호환 어댑터를 사용해 캐시 DTO 수락 시점에만 버전 커서를 갱신한다.
- 바이너리 다운로드·AI 생성 스트림·서버 외부 API 전송 유지. ONLYOFFICE는 명시적 열기 시 갱신하고 포커스/재연결로 세션을 다시 열지 않는다.
- RequestError에 status·code·details·requestId를 보존하고 표시 문구는 현재 공간 설정으로 해석한다. 요금제 409의 새로고침 안내도 유지했다.
- 기존 미커밋 HISTORY.md·PROMPT.md·루트 레이아웃·lockfile 변경 보존. 기존 package.json에 검증 명령을 추가하고 신규 Provider 기반을 보완했다. 패키지 추가/업그레이드 없음.

## 변경 파일

- 설정: `lib/system-settings/*`, `app/api/me/system-settings/route.ts`, `app/api/admin/settings/system/route.ts`, `components/admin/system-settings-admin.tsx`, 메뉴·감사 허용 필드.
- 공통: `lib/query/*`, `components/query/*`, `app/providers.tsx`, 세 인증 레이아웃 및 초기 화면, 도메인 컴포넌트·훅·개인 설정 저장소.
- 검증: 시스템설정 단위/API·fetch AST 감사 스크립트 추가. 기존 브라우저에 설정 UI·오류 재표시 검증 추가. 격리 DB fixture 일부를 현행 workspace 요금제 구조에 정렬.
- README.md·AGENTS.md·CLAUDE.md·WORK_HISTORY.md 갱신. [상세 변경 파일 목록](fetch-ReactQuery-전환-변경파일.md) 참고.

## DB 변경

- `db/migrations/043_workspace_system_settings.sql` 추가 및 **구성된 DB에 043만 적용 완료**. 적용 전 042 확인, schema_migrations 등록 확인.
- workspace FK·범위/정수/JSON/version 제약 적용. 기존 업무 데이터 수정·설정 backfill 없음. GET은 행을 생성하지 않는다. 미등록 version 0, 조회 불가 version null로 저장 차단.
- 회귀 검증은 메모리/임시 SQLite만 사용. 실제 DB에 테스트 계정·업무 데이터를 생성하지 않았으며 민감정보를 기록하지 않았다.

## 검증 결과

- 통과: `test:system-settings`, `test:system-settings-api`, `test:product-administration`, `test:database-domains`, `test:personal-preferences`, `test:personal-preferences-browser`, `test:planning-board`, `test:planning-board-browser`, `test:wbs-schedule`.
- 설정 검증: 권한·공간 격리·Origin·입력·중복 JSON key·UTF-8 128KiB·버전·감사 snapshot, 재시도 0/1/3의 실제 1/2/4회, Retry-After, 같은 scope 재마운트 캐시 보존 포함.
- 보드 브라우저: 편집·저장·템플릿·이미지·내보내기·프리뷰·권한 상실·사용자 전환·미저장 초안 보존. 개인 설정: 즉시 미리보기·저장·복원·소유권 검증.
- fetch AST 조사 통과: 83개 파일·170개 호출, Q/IQ 79·M 41·Q/M 어댑터 19·명령형 I 6·전송 T 17·서버 S 8, 미분류 0. 호출부/전송부 중복을 포함하며 실제 HTTP 건수가 아니다.
- 변경 파일 ESLint 오류 0. 전체 lint는 기존 `scripts/test-wbs-view.mjs` 오류로 실패. 전체 diff check의 기존 `PROMPT.md` 후행 공백은 사용자 변경을 보존했다.
- 최종 `pnpm typecheck`, `pnpm build` 통과. Cache Components·Partial Prefetching 유지. 정적 생성 중 기존 Request failed 로그가 있으나 종료 코드 0.
- 최종 `pnpm test:product-administration-browser --production` 통과: 시스템설정 저장·기본값 초안·재조회, 기존 오류 문구의 실시간 재계산, raw 오류 미노출, 실패 Mutation 1회 유지, master 즉시 플랜 변경·409 새로고침 안내·관리자 범위 격리 확인.
- 공개 번들 130개에서 확인 대상 서버 비밀값 미검출. 변경 파일 lint는 오류 0·기존 openMismatch 미사용 경고 1건. 이번 변경 소스·문서 diff check 통과.
- 개발 브라우저와 빌드의 출력 정리 충돌은 검증 실행 충돌로 분리하고, 프로덕션 빌드 완료 후 브라우저를 순차 실행해 통과했다. 임시 타입 경로는 정리했다.

## 미완료·별도 확인 사항

- `test:rfp-source`: 기존 `lib/ai/rfp-generation.ts`의 input/context/output guard 호출이 주석 처리되어 민감 원문 차단 기대 422 대신 200을 반환한다. 이번 작업에서 해당 서버 파일은 변경하지 않았으며 가드레일 정책 변경은 범위 밖으로 남겼다. WBS는 별도로 통과.
- `test:team-sharing`: 기존 fixture의 legacy admin 역할과 현행 master 권한 규칙 차이로 기대 400 대신 403에서 실패한다. 권한 완화나 업무 API 계약 변경은 수행하지 않았다.
- 외부 AI·ONLYOFFICE·결제 제공자의 실제 자격증명을 이용한 연동 시험은 수행하지 않았다. 기존 전송/권한 계약은 유지한다.
- 043은 이미 적용되어 있으므로 중복 적용하지 않는다. 후속 검증도 격리 DB를 사용하고 기존 검증 실패 원인을 분리해 재개한다.
