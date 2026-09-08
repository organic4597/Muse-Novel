# 설치 및 실행

## 요구 사항

- Node.js 20 이상
- Bun 1.3 이상
- 선택: Docker
- AI 기능 사용 시 별도의 LLM API

## 로컬 실행

```bash
git clone https://github.com/organic4597/Muse-Novel.git
cd Muse-Novel
bun install
cp .env.example .env.local
bun dev
```

PowerShell에서는 `Copy-Item .env.example .env.local`을 사용합니다. 개발 서버는 기본적으로 `127.0.0.1:3000`에서 열립니다. SQLite DB와 인증 디렉터리는 처음 실행할 때 `data/` 아래에 자동 생성됩니다.

## Docker 실행

```bash
cp .env.example .env
docker build -t muse-novel:latest .
docker volume create muse-novel-data
docker run -d --name muse-novel --restart unless-stopped \
  -p 3210:3000 \
  --env-file .env \
  -v muse-novel-data:/app/data \
  muse-novel:latest
```

브라우저에서 `http://localhost:3210`으로 접속합니다. 컨테이너를 업데이트할 때도 `muse-novel-data:/app/data`를 다시 연결해야 DB, 업로드 이미지, 로그인 계정이 유지됩니다.

공개 도메인을 연결해도 별도 회원가입은 제공하지 않습니다. 서버의 최초 설정 과정에서 만든 로컬 관리자 계정만 로그인할 수 있으며 로그인 세션은 24시간 후 만료됩니다.

## 최초 로그인

LAN에서 사용할 서버라면 실행 전에 `.env.local` 또는 `.env`에 `MUSE_AUTH_SETUP_TOKEN`을 설정하세요. 만드는 방법과 `/setup` 입력 순서는 [로그인과 운영 보안](Security)에 있습니다.

1. 처음 접속하면 `/setup`으로 이동합니다.
2. 환경 변수에 넣은 초기 설정 코드를 입력합니다.
3. 관리자 아이디와 12자 이상 비밀번호를 만듭니다.
4. 이후 `/login`에서는 관리자 아이디와 비밀번호만 사용합니다.

초기 설정 코드는 로그인 비밀번호가 아닙니다.

## AI 없이 먼저 확인

LLM을 연결하지 않아도 로그인, 프로젝트·챕터·캐릭터·세계관·지도 관리와 원고 편집은 사용할 수 있습니다. AI 기능은 provider 연결 전에는 오류 또는 연결 안내를 표시할 수 있습니다.

## AI 연결

로그인 후 상단 **AI 환경**에서 공통 LLM을 먼저 연결합니다. WSL llama.cpp, Ollama, 외부 API의 Base URL과 모델 ID 입력 방법은 [AI 연결과 모델 설정](AI-Configuration)을 참고하세요.

권장 확인 순서:

1. LLM 서버의 `/health`
2. `/v1/models`의 실제 모델 ID
3. AI 환경의 연결 테스트
4. 홈 스토리 구상에서 짧은 요청
5. 프로젝트 집필 에이전트와 World assistant

## 첫 프로젝트 사용 순서

1. 홈에서 새 소설을 만들거나 [스토리 구상](Story-Planning) 결과를 적용합니다.
2. **작품 정보**에서 시놉시스와 집필 기준을 확인합니다.
3. **캐릭터**, **세계관**에서 설정을 추가합니다.
4. **지도**에서 이미지를 올리고 항목 핀을 배치합니다.
5. **집필**에서 챕터를 만들고 원고를 작성합니다.
6. 작가 노트와 지속 상태 메모에 반드시 기억할 규칙·소지품·기술·상태를 기록합니다.

## 데이터베이스 명령

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

일반 실행은 기존 마이그레이션을 자동 적용합니다. 새 마이그레이션 생성이나 수동 점검 때만 위 명령을 사용합니다.

## 다음 문서

- [운영·백업·업데이트](Operations)
- [트러블슈팅](Troubleshooting)
- [외부 API 계약](External-Services)
