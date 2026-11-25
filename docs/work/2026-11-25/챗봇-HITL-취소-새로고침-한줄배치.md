# 챗봇 HITL 취소·상태 새로고침 한 줄 배치

- 작성일: 2026-11-25 (Asia/Seoul)
- 변경: 선택형 HITL 카드의 취소·상태 새로고침 버튼을 같은 동작 행에 배치하고 버튼과 글자의 줄바꿈을 방지했다. 선택 완료 후에는 상태 새로고침만 표시한다.
- 변경 파일: components/chatbot/clarification-card.tsx, styles/chatbot.css 및 관련 이력 문서.
- DB 변경: 없음.
- 검증: 변경 컴포넌트 ESLint 및 diff 공백 검사 통과. 브라우저 실측 검증은 수행하지 않았다.
- 미완료 사항: 없음.
