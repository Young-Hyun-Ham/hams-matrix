# 챗봇 문서 형식 DOCX·PPTX·PDF·Mermaid 확장

- 작성일: 2026-11-25 (Asia/Seoul)
- 요구사항: 문서 생성의 문서 형식 선택에 Word(DOCX), 슬라이드(PPTX), PDF, Mermaid를 추가하고 실제 해당 형식의 파일을 생성한다.

## 주요 변경사항

- Markdown/텍스트를 유지하면서 DOCX·PPTX·PDF·Mermaid 선택 항목을 추가했다. 생성 모델은 기존처럼 서버가 자동 결정한다. 서버에서도 허용 형식을 검증한다.
- DOCX는 제목 계층·본문·표·첨부 이미지를 포함한 Word OOXML 패키지, PPTX는 16:9 슬라이드·텍스트·표·이미지·슬라이드 마스터/레이아웃/테마를 포함한 PresentationML 패키지로 작성한다. 슬라이드 전용 모델 지침과 기본 페이지 분할을 적용한다.
- PDF는 외부 요청·스크립트·폼을 차단한 이스케이프 HTML을 임시 폴더에 작성하고 설치된 Chromium으로 A4 PDF를 생성한다. 프로세스는 숨겨 실행하고 변환 시간/파일 크기를 제한한다. 임시 파일과 프로필은 생성한 정확한 경로만 검증 후 정리한다.
- Mermaid는 도식 전용 지침으로 코드만 생성해 .mmd로 다운로드한다. 서버에서 지원 도식/위험 지시문을 검사하고, 클라이언트는 기존 공통 렌더 큐·strict 설정·SVG 정제 함수를 사용해 도식을 표시한다. 원본 코드도 확인할 수 있다.
- MIME·확장자는 실제 형식과 일치한다. 바이너리 문서는 생성 원문을 같은 객체의 암호화 envelope에 함께 저장한다. 미리보기와 후속 모델 수정에는 원문을 사용하며 바이너리를 UTF-8로 해석하지 않는다. 기존 source 없는 Markdown/텍스트 객체도 읽을 수 있다.
- 생성물 DTO에 형식을 포함해 수정 버튼으로 열 때 원래 형식을 유지한다. 다른 형식으로 변경해 수정하는 것도 가능하다. 기존 HITL/정책·소유권·불변 버전·후보 다운로드 차단·완료 유료 응답 재사용을 유지한다.

## 변경 파일

- UI: components/chatbot/chatbot-panes.tsx, chatbot-mermaid.tsx(신규), runtime.tsx, styles/chatbot.css
- 변환: lib/chatbot/document-formats.ts, document-blocks.ts, document-ooxml.ts, document-pdf.ts, document-export.ts(신규), document.ts
- 저장/실행: lib/chatbot/storage.ts, generation.ts, repository.ts, types.ts
- 검증: scripts/test-chatbot-document-formats.mjs(신규), test-chatbot.mjs, test-chatbot-browser.mjs, chatbot-browser-provider.mjs, package.json
- 기록: 이 문서, WORK_HISTORY.md, README.md, AGENTS.md, CLAUDE.md

## DB 변경

- 없음. 기존 artifact version의 format/mime_type/size_bytes/sha256과 암호화 객체 저장을 활용한다. 별도 migration이나 운영 DB 테스트 자료를 만들지 않았다. Mermaid의 저장 확장자는 mmd이며 UI/요청 형식은 mermaid로 정규화한다.

## 검증

- 기존·확장 통합: 117개 통과. 네 가지 실제 파일 헤더·MIME/확장자·원문 복구·수정 승인·승인 전 후보 접근 차단·기존 AI 자료 보존을 임시 DB/메모리 저장소/모의 AI로 확인했다.
- 형식 전용: 10개 통과. DOCX/PPTX ZIP 내부 XML 파싱·관계 대상 존재·표·이미지·한글 보존, 실제 PDF 파싱과 한글 추출/여러 페이지, HTML 이스케이프, Mermaid 제한을 확인했다. 검토용 합성 파일은 git 제외 .auth-tests/chatbot-document-formats에 생성한다.
- 전체 TypeScript 검사 통과.
- Chrome 회귀 28개 통과. 로컬 모의 R2·모의 공급자를 사용해 새 형식 4개 각각의 실제 서버 생성/다운로드 헤더·미리보기, Mermaid SVG, 기존 슬래시·테마·시뮬레이터를 확인했다.
- 변경 코드 ESLint 통과(오류/경고 0개). 문서/패키지 diff 공백 검사 통과, tsconfig.json 내용 변경 없음. production build는 이번 후속 변경에서 반복하지 않았다.
- 의존성은 설치하지 않았다. 기존 fflate/sharp/Mermaid/Chromium과 설치된 검증 도구를 사용한다. 실제 유료 모델·외부 R2·운영 DB를 사용한 생성 테스트는 하지 않았다.

## 실행 조건과 제한

- PDF 작업자가 실행되는 서버에 Chromium/Chrome/Edge와 한글 폰트가 필요하다. 기본 설치 경로를 탐색하며 필요하면 서버 전용 CHATBOT_CHROMIUM_PATH를 지정한다. 미설정/실행 불가 시 실패를 명시하고 다른 형식의 파일로 위장하지 않는다. 이번 Windows 환경에서는 설치된 Chrome과 한글 폰트로 검증했다.
- 변환 최대 45초, 생성 파일 최대 64MB, PPTX 최대 100장이다. 긴 슬라이드 본문과 표는 나누어 배치한다. 기본 문서/슬라이드 템플릿을 사용하며 복잡한 Office 조판·전환 효과·사용자 템플릿은 추가하지 않았다. Office 데스크톱 앱의 직접 열기 검증은 수행하지 않았다.
- DOCX/PPTX/PDF의 채팅 미리보기는 암호화된 생성 원문 기반이다. 최종 페이지/슬라이드 배치는 다운로드한 파일에서 확인한다. Mermaid는 실제 도식 렌더링과 코드를 제공한다.
- 초기 PDF 검증에서 현재 Chrome과 호환되지 않는 disable-extensions 실행 옵션으로 종료되어 해당 옵션을 제거했고, 이후 실제 PDF 생성·한글 추출은 통과했다. 네트워크 차단/CSP/프로필 격리는 유지한다.
- 미완료 사항: 없음. 실제 유료 공급자의 작성 품질과 Office 데스크톱 레이아웃은 이번 검증 범위 밖이다.
