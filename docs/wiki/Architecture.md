# 아키텍처 개요

## 전체 구조

- UI: Next.js App Router + Client Components
- API: Route Handlers
- DB: Drizzle ORM + SQLite / Turso
- AI: provider-factory 기반 다중 provider 추상화
- 이미지 생성: diffusers subprocess + Automatic1111 API
- 태그 추천: 별도 Python HTTP 서버
- 로컬 추론: llama.cpp llama-server (qwen-local provider)

## 주요 계층

### 홈 화면

- 소설 목록 탭
- 스토리 구상 탭
- 전역 AI 설정 사용

### 프로젝트 작업 영역

- 챕터 작성
- 등장인물 관리
- 세계관 관리
- 프로젝트별 AI 설정

### AI 계층

- 공용 AI 설정: `/settings/ai`
- 프로젝트별 AI 설정: 집필/편집 기능
- fallback: 환경 변수 provider

지원 provider:

| Provider | 방식 | 비고 |
|----------|------|------|
| `openai` | @ai-sdk/openai | API 키 필요 |
| `anthropic` | @ai-sdk/anthropic | API 키 필요 |
| `ollama` | ollama-ai-provider-v2 | 로컬 |
| `nvidia` | OpenAI compat | API 키 필요 |
| `koboldcpp` | OpenAI compat | 로컬 |
| `qwen-local` | OpenAI compat | 로컬 llama-server |

### 이미지 생성 계층

- 프로젝트별 이미지 설정: `ImageSettingsPage`
- 생성 방식:
  - `diffusers` — Python subprocess로 직접 생성
  - `automatic1111` — Stable Diffusion WebUI / Forge API 호출
- 캐릭터 이미지 생성 흐름:

```
ImageGenerationDialog
  └─ /api/projects/[id]/characters/[characterId]/images/generate
       └─ generateCharacterImages()
            ├─ prompt-builder
            ├─ tag-translator
            ├─ diffusers-client or automatic1111-client
            └─ public/uploads/characters/.../generated
```

- profile / full-body / illustration 프리셋별 크기, batch size, prompt defaults, negative defaults 사용
- 생성 시 VRAM coordinator가 추론 서버와 충돌하지 않도록 inference server를 잠시 중지할 수 있음

### qwen-local 추론 서버 계층

`qwen-local` provider는 로컬에서 실행하는 llama-server와 통신합니다.

```
앱 (Next.js)
  └─ /api/projects/[id]/settings/ai/qwen-local/start  → QwenServerManager
       └─ llama-server (localhost:8321)
            └─ GGUF 모델 파일
```

관련 파일:
- `src/lib/ai/qwen-server-manager.ts` — 서버 시작/중지/상태 관리
- `src/app/api/projects/[id]/settings/ai/qwen-local/start/route.ts` — 시작 API
- 로그: `/tmp/qwen-local.log`
- PID: `.qwen-server.pid` (프로젝트 루트)

llama-server는 검열 해제를 위해 `--jinja` + `--chat-template` (Qwen ChatML 형식)으로 실행됩니다. `--system-prompt` 플래그는 llama.cpp b463 이후 제거되어 사용할 수 없습니다.

### 태그 추천 계층

- `scripts/tag_recommender_server.py`
- `src/lib/tag-recommender-client.ts`
- 한국어 번역 + 태그 임베딩 검색

## 데이터 저장 전략

- 로컬 우선 구조
- 스토리 구상 세션은 localStorage 저장
- 확정 시에만 DB 엔티티 생성
- draft snapshot은 `projects.settingsJson`에 저장

## 최근 데이터베이스 변경

- `loras.project_id` nullable
- `ON DELETE SET NULL`로 공유 LoRA 보존
