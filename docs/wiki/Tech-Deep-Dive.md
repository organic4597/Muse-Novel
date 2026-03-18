# 기술 분석 문서

이 문서는 Muse Novel 프로젝트에 사용된 주요 기술, 알고리즘, 데이터 구조, 기능별 아키텍처를 한 번에 파악하기 위한 기술 분석 문서입니다.

## 1. 전체 기술 스택

| 영역 | 사용 기술 | 역할 |
|---|---|---|
| 앱 프레임워크 | Next.js 16, React 19, TypeScript 5 | App Router 기반 UI, Route Handler API, 타입 안전성 |
| 패키지/실행 | Bun | 의존성 관리와 개발 스크립트 실행 |
| UI | Tailwind CSS v4, Radix UI, Ariakit, Lucide, Sonner | 레이아웃, 공통 컴포넌트, 접근성, 아이콘, 토스트 |
| 에디터 | Plate.js 52 | 소설 집필용 리치 텍스트 에디터와 플러그인 시스템 |
| 상태/AI 스트리밍 | Vercel AI SDK, @ai-sdk/react | AI 스트리밍 응답, 채팅 인터페이스, 모델 추상화 |
| 데이터베이스 | Drizzle ORM, SQLite, libsql, better-sqlite3 | 프로젝트/챕터/등장인물/세계관/AI 설정 저장 |
| 이미지 생성 | diffusers, Automatic1111 API | 캐릭터 이미지 생성 |
| 로컬 추론 | llama.cpp llama-server, GGUF, Qwen 3.5 | 로컬 글쓰기/구상 보조 모델 제공 |
| 태그 추천 | Python HTTP 서버, sentence-transformers, MarianMT, NumPy | 임베딩 기반 태그 추천과 한→영 번역 |
| 테스트 | Vitest, Testing Library, Playwright | 유닛/통합/E2E 테스트 |
| 코드 품질 | Biome, ESLint, lefthook | 포맷, 정적 검사, 훅 기반 품질 유지 |

## 2. 전체 구조

프로젝트는 크게 **UI 계층**, **API 계층**, **도메인/라이브러리 계층**, **외부 프로세스 계층**으로 나뉩니다.

```text
Next.js App Router UI
  ├─ 프로젝트/집필/등장인물/세계관/설정 페이지
  ├─ Plate.js 편집기 + AI 보조 UI
  └─ 스토리 구상 탭

Route Handlers
  ├─ /api/ai/*
  ├─ /api/story-planning/*
  ├─ /api/projects/[id]/*
  ├─ /api/prompt-tags/*
  └─ /api/global-ai-settings/*

Domain Libraries
  ├─ lib/db/*
  ├─ lib/ai/*
  ├─ lib/image-gen/*
  ├─ lib/export/*
  └─ lib/tag-recommender-client.ts

Sidecar / External Processes
  ├─ llama-server (qwen-local)
  ├─ Python tag recommender server
  ├─ diffusers subprocess
  └─ QLoRA training subprocess
```

핵심 설계 포인트는 다음과 같습니다.

- **로컬 우선 구조**: 스토리 구상 draft는 먼저 브라우저 localStorage에 유지하고, 확정 시에만 DB에 반영합니다.
- **provider 추상화**: OpenAI/Anthropic/로컬 Qwen 등 여러 모델을 같은 인터페이스로 다룹니다.
- **GPU 자원 조정**: 이미지 생성, 로컬 추론, LoRA 학습이 동시에 GPU를 과점하지 않도록 조정 레이어를 둡니다.
- **기능별 Route Handler**: Next.js App Router의 파일 기반 API 구조를 그대로 도메인에 매핑했습니다.

## 3. 데이터베이스 구조

데이터 계층은 Drizzle ORM 기반이며, 주요 엔티티는 다음과 같습니다.

### 프로젝트/집필

- `projects`: 작품의 메타데이터, 설정 JSON, 활성 LoRA, 문체 샘플 등 저장
- `chapters`: 챕터 제목, 순서, 요약, 메모, `contentJson`(Plate.js 문서 JSON) 저장

