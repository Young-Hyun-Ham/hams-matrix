# 아키텍처 구성도·Mermaid 탭 및 등록 모달 개편 설계

- 작성일: 2026-10-30 (한국시간)
- 단계: 현재 소스 분석 및 설계. 구현, DB 변경, 마이그레이션 실행은 하지 않는다.
- 범위: 프로젝트 아키텍처 화면, 등록·수정 모달, 구성도 표시, 저장 시 AI Mermaid 생성 및 재조회.

## 1. 요구사항

1. 현재 아키텍처 구성도 영역을 `아키텍처 구성도`, `Mermaid` 두 탭으로 변경한다.
2. 등록·수정 모달의 기본 입력을 명칭, 상태, 시스템 구성 개요, 담당자, 비고로 정리한다.
3. 구성요소 추가 및 연결 추가 기능은 유지한다.
4. 모달을 기존 공통 모달 UI에 맞춘다.
5. 아키텍처 구성도 탭에 등록한 구성요소와 연결을 실제 다이어그램으로 표시한다.
6. 저장 시 AI가 해당 입력에 맞는 Mermaid 코드 스니펫을 생성하고 함께 저장한다.
7. 선택한 아키텍처를 불러오면 Mermaid 탭 좌측에 저장 코드, 우측에 해당 코드의 미리보기를 표시한다.

사용자가 말한 input은 입력 항목이라는 의미로 해석한다. 권장 컨트롤은 명칭·담당자 input, 상태 select, 시스템 구성 개요·비고 textarea다. 모든 항목을 단일 행 input으로 변경할지는 검토가 필요하다.

## 2. 현재 구조 및 확인 결과

| 영역 | 현재 파일 및 동작 | 영향 |
| --- | --- | --- |
| 화면 진입 | `components/pages/architecture/architecture-page.tsx`에서 `ArchitectureDiagram`과 `ArtifactList(kind="architecture")`를 순서대로 표시 | 구성도 영역 내부 탭 추가. 목록은 공통 영역으로 유지 가능 |
| 선택 및 표시 | `architecture-diagram.tsx`가 자체 selectedId를 관리하고, 선택 실패 시 첫 항목을 사용. 현재 본문은 `ArchitectureSummary` | 선택 상태를 두 탭이 공유해야 함 |
| 현재 구성도 본문 | `architecture-summary.tsx`에서 개요·기술·보안·성능 등의 텍스트 카드 표시 | 구성요소·연결 다이어그램 표시로 전환 필요 |
| SVG 자산 | `architecture-diagram-svg.tsx`, `architecture-layout.ts`에 구성도 렌더러 및 자동 배치 구현 존재 | 현재 본문에 연결하여 재사용 가능 |
| 구조 편집 | `architecture-structure-editor.tsx`에서 topology hidden input과 구성요소·연결 편집 제공 | 동작 유지, 모달 안 배치 및 스타일 조정 |
| 공통 산출물 모달 | `components/shared/artifact-dialogs.tsx`의 native dialog에 명칭·상태·ArtifactFields·StructureEditor 표시 | 아키텍처 분기만 공통 모달 외형에 맞춰 변경 |
| 기본 필드 | `lib/artifact-types.ts`의 architecture 정의에 개요 외 언어·프레임워크·DB·서버·배포·보안·성능·표준·담당자·비고 존재 | 프레임워크·DB·서버·보안·성능·표준은 현재 필수이므로 UI만 숨기면 저장 불가 |
| 클라이언트 저장 | `components/shared/use-artifact-actions.ts`가 POST/PATCH에 fields와 structure.topology 전송 | Mermaid 생성 진행·오류 처리 및 저장 후 선택 유지 필요 |
| 서버 저장 | `lib/artifacts.ts`의 validate 및 mutateArtifact에서 권한·필드·버전·연결 검증 후 저장 | 단순화한 필드 정책, AI 생성 단계, 기존값 보존 설계 필요 |
| 구조 정규화 | `lib/artifact-validation.ts`의 prepareStructure가 architecture에는 topology만 복사 | Mermaid 필드를 추가해도 현재 상태로는 저장 과정에서 사라짐 |
| 저장소 | `db/migrations/006_integrated_deliverables.sql`의 project_artifacts.fields_json / structure_json, artifact_revisions | 기존 JSON 구조 확장으로 구현 가능. 신규 테이블은 필수 아님 |
| 공통 모달 기준 | `styles/dialog.css`의 workspace-dialog, dialog-header 및 admin-detail-dialog 계열. `components/shared/preview-dialog.tsx` 등에서 사용 | 단일 범용 폼 모달 컴포넌트가 이미 있다고 가정하지 말고 기존 패턴 재사용 |
| AI 경로 | `lib/ai/page-tools.ts`도 mutateArtifact를 사용. `lib/ai/page-prompts.ts`에 아키텍처 지침 존재 | 수동 폼 외 AI 저장 경로도 동일 정책 적용 필요 |
| 이미지 기능 | `architecture-image-actions.tsx`, `lib/ai/architecture-images.ts`, 이미지 API 및 별도 이미지 테이블 존재 | Mermaid 코드와 AI 이미지 저장은 별개. 기존 기능 삭제 여부 미지정 |
| Mermaid | package.json에 mermaid 의존성 존재. 확인한 components/lib에는 Mermaid 렌더링 구현 없음 | 신규 렌더링 컴포넌트 필요, 의존성 추가는 우선 불필요 |

