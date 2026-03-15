# muse-novel

한국어 소설 집필을 위한 AI 보조 웹앱입니다. 프로젝트, 챕터, 등장인물, 세계관을 한곳에서 관리하고, AI 보조 작성과 스토리 구상 기능으로 초안 작성부터 설정 정리까지 이어서 작업할 수 있습니다.

## 핵심 기능

- 소설 프로젝트 생성 및 관리
- 챕터 작성, 정렬, 자동 저장
- 등장인물 / 세계관 항목 CRUD
- AI 보조 작성 및 명령형 편집
- 홈 화면 스토리 구상 탭
- 공용 AI 설정과 프로젝트별 AI 설정 분리
- 캐릭터 이미지 프롬프트용 한국어 태그 추천 및 번역
- 다크 모드 / 시스템 테마 동기화
- LoRA 관리 및 프로젝트 삭제 시 공유 LoRA 보존

## 최근 반영 사항

- 홈 화면에 소설 목록 / 스토리 구상 탭 추가
- 스토리 구상 대화 결과를 새 소설 프로젝트로 일괄 적용 가능
- 공용 AI 설정 API 추가
- 한국어 프롬프트 태그 추천을 위한 상주 Python 서버 추가
- 개발/실행 스크립트에서 태그 서버 자동 실행
- 프로젝트 삭제 시 공유 LoRA는 유지하고 프로젝트 소유 데이터만 정리하도록 수정

## 기술 스택

- Next.js 16 App Router
- React 19
- TypeScript 5
- Tailwind CSS v4
- Drizzle ORM + SQLite / Turso
- Vercel AI SDK
- Plate.js editor
- Python tag recommender server

## 요구 사항

### Node / Bun

- Node.js 20+
- Bun 1.3+

### Python

- Python 3.10+
- 권장 패키지

```bash
pip install numpy sentence-transformers transformers torch
```

태그 추천 서버는 한국어 입력을 영어 태그로 번역하고 임베딩 검색을 수행하므로 첫 실행 시 모델 다운로드에 시간이 걸릴 수 있습니다.

## 설치

```bash
git clone <your-repo-url>
cd muse-novel
bun install
cp .env.example .env.local
```

필요하면 Python 의존성도 설치합니다.

```bash
pip install numpy sentence-transformers transformers torch
```

## 환경 변수 설정

기본 예시는 .env.example에 있습니다.

주요 항목:

- `DATABASE_PROVIDER=sqlite` 또는 `turso`
- `DATABASE_URL` 로컬 SQLite 경로
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `NVIDIA_API_KEY`
- `NVIDIA_BASE_URL`
- `NVIDIA_MODEL`
- `ENCRYPTION_KEY` 프로젝트/공용 AI 설정 API 키 암호화용
- `TAG_RECOMMENDER_PORT` 태그 추천 서버 포트, 기본값 `9877`
- `PYTHON_BIN` 태그 서버 실행용 Python 바이너리 경로

AI는 두 단계로 선택됩니다.

1. 홈 스토리 구상 탭의 공용 AI 설정
2. 없으면 환경 변수 기반 기본 provider fallback

## 개발 실행

기본 개발 모드는 태그 추천 서버를 함께 띄웁니다.

```bash
bun dev
```

웹 서버만 따로 실행하려면:

```bash
bun run dev:web
```

태그 추천 서버만 따로 실행하려면:

```bash
bun run tag-server
```

브라우저 접속:

- `http://localhost:3000`

## 프로덕션 실행

```bash
bun run build
bun run start
```

`start`와 `preview`도 태그 서버를 함께 실행합니다.

## 데이터베이스

마이그레이션 관련 명령:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

최근 마이그레이션:

- `0007_shared_loras.sql` : `loras.project_id` nullable + `ON DELETE SET NULL`

## 사용 방법

### 1. 소설 목록에서 수동 생성

- 홈의 소설 목록 탭에서 `새 소설` 버튼 클릭
- 제목 입력 후 프로젝트 생성

### 2. 스토리 구상 탭으로 생성

- 홈의 `스토리 구상` 탭 진입
- AI와 대화하며 제목, 장르, 시놉시스, 등장인물, 세계관, 첫 장 개요를 구상
- 우측 `기획 초안` 패널에서 현재 구조화 상태 확인
- `이 설정으로 소설 만들기` 버튼으로 프로젝트 생성

생성 시 포함되는 항목:

- 프로젝트 제목 / 장르 / 시놉시스
- 등장인물 일괄 생성
- 세계관 항목 일괄 생성
- 1장 개요 생성
- 원본 draft snapshot을 `project.settingsJson`에 저장

### 3. 프로젝트 내 작업

- 챕터 작성 및 자동 저장
- 등장인물 정리
- 세계관 문서화
- AI 보조 작성
- 이미지 프롬프트 태그 추천
- LoRA 및 스타일 프로필 관리

## 주요 API

### 홈 / 스토리 구상

- `GET /api/global-ai-settings`
- `POST /api/global-ai-settings`
- `PUT /api/global-ai-settings`
- `DELETE /api/global-ai-settings?id=...`
- `POST /api/story-planning/chat`
- `POST /api/story-planning/apply`

### 프로젝트

- `GET/POST /api/projects`
- `GET/PATCH/DELETE /api/projects/[id]`
- `.../chapters`
- `.../characters`
- `.../world-entries`
- `.../ai-settings`
- `.../style-profiles`

### AI / 유틸리티

- `POST /api/ai/copilot`
- `POST /api/ai/command`
- `POST /api/prompt-tags/recommend`

## 디렉토리 개요

```text
src/
	app/
		(main)/
			page.tsx
			home-tab-shell.tsx
			story-planning-tab.tsx
		api/
			global-ai-settings/
			story-planning/
			projects/
			ai/
	components/
		settings/
		ui/
	lib/
		ai/
		db/
		image-gen/
		theme.ts
		tag-recommender-client.ts
scripts/
	run-with-tag-server.sh
	tag_recommender.py
	tag_recommender_server.py
drizzle/
	0007_shared_loras.sql
```

## 테스트 / 검증

```bash
bun run typecheck
bun run test
bun run test:e2e
```

수동 확인 권장 항목:

- 홈 스토리 구상 탭 대화
- 공용 AI 설정 저장/수정
- 스토리 구상 결과 프로젝트 생성
- 프로젝트 삭제 시 공유 LoRA 유지 여부
- 한국어 프롬프트 태그 추천 품질

## 주의 사항

- 현재 GitHub 사용자 인증 기능은 없습니다.
- 공용 AI 설정에 저장되는 API 키는 DB 암호화를 전제로 합니다. `ENCRYPTION_KEY` 설정을 권장합니다.
- 태그 추천 서버는 메모리를 사용하며 초기 모델 로딩 시간이 깁니다.
- 홈 스토리 구상 세션은 서버 DB가 아니라 브라우저 localStorage에 임시 저장됩니다.

## 라이선스

저장소의 LICENSE를 따릅니다.
