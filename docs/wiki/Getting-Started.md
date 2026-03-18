# 설치 및 실행

## 요구 사항

- Node.js 20+
- Bun 1.3+
- Python 3.10+

권장 Python 패키지:

```bash
pip install numpy sentence-transformers transformers torch
```

## 설치

```bash
git clone https://github.com/organic4597/Muse-Novel.git
cd Muse-Novel
bun install
cp .env.example .env.local
```

## 환경 변수

### 기본 항목

- `DATABASE_PROVIDER=sqlite` 또는 `turso`
- `DATABASE_URL`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `NVIDIA_API_KEY`
- `NVIDIA_BASE_URL`
- `NVIDIA_MODEL`
- `ENCRYPTION_KEY`
- `TAG_RECOMMENDER_PORT`
- `PYTHON_BIN`

### 이미지 생성 관련

프로젝트별 이미지 생성은 DB 설정을 우선 사용하지만, 로컬 실행 환경에서는 아래 항목을 같이 준비하는 편이 좋습니다.

- Python + PyTorch CUDA 환경
- diffusers / transformers / accelerate
- 또는 Automatic1111 / Forge 실행용 base URL

권장 추가 패키지 예시:

```bash
pip install diffusers accelerate safetensors sentencepiece xformers
```

Automatic1111 / Forge를 사용할 경우 기본 주소 예시:

```bash
http://localhost:7860
```

### qwen-local (Local) 추론 서버

로컬 llama-server를 사용할 경우 추가로 설정합니다.

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `QWEN_LOCAL_URL` | 추론 서버 주소 | `http://localhost:8321` |
| `QWEN_GGUF_MODEL_PATH` | GGUF 모델 파일 경로 | — |
| `LLAMA_SERVER_PATH` | llama-server 바이너리 경로 | — |
| `QWEN_INFERENCE_GPU` | GPU 인덱스 (선택) | — |
| `QWEN_INFERENCE_GPU_UUID` | GPU UUID (선택, GPU 인덱스보다 우선) | — |

예시:

```bash
QWEN_LOCAL_URL=http://localhost:8321
QWEN_GGUF_MODEL_PATH=/root/models/Qwen3.5-9B-Base-Q4_K_M.gguf
LLAMA_SERVER_PATH=/usr/local/bin/llama-server
```

## 개발 실행

기본 실행:

```bash
bun dev
```

웹 서버만 실행:

```bash
bun run dev:web
```

태그 추천 서버만 실행:

```bash
bun run tag-server
```

## qwen-local 추론 서버 수동 실행

앱 설정 UI의 "서버 시작" 버튼으로 자동 실행할 수 있습니다. 직접 실행할 경우:

```bash
llama-server \
  --model /path/to/model.gguf \
  --port 8321 \
  --host 0.0.0.0 \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  --flash-attn on \
  --jinja \
  --chat-template "{% for message in messages %}{{'<|im_start|>' + message['role'] + '\n' + message['content'] + '<|im_end|>' + '\n'}}{% endfor %}{% if add_generation_prompt %}{{ '<|im_start|>assistant\n' }}{% endif %}"
```

> **주의**: llama.cpp b463 이상에서는 `--system-prompt` 플래그가 제거되었습니다. 반드시 `--jinja` + `--chat-template` 조합을 사용하십시오.

서버 상태 확인:

```bash
curl http://localhost:8321/health
```

로그 확인:

```bash
tail -f /tmp/qwen-local.log
```

## 프로덕션 실행

```bash
bun run build
bun run start
```

## 이미지 생성 빠른 시작

1. `/settings/ai?projectId=<id>`에서 이미지 생성 설정 진입
2. 생성 방식 선택
   - `Diffusers (로컬)`
   - `SD WebUI (API)`
3. 모델 / 기본 steps / sampler / CFG / 기본 negative prompt 설정
4. 캐릭터 상세 화면에서 이미지 생성 다이얼로그 열기
5. profile / full-body / illustration 중 하나를 선택해 미리보기 또는 생성

## DB 명령

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```