topology는 nodes(id, name, technology, layer, shape)와 edges(id, source, target, label)로 구성된다. `lib/architecture.ts`에서 구성요소 최대 30개, 연결 최대 60개, ID 중복·존재하지 않는 연결 대상·자기 연결 등을 검증한다. 기존 제한을 유지한다.

`topologyFor()`는 구조가 없는 기존 문서에서 프레임워크·서버·DB 텍스트로 최소 노드를 만들고 연결은 추정하지 않는다. 기존 자료와 신규 명시적 topology를 구분해야 한다.

## 3. 화면 및 모달 수정 방향

### 3.1 탭과 선택 상태

```text
아키텍처 선택 [ARC-001 · 명칭 ▼]   [구성요소 / 연결 편집]
[아키텍처 구성도] [Mermaid]
  구성도 탭: 개요 / 구성요소·연결 SVG
  Mermaid 탭: [저장된 코드 스니펫] | [코드 미리보기]
아키텍처 목록 및 등록 버튼 (기존 ArtifactList)
```

- 선택기는 탭 공통 상단에 두고 기본 탭은 아키텍처 구성도로 한다. 탭 전환으로 선택이 바뀌지 않도록 한다.
- 신규 등록 성공 시 반환된 항목 ID를 선택하고, 수정 후에는 같은 ID의 최신 데이터를 표시한다. 현재 save가 반환 데이터를 사용하지 않으므로 응답 계약과 onChanged/context 전달을 함께 확인·확장한다.
- 선택 항목 삭제 시 남은 첫 항목으로 이동한다. 항목이 없으면 등록 안내를 표시하고 이전 코드·미리보기는 제거한다.
- 탭에는 tablist/tab/tabpanel 관계와 키보드 이동을 제공한다. 작은 화면에서는 Mermaid 코드와 미리보기를 상하로 배치한다.

### 3.2 구성도 탭

- `ArchitectureDiagramSvg`를 재사용해 명시적인 topology의 모든 노드 및 연결 방향·라벨을 표시한다. 기술/버전, 영역, 서비스 박스·DB 원통 구분을 유지한다.
- 시스템 구성 개요와 담당자·비고는 간단한 부가 정보로 표시한다. 기존 기술·기준 카드 전체를 새 화면에 계속 노출할 필요는 없다.
- 구성요소가 없으면 빈 상태를 표시한다. 연결만 없는 경우에는 노드만 정상 표시한다.
- 기존 문서의 fallback은 호환용 표시로 구분하고, 추정 연결을 추가하지 않는다. 다음 편집 저장 시 표시된 fallback을 명시적인 topology로 확정할지는 결정 사항으로 둔다.
- 기존 AI 이미지 기능은 우선 보존하며 공통 도구 영역 등에 배치한다. 이미지가 구조 기반 SVG나 Mermaid 미리보기를 대체하지 않도록 한다. 기존 PNG 내보내기 관련 코드의 사용 경로도 구현 시 재확인한다.

