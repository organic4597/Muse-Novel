# AI 연결과 모델 설정

Muse Novel의 검색, 에이전트 루프, 프롬프트 구성과 저장은 웹 서버에서 실행됩니다. LLM 서버는 텍스트 추론 API만 제공하므로 모델을 바꿔도 웹 기능의 규격은 유지됩니다.

## 설정 우선순위

API 키 대신 ChatGPT 구독의 Codex 한도를 사용하려면 [ChatGPT OAuth · OpenCode 호환 모듈](OpenCode-OAuth)을 참고하세요. 기존 API 연결을 보존하는 선택형 제공자입니다.

1. 프로젝트별 AI 설정
2. 전역 AI 설정
3. 환경 변수 fallback

홈 스토리 구상은 전역 설정을 기본으로 사용합니다. 프로젝트 집필·수정 기능은 해당 프로젝트 설정이 있으면 이를 우선합니다. 문제가 생기면 전역과 프로젝트 양쪽에 서로 다른 주소나 모델 ID가 저장되어 있지 않은지 확인하세요.

Ghost Text는 이 우선순위를 상속하지 않습니다. 프로젝트별 전용 로컬 연결이 반드시 필요하며, 설정이 없거나 공개 클라우드 제공자로 저장된 과거 설정은 자동완성을 비활성화합니다.

## OpenAI 호환 Local LLM

필수 규격:

| 요청 | 용도 |
| --- | --- |
| `GET /health` | 연결 확인 |
| `GET /v1/models` | 모델 ID 확인 |
| `POST /v1/chat/completions` | 스토리 구상·세계관·집필·수정 |
| `POST /v1/completions` | Ghost Text |

Base URL은 일반적으로 `/v1` 앞의 서버 루트를 입력합니다. 모델 ID는 추측하지 말고 `/v1/models`가 반환한 `id` 또는 llama-server의 `--alias`와 정확히 같게 입력합니다.

예시:

```text
Base URL: http://127.0.0.1:8080
Model ID: SuperQwen-example
API Key: 서버가 요구할 때만 입력
Context length: 실제 서버 설정 이하
```

## WSL·Docker 주소 주의

- Windows 앱에서 WSL 서비스에 접근할 때는 Windows에서 실제로 열리는 주소를 사용합니다.
- Docker 컨테이너의 `127.0.0.1`은 Windows나 WSL이 아니라 해당 컨테이너입니다.
- 같은 Docker 네트워크의 서비스 이름, 호스트 게이트웨이 또는 방화벽으로 제한한 사설 주소를 사용합니다.
- 실제 내부 IP, API 키, 환경 파일은 Git에 커밋하지 않습니다.
- LLM을 `0.0.0.0`에 바인딩할 때는 신뢰된 LAN과 방화벽 안에서만 사용합니다.

## AI 환경 화면

상단 **AI 환경**에서 다음 순서로 설정합니다.

1. 공통 AI provider와 모델을 저장합니다.
2. 연결 테스트로 health와 모델 목록을 확인합니다.
3. SearXNG, 임베딩, 태그 추천 같은 공통 연결을 각각 테스트합니다.
4. 프로젝트 선택 후 프로젝트별 AI·임베딩·이미지·LoRA 설정을 확인합니다.

API 키는 DB에 암호화해 저장합니다. 로컬 SQLite는 암호화 키 파일을 생성하고, Turso나 클라우드에서는 `ENCRYPTION_KEY`를 직접 지정해야 합니다.

## 대기열과 제한 시간

로컬 LLM은 기본 동시 실행 1개와 최대 대기 24개로 운영됩니다. 대화·집필 같은 사용자 요청이 배경 작업보다 우선됩니다.

- 일반 장기 AI 요청: 최대 10분
- 검색 필요성 계획: 최대 120초
- SearXNG 호출: 12초
- 일반 연결 테스트: 약 10초
- Ghost Text: 짧은 클라이언트 제한을 별도 사용

10분 제한을 늘리는 것보다 모델 로딩 시간, 컨텍스트 크기, KV cache, 실제 tokens/sec와 대기열을 함께 점검하는 편이 좋습니다.

## 임베딩

장기 기억과 창작 지식 의미 검색은 OpenAI 호환 `/v1/embeddings` API를 사용합니다. 연결되지 않거나 인덱스가 준비되지 않았으면 키워드 검색으로 자동 전환되므로 집필 자체는 계속할 수 있습니다.

대표 환경 변수:

```dotenv
QWEN_LOCAL_URL=http://127.0.0.1:8080
AI_LOCAL_CONCURRENCY=1
AI_LOCAL_MAX_QUEUE_SIZE=24
EMBEDDING_BASE_URL=http://127.0.0.1:8081
EMBEDDING_MODEL=Qwen3-Embedding-0.6B
WEB_SEARCH_URL=http://muse-search:8080
```

설정 화면에 저장된 값이 환경 변수보다 우선합니다.

