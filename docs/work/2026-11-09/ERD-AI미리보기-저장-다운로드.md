# ERD AI 미리보기·배치 저장·이미지 다운로드

- 작성일: 2026-11-09 (한국시간, Asia/Seoul)
- 요청: ERD 캔버스 우측 상단에서 AI로 관계선을 정리한 이미지 미리보기를 열고 저장 결과를 재사용한다. 모달의 다시 생성으로만 갱신하고 이미지를 다운로드한다.
- 상태: 구현·DB 적용 및 최종 빌드·브라우저 통합 검증 완료.

## 주요 변경사항

- ERD 캔버스 제목 우측에 `미리보기` 버튼과 전용 모달을 추가했다. 저장 이미지가 없을 때 최초 생성하며, 저장 이미지가 있으면 AI 호출 없이 그대로 표시한다.
- 원본 테이블·컬럼·PK/UQ/FK를 서버에서 읽고 AI에는 테이블 ID 배치 순서만 제안하게 한다. AI가 명칭이나 관계를 임의로 만들거나 바꿀 수 없도록 원본 ID의 누락·중복·추가를 검증한다.
- [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)의 직각 라우팅과 교차 최소화를 사용한다. 컬럼별 고정 포트, 연결된 테이블 배치, 별도 연결요소 간격, 자기 참조·순환 FK를 지원한다. 두 후보 중 교차가 적은 결과를 선택하고 교차 수가 같으면 면적이 작은 결과를 선택한다.
- 테이블 겹침·테이블 내부를 통과하는 선·대각선 구간을 검사한다. 모든 선의 양 끝점이 실제 참조 컬럼과 FK 컬럼에 연결되는지도 검사한 뒤 PNG를 만든다. 관계별 색과 교차 구분용 흰 테두리를 사용하고 PK/FK 행을 구분한다.
- 정확한 글자와 관계선 보존을 위해 AI의 배치 계획을 검증된 SVG로 직렬화한 후 Sharp로 PNG를 렌더링한다. 테이블 정보를 이미지 모델이 다시 그리도록 하지 않는다. 기존 화면의 반응형 카드 배치는 유지한다.
- 생성된 PNG를 기존 AES-256-GCM 이미지 암호화 유틸리티로 저장하고 배치 좌표·선 경로·AI 순서·원본 해시도 DB에 저장한다. 인증된 이미지 API로만 조회·다운로드한다.
- 저장 후 데이터가 바뀌어도 자동 재생성하지 않는다. 모달에 이전 데이터 안내를 표시하고 `다시 생성` 클릭 시에만 최신 데이터로 교체한다. 실패·동시 요청·버전 충돌·생성 중 권한/데이터 변경 시 기존 이미지를 보존한다.
- 모달에 `이미지 다운로드`, `원본 크기`/`한눈에 보기`, `저장 이미지 다시 불러오기`를 제공한다. 다운로드는 저장된 원본 PNG를 사용하며 AI를 호출하지 않는다.
- 기존 DB설계 READ/UPDATE 권한, origin 검사, 가드레일, AI 토큰 기록과 이미지 생성 한도를 적용한다. 프로젝트별 생성 잠금과 만료, 저장 이미지 ID 비교로 중복·덮어쓰기를 제어한다.

## 변경 파일

| 구분 | 파일 |
| --- | --- |
| 원본 추출·배치·렌더 | `lib/database-erd-layout.ts` |
| AI 계획·암호화·캐시·저장 | `lib/ai/database-erd-images.ts` |
| API | `app/api/projects/[projectId]/database/erd/image/route.ts`, `app/api/projects/[projectId]/database/erd/image/content/route.ts` |
| UI | `components/pages/database/database-erd-preview.tsx`, `components/pages/database/database-erd-preview.css`, `components/pages/database/database-diagram.tsx`, `components/pages/database/database-tool-page.tsx` |
| DB | `db/migrations/039_database_erd_images.sql`, `scripts/apply-database-erd-images.mjs` |
| 의존성·명령 | `package.json`, `pnpm-lock.yaml`: `elkjs@0.9.3`, `test:database-erd-images` 추가 |
| API 검증 | `scripts/check-database-erd-images.mjs`, `scripts/test-database-erd-images.mjs`, `scripts/test-rfp-source.mjs` |
| 브라우저 검증 | `scripts/check-database-domains-browser.mjs`, `scripts/test-navigation-browser.mjs`, `scripts/ai-test-provider.mjs` |
| 기록 | 본 문서, `WORK_HISTORY.md` |

