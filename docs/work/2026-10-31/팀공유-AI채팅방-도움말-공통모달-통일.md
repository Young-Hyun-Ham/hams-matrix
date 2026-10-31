# 팀 공유·AI 채팅방·도움말 공통 모달 스타일 통일

- 작업일: 2026-10-31 (한국시간)

## 주요 변경사항

- 팀 공유의 멤버 추가·공유 글 작성, AI chatbot 메뉴의 채팅방 제목 변경·채팅방 삭제, 도움말의 다섯 모달을 기존 compact 공통 스타일로 통일했다.
- 같은 테마 배경·테두리·모서리, 제목/닫기 버튼 헤더, 본문 스크롤, 하단 버튼 영역과 12px 글자 규칙을 사용한다. 기본 최대 폭 520px, 최대 높이 85dvh를 공유한다.
- `workspace-form-dialog` 클래스로 프로젝트 등록 모달과 폼 배치·입력·버튼 영역 규칙을 재사용한다. 팀 공유 폼은 기존 team-compose 전용 클래스를 제거하여 충돌을 피했다. 해당 기존 클래스를 사용하는 팀 소유권 이전 화면은 변경하지 않았다.
- 채팅방의 별도 폼/입력/버튼 여백 규칙을 제거하고 공통 규칙을 적용했다. 삭제 버튼의 위험 색상, 취소 버튼 초기 포커스, 제목 입력 초기 포커스와 처리 중 닫기 방지는 유지한다.
- 도움말은 공통 본문/하단 확인 영역을 적용하고 내부 여백 중복을 제거했다. 도움말 내용과 서비스 안내 링크는 유지한다.
- API 호출·검증·권한·저장/삭제·취소 동작은 변경하지 않았다. 기존 다른 작업의 변경사항은 보존했다.

## 변경 파일

- `components/pages/team/team-member-add-dialog.tsx`
- `components/pages/team/team-page.tsx`
- `components/ai/ai-conversation-dialog.tsx`
- `components/ai/ai-chatbot.css`
- `components/workspace-shell.tsx`
- `styles/dialog.css`
- 이 문서 및 `WORK_HISTORY.md`

## DB 변경 여부

- 없음. UI 구조와 공통 스타일만 수정했다.

## 검증 결과

- `pnpm typecheck`: 통과.
- 변경한 TSX 파일 ESLint: 통과.
- `git diff --check`: 통과.
- 각 모달의 폼 제출 버튼·닫기 버튼 type, 처리 중 disabled 및 취소 이벤트, 초기 포커스 속성 유지 여부를 소스에서 확인했다.

## 미완료 사항

- 요청한 스타일 변경의 미완료 없음. 실제 로그인 브라우저에서 다섯 모달의 모바일·테마·포커스/스크롤을 직접 조작하는 수동 검증은 미실시다.
