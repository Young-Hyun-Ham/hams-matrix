# Mermaid 숫자 엔티티 생성 제거

작성일: 2026-11-16 (한국시간)

## 주요 변경사항
- 서버 Mermaid 라벨 직렬화에서 특수문자를 #숫자; 형식으로 변환하던 동작을 제거했다.
- 괄호와 가운뎃점을 노드 이름·기술명·연결 설명에 실제 문자로 출력한다.
- 원본 라벨에 포함된 #40;, #41;, #183; 및 &#숫자;/16진 숫자 엔티티는 실제 문자로 정리한다. 허용하지 않는 문자·HTML 구문 기호는 공백으로 정리하며 공백을 정규화한다.
- 자동 생성 Mermaid의 안전 문법도 같은 허용 문자 집합으로 맞춘다. 기존 자동 코드에 숫자 엔티티가 있으면 다음 데이터 저장·재생성 시 캐시를 재사용하지 않는다.
- 조회만으로 DB를 갱신하지 않으며 사용자 수동 Mermaid 코드는 임의 수정하지 않는다.

## 변경 파일
- lib/architecture-mermaid.ts: 라벨 정리와 자동 코드 문법 검사.
- scripts/test-architecture-mermaid.mjs: 괄호·가운뎃점 유지, 입력 숫자 엔티티 정리, 엔티티 없는 출력·안전 문법 회귀 검증.
- README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md: 작업 기록 링크.

## DB 변경 여부
- 스키마·기존 데이터 일괄 변경 없음. 이후 저장·생성부터 적용한다.

## 검증 결과
- node scripts/test-architecture-mermaid.mjs: 통과.
- node scripts/test-architecture-images.mjs 및 함께 실행되는 WBS 이미지 회귀 테스트: 통과.
- 변경 파일 ESLint·TypeScript --noEmit·git diff --check: 통과.
- 실제 유료 AI 호출 없음. 브라우저 직접 조작은 수행하지 않았다.

## 미완료 사항
- 없음.