### 등장인물

- `characters`: 이름, 역할, 외형, 성격, 배경, 아크, 소지품 등 저장
- `characterRelationships`: 등장인물 간 관계 그래프 저장
- `characterEmotions`: 챕터별 감정 변화 메모
- `characterImages`: 생성 이미지 경로, 프롬프트, 시드, 해상도, 모델명 등 저장

### 세계관

- `worldEntries`: 장소, 문화, 마법, 사건 같은 세계관 항목 저장
- `worldEntryLinks`: 세계관 항목 간 연결 관계 저장
- `worldEntryTags`: 항목별 태그 저장

### AI/이미지/문체 설정

- `aiProviderSettings`: 프로젝트별 AI provider 설정
- `imageProviderSettings`: 이미지 생성 provider, 모델, sampler, steps, negative prompt 기본값 저장
- `writingStyleProfiles`: 업로드한 문체 파일과 설명 저장

### LoRA

- `loras`: 학습된 LoRA 파일 경로와 프로젝트 연결 정보 저장

이 구조는 **프로젝트 단위 격리**, **확장 가능한 설정 저장**, **문서형 콘텐츠 + 관계형 메타데이터 혼합**에 맞춰 설계되어 있습니다.

## 4. 집필 에디터 구조

집필 기능은 Plate.js 기반 리치 텍스트 에디터로 구현되어 있습니다.

### 핵심 구성

- `src/components/editor/plate-editor.tsx`
- `src/components/editor/editor-kit.tsx`
- `src/components/editor/plugins/ai-kit.tsx`
- `src/components/editor/plugins/inline-suggestion-plugin.tsx`
- `src/components/editor/use-chat.ts`

### 플러그인 계층

- **문서 요소**: paragraph, heading, blockquote, list, callout, link
- **서식 요소**: bold, italic, underline, code, font 관련 기능
- **편집 UX**: slash command, block menu, drag-and-drop, autoformat, emoji
- **내보내기/파싱**: markdown, docx
- **AI 보조**:
  - `AIKit`: 선택 영역 편집/생성
  - `InlineSuggestionKit`: copilot 스타일 문장 이어쓰기

### 저장 방식

에디터 문서는 HTML이 아니라 **Plate JSON 구조**로 `chapters.contentJson`에 저장됩니다. 이 덕분에:

- 리치 텍스트 구조를 손실 없이 저장 가능
- Markdown/TXT/EPUB 변환이 쉬움
- 블록 기반 편집/재정렬이 안정적임

## 5. AI 명령형 편집 시스템

선택 영역을 기반으로 하는 AI 편집은 `/api/ai/command`를 중심으로 동작합니다.

### 동작 흐름

1. 에디터가 현재 selection, 프로젝트 ID, 챕터 ID, 사용자 지시문을 전송
2. 서버가 먼저 사용자의 요청을 **generate / edit** 중 무엇인지 분류
3. 분류 결과에 따라 서로 다른 프롬프트를 구성
4. 작품 전체 컨텍스트를 추가로 조합
5. 스트리밍 응답을 UI에 점진적으로 반영

### 핵심 알고리즘

- **도구 선택 분류**: 먼저 짧은 분류 프롬프트로 요청 성격을 판별
- **앞뒤 문맥 추출**: 선택된 문장 주변 문단을 잘라 함께 전달
- **작품 전체 컨텍스트 조합**: 프로젝트 요약, 등장인물, 세계관, 챕터 정보를 system prompt에 결합
- **선택 영역 고정 규칙**: 편집 모드에서는 선택 영역만 치환하도록 출력 규칙을 강하게 부여

### 최근 반영된 구조

- AI 질문 시 **소설 전체 컨텍스트**를 참고하도록 변경
- 버튼형 요청(`Improve writing`, `Make longer`) 시 **앞뒤 문맥**을 포함하도록 변경

즉, 이 시스템은 단순 텍스트 리라이트가 아니라 **선택 영역 + 주변 문맥 + 작품 지식 베이스**를 함께 쓰는 구조입니다.

