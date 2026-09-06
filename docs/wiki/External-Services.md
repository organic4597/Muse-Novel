# 외부 API 계약

Muse Novel은 LLM·임베딩·검색·태그 추천·이미지 생성 서비스를 HTTP API로 호출합니다. 외부 프로세스의 설치, 모델 로드, GPU 선택, VRAM 조정과 재시작은 각 서비스 운영자가 담당합니다.

## 공통 규칙

- Base URL의 마지막 `/`는 생략 가능
- API 키는 필요한 서비스에만 설정
- 연결 테스트 성공은 모델 추론 성공을 보장하지 않으므로 실제 짧은 생성도 확인
- 브라우저가 아니라 Muse Novel 서버/컨테이너가 접근 가능한 주소 사용
- 실제 내부 주소와 키를 저장소에 커밋하지 않음

## Local LLM

OpenAI 호환 API를 사용합니다.

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| GET | `/health` | 서버 준비 상태 |
| GET | `/v1/models` | 모델 ID 확인 |
| POST | `/v1/chat/completions` | 대화·기획·세계관·집필·수정 |
| POST | `/v1/completions` | Ghost Text |

서버 alias와 설정 화면의 모델 ID가 일치해야 합니다. Muse Novel의 장기 생성 요청 제한은 최대 10분이지만 Ghost Text는 사용성을 위해 훨씬 짧은 제한을 사용합니다.

## 임베딩

OpenAI 호환 `POST /v1/embeddings`와 모델 확인용 `GET /v1/models`를 사용합니다. 입력은 검색 단위로 분할한 작품 기억 또는 창작 지식입니다. 서비스가 중단되면 키워드 검색으로 자동 전환됩니다.

## SearXNG

`GET /search?q=...&format=json` 형태의 JSON 검색을 사용합니다. SearXNG 설정의 `search.formats`에 `json`이 활성화되어 있어야 합니다. 검색어만 전달하고 원고 전체·로그인 정보·API 키는 검색 요청에 포함하지 않습니다.

## Diffusers 이미지 API

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| GET | `/health` | 연결 테스트 |
| POST | `/generate` | 이미지 생성 |

요청 예시:

```json
{
  "prompt": "portrait, ...",
  "negativePrompt": "blurry, ...",
  "width": 512,
  "height": 512,
  "steps": 24,
  "sampler": "euler_a",
  "cfgScale": 6,
  "batchSize": 1,
  "modelName": "model-id",
  "loraId": "optional-adapter-id",
  "loraWeight": 1
}
```

응답은 `images[].base64`, seed, width, height를 포함해야 합니다. 생성 요청 제한은 최대 10분입니다.

## Automatic1111 / Forge

- 연결 확인: 구현된 health 경로
- 생성: `POST /sdapi/v1/txt2img`
- 기본 생성 제한: 2분

provider별 지원 필드 차이가 있으므로 설정 화면의 미리보기 요청으로 먼저 확인합니다.

## 태그 추천

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| GET | `/health` | 연결 테스트 |
| POST | `/recommend` | 한국어 설명에서 이미지 태그 추천 |
| POST | `/translate` | 텍스트 번역 |

연결되지 않아도 이미지 생성 자체는 가능하지만 자동 태그·번역 보조가 생략될 수 있습니다.

## LoRA

현재 Muse Novel은 프로젝트별 LoRA 서비스 주소 저장과 health 테스트, 로컬 레지스트리 조회, 캐릭터 이미지 요청에 LoRA ID·가중치·trigger words 전달을 제공합니다. 실제 가중치 로드와 적용 여부는 외부 이미지 서버가 책임집니다.

Muse Novel 안에서의 LoRA 학습 시작·취소·진행률 복구와 완성 모델 자동 등록은 아직 확정된 공통 계약이 아닙니다. 기존 LoRA 기록은 설정 화면에서 확인할 수 있지만 전체 학습 관리 기능으로 간주하지 않습니다.

