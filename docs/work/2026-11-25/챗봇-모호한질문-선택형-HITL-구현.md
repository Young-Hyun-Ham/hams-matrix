# 챗봇 모호한 질문의 선택형 HITL 구현

- 작성일: 2026-11-25 (Asia/Seoul)
- 기준: 최신 [설계 문서](../../history/2026-11-25/챗봇-모호한질문-선택형-HITL-설계.md)를 다시 읽고 구현했다. 기존 작업과 AI Chat 저장소는 보존했다.

## 주요 변경사항

- 일반 채팅에서 구조화된 판단(answer/clarify/capability_unavailable)을 받아 모호한 조건을 2~6개 선택지와 직접 입력 카드로 표시한다. 카드 선택 후 원래 요청과 turn을 이어서 처리한다.
- 사용자 후속 설명에 따라 날씨는 예시로 취급했다. 주제별 어댑터나 날씨 API를 추가하지 않았다. 선택형 HITL은 공통 기능이며, 외부 실시간 데이터가 필요한 경우 실제 도구 연동 전에는 기능 제한을 명확히 안내한다.
- 선택 대기에는 작업 lease와 상태 폴링을 종료한다. 새 질문은 가능하며 재개에는 최초 고정 문맥과 해당 요청의 확정 조건만 사용한다. 기존 초안은 보존한다.
- 최대 3회, 24시간 만료, 세 번째 직접 입력, 취소·만료·삭제 처리를 구현했다. 카드 식별자·버전·선택지·정책·소유권·Origin·동시 실행·멱등성을 서버에서 확인한다.
- 정책 승인과 조건 선택을 분리했다. 단계별 암호화 결과를 저장해 승인 후 재개와 카드 새로고침에서 완료한 유료 호출을 반복하지 않는다. 구조화 응답 오류는 임의 텍스트 파싱으로 우회하지 않는다.
- 모델 요청 계약은 [OpenAI Structured Outputs 공식 문서](https://developers.openai.com/api/docs/guides/structured-outputs)의 Responses JSON Schema 형식을 사용한다. 모델 교체나 패키지 설치는 하지 않았다.

## 변경 파일

- 판단·실행·저장: lib/chatbot/decision-schema.ts, decision.ts, clarification.ts, providers.ts, generation.ts, repository.ts, policy.ts, worker.ts, maintenance.ts.
- API: app/api/chatbot/clarifications/[clarificationId]/ 하위 조회·선택·취소·옵션 라우트.
- 화면: components/chatbot/clarification-card.tsx, chatbot-panes.tsx, types.ts 및 styles/chatbot.css.
- DB·운영: db/migrations/055_chatbot_clarifications.sql, scripts/migrate.mjs, chatbot-clarification-migration.mjs, verify-chatbot-clarification-schema.mjs, verify-chatbot-schema.mjs, chatbot-worker.mjs.
- 검증: scripts/test-chatbot.mjs, test-chatbot-clarification-migration.mjs, test-chatbot-browser.mjs, chatbot-browser-provider.mjs.
- 문서: README.md, AGENTS.md, CLAUDE.md, WORK_HISTORY.md 및 이 기록. 기존 다른 작업의 수정은 유지했다.

## DB 변경

- 055는 기존 054를 수정하지 않고 요청 상태에 waiting_clarification을 추가한다. 명확화·불변 선택 이벤트·단계별 실행 결과 3개 테이블을 추가해 챗봇 테이블은 총 19개가 된다.
- 요청 FK 관계의 기존 7개 테이블을 FK를 켠 상태에서 트랜잭션으로 재구성한다. 스키마 사전 비교, 기존 행 보존 확인, FK 검증 실패 시 전체 롤백으로 보호한다. 알 수 없는 스키마 변경이나 실행 중 작업은 적용을 거부한다.
- 구성 DB에 055만 선택 적용했다. 적용 전 실행 중인 챗봇 요청/시나리오가 없음을 확인하고 챗봇 작업자만 잠시 대기시켰다. 사후 비교에서 기존 챗봇 모든 행, 다른 테이블 건수, 기존 인덱스·트리거 보존과 FK 위반 0건·integrity ok를 확인했다. 유지보수 잠금은 해제했고 작업자를 새 코드로 재시작했다.

## 검증 결과

- 통합 검증 176개 통과: 선택·직접 입력·동시 선택·멱등성·3회 제한·만료·취소·정책 승인 재개·완료 호출 보존·기존 생성 기능.
- 마이그레이션 검증 7개 통과: 데이터가 있는 기존 저장소 보존, 실패 시 롤백, FK와 불변 트리거.
- TypeScript와 변경 파일 ESLint 통과. 기존 AI 승인/설정/검토 회귀 및 시나리오 빌더 API 회귀 29개 통과.
- Chrome 브라우저 31개 통과: 선택 카드·직접 입력·원래 turn 재개·작성 중 초안 보존, 기존 슬래시/문서 형식/독립 테마/시나리오 팝업·모바일 회귀. 실제 유료 모델 호출 없이 합성 계정·임시 DB·모의 공급자로 검증했다.

## 미완료 사항 및 재개 정보

- 요청 범위의 미완료 작업 없음. 구성 DB 055 적용과 전후 보존 검증, 유지보수 잠금 해제를 완료했다. 다른 환경에서는 054 이후 055만 선택 적용하고 적용 전 실행 중 요청/시나리오와 작업자를 정리한다.
- 외부 실시간 정보 도구는 이번 범위에 포함하지 않는다. 실제 공급자 유료 호출과 전체 production build는 이번 검증에 포함하지 않았다.
