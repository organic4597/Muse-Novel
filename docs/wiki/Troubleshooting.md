# 트러블슈팅

## qwen-local (Local) 추론 서버

### "추론 서버가 시작 중 종료됨"

앱에서 서버를 시작하면 곧바로 종료 상태로 전환되는 경우입니다.

**진단 방법:**

```bash
tail -50 /tmp/qwen-local.log
```

**흔한 원인과 해결법:**

| 증상 (로그 키워드) | 원인 | 해결법 |
|---|---|---|
| `No such file or directory` | 모델 파일 또는 바이너리 경로 오류 | `QWEN_GGUF_MODEL_PATH`, `LLAMA_SERVER_PATH` 경로 확인 |
| `CUDA out of memory` | GPU VRAM 부족 | `--n-gpu-layers` 값 줄이기 (예: 99 → 40) 또는 다른 GPU 지정 |
| `Address already in use` | 포트 8321 충돌 | `lsof -i :8321` 로 사용 중인 프로세스 확인 후 종료 |
| `invalid argument: --system-prompt` | llama.cpp b463+ 호환성 | 아래 항목 참고 |

---

### "invalid argument: --system-prompt"

llama.cpp b463 이후 `--system-prompt` 플래그가 **제거**되었습니다. 이 플래그를 수동 실행 스크립트나 외부 설정에서 사용 중이면 반드시 제거하십시오.

앱 내부(`qwen-server-manager.ts`)는 이미 `--jinja` + `--chat-template` 조합을 사용하도록 수정되어 있습니다.

수동 실행 시 올바른 예시:

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

---

### GPU VRAM 부족 (`CUDA out of memory`)

`--n-gpu-layers` 값을 줄여 일부 레이어를 CPU로 오프로드합니다.

```bash
# GPU에 40개 레이어만 올리고 나머지는 CPU 처리
--n-gpu-layers 40
```

특정 GPU를 지정하려면 환경 변수를 사용합니다.

```bash
# 인덱스 기반 (덜 안정적)
QWEN_INFERENCE_GPU=1

# UUID 기반 (더 안정적)
QWEN_INFERENCE_GPU_UUID=GPU-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

GPU UUID 확인:

```bash
nvidia-smi -L
```

---

### 서버는 실행 중인데 AI 응답이 없음

1. 서버 상태 확인:

```bash
curl http://localhost:8321/health
```

2. AI 설정 페이지에서 "연결 확인" 버튼으로 헬스체크
3. 로그 확인:

```bash
tail -f /tmp/qwen-local.log
```

4. PID 파일 잔여물 확인 (비정상 종료 후 PID 파일이 남아 있을 경우):

```bash
cat .qwen-server.pid
# PID가 없는 프로세스를 가리키면 삭제
rm .qwen-server.pid
```

---

## 스토리 구상

### draft가 업데이트되지 않거나 기획 초안 패널이 비어 있음

**원인**: Qwen3 Base 모델은 응답 앞에 `<think>…</think>` 추론 블록을 출력하며, 이전 버전의 파서는 이를 처리하지 못해 JSON 파싱에 실패했습니다.

**해결**: `src/lib/ai/story-planning-prompt.ts`의 `parseStoryPlanningResponse`가 `<think>` 블록을 자동 제거하도록 수정되어 있습니다. 최신 코드(`main` 브랜치)를 사용하고 있는지 확인하십시오.

---

### 우측 기획 초안 패널이 보이지 않음

대화를 시작하기 전에도 패널이 항상 렌더링되도록 수정되었습니다. 패널이 보이지 않으면 최신 코드를 사용하고 있는지 확인하십시오.

---

## 태그 추천 서버

### 첫 실행 시 매우 느림

태그 추천 서버는 한국어 번역 모델과 임베딩 모델을 메모리에 로드합니다. 첫 실행 시 모델 다운로드 및 로딩으로 수 분이 소요될 수 있습니다. 이후 재시작 시에는 캐시된 모델이 사용됩니다.

### 태그 추천 서버 수동 실행

```bash
bun run tag-server
```

또는:

```bash
PYTHON_BIN=python3 python3 scripts/tag_recommender_server.py
```

---

## 일반

### tsc 오류

```bash
bun run typecheck
```

0 errors 상태를 유지해야 합니다. 오류 발생 시 해당 파일의 타입 정의를 확인하십시오.

### Biome lint 오류

```bash
bun run lint:fix
```

자동 수정 후 남은 오류는 수동으로 처리합니다.
