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

## 이미지 생성

### 이미지 생성이 너무 느림

현재 구조는 text-to-image 기준으로 diffusers subprocess 또는 Automatic1111 API를 사용합니다. 느릴 때 우선 확인할 항목:

1. 해상도 낮추기 (`512x512`, `512x768`부터)
2. steps 줄이기 (`24 → 16` 또는 `20 → 15`)
3. scheduler 변경 (`euler_a`, `euler`, `dpm++_2m` 비교)
4. batch size 줄이기
5. LoRA를 많이 겹치지 않기

향후 개선 후보:

- few-step 모델(SDXL Lightning, LCM 계열) 검토
- DPM 계열 scheduler 기준 기본 프리셋 재조정
- latent preview / progress UX 개선
- compile / quantization / hot-swap 최적화

### Diffusers 생성이 실패함

확인 항목:

- Python 환경에 diffusers / torch / accelerate 설치 여부
- CUDA 사용 가능 여부
- 모델 첫 다운로드 중인지 여부
- VRAM 부족 여부

### Automatic1111 연결 테스트 실패

- Base URL 확인 (`http://localhost:7860` 등)
- WebUI / Forge가 실제로 실행 중인지 확인
- API 모드가 열려 있는지 확인

### 이미지 생성 중 추론 서버가 멈춤

이미지 생성과 qwen-local 추론은 VRAM을 공유하므로 생성 시 inference server가 잠시 중지될 수 있습니다. 생성 완료 후 자동 재시작이 정상 동작인지 `/api/ai/inference-status` 또는 AI 설정 화면에서 확인합니다.

---

## LoRA 학습

### LoRA 학습 중 생성/추론이 안 됨

정상 동작일 수 있습니다. 현재 구조는 학습 시 GPU 자원을 우선 확보하기 위해 inference/image generation과 충돌을 피하도록 설계되어 있습니다.

### LoRA 로그가 안 보임

- 프로젝트별 AI 설정 허브(`/settings/ai?projectId=<id>`)에서 LoRA 섹션 확인
- 학습 상태 polling 실패 여부 확인
- 브라우저 네트워크 탭에서 training-status API 응답 확인

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
