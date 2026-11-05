# 아키텍처 저장 이미지 표시 및 Mermaid 동기화

- 작성일: 2026-11-03 (한국시간)

## 주요 변경사항

- 아키텍처 구성도 영역에서 저장된 AI 이미지가 있으면 SVG 캔버스를 렌더링하지 않고 이미지를 표시한다. 이미지가 없을 때만 기존 캔버스를 표시한다.
- 최초 진입·아키텍처 선택·버전 변경·이미지 생성 후 최신 메타데이터를 조회한다. 조회 및 이미지 로딩 오류는 재시도로 처리하고, 다른 아키텍처의 이미지를 표시하지 않는다. 이전 버전 이미지에는 재생성 안내를 표시한다.
- AI 이미지 생성 후 생성된 PNG를 이미지 인식 가능한 텍스트 모델에 전달한다. 등록된 구성요소와 연결의 ID 순열 및 읽기 방향(TD/LR/RL/BT)을 받아 서버에서 Mermaid를 직렬화한다.
- 구성요소·기술·연결 방향과 라벨은 등록된 원본을 보존한다. 이미지의 장식·세부 픽셀 배치를 복제하거나 이미지에서 새 구성요소를 임의로 추가하는 기능은 아니다. 구형 데이터는 기존 호환 topology를 사용한다.
- 이미지와 Mermaid를 같은 트랜잭션에서 저장하고 아키텍처 버전을 1 증가시킨다. 이미지의 원본 버전은 갱신된 버전으로 기록하며 변경 이력과 기존 연결을 유지한다.
- 이미지 분석 실패·권한 변경·원본 버전 충돌·저장 실패 시 기존 이미지와 Mermaid를 보존한다. 이미지 생성은 이미 비용이 발생할 수 있으며, Mermaid 분석에는 별도의 AI 토큰 사용량이 기록된다.
- 기존 이미지 재사용은 추가 AI 호출이나 Mermaid 변경 없이 동작한다. 기존 저장 이미지는 즉시 표시되며, Mermaid 자동 동기화는 새 생성/재생성부터 수행한다.
- 생성 응답의 최신 프로젝트 데이터를 화면에 반영하여 Mermaid 탭도 바로 갱신한다. Mermaid를 편집 중이면 이미지 작업 버튼을 비활성화하여 미저장 내용과 충돌하지 않도록 한다.
- 원본 버전·권한·생성 잠금 및 기존 가드레일을 유지한다. 전체 작업 시간 한도를 설정하여 생성 잠금 만료 전 저장 여부를 판단한다.

## 변경 파일

- `components/pages/architecture/architecture-image-surface.tsx`: 저장 이미지 조회·표시·오류 재시도 및 캔버스 분기.
- `components/pages/architecture/architecture-diagram.tsx`: 이미지 표시와 생성 후 프로젝트 상태 갱신.
- `components/pages/architecture/architecture-image-actions.tsx`: 생성 완료/비활성화 콜백 전달.
- `components/pages/architecture/architecture-page.css`: 인라인 이미지 표시 스타일.
- `components/shared/ai-image-actions.tsx`: 선택적 생성 완료 콜백과 외부 비활성화 지원.
- `lib/ai/architecture-images.ts`: 생성 이미지 분석, 원자적 이미지·Mermaid 저장과 버전 갱신.
- `lib/ai/architecture-mermaid.ts`: 이미지 기반 방향·순서 분석과 검증.
- `lib/architecture-mermaid.ts`: 안전한 방향별 Mermaid 직렬화.
- `lib/artifacts.ts`: 이미지 기반 Mermaid 준비 옵션 전달.
- `app/api/projects/[projectId]/artifacts/[artifactId]/image/route.ts`: 변경 이력 처리를 위한 요청 전달.
- `scripts/test-architecture-images.mjs`: 이미지 분석·버전 증가·실패 보존 검증 보강.
- `scripts/test-architecture-surface-browser.mjs`: 실제 화면 전환과 저장 이미지·Mermaid 동기화 검증.
- `scripts/ai-test-provider.mjs`: 브라우저 검증용 이미지·Mermaid 모의 응답.
- `components/pages/architecture/README.md`, `WORK_HISTORY.md`: 동작 및 기록 설명.

## DB 변경 여부

- 스키마 변경 및 운영 DB 직접 수정 없음.
- 기능 실행 시 기존 산출물·이미지·변경 이력 테이블에 같은 트랜잭션으로 저장한다. 검증은 임시 SQLite에서 수행했다.

## 검증 결과

- `node scripts/test-architecture-images.mjs`: 통과. 실제 라우트·권한·암호화·원본 버전·중복 잠금·재사용 및 이미지 분석 실패 시 기존 결과 보존 검증. 새 이미지의 시각 입력 전달, LR Mermaid 저장, 원본 topology 보존과 버전 증가 확인. WBS 이미지 회귀 검증도 통과했다.
- `node scripts/test-architecture-mermaid.mjs`: 통과. 기존 생성·수동 코드 저장·보안 문법·권한·충돌·AI 변경 경로 검증.
- `node scripts/test-architecture-surface-browser.mjs`: 통과. 이미지가 없는 캔버스, 실제 생성 모달, 이미지가 캔버스를 대체하는 동작, LR Mermaid 즉시 갱신 및 렌더링, 미저장 Mermaid 보호, 다른 아키텍처 선택, 읽기 전용 사용자 재진입, 좁은 화면 테마 표시 검증.
- 전체 TypeScript 검사 및 `pnpm build`: 통과.
- 변경 React/서버 코드 ESLint 및 diff 공백 검사: 통과.
- 외부 AI는 모의 응답으로 대체했으며 유료 호출은 수행하지 않았다. 실제 모델의 시각적 해석 품질은 별도 확인 대상이다.

## 미완료 사항

- 없음. 기존 저장 이미지의 Mermaid 일괄 변환은 수행하지 않았다.