## 6. Copilot / Inline Suggestion 구조

인라인 추천은 `/api/ai/copilot`과 에디터의 inline suggestion 플러그인이 함께 처리합니다.

### 두 가지 경로

#### 1) qwen-local 경로

- 로컬 `llama-server`의 completions endpoint를 직접 사용
- 짧은 이어쓰기 전용 저토큰 설정 사용
- `repeat_penalty` 같은 반복 억제 설정 적용
- LoRA가 활성화된 경우 이 경로가 우선됨

#### 2) 외부 provider 경로

- OpenAI/Anthropic 등의 모델을 공통 provider 레이어로 호출
- 짧고 결정적인 1~2문장 추천을 생성

### 설계 의도

- 인라인 추천은 챗봇보다 더 짧고 빠르게 동작해야 하므로 별도 경량 프롬프트/토큰 전략을 사용
- 로컬 모델과 외부 모델을 모두 같은 UX로 연결하되, 내부 구현은 목적에 맞게 분기함

## 7. 스토리 구상 상태 머신

스토리 구상 탭은 단순 자유 채팅이 아니라 **단계형 상태 머신**입니다.

### 현재 단계 구조

사용자에게 보이는 실질 단계는 5개이며, 마지막에 종료 상태가 있습니다.

1. `genre_tone`
2. `premise`
3. `characters`
4. `world`
5. `plot`
6. `complete` (종료 상태)

### 핵심 데이터 구조

- `StoryPlanningDraft`
- `StoryPlanningCharacter`
- `StoryPlanningWorldEntry`
- `pendingCharacters`
- `pendingWorldEntries`

`pending*` 배열은 아직 확정되지 않은 후보를 임시 보관하는 staging 영역입니다.

### 핵심 알고리즘

- **phase inference**: 사용자 입력을 보고 다음 단계로 넘어갈 수 있는지 판단
- **required field 검사**: 현재 단계에서 필요한 필드가 채워졌는지 검증
- **overlap detection**: AI가 같은 질문을 반복하면 응답 중복률을 계산해 fallback 처리
- **JSON 파싱 복구**:
  - 코드블록 JSON 파싱
  - 본문 내부 JSON 추출
  - 실패 시 부분 필드 복구
- **`<think>` 제거**: Qwen Base 계열이 출력하는 추론 블록을 먼저 제거 후 JSON 파싱
- **중복 제거**: 등장인물/세계관 후보를 정규화 키로 비교해 중복 삽입 방지

### 설계 특징

- 자유 대화를 허용하지만 내부적으로는 구조화 draft를 점진적으로 완성
- 현재 단계와 다른 정보가 들어와도 버리지 않고 staging 후 나중에 반영
- 반복 질문을 줄이기 위해 fallback reply와 기본 옵션 세트를 둠

## 8. 등장인물 / 세계관 / 문체 보조 기능

### 등장인물 제안

`/api/projects/[id]/characters/suggest`는 프로젝트 장르/시놉시스/기존 인물 목록을 문맥으로 넣고, JSON 형태의 새 캐릭터 후보를 생성합니다.

핵심 포인트:

- 기존 이름과 충돌하지 않도록 제약 부여
- 역할 enum을 제한해 잘못된 값 정리
- appearance / personality / backstory / arcDescription을 구조화 생성

### 세계관 항목 제안

`/api/projects/[id]/world-entries/suggest`는 기존 세계관과 현재 작품 설정을 참고해 카테고리/제목/내용/태그를 제안합니다.

### 문체 분석

두 경로가 있습니다.

- 프로젝트 문체 샘플 분석: `/api/projects/[id]/style/analyze`
- 업로드된 문체 프로필 분석: `/api/projects/[id]/style-profiles/[profileId]/analyze`

공통적으로 다음 특징을 분석한 요약을 생성합니다.

- 문장 길이와 호흡
- 시점
- 감정 표현 방식
- 묘사 밀도
- 전반적 톤

이 분석 결과는 이후 AI 집필 프롬프트에 참고 데이터로 들어갑니다.

