# 로드맵 / 추후 작업

이 문서는 현재 코드베이스 기준으로 아직 구현되지 않았거나, 추가 개선이 필요한 작업을 정리한 문서입니다.

## 현재 상태 요약

- 홈 화면 스토리 구상 탭과 소설 목록 탭 제공
- `/settings/ai`에서 스토리 구상용 AI 설정 + 프로젝트별 AI / 이미지 / LoRA 설정 통합
- 다중 AI provider 지원
- 캐릭터 이미지 text-to-image 생성 지원
- LoRA 학습 / 로그 / 추론 연동 지원

아래 항목들은 현재 코드에 없거나, 구현이 있어도 추가 고도화가 필요한 작업입니다.

## 1. 사이트 한국어 / 영어 전환 기능

### 현재 상태

- 앱 전반이 한국어 하드코딩 상태
- `src/app/layout.tsx`는 `lang="ko"`
- locale route / message bundle / locale persistence 구조 없음

### 권장 방향

- Next.js App Router 기준 `next-intl` 도입
- `localePrefix: 'as-needed'` 전략으로 한국어 기본 URL 유지
- `/en/...` 경로로 영어 페이지 제공
- 공통 UI 문자열 → message 파일로 추출
- metadata / navigation / server component 번역 지원

### 예상 작업

1. locale routing / middleware 추가
2. message 파일 구조 도입 (`ko`, `en`)
3. 주요 shared UI부터 문자열 추출
4. locale switcher 추가
5. API 에러 문구 / Python 보조 스크립트 메시지 정리

## 2. 이미지 to 이미지 기능

### 현재 상태

- 현재는 text-to-image만 지원
- diffusers subprocess와 Automatic1111 txt2img 경로만 존재
- init image, strength, mask, inpaint, controlnet 경로 없음

### 목표 범위

- 기존 캐릭터 이미지를 기반으로 변형 생성
- 구도 유지 + 의상/표정/분위기 변경
- 향후 inpaint / partial edit까지 확장 가능하도록 설계

### 추천 1차 범위

- base image 1장 선택
- `strength` 슬라이더 추가
- prompt / negative prompt 재사용
- 결과를 새 variation으로 갤러리에 저장

### 확장 후보

- inpaint mask 편집
- background-only variation
- portrait → full-body / illustration 확장
- ControlNet pose / depth / canny 연동

## 3. 이미지 생성 속도 개선

### 현재 병목

- SDXL 계열 모델의 모델 로드 시간과 VAE decode 비용
- 고해상도 / 높은 steps / 큰 batch size 사용 시 지연 증가
- 이미지 생성 시 inference server와 VRAM 경쟁

### 현실적인 개선 방향

#### 모델 / 스텝 전략

- few-step 모델(SDXL Lightning, LCM 계열) 검토
- 기본 step 프리셋 재설계
  - fast
  - balanced
  - quality

#### scheduler / pipeline 최적화

- `dpm++_2m` 등 더 빠른 수렴 scheduler 검토
- `torch.compile` / regional compile 검토
- bf16 / fp16 / SDPA / xformers 사용 조건 점검
- LoRA hot-swap 가능 구조 검토

#### UX 기반 속도 개선

- latent preview 또는 draft preview 먼저 표시
- 빠른 저해상도 초안 → 후속 upscale 2단계 흐름
- progress / stage 메시지 개선으로 체감 속도 개선

#### 인프라 / 자원 활용

- multi-GPU batch splitting 검증 및 튜닝
- batch size 자동 축소 retry
- 해상도별 권장 preset 제공

## 4. 이미지 생성 UX 고도화

### 다음 후보

- prompt 구성 미리보기
- prompt 출처별 분해 표시
  - 기본 프리셋
  - 캐릭터 기반 태그
  - 자동 번역 태그
  - 사용자 추가 태그
  - LoRA trigger
- 타입별 추천 태그 퀵픽
- 사용자 프리셋 저장 / 불러오기
- 결과 기반 변형 생성

## 5. 문서 / 운영 측면 후속 작업

- 이미지 생성 / LoRA 운영 가이드 분리
- provider별 설정 예시 문서 보강
- 성능 측정 기준 정리
  - 모델별
  - 해상도별
  - batch size별

## 우선순위 제안

### 단기

1. 이미지 생성 prompt 구성 미리보기
2. 이미지 생성 속도 프리셋(fast / balanced / quality)
3. KR/EN 전환 구조 설계

### 중기

1. image-to-image 1차 버전
2. 추천 태그 퀵픽 / 프리셋 저장
3. few-step 모델 실험

### 장기

1. inpaint / controlnet
2. locale 전면 적용
3. 이미지 생성 성능 자동 튜닝