### 3.3 등록·수정 모달

| 항목 | 저장 키 | 권장 정책 |
| --- | --- | --- |
| 명칭 | title | 필수, 현재 최대 200자 유지 |
| 상태 | status | 기존 상태 목록과 기본 초안 유지 |
| 시스템 구성 개요 | fields.definition | 필수, 최대 3,000자 유지 |
| 담당자 | fields.owner | 선택, 최대 3,000자 유지 |
| 비고 | fields.notes | 선택, 최대 3,000자 유지 |
| 구성요소·연결 | structure.topology | 기존 편집기와 검증 유지 |

- architecture 필드의 표시 목록과 과거 필드 보존 정책을 분리한다. 숨긴 기존 필드는 필수 검증에서 제외하되 이전 값을 삭제하거나 빈 문자열로 덮어쓰지 않는다.
- `definitions.architecture.fields`에서 과거 항목을 단순 제거하면 서버 validate가 해당 키를 저장 결과에서 누락시키므로, 서버에서 허용된 과거 키를 병합·보존하도록 설계한다. 임의 키 전체를 무조건 허용하지 않는다.
- 신규 문서는 축소한 항목만으로 저장 가능해야 한다. 기존 문서도 숨겨진 필수값 때문에 수정이 막히지 않아야 한다.
- 공통 모달 헤더·닫기 버튼·배경·본문 스크롤·하단 저장 영역 패턴을 적용한다. 구성 편집에 필요한 넓은 폭은 아키텍처 전용 modifier로 조정한다.
- 전체 ArtifactDialogs의 일괄 외형 변경을 피하고 아키텍처 범위부터 적용한다. 공통 shell을 추출한다면 다른 산출물 모달 회귀를 확인한다.
- 읽기 전용 권한, 저장 중 중복 제출·닫기 방지, 취소 시 미저장 데이터 처리, 오류 시 입력 유지, 닫은 뒤 원래 버튼으로 포커스 복귀를 유지·보완한다.

## 4. Mermaid 생성·저장 설계

### 4.1 데이터 모델 제안

기존 structure_json 안에 다음 선택 속성을 추가하는 방안을 권장한다. 이름과 세부 타입은 구현 시 확정한다.

```text
structure.topology: 기존 nodes / edges
structure.mermaid:
  code: 검증된 Mermaid 원문 (코드 펜스 제외)
  sourceHash: 생성 입력의 정규화 해시
  generatedAt: 생성 시각 (UTC ISO, 화면 표시는 한국시간)
  generatorVersion: 프롬프트/변환 규칙 버전
```

- topology가 구성요소·연결의 원본이다. Mermaid는 원본으로부터 생성한 파생 표현이며 코드에서 topology를 역변환하지 않는다.
- 해시 대상은 title, definition, topology 및 프롬프트가 실제 사용하는 값으로 제한한다. 담당자·비고는 기본적으로 AI에 보내지 않는다. 상태 등 표현과 무관한 수정은 재생성 없이 기존 코드를 보존한다.
- 생성 입력이 같고 코드가 있으면 재사용한다. 최초 등록, 입력 변경, 기존 코드 없음 시 생성한다. 매 저장마다 재호출할지는 결정 사항이다.
- `ArtifactStructure` 타입, prepareStructure의 허용 필드 처리, 서버 저장·이력 스냅샷을 함께 확장한다. 클라이언트가 임의로 전달한 generatedAt/sourceHash를 신뢰하지 않는다.
- JSON 확장안은 신규 DB 스키마가 필요하지 않다. 기존 행 일괄 갱신과 조회 시 자동 생성은 하지 않는다.

### 4.2 저장 처리 순서 — 권장안