## DB 변경 여부

- **변경 있음.** 연결된 DB에 `039_database_erd_images.sql`만 트랜잭션으로 적용하고 `schema_migrations`에 기록했다. 기존 산출물 건수 보존과 재실행 시 중복 적용 생략을 확인했다.
- `database_erd_images`: 프로젝트별 최신 이미지 1개, 원본 해시·모델·배치 JSON·이미지 크기·생성자/시각·암호화된 PNG 저장.
- `database_erd_image_generations`: 프로젝트별 생성 잠금·요청 토큰·만료 시각 저장.
- 다른 미적용 마이그레이션을 실행하거나 기존 테이블/도메인 내용을 변환하지 않았다. 실제 프로젝트의 유료 AI 이미지 생성은 수행하지 않았다.
- 기존 AI·이미지 암호화 설정의 유효 여부만 확인했으며 키·토큰·접속 정보는 출력하거나 기록하지 않았다.

## 검증 결과

- 비증분 TypeScript 검사: 통과.
- 변경 소스/스크립트 ESLint: 통과.
- `pnpm test:database-erd-images`: 통과. 실제 ELK/Sharp·임시 SQLite·모의 AI로 8개 테이블과 7개 FK(자기 참조·순환·분리된 관계 포함)의 PNG 생성, 원본 컬럼 끝점, 저장·복호화·다운로드, AI 없는 캐시 재사용, 변경 후 기존 이미지 표시, 명시적 재생성, origin/권한/범위, 잠금, 공급자 실패·잘못된 계획·생성 중 데이터 변경 시 기존 이미지 보존을 확인했다.
- 생성된 PNG를 직접 열어 한글·테이블·관계선 배치를 확인했다.
- `pnpm test:database-domains`: 통과. 기존 도메인 CRUD·수동 선택·AI 테이블 생성 회귀 유지.
- `pnpm build`: 최종 소스 기준 통과. Cache Components와 충돌하는 명시적 runtime 선언은 제거하고 기본 Node.js 런타임을 사용했다. 기존 빌드에서도 보이던 정적 사전 렌더의 `Request failed Error` 로그가 있었지만 컴파일·타입·페이지 생성과 종료 코드 0을 확인했다.
- `pnpm test:database-domains-browser`: 최종 실행 통과. 최초 생성·저장 결과 재사용·변경 안내·다시 생성·PNG 다운로드와 기존 반응형 배치·FK·수정/삭제·도메인 선택·조회 전용·모바일·테마 동작을 확인했다. 성공한 미리보기 스크린샷도 직접 확인했다.
- 브라우저 초기 실행의 재생성 단계는 테스트가 별도 SQLite 연결에서 계속 조회하면서 쓰기와 경합해 실패했다. 생성 중 직접 DB 폴링을 제거하고 브라우저 완료 상태를 먼저 확인한 뒤 저장 결과를 검사하도록 바꿔 전체 검증을 통과했다.
- 039 적용 도구 재실행의 중복 적용 생략, 변경 공백 검사와 작업 이력 링크도 확인했다.

## 미완료 사항 및 범위

- 요청한 구현 범위의 미완료 사항 없음.
- 미리보기는 테이블 100개·컬럼 합계 2,000개·FK 400개, 이미지 한 변 16,000px·총 6,400만 픽셀·32MiB까지 지원한다. 초과 시 기존 이미지 보존과 함께 안내한다.
- 임의의 복잡한 그래프에서 교차가 0개라고 보장하지 않으며 교차 최소화·테이블 내부 통과 차단·색/테두리 구분으로 가독성을 높인다. 큰 도표는 한눈에 보기와 원본 크기를 전환해 확인할 수 있다.
- 실제 제공자 모델의 배치 제안 품질은 별도 유료 호출로 측정하지 않았다. 검증에서 AI는 모의 응답이며 배치·렌더·저장·다운로드는 실제 구현을 사용했다.