## 9. 태그 추천 알고리즘

태그 추천은 별도 Python 서버가 담당하는 **임베딩 기반 검색 시스템**입니다.

### 구성 요소

- `scripts/tag_recommender_server.py`
- `src/lib/tag-recommender-client.ts`
- `config/prompt-tags.json`

### 사용 알고리즘

1. 프롬프트 태그 목록을 미리 임베딩으로 변환해 캐시
2. 사용자 입력 또는 캐릭터 설명을 임베딩으로 변환
3. 코사인 유사도로 가장 가까운 태그를 검색
4. 한국어 입력은 MarianMT로 영어로 번역 후 매칭
5. alias/exact match가 있으면 먼저 우선 적용

### 기술 포인트

- **모델**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- **번역기**: `Helsinki-NLP/opus-mt-ko-en`
- **벡터 연산**: L2 정규화 후 dot product 기반 cosine similarity
- **적응형 threshold/topK**: 입력 길이에 따라 추천 수와 임계값 조정
- **autoSplit**: 긴 문장은 fragment 단위로 쪼개서 더 정확한 태그 검색

이 구조 덕분에 한국어로 적은 캐릭터 설명도 Danbooru 계열 영어 태그로 빠르게 변환할 수 있습니다.

## 10. 캐릭터 이미지 생성 구조

캐릭터 이미지 생성은 `/api/projects/[id]/characters/[characterId]/images/generate`를 진입점으로 하는 스트리밍 파이프라인입니다.

### 파이프라인

1. 캐릭터 정보 로드
2. prompt-builder로 기본 프롬프트 구성
3. tag-translator로 한국어 설명을 영어 태그로 보정
4. provider 설정에 따라 분기
   - `diffusers`
   - `automatic1111`
5. 결과 이미지를 `public/uploads/characters/...`에 저장
6. 메타데이터를 `characterImages` 테이블에 기록

### 기능 포인트

- `profile`, `full-body`, `illustration` 프리셋 제공
- batch 생성 가능
- 추가 prompt / negative prompt 덧붙이기 가능
- LoRA ID와 weight를 함께 넣어 생성 시 adapter 반영 가능
- SSE로 생성 진행 상황을 스트리밍 가능

### GPU 조정

이미지 생성 직전에는 VRAM coordinator가 추론 서버를 잠시 멈춰 GPU 메모리를 확보할 수 있습니다.

## 11. LoRA 학습 파이프라인

LoRA 학습은 `/api/projects/[id]/lora/generate`를 통해 시작됩니다.

### 입력 소스 우선순위

1. 업로드된 텍스트 파일들
2. 직접 입력한 텍스트
3. 프로젝트 전체 챕터 내용

### 학습 파이프라인

1. 학습 잠금(lock) 획득
2. 기존 checkpoint가 있으면 resume 여부 판단
3. Python `qlora_trainer.py` subprocess 실행
4. stdout JSON lines를 읽어 stage/progress/log 갱신
5. 완료 시 adapter 파일 생성 여부 확인
6. DB에 LoRA 레코드 생성
7. 프로젝트의 active LoRA로 자동 연결

### 핵심 알고리즘/구조

- **single training lock**: 앱 전체에서 동시 다중 학습 방지
- **checkpoint resume**: 이전 중단 지점을 감지해 이어서 학습
- **sequential multi-job**: 다중 파일 업로드 시 병렬이 아니라 순차 처리
- **status persistence**: training status를 파일/상태 레이어에 저장해 UI polling 가능
- **cancel flow**: 취소 플래그를 감지해 안전하게 중단

### GPU 운영 정책

- 학습 시작 전 qwen-local 추론 서버 중지
- 필요 시 Ollama 메모리도 정리
- 학습 완료 후 추론 서버 재시작

즉, 이 시스템은 단순 파인튜닝 호출이 아니라 **GPU 리소스 스케줄링 + 상태 추적 + resume 가능성**까지 포함한 운영 구조입니다.

## 12. qwen-local 추론 서버 구조