1. POST/PATCH 요청에서 로그인·프로젝트 쓰기 권한, 필드·topology, 수정 version을 먼저 확인한다.
2. 서버가 정규화한 입력과 기존 코드의 해시를 비교해 생성 필요 여부를 판정한다.
3. 필요하면 서버 전용 Mermaid 생성 서비스를 호출한다. AI 네트워크 호출 동안 DB 쓰기 트랜잭션을 열어두지 않는다.
4. 응답을 제한된 Mermaid 형식으로 검증한다. 문법뿐 아니라 등록 노드·연결의 누락, 추가, 방향 변경도 검사한다.
5. 짧은 쓰기 트랜잭션에서 권한·삭제 여부·version을 재확인한 뒤 원본과 Mermaid를 같은 버전으로 저장한다. 현재 mutateArtifact의 트랜잭션 경계를 고려해 사전 생성 orchestration과 최종 mutation을 분리한다.
6. 기존 변경 이력·감사 기록 경로를 유지하고 최신 항목을 반환한다. 클라이언트는 선택된 항목과 두 탭을 갱신한다.

AI 실패·시간 초과·검증 실패 시 권장 기본값은 전체 저장 실패다. 신규 문서는 만들지 않고, 기존 원본과 코드는 그대로 보존하며 폼 입력을 유지한다. 변경된 topology와 이전 Mermaid가 같은 최신 버전처럼 저장되는 상황을 방지한다. 원본을 먼저 저장하는 부분 성공 정책을 택한다면 pending/failed 상태, 재시도 API 및 UI를 별도 설계해야 한다.

동시 수정은 최종 재검증에서 409로 처리하고 생성 결과로 다른 사용자의 수정을 덮어쓰지 않는다. 생성 후 최종 저장이 실패해도 외부 AI 사용량은 발생할 수 있으므로 재시도·중복 요청의 처리와 생성 제한을 고려한다. 자동 재시도는 횟수를 제한하며, 타임아웃 후 무제한 재호출하지 않는다.

### 4.3 AI 입력 및 검증

- 기존 AI 설정·사용량 기록·권한·가드레일 경로를 조사해 텍스트 생성용 공통 호출 계층을 재사용한다. 이미지 생성 서비스 자체를 코드 생성기로 사용하지 않는다.
- 호출은 다이어그램 표현 변환으로 제한한다. 설명 안의 지시문을 도구 실행 지시로 해석하거나 임의의 데이터 조회·변경을 허용하지 않는다.
- 초기 범위는 flowchart와 영역별 subgraph, 서비스/DB 모양, 방향 있는 연결 및 라벨로 제한한다. AI가 구성요소나 네트워크 관계를 임의로 발명하지 않도록 한다.
- topology UUID를 그대로 문법 ID에 넣지 않고 안전한 별칭과 원본 ID 매핑을 사용한다. 한글·따옴표·괄호·개행 등은 라벨 이스케이프 규칙을 적용한다.
- 출력 길이 제한과 노드·연결 상한을 두고, 코드 펜스·설명문·허용하지 않은 지시문·click/외부 URL/HTML 라벨을 거부한다. Mermaid parse만으로 구조 일치가 보장되지는 않는다.
- 구조 일치 검증을 위해 AI가 제한된 중간 표현을 반환하고 서버가 Mermaid 문자열을 직렬화하는 방식도 검토한다. 자유 형식 코드 출력보다 등록 구조를 보장하기 쉽다.
- AI 채팅 등록·수정도 동일 생성 orchestration을 거치도록 하고, 생성 서비스가 다시 AI mutation을 호출하는 순환을 만들지 않는다. 수동 폼 외 저장 경로가 생성 없이 저장되는 우회를 점검한다.

## 5. Mermaid 탭 렌더링 및 호환

