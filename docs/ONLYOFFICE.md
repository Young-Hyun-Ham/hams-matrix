# ONLYOFFICE 편집 연결

문서함의 파일명을 더블클릭하거나 파일명에 키보드 초점을 둔 뒤 Enter를 누르면 새 탭에서 DOCX·XLSX·PPTX를 엽니다. 조회 전용 계정은 읽기 모드로 열립니다. 다른 형식은 기존 다운로드를 이용합니다.

## 서버 설정

실제 문서 편집에는 별도로 실행 중인 ONLYOFFICE Docs 서버가 필요합니다. React 패키지만으로 편집 서버가 실행되지는 않습니다.

서버 `.env`에 다음을 설정하고 앱을 재시작합니다.

```dotenv
ONLYOFFICE_DOCUMENT_SERVER_URL=https://office.example.com
ONLYOFFICE_JWT_SECRET=문서서버와-동일한-JWT-비밀키
# 문서 서버에서 APP_URL에 접근할 수 없는 경우 별도 앱 주소 지정
ONLYOFFICE_PUBLIC_APP_URL=https://matrix.example.com
# 문서 서버의 JWT_HEADER를 바꾼 경우에만 지정 (기본 Authorization)
# ONLYOFFICE_JWT_HEADER=Authorization
```

`ONLYOFFICE_PUBLIC_APP_URL`이 없으면 기존 `APP_URL`을 사용합니다. 이 주소는 앱 루트 주소입니다. 브라우저는 문서 서버에, 문서 서버는 앱의 파일 제공·콜백 API에, 앱은 문서 서버의 편집 파일 URL에 접근할 수 있어야 합니다. HTTPS 앱에는 HTTPS 문서 서버를 사용합니다. 로컬 앱 주소는 외부 문서 서버에서 접근할 수 없으므로 개발용 터널이나 접근 가능한 개발 서버가 필요합니다. 사설 주소의 앱을 사용하는 경우 ONLYOFFICE 측 사설 네트워크 요청 설정도 해당 배포 환경에 맞게 확인합니다.

JWT는 HS256으로 서명합니다. 문서 서버의 브라우저·송신 JWT 검증을 활성화하고 동일한 비밀키를 사용합니다. 콜백은 본문의 `token`과 헤더의 JWT 두 방식을 지원하며, 서명으로 검증한 필드만 처리합니다. 비밀키와 R2 자격증명은 브라우저에 보내지 않습니다.

`pnpm db:migrate`로 `015_onlyoffice.sql`을 적용합니다. 실제 문서 서버가 없거나 설정이 빠져 있으면 새 탭에 연결 설정 안내가 표시됩니다.

## 저장 흐름

### Docker Desktop에서 로컬 개발

앱은 Windows에서, ONLYOFFICE는 Docker Desktop에서 실행한다면 다음 주소를 사용합니다.

```dotenv
APP_URL=http://localhost:3000
ONLYOFFICE_DOCUMENT_SERVER_URL=http://localhost:8080
ONLYOFFICE_PUBLIC_APP_URL=http://host.docker.internal:3000
```

컨테이너의 `localhost`는 컨테이너 자신입니다. 파일 제공·콜백 URL에 Windows 호스트 주소를 사용해야 합니다. 설정 변경 후 앱을 재시작하고 기존 편집 탭을 닫은 뒤 문서함에서 다시 엽니다. 문서 서버 로그에 사설 IP 차단 오류가 있으면 개발용 컨테이너의 `ALLOW_PRIVATE_IP_ADDRESS=true` 설정도 확인합니다.

콜백 API는 ONLYOFFICE 서버가 서명된 JSON을 `POST`하는 주소입니다. 브라우저 주소창으로 열면 `GET` 요청이 되어 `405 Method Not Allowed`가 반환됩니다. 로그의 `;data`는 콜백 URL의 일부가 아니므로 URL에 붙이지 않습니다.

- 문서 서버는 쿠키 대신 파일·프로젝트·사용자·문서 버전에 한정된 서명 URL로 원본을 가져옵니다. 원본 URL은 24시간 유효하며, 긴 편집 작업은 저장 후 문서를 다시 여세요.
- 저장 버튼은 `forcesave`를 사용합니다. 상태 6 콜백에서 R2와 DB에 반영하고 현재 공동 편집 키는 유지합니다.
- 최종 저장(상태 2)과 변경 없는 종료(상태 4) 후 다음 열기에 사용할 문서 버전 키를 바꿉니다. 종료된 버전의 재전송 콜백은 내용을 덮어쓰지 않습니다.
- 원본과 같은 파일당 20MiB 제한을 적용합니다. 저장할 파일은 설정된 문서 서버와 동일한 origin에서만 가져오며 리다이렉트를 허용하지 않습니다.
- 새 객체에 저장한 뒤 DB의 객체 경로를 바꾸고, 커밋 후 이전 객체를 정리합니다. 저장 실패 시 기존 문서를 유지합니다. 강제 종료나 정리 실패로 남는 객체는 별도 정리가 필요할 수 있습니다.
- 저장 시 프로젝트 수정 권한을 다시 확인합니다. 편집 도중 삭제한 문서는 저장 콜백으로 복원하지 않습니다.
- 편집기의 변경 상태 알림은 R2 저장 완료를 의미하지 않습니다. 저장 실패 시 ONLYOFFICE의 오류 안내를 확인하세요. 최종 저장은 편집 종료 후 서버에서 처리되므로 즉시 다운로드하면 이전 파일일 수 있습니다.

## 검증

`node scripts/test-documents.mjs`는 로컬 DB와 가짜 S3·문서 서버로 실제 라우트·JWT 검증·저장·버전·권한·실패 처리를 검사합니다. 실제 문서 서버 설정 후에는 새 탭 열기 → 수정 → 저장 → 문서함 다운로드 순서로 브라우저에서 확인합니다.

공식 문서: [React 연결](https://api.onlyoffice.com/docs/docs-api/get-started/frontend-frameworks/react), [저장 콜백](https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler).
