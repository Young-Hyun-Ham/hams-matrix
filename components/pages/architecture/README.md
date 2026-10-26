# 아키텍처 화면과 AI 이미지

- `architecture-diagram.tsx` / `architecture-summary.tsx`: 기존 구성 요약 카드와 아키텍처 선택.
- `architecture-image-actions.tsx`: 공통 `shared/ai-image-actions.tsx`에 아키텍처 설정 전달. 저장 이미지가 있으면 모델 선택과 AI 호출을 건너뜁니다.
- `architecture-structure-editor.tsx`: 이미지 생성에 전달할 구성요소·연결 관계 편집.
- `lib/ai/architecture-image-prompt.ts`: 서버에서 최신 아키텍처 필드와 전체 topology를 프롬프트에 결합. 예시와 같은 계층형 배치, 인프라 경계, 서버·DB·통신 화살표를 지시합니다. 불명확한 기술이나 통신 관계는 확정하지 않습니다.
- `lib/ai/architecture-images.ts`: 프로젝트 권한 확인, 중복 생성 잠금, 버전 검사, 암호화 저장 및 조회. AI 요청 동안 DB 트랜잭션을 유지하지 않습니다. 새 이미지 저장에 성공해야 기존 이미지가 교체됩니다.
- `lib/ai/image-crypto.ts`: 채팅 이미지와 공유하는 AES-256-GCM 암호화. 아키텍처·프로젝트·워크스페이스·이미지 메타데이터를 인증 데이터에 포함합니다.

## 서버 설정

`OPENAI_API_KEY`, `AI_IMAGE_ENCRYPTION_KEY`, DB 연결 설정이 필요합니다. 기존 암호화 키를 바꾸면 저장 이미지를 복호화할 수 없으므로 키를 유지해야 합니다. 키가 없는 환경에서는 `node scripts/setup-ai-image-key.mjs`로 생성합니다. 서버 설정 값은 브라우저로 전달하지 않습니다.

`pnpm db:migrate`로 `012_architecture_images.sql`을 적용합니다. 선택적으로 `OPENAI_IMAGE_MODELS`로 이미지 모델을 제한하고 `OPENAI_IMAGE_MODEL`로 기본값을 정할 수 있습니다. 모델 목록은 API에서 조회한 사용 가능 목록과 교차 확인합니다.

## API

- `GET /api/ai/image-models`: 로그인 후 이미지 모델 목록 조회.
- `GET /api/projects/:projectId/artifacts/:artifactId/image`: 이미지 메타데이터 조회. 암호문과 이미지 본문은 포함하지 않습니다.
- `POST .../image`: `{model,prompt,artifactVersion,regenerate?,expectedImageId?}`. 편집 권한이 필요합니다.
- `GET .../image/content?imageId=:id`: 권한 검사 후 복호화한 PNG. `download=1`은 첨부 다운로드입니다. 결과는 캐시하지 않습니다.

미리보기와 다운로드는 동일한 저장 이미지 ID를 사용합니다. 원본 아키텍처가 수정돼도 자동 재생성하지 않고 생성 버전이 다름을 표시합니다. 삭제된 아키텍처와 접근 권한이 없는 프로젝트의 이미지는 조회할 수 없습니다.

## 검증

`pnpm test:architecture-images`는 실제 라우트, 인증·권한, 임시 SQLite DB, 전체 마이그레이션과 암호화를 검증합니다. Next의 요청 쿠키 컨텍스트와 외부 OpenAI 응답만 대체합니다. 유료 API 요청은 보내지 않습니다.

AI 결과의 텍스트·배치 정확도와 시각적 품질은 모델에 따라 달라집니다. 실제 생성 이미지에 대한 내용 확인과 필요시 재생성이 필요합니다.