로컬 추론은 `src/lib/ai/qwen-server-manager.ts`가 관리합니다.

### 역할

- `llama-server` 프로세스 시작/중지
- PID 파일 관리
- health check
- LoRA adapter 로드 상태 추적
- GPU UUID/디바이스 설정 적용
- 학습/이미지 생성과 충돌 시 안전하게 서버 정리

### 주요 설정 포인트

- GGUF 기반 Qwen 모델 사용
- 큰 context size 사용
- GPU layer를 높게 올려 로컬 추론 성능 확보
- 로그는 `/tmp/qwen-local.log`에 기록

`/api/ai/inference-status`는 현재 서버가 떠 있는지, 어떤 LoRA가 연결되었는지 확인하는 모니터링용 엔드포인트입니다.

## 13. 내보내기 구조

프로젝트는 `/api/projects/[id]/export/[format]`로 내보낼 수 있습니다.

### 지원 포맷

- `txt`
- `md`
- `epub`

### 변환 방식

- 원본은 Plate JSON 문서
- export 레이어가 이를 재귀적으로 순회해 텍스트/Markdown/HTML로 변환
- EPUB은 `epub-gen-memory`를 사용해 메모리에서 바로 패키징

이 구조의 장점은 다음과 같습니다.

- 편집 포맷과 출력 포맷을 분리 가능
- 같은 원본 문서에서 여러 출력 형식을 안정적으로 생성 가능
- 국제 문자와 제목 구조를 유지하기 쉬움

## 14. 테스트와 품질 관리

프로젝트는 다음 도구로 품질을 관리합니다.

- `tsc --noEmit`: 타입 검사
- `vitest`: 유닛/통합 테스트
- `playwright`: E2E 테스트
- `biome`, `eslint`: 정적 검사와 스타일 관리
- `lefthook`: 커밋 전 검증 자동화

특히 AI/에디터 관련해서는 다음 같은 테스트 포인트가 중요합니다.

- story context 조합
- editor context 직렬화
- 자동 저장 훅
- DB driver 분기

## 15. 기능별 요약

### 프로젝트 관리

- Next.js App Router 기반 페이지 구조
- Drizzle ORM 기반 CRUD
- 프로젝트별 설정과 전역 설정의 역할 분리

### 집필/편집

- Plate.js 기반 블록 에디터
- AI 편집과 인라인 제안을 분리한 이중 보조 구조
- selection 중심 리라이트 + 작품 컨텍스트 기반 생성

### 스토리 구상

- 5단계 수집형 상태 머신
- 구조화 draft + pending 후보 모델
- JSON 파싱 복구와 반복 억제 로직 포함

### 등장인물/세계관

- 구조화된 도메인 엔티티
- 관계/감정/링크 그래프까지 관리 가능
- AI 보조 제안과 직접 편집을 혼합

### 이미지/LoRA

- 텍스트 기반 캐릭터 설정 → 프롬프트 자동 구성 → 이미지 생성
- 프로젝트 맞춤 LoRA 학습과 활성화 지원
- GPU 자원 충돌을 고려한 운영 레이어 포함

### 태그 추천

- 한국어 입력 대응 임베딩 검색
- 번역 + 벡터 검색 + alias 룰 혼합 구조
- Python sidecar 서버로 반복 호출 성능 확보

## 16. 결론

Muse Novel은 단순한 소설 메모 앱이 아니라 아래 요소가 결합된 **작가용 통합 제작 환경**입니다.

- 구조화된 장편 창작 데이터 모델
- 리치 텍스트 집필 에디터
- 작품 컨텍스트 인식형 AI 편집
- 단계형 스토리 구상 상태 머신
- 임베딩 기반 태그 추천
- 캐릭터 이미지 생성
- 프로젝트 맞춤 LoRA 학습
- 로컬 추론 서버 운영

즉, 이 프로젝트의 핵심은 **문서 편집기 + AI orchestration + 창작 자산 관리 + 로컬 ML 운영**을 한 애플리케이션 안에 통합한 데 있습니다.