- 기본은 읽기 전용 코드와 복사 기능이다. 직접 수정·별도 저장·코드에서 구조 역변환은 요구 범위가 명확하지 않아 제외를 권장한다.
- 저장된 code만으로 우측 미리보기를 렌더링한다. 탭 클릭·조회·새로고침만으로 AI를 호출하거나 DB를 변경하지 않는다.
- 기존 문서에 code가 없으면 `저장된 Mermaid 코드가 없습니다. 편집 후 저장하면 생성됩니다.`를 표시한다. 구조 SVG는 계속 조회할 수 있다.
- 클라이언트 전용 렌더러에서 mermaid를 지연 로딩하고 보안 설정을 고정한다. 저장 코드의 초기화 지시문으로 설정을 덮어쓰지 못하게 한다. 렌더링된 SVG도 외부 리소스·이벤트 속성 등 검증/정제 정책을 적용한다.
- 선택 ID·코드 변경마다 고유 렌더 ID를 사용한다. 비동기 렌더 결과에 요청 식별자를 두어 A → B를 빠르게 선택해도 A의 늦은 결과가 B 화면을 덮지 못하게 한다.
- 문법/렌더 오류는 미리보기 영역에 표시하고 원문 복사는 가능하게 한다. 이전 선택의 성공 미리보기를 현재 항목의 결과처럼 남기지 않는다.
- 긴 코드·큰 다이어그램 스크롤, 한글 글꼴, 밝은/어두운 테마, 비활성 탭의 크기 계산을 검증한다.

## 6. 변경 대상 파일

아래는 향후 구현 대상이며 이번 작업에서 수정하지 않는다.

| 파일 | 변경 또는 점검 내용 |
| --- | --- |
| `components/pages/architecture/architecture-page.tsx` | 목록과 탭 영역 배치, 선택 상태 소유 위치 |
| `components/pages/architecture/architecture-diagram.tsx` | 공통 선택기, 탭, SVG 및 Mermaid 연결 |
| `components/pages/architecture/architecture-diagram-svg.tsx`, `architecture-layout.ts` | 기존 렌더러 재사용, 빈 상태·긴 라벨 확인 |
| `components/pages/architecture/architecture-summary.tsx` | 축소 입력에 맞춘 부가 요약 또는 기존 표시 제거 |
| `components/pages/architecture/architecture-mermaid.tsx` (신규 제안) | 코드·미리보기, 로딩·오류·선택 전환 처리 |
| `components/pages/architecture/architecture-page.css` | 탭, 분할 레이아웃, 반응형 및 모달 전용 스타일 |
| `components/pages/architecture/architecture-structure-editor.tsx` | 기능 보존, 모달 내부 배치 및 fallback 정책 |
| `components/shared/artifact-dialogs.tsx`, `components/artifact-fields.tsx`, `components/shared/artifact-field-inputs.tsx` | 아키텍처 필드 축소 및 공통 모달 적용 |
| `components/shared/use-artifact-actions.ts`, `project-page-context.tsx` | 저장 결과 전달, 선택 유지, AI 진행·오류 상태 |
| `styles/dialog.css` | 공통 패턴 활용. 공통 규칙 변경 필요 시 타 모달 영향 확인 |
| `lib/artifact-types.ts`, `lib/artifacts.ts`, `lib/artifact-validation.ts` | Mermaid 타입, 필수값 변경, 과거 필드 보존, 서버 생성·저장 연결 |
| `lib/architecture.ts` | 기존 topology 검증 유지, 정규화/생성 입력 처리 검토 |
| `lib/ai/architecture-mermaid.ts` (신규 제안) | 생성·검증·해시·생성 정책 |
| `app/api/projects/[projectId]/artifacts/route.ts`, `[artifactId]/route.ts` | 기존 POST/PATCH의 생성 orchestration 및 오류 계약 |
| `lib/ai/page-tools.ts`, `lib/ai/page-prompts.ts`, `lib/ai/page-data.ts` | AI 저장 우회 방지, 축소 필드 정책 및 조회 영향 |
| `lib/ai/token-usage.ts`, `guardrails.ts` 및 기존 AI 호출 계층 | 사용량·가드레일·시간 제한 통합 지점 검토 |
| `lib/ai/architecture-image-prompt.ts`, `components/pages/architecture/architecture-image-actions.tsx` | 기존값 보존 및 축소 입력 후 이미지 생성 호환 |
| `lib/workbook.ts`, `lib/integration.ts` | 과거 필드·승인 기준·출력에 대한 회귀 확인 |
| `scripts/test-architecture.mjs`, `scripts/test-architecture-images.mjs` 및 필요 시 신규 테스트 | 축소 필드 저장·생성·구조 일치·기존 이미지 회귀 |

