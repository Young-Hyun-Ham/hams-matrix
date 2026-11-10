# master 플랜 변경 즉시 반영 구현

- 작성일: 2026-11-10 (한국시간, Asia/Seoul)
- 기준 문서: [master 플랜 변경 즉시 반영 설계](../../history/2026-11-10/master-플랜변경-즉시반영-설계.md)
- 최신 설계 문서를 다시 읽고 8절의 권장 기본안으로 구현했다. 기존 작업 디렉터리의 다른 변경사항은 유지했다.

## 주요 변경사항

- 인증된 `accountRole === 'master'`에 한해 Free·Pro·Team·Business 개인 구독을 기존 PATCH API로 즉시 변경한다. 승인·계약 신청·결제·상품 생성 없이 master 역할을 유지한다.
- 비master의 Team·Business 직접 변경 차단, 인증·Origin·입력·현재 구독/카탈로그 버전 검증, 상품 지원 중 변경 차단을 유지한다.
- 구독·관리 버전·감사 이력을 같은 트랜잭션으로 반영한다. master 변경 로그에 `changeMode: master_direct`, `paymentMode: none`을 기록한다. 동일 플랜은 중복 갱신하지 않는다.
- 동시 변경 검증에서 확인된 SQLite 쓰기 잠금 오류(`SQLITE_BUSY`, `SQLITE_LOCKED`)는 409로 반환하여 새로고침 후 재시도를 안내한다.
- master 요금제 화면은 신청/결제 안내와 폼을 숨기고 확인 모달의 “즉시 변경”으로 확정한다. 성공 후 현재 플랜을 갱신하고 중복 제출 방지는 유지한다.
- 기존 워크스페이스의 플랜·상품 연결은 변경하지 않는다. 개인 구독과 불일치하면 기존 접근 정책과 복구 경로를 따른다. 상품 지원 중인 과거 master 데이터도 자동 분리하지 않는다.

## 변경 파일

- `app/api/me/subscription/route.ts`: master 직접 변경, 감사 출처, 동시 쓰기 충돌 응답.
- `components/subscription-plans.tsx`: master API 분기·안내·확인 모달·신청/결제 영역 표시 조건.
- `scripts/test-subscription-change.mjs`: 이전 일반 사용자 Team 성공 기대값 보정, master 전환·무청구·버전·중복·롤백·충돌·데이터 보존 검증.
- `scripts/test-product-administration.mjs`: 실제 인증 기반 master 전환, 워크스페이스 불일치 및 새 Business 공간 생성/복구 검증.
- `scripts/test-product-administration-browser.mjs`: master 네 플랜 전환·PATCH 호출·중복 클릭·오래된 정보 오류·새로고침 검증.
- 본 작업 기록과 `WORK_HISTORY.md` 링크 추가.

## DB 변경 여부

- 운영 DB의 스키마·데이터 변경 및 마이그레이션 없음. 기존 스키마로 구현 가능하다.
- 테스트만 각 실행에서 분리된 임시 SQLite DB에 기존 마이그레이션과 테스트 데이터를 적용했다. 실제 결제나 외부 알림은 수행하지 않는다.
- 사용자가 기능을 실행하면 해당 master의 구독·관리 버전·감사 이력만 반영한다. 기존 상품·계약·신청·결제·공간 데이터는 자동 변경하지 않는다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| `node scripts/test-subscription-change.mjs` | 통과. 4개 플랜 전환·GET, 권한 위조 차단, 역할 유지, 부수 데이터 미생성, 동일 요청, 감사 실패 롤백, 동시 요청 200/409, 기존 공간·프로젝트·사용량 보존 |
| `node scripts/test-product-administration.mjs` | 통과. 실제 인증 master 직접 전환 및 새 공간 복구, 기존 상품 격리·계약 신청·검증 결제·정원·권한 회귀 |
| `node scripts/test-workspace-plan-policy.mjs` | 통과. 기존 공간 플랜 고정, 정확한 플랜/상품 일치, 권한·쿼터·복구 경로 |
| `pnpm typecheck` | 권한을 조정한 환경에서 재실행하여 통과. 최초 실행은 기존 의존성 파일 읽기 권한 오류 |
| 변경 파일 ESLint | Node 직접 실행으로 오류 0건. 기존 브라우저 스크립트의 미사용 `openMismatch` 경고 1건은 유지. pnpm 실행 래퍼의 EPERM을 우회해 검사 완료 |
| `node scripts/test-product-administration-browser.mjs` | 기능 검증 assertion 전체 통과 및 PASS 출력 확인. master Team·Business·Pro·Free 전환, PATCH 전용 호출, 신청/결제 조회·생성 생략, 중복 클릭 방지, 오래된 정보 오류, 새로고침 및 기존 관리 화면 회귀 확인. 첫 실행의 쿠키 설정 시간 초과는 새 프로필 재시도로 해소. PASS 출력 후 프로세스 종료가 지연되어 해당 테스트 프로세스 트리 3개를 정리했으며, 이 강제 정리로 최종 명령 종료 코드는 1 |
| 변경 파일 `git diff --check` | 통과 |
| 변경 소스·테스트 5개 파일 Prettier 검사 | 통과 |
| 작업 문서·WORK_HISTORY 링크 검사 | 통과. 기준 설계 문서 링크 유효, 신규 작업 링크 1건 |

## 미완료 사항 및 재개 정보

- 기능 구현 범위 내 미완료 사항 없음. 정적 검사·서버/정책 테스트·브라우저 기능 검증을 완료했다. 브라우저 스크립트의 정상 종료 지연은 테스트 실행 환경의 후속 점검 대상으로 남긴다.
- 브라우저 실행 전후 `tsconfig.json`, `next-env.d.ts`, `AGENTS.md`의 SHA-256이 동일함을 확인했다. 지연된 테스트 프로세스는 정리했다.
- DB 이관 작업은 필요하지 않다. 기존 공간의 자동 플랜 전환은 설계 기본안의 범위 밖이다.
- 테스트 재실행 위치는 `hams-matrix`이며 위 검증 스크립트를 사용한다. 운영 DB 연결 정보나 `.env`를 지정하는 DB 변경 명령은 필요하지 않다.
