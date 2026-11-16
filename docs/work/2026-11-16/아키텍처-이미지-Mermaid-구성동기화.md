# 아키텍처 이미지·Mermaid 구성 동기화

작성일: 2026-11-16 (한국시간)

## 원인 및 주요 변경사항
- 기존 이미지 생성 후 Mermaid AI는 이미지를 보더라도 기존 노드·연결 ID의 배치 순서와 방향만 반환했다. 등록된 topology가 Frontend/Backend/DB뿐이면 구성요소를 보완할 수 없었다.
- 이미지 생성·재생성 후 새 이미지와 아키텍처 설명·기술 필드를 함께 분석해 보완된 topology(nodes/edges), 배치 순서, 방향을 반환하도록 변경했다.
- 기존 노드의 ID·이름·기술·영역·형태 및 기존 연결의 ID·방향·설명은 서버가 보존 여부를 검증한다. 새 노드·연결도 기존 topology 검증을 통과해야 하며 노드 30개·연결 60개 제한을 유지한다.
- 일반적인 Frontend/Backend/DB 세 상자 대신 근거 있는 진입점·업무 구성요소·저장소·외부 연계·운영 구성 책임을 구분하도록 프롬프트를 개선했다. 이미지 장식은 구성요소로 취급하지 않으며 근거 없는 제품·버전·복제·보안 서비스를 추가하지 않도록 지시한다.
- Mermaid는 AI 자유 코드가 아닌 검증된 topology를 서버 직렬화하여 생성한다. 보완 topology 기준 sourceHash를 계산하고 기존 이미지 저장 트랜잭션에서 topology·Mermaid·이미지를 함께 저장한다.
- 이미지/보완 데이터 생성·검증·권한·버전 재검증 또는 저장 실패 시 기존 이미지·topology·Mermaid를 유지한다. 외부 AI 호출 사용량은 기존 방식으로 기록한다.
- 아키텍처 탭 AI 데이터 생성·수정 프롬프트에도 설명과 topology 동시 반영 및 구체적 구성요소·통신 흐름 작성 지침을 추가했다.
- 이미지 없는 일반 저장과 수동 Mermaid 편집의 기존 캐시·검증 동작을 유지한다.

## 변경 파일
- lib/ai/architecture-mermaid.ts: 이미지 분석의 보완 topology 응답 스키마·검증·직렬화·hash 갱신.
- lib/artifacts.ts: 보완 topology를 저장 후보와 입력 구조에 함께 반영.
- lib/ai/page-prompts.ts: 아키텍처 데이터 AI 생성·수정 지침 강화.
- scripts/test-architecture-images.mjs: 프록시·요청 경로 보완 저장, 기존 구성 보존, sourceHash, 잘못된 topology 실패 시 기존 결과 보존 검증.
- scripts/test-architecture-mermaid.mjs: 현행 workspace 플랜 정책에 맞게 임시 테스트 fixture 보완.
- README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md: 작업 기록 링크.

## DB 변경 여부
- 스키마·운영 데이터 변경 없음. 사용자가 이미지 생성·재생성을 실행하면 기존 structure_json의 topology와 mermaid 및 이미지 데이터가 기존 트랜잭션에서 갱신된다.
- 이미 저장된 이미지를 조회·재사용하는 경우는 유료 AI 호출 없이 기존 데이터를 반환한다. 기존 이미지에 새 구성을 반영하려면 이미지 재생성을 실행해야 한다.

## 검증 결과
- node scripts/test-architecture-images.mjs: 통과. 임시 SQLite의 실제 API·이미지 암호화·재사용·보완 topology/Mermaid 동시 저장·실패 보존·권한·버전 충돌 검증. 외부 AI 응답은 모의 처리했으며 유료 호출 없음.
- 위 스크립트가 실행하는 WBS 이미지 회귀 검증: 통과.
- node scripts/test-architecture-mermaid.mjs: 통과. 일반 저장·AI 변경·수동 편집 보존·안전 문법·권한·버전 검증.
- 변경 소스·테스트 ESLint, TypeScript --noEmit 및 git diff --check: 통과.
- 실제 유료 이미지 생성과 브라우저 시각 품질 확인은 수행하지 않았다. AI 결과의 세부 구성은 입력 자료에 따라 달라진다.

## 미완료 사항
- 없음.