## 7. 검증 방법

### 구현 후 자동 검증

- `pnpm typecheck`, `pnpm lint`, `pnpm build` 및 기존 `pnpm test:architecture`, `pnpm test:architecture-images`를 영향에 맞춰 실행한다.
- 테스트 DB에서 축소 필드 신규 저장, 기존 숨김 필드 보존, code 왕복 저장·재조회, 이력 스냅샷 포함을 검증한다. 운영 DB를 사용하지 않는다.
- AI는 mock으로 성공·실패·시간 초과·잘못된 문법·추가/누락된 노드·역방향 연결을 재현한다. 등록 구조와 코드 의미가 일치하는지 검증한다.
- 실제 AI 호출은 별도 통합 확인으로 최소화하고, 조회·동일 입력 저장의 불필요한 호출 방지 및 사용량 기록을 확인한다.
- 최종 version 충돌·권한 상실·삭제·중복 제출에서 덮어쓰기와 부분 저장이 없는지 검증한다.

### 화면 및 회귀 검증

1. 다중 아키텍처에서 선택·탭 전환·새로고침·수정 저장 후 올바른 데이터와 코드/미리보기가 함께 표시된다.
2. 구성요소 0개/1개/30개, 연결 0개/60개, 노드 삭제에 따른 연결 삭제와 상한 검증이 유지된다.
3. 코드 없는 기존 문서, fallback 문서, 기존 코드 오류 문서에서 안내가 정확하고 자동 생성·저장이 없다.
4. AI 실패 시 입력을 잃지 않으며 DB와 기존 미리보기가 잘못 갱신되지 않는다.
5. 빠른 항목 전환, 긴 한글 라벨·특수문자, 작은 화면, 다크 테마, 키보드 탭 이동 및 모달 포커스를 확인한다.
6. 읽기 전용 사용자는 두 탭을 볼 수 있지만 변경·생성 저장은 불가하다. 다른 프로젝트/워크스페이스 접근을 차단한다.
7. 기존 AI 이미지 생성·조회, 다른 산출물 등록 모달, 참조 연결·승인/기준선·엑셀 출력에 회귀가 없는지 확인한다.
8. 악성 라벨·코드의 HTML/스크립트·외부 URL·설정 덮어쓰기가 실행되지 않는지 확인한다.

## 8. 결정이 필요한 사항

| 결정 항목 | 권장안 |
| --- | --- |
| 기본 입력의 실제 컨트롤 | 상태 select, 개요·비고 textarea 유지 |
| Mermaid 코드 직접 편집 | 첫 단계는 읽기 전용 및 복사만 제공 |
| AI 생성 시점 | 최초/표현 입력 변경/코드 누락 저장 시 생성, 동일 입력 재사용 |
| AI 실패 시 저장 | 전체 저장 실패로 원본과 코드 일관성 보장 |
| 구성요소 없는 문서 저장 | 기존처럼 허용하고 빈 구성 안내. 개요만으로 관계를 임의 추론하지 않음 |
| 기존 fallback 처리 | 조회는 호환 표시, 편집 저장 시 명시 topology 확정 여부 검토 |
| 기존 숨김 기술·기준 필드 | 값 보존, 신규 입력 필수에서 제외. 삭제/재편집 기능은 별도 범위 |
| 공통 모달 기준 | 현재 compact 공통 모달 패턴 사용, 구성 편집 폭만 별도 확장 |
| AI 이미지 도구 위치·유지 | 기능 보존, 탭 공통 보조 도구로 배치 |
| AI 출력 제약 | 제한된 중간 표현과 서버 직렬화 우선 검토, 자유 코드 출력 시 의미 검증 필수 |

## 9. 이번 단계 산출물

이 설계 문서와 HISTORY 링크만 작성한다. 검토자가 문서를 수정·확정한 뒤 별도의 구현 요청에 따라 소스 변경, 테스트 및 필요한 저장 정책 적용을 진행한다.
