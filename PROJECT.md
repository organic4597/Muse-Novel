# muse-novel — 프로젝트 문서

> AI 보조 한국어 소설 창작 웹앱. 로컬 우선(SQLite), 다중 AI 프로바이더, 리치텍스트 에디터 통합.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [아키텍처 개요](#3-아키텍처-개요)
4. [디렉토리 구조](#4-디렉토리-구조)
5. [데이터베이스 스키마](#5-데이터베이스-스키마)
6. [API 라우트](#6-api-라우트)
7. [주요 기능](#7-주요-기능)
8. [AI 통합](#8-ai-통합)
9. [환경 변수](#9-환경-변수)
10. [개발 규칙 & 제약](#10-개발-규칙--제약)
11. [스크립트](#11-스크립트)
12. [주요 파일 참조](#12-주요-파일-참조)

---

## 1. 프로젝트 개요

**muse-novel**은 한국어 소설 작가를 위한 AI 지원 집필 도구입니다.

| 항목 | 내용 |
|------|------|
| 목적 | 소설 프로젝트 관리, 챕터 집필, 등장인물·세계관 구성 |
| 대상 | 한국어 소설 작가 (개인 로컬 사용 위주) |
| 배포 | Vercel (프로덕션) / localhost (개발) |
| 데이터 | 로컬 SQLite (개발) · Turso libSQL (Vercel 배포) |
| 언어 | TypeScript, 한국어 UI |

---

## 2. 기술 스택

### 프론트엔드

| 라이브러리 | 버전 | 역할 |
|-----------|------|------|
| Next.js | 16.0.3 | App Router 기반 풀스택 프레임워크 |
| React | 19.2.0 | UI (React Compiler 적용) |
| Tailwind CSS | v4.1.17 | 유틸리티-퍼스트 스타일링 |
| shadcn/ui + Radix UI | — | 접근성 UI 컴포넌트 시스템 |
| Plate.js | ^52.0.1 | Slate 기반 리치텍스트 에디터 |
| dnd-kit | ^6.x | 드래그 앤 드롭 (챕터 순서 변경 등) |
| Lucide React | ^0.554.0 | 아이콘 |
| Sonner | ^2.0.7 | 토스트 알림 |

### 백엔드 / 인프라

| 라이브러리 | 버전 | 역할 |
|-----------|------|------|
| Drizzle ORM | ^0.45.1 | 타입세이프 SQL ORM |
| better-sqlite3 | ^12.6.2 | 로컬 SQLite 드라이버 |
| @libsql/client | ^0.17.0 | Turso(libSQL) 드라이버 |
| ai (Vercel AI SDK) | ^6.0.116 | AI 스트리밍 유틸리티 |
| epub-gen-memory | ^1.1.2 | EPUB 생성 |

### AI 프로바이더

| SDK | 지원 프로바이더 |
|-----|--------------|
| @ai-sdk/openai | OpenAI GPT 계열 |
| @ai-sdk/anthropic | Anthropic Claude 계열 |
| ollama-ai-provider-v2 | Ollama (로컬) |
| @ai-sdk/openai-compatible | NVIDIA NIM, KoboldCpp |

### 개발 도구

| 도구 | 용도 |
|------|------|
| Biome | 린팅 + 포매팅 |
| Vitest | 단위 테스트 |
| Playwright | E2E 테스트 |
| Lefthook | Git 훅 |
| TypeScript | 5.9.3, strict |
| Bun | 패키지 매니저 + 런타임 |

---

## 3. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js App Router                  │
│                                                         │
│  ┌────────────────┐     ┌───────────────────────────┐   │
│  │  Client Pages   │     │      API Routes            │   │
│  │  (use client)  │────▶│  /api/projects/[id]/...   │   │
│  │                │     │  /api/ai/copilot           │   │
│  │  Plate.js      │     │  /api/ai/command           │   │
│  │  Editor        │     └──────────┬────────────────┘   │
│  └────────────────┘                │                    │
│                                    ▼                    │
│                         ┌──────────────────┐            │
│                         │   Drizzle ORM    │            │
│                         └────────┬─────────┘            │
└──────────────────────────────────┼──────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             ┌──────▼──────┐             ┌───────▼──────┐
             │  SQLite      │             │  Turso       │
             │  (로컬 개발) │             │  (Vercel)    │
             └─────────────┘             └──────────────┘

AI 프로바이더 (외부)
  OpenAI ──────┐
  Anthropic ───┤
  Ollama  ─────┼──▶ provider-factory.ts ──▶ Copilot/Command API
  NVIDIA  ─────┤
  KoboldCpp ───┘
```

### 핵심 설계 결정

- **로컬 우선**: 인증 없음. 단일 사용자, 개인 데스크톱 앱에 가까운 구조
- **React Compiler**: `useMemo` / `useCallback` / `React.memo` 성능 목적 사용 금지
- **Plate.js JSON**: 챕터 본문은 `contentJson`(Slate JSON 문자열)으로 저장
- **API 키 암호화**: DB에 저장되는 AI 프로바이더 API 키는 AES 암호화
- **자동 저장**: 디바운스(5초) + localStorage 백업 이중 보호
- **SSE 스트리밍**: AI 코파일럿 · LoRA 생성 진행률은 서버-센트 이벤트로 실시간 전달

---

## 4. 디렉토리 구조

```
muse-novel/
├── drizzle/                    # Drizzle 마이그레이션 SQL
│   ├── 0000_warm_harpoon.sql
│   ├── 0001_silky_satana.sql
│   ├── 0002_organic_betty_ross.sql
│   ├── 0003_married_wallow.sql
│   └── 0004_glorious_captain_america.sql  ← 최신 (loraPath, contextSize)
├── e2e/                        # Playwright E2E 테스트
├── scripts/
│   └── qlora_trainer.py        # 현재 QLoRA 학습 스크립트
├── src/
│   ├── app/
│   │   ├── (main)/             # 메인 레이아웃 그룹
│   │   │   ├── page.tsx        # 소설 목록 (홈)
│   │   │   ├── create-project-form.tsx
│   │   │   └── projects/[id]/
│   │   │       ├── page.tsx           # 프로젝트 개요·편집
│   │   │       ├── layout.tsx         # 프로젝트 네비게이션 레이아웃
│   │   │       ├── write/page.tsx     # 챕터 집필 (에디터 + 사이드바)
│   │   │       ├── characters/        # 등장인물 관리
│   │   │       ├── world/             # 세계관 관리
│   │   │       └── settings/page.tsx  # AI 설정 + LoRA 설정
│   │   ├── api/
│   │   │   ├── ai/
│   │   │   │   ├── copilot/route.ts   # AI 텍스트 자동완성
│   │   │   │   └── command/route.ts   # AI 편집 커맨드
│   │   │   ├── projects/
│   │   │   │   ├── route.ts           # 프로젝트 목록/생성
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts
│   │   │   │       ├── chapters/      # 챕터 CRUD
│   │   │   │       ├── characters/    # 인물 CRUD
│   │   │   │       ├── world-entries/ # 세계관 항목 CRUD
│   │   │   │       ├── ai-settings/   # AI 프로바이더 설정
│   │   │   │       ├── export/        # EPUB · MD · TXT 내보내기
│   │   │   │       ├── lora/generate/ # LoRA 생성 (SSE)
│   │   │   │       ├── mentions/      # 인물 @멘션 자동완성
│   │   │   │       ├── settings/      # 프로젝트 설정
│   │   │   │       ├── style/         # 활성 문체 프로파일
│   │   │   │       └── style-profiles/
│   │   │   └── style-profiles/        # 전역 문체 프로파일
│   │   └── editor/                    # 독립형 에디터 데모 (/editor)
│   ├── components/
│   │   ├── chapter/
│   │   │   └── chapter-sidebar.tsx    # 챕터 목록 + 추가/삭제
│   │   ├── character/
│   │   │   ├── character-list.tsx
│   │   │   ├── character-form.tsx
│   │   │   ├── character-relationships.tsx
│   │   │   ├── character-emotion-timeline.tsx
│   │   │   ├── character-appearances.tsx
│   │   │   └── character-image-upload.tsx
│   │   ├── editor/
│   │   │   ├── plate-editor.tsx       # 메인 에디터 컴포넌트
│   │   │   ├── editor-kit.tsx         # 플러그인 조합
│   │   │   ├── auto-save-indicator.tsx
│   │   │   ├── settings-dialog.tsx
│   │   │   └── plugins/               # Plate 커스텀 플러그인
│   │   ├── export/
│   │   │   └── export-dialog.tsx
│   │   ├── settings/
│   │   │   ├── ai-settings-page.tsx   # AI 프로바이더 탭 UI
│   │   │   ├── lora-settings-section.tsx
│   │   │   ├── writing-style-section.tsx
│   │   │   └── global-style-profiles-section.tsx
│   │   ├── world/
│   │   │   ├── world-entry-list.tsx
│   │   │   ├── world-entry-detail.tsx
│   │   │   ├── world-entry-form.tsx
│   │   │   ├── world-entry-links.tsx
│   │   │   └── world-search.tsx
│   │   └── ui/                        # shadcn/ui 공통 컴포넌트
│   ├── hooks/
│   │   ├── use-auto-save.ts           # 디바운스 자동저장
│   │   ├── use-debounce.ts
│   │   ├── use-is-touch-device.ts
│   │   └── use-mounted.ts
│   └── lib/
│       ├── ai/
│       │   ├── types.ts               # ProviderType, ProviderConfig
│       │   ├── provider-factory.ts    # createProvider() 팩토리
│       │   ├── prompts.ts             # 시스템 프롬프트 생성
│       │   ├── build-story-context.ts # 스토리 컨텍스트 조립
│       │   ├── health-check.ts        # 프로바이더 연결 확인
│       │   ├── encryption.ts          # API 키 AES 암호화
│       │   ├── daily-slogan.ts        # 오늘의 창작 슬로건
│       │   └── serialize-editor-context.ts
│       ├── db/
│       │   ├── index.ts               # DB 연결 (SQLite/Turso 분기)
│       │   ├── schema.ts              # Drizzle 테이블 정의
│       │   └── queries/               # 테이블별 쿼리 함수
│       ├── export/
│       │   ├── export-epub.ts
│       │   ├── export-md.ts
│       │   └── export-text.ts
│       └── utils.ts
└── public/                            # 정적 에셋
```

---

## 5. 데이터베이스 스키마

**드라이버**: `better-sqlite3` (로컬) / `@libsql/client` (Turso)  
**ORM**: Drizzle ORM  
**마이그레이션**: `drizzle-kit generate` → `drizzle-kit push`

```
projects
├── id                  TEXT PK (UUID)
├── title               TEXT NOT NULL
├── genre               TEXT
├── synopsis            TEXT
├── settings_json       TEXT         ← 프로젝트 추가 설정 JSON
├── writing_style_sample TEXT
├── writing_style_description TEXT
├── active_writing_style_profile_id TEXT
├── lora_path           TEXT         ← 생성된 LoRA .safetensors 경로
├── lora_generated_at   INTEGER (timestamp)
├── created_at          INTEGER (timestamp)
└── updated_at          INTEGER (timestamp)

chapters
├── id                  TEXT PK
├── project_id          TEXT → projects.id
├── title               TEXT NOT NULL
├── order               INTEGER NOT NULL  ← 챕터 순서
├── content_json        TEXT         ← Plate.js Slate JSON
├── outline             TEXT
├── summary             TEXT
├── memo                TEXT
├── word_count          INTEGER DEFAULT 0
├── created_at          INTEGER
└── updated_at          INTEGER

characters
├── id                  TEXT PK
├── project_id          TEXT → projects.id
├── name                TEXT NOT NULL
├── role                TEXT
├── appearance          TEXT
├── personality         TEXT
├── backstory           TEXT
├── arc_description     TEXT
├── image_path          TEXT
├── created_at          INTEGER
└── updated_at          INTEGER

character_relationships
├── id                  TEXT PK
├── character_a_id      TEXT → characters.id
├── character_b_id      TEXT → characters.id
├── relationship_type   TEXT NOT NULL
├── description         TEXT
└── created_at          INTEGER

character_emotions
├── id                  TEXT PK
├── character_id        TEXT → characters.id
├── chapter_id          TEXT → chapters.id
├── emotion             TEXT NOT NULL  ← 챕터별 감정 상태
├── note                TEXT
└── created_at          INTEGER

world_entries
├── id                  TEXT PK
├── project_id          TEXT → projects.id
├── category            TEXT NOT NULL  ← 장소/사건/설정 등
├── title               TEXT NOT NULL
├── content             TEXT
├── created_at          INTEGER
└── updated_at          INTEGER

world_entry_links       ← 세계관 항목 간 연결 (그래프)
├── id                  TEXT PK
├── source_id           TEXT → world_entries.id
├── target_id           TEXT → world_entries.id
└── created_at          INTEGER

world_entry_tags
├── id                  TEXT PK
├── entry_id            TEXT → world_entries.id
├── tag                 TEXT NOT NULL
└── created_at          INTEGER

ai_provider_settings
├── id                  TEXT PK
├── project_id          TEXT → projects.id
├── provider_type       TEXT NOT NULL   ← 'openai'|'anthropic'|'ollama'|'nvidia'|'koboldcpp'
├── api_key_encrypted   TEXT
├── model_name          TEXT
├── base_url            TEXT
├── context_size        INTEGER
├── is_default          INTEGER DEFAULT 0
├── created_at          INTEGER
└── updated_at          INTEGER

writing_style_profiles
├── id                  TEXT PK
├── project_id          TEXT → projects.id
├── name                TEXT NOT NULL
├── file_path           TEXT
├── description         TEXT
├── created_at          INTEGER
└── updated_at          INTEGER
```

---

## 6. API 라우트

### 프로젝트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/projects` | 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects/[id]` | 프로젝트 상세 |
| PUT | `/api/projects/[id]` | 프로젝트 수정 |
| DELETE | `/api/projects/[id]` | 프로젝트 삭제 |

### 챕터

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/projects/[id]/chapters` | 챕터 목록 |
| POST | `/api/projects/[id]/chapters` | 챕터 생성 |
| GET | `/api/projects/[id]/chapters/[chId]` | 챕터 상세 |
| PUT | `/api/projects/[id]/chapters/[chId]` | 챕터 저장 (본문 포함) |
| DELETE | `/api/projects/[id]/chapters/[chId]` | 챕터 삭제 |

### 등장인물

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/projects/[id]/characters` | 인물 목록 |
| POST | `/api/projects/[id]/characters` | 인물 생성 |
| PUT/DELETE | `/api/projects/[id]/characters/[cid]` | 인물 수정/삭제 |
| GET | `/api/projects/[id]/mentions` | @멘션 자동완성용 인물 목록 |

### 세계관

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/POST | `/api/projects/[id]/world-entries` | 세계관 항목 목록/생성 |
| PUT/DELETE | `/api/projects/[id]/world-entries/[eid]` | 항목 수정/삭제 |

### AI

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/ai/copilot` | 텍스트 자동완성 (SSE 스트리밍) |
| POST | `/api/ai/command` | AI 편집 커맨드 (선택 텍스트 변환) |
| GET/POST | `/api/projects/[id]/ai-settings` | AI 프로바이더 설정 조회/저장 |
| POST | `/api/projects/[id]/lora/generate` | QLoRA 학습 (SSE 진행률) |

### 내보내기 & 설정

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/projects/[id]/export` | EPUB / Markdown / TXT 내보내기 |
| GET/PUT | `/api/projects/[id]/settings` | 프로젝트 설정 |
| GET/POST | `/api/projects/[id]/style-profiles` | 문체 프로파일 CRUD |
| GET/PUT | `/api/projects/[id]/style` | 활성 문체 프로파일 설정 |
| GET/POST | `/api/style-profiles` | 전역 문체 프로파일 |

---

## 7. 주요 기능

### 7.1 소설 프로젝트 관리
- 프로젝트 생성 (제목, 장르, 시놉시스)
- 홈 화면에서 프로젝트 카드 목록
- AI 생성 "오늘의 창작 슬로건" (연결된 AI 프로바이더 없으면 안내 메시지 표시)

### 7.2 챕터 집필 (`/projects/[id]/write`)
- **Plate.js 리치텍스트 에디터**: Markdown 단축키, 슬래시 커맨드, 자동서식 지원
- **챕터 사이드바**: 챕터 추가/선택/삭제, 순서 변경
- **자동저장**: 5초 디바운스 → DB 저장 + `localStorage` 백업 (새로고침/비정상 종료 대비)
- **자동저장 인디케이터**: 저장 상태(saving / saved / error / idle) 실시간 표시
- **미저장 복원 다이얼로그**: 챕터 전환 시 로컬 백업 발견되면 복원 여부 확인

### 7.3 AI 코파일럿
- 커서 위치 기준 앞 최대 1,500자를 컨텍스트로 전송
- 프로젝트 정보(제목, 장르, 시놉시스), 등장인물, 세계관을 시스템 프롬프트에 자동 주입
- KoboldCpp인 경우 문체 프로파일 주입 생략 (LoRA로 대신 적용)
- Plate.js `@platejs/ai` 플러그인을 통해 에디터 내 인라인 제안

### 7.4 AI 커맨드
- 선택된 텍스트에 AI 편집 커맨드 적용 (요약, 번역, 톤 변경 등)
- `/api/ai/command` → `ai` SDK 스트리밍

### 7.5 등장인물 관리 (`/projects/[id]/characters`)
- 인물 프로필: 이름, 역할, 외모, 성격, 배경, 성장 아크, 이미지
- **인물 관계도**: 인물 간 관계 유형과 설명 (양방향)
- **감정 타임라인**: 챕터별 인물 감정 상태 기록
- **등장 횟수 분석**: 챕터별 인물 언급 추적
- **이미지 업로드**: UploadThing 연동

### 7.6 세계관 관리 (`/projects/[id]/world`)
- 카테고리별 세계관 항목 (장소, 사건, 설정, 마법체계 등 자유 분류)
- 항목 간 링크(그래프 구조)로 관계 시각화
- 태그 시스템
- 전문 검색

### 7.7 내보내기
- **EPUB**: `epub-gen-memory` 라이브러리, 챕터 순서 보존
- **Markdown**: `@platejs/markdown` Slate→MD 변환
- **Plain Text**: 순수 텍스트 추출

### 7.8 문체 프로파일 & 스타일 학습
- 문체 샘플 + 설명으로 프로파일 생성
- 프로젝트별 활성 프로파일 지정 → AI 코파일럿 시스템 프롬프트에 자동 삽입

### 7.9 QLoRA 문체 학습 (Qwen Local)
- 소설 챕터 또는 업로드 텍스트를 Qwen 기반 QLoRA 어댑터로 학습
- `scripts/qlora_trainer.py` 사용
- 프로세스: `uv run python scripts/qlora_trainer.py --input <txt> --output <dir> --model Qwen/Qwen2.5-14B`
- SSE 진행률 스트리밍: `{"stage": "loading|tokenizing|training|saving|done|error", "progress": 0-100}`
- 여러 파일 업로드 시 파일별 개별 LoRA 생성
- 전역 학습 락으로 동시 학습 방지, 학습 중에는 Qwen 추론 서버 자동 중지 후 완료 시 재시작

### 7.10 AI 프로바이더 설정
- 프로젝트별 다중 프로바이더 설정 (탭 UI)
- API 키 AES 암호화 저장 (`ENCRYPTION_KEY` 환경변수)
- 프로바이더 연결 상태 헬스체크
- 기본 프로바이더 지정

---

## 8. AI 통합

### 지원 프로바이더

| ProviderType | 연결 방식 | 기본 URL | API 키 |
|-------------|---------|---------|--------|
| `openai` | `@ai-sdk/openai` | api.openai.com | 필수 |
| `anthropic` | `@ai-sdk/anthropic` | api.anthropic.com | 필수 |
| `ollama` | `ollama-ai-provider-v2` | localhost:11434 | 불필요 |
| `nvidia` | `createOpenAICompatible` | integrate.api.nvidia.com/v1 | 필수 |
| `koboldcpp` | `createOpenAICompatible` | localhost:5001/v1 | 불필요 |
| `qwen-local` | `createOpenAICompatible` | localhost:8321/v1 | 불필요 |

```typescript
export type ProviderType = 'ollama' | 'nvidia' | 'openai' | 'anthropic' | 'koboldcpp' | 'qwen-local';
```

### 코파일럿 시스템 프롬프트 구성

```
당신은 한국어 소설 작성 보조 AI입니다...

[작품 정보]
- 제목: {project.title}
- 장르: {project.genre}
- 시놉시스: {project.synopsis}

[등장인물]
- {name} ({role})
...

[세계관]
- [{category}] {title}
...

## 문체 스타일          ← KoboldCpp가 아닐 때만 포함
{activeProfile.description}
```

---

## 9. 환경 변수

```bash
# DB 프로바이더 선택 (기본: sqlite)
DATABASE_PROVIDER=sqlite          # 'sqlite' | 'turso'

# 로컬 SQLite
DATABASE_URL=sqlite.db            # 생략 시 기본값 사용

# Turso (Vercel 배포용)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# AI 프로바이더 (최소 1개 필요)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=

# Ollama (로컬, API 키 불필요)
OLLAMA_BASE_URL=http://localhost:11434

# API 키 암호화 (32자 필수)
ENCRYPTION_KEY=

# 이미지 업로드 (UploadThing)
UPLOADTHING_TOKEN=
```

---

## 10. 개발 규칙 & 제약

### React / TypeScript

- **React Compiler 적용**: `useMemo`, `useCallback`, `React.memo` 성능 목적 사용 **금지**
- `useEffectEvent` 사용으로 비반응형 로직 분리 (`eslint-disable` 금지)
- `Textarea` shadcn 컴포넌트 **사용 금지** → plain `<textarea>` + 수동 className
- `Select` shadcn 컴포넌트 **사용 금지** → plain `<select>` + 수동 className

### Tailwind v4

- 불투명도 구문: `bg-black/50` (v3의 `bg-opacity-50` 금지)
- CSS 변수: `bg-(--brand-color)` (v3의 `bg-[--brand-color]` 금지)
- 그림자: `shadow-xs` / `shadow-sm` (이름 변경됨)

### 검증 기준

```bash
npx tsc --noEmit   # 0 errors
npx vitest run     # 309/309 pass
```

### 커밋 메시지

극도로 간결하게 (문법 희생 허용)

---

## 11. 스크립트

```bash
bun dev              # 개발 서버 (Next.js)
bun build            # 프로덕션 빌드
bun start            # 프로덕션 서버

bun test             # Vitest 단위 테스트
bun test:watch       # Vitest watch 모드
bun test:e2e         # Playwright E2E

bun lint             # Biome + ESLint
bun lint:fix         # Biome 자동 수정

bun db:generate      # Drizzle 마이그레이션 파일 생성
bun db:migrate       # 마이그레이션 적용
bun db:studio        # Drizzle Studio (DB GUI)

bun typecheck        # tsc --noEmit

# QLoRA 학습 (직접 실행)
uv run python scripts/qlora_trainer.py \
  --input <text_file.txt> \
  --output <output_dir> \
  --model Qwen/Qwen2.5-14B
```

---

## 12. 주요 파일 참조

| 파일 | 역할 |
|------|------|
| `src/lib/db/schema.ts` | 전체 DB 테이블 정의 |
| `src/lib/ai/types.ts` | `ProviderType`, `ProviderConfig` |
| `src/lib/ai/provider-factory.ts` | `createProvider()` — 프로바이더 팩토리 |
| `src/lib/ai/prompts.ts` | `getNovelSystemPrompt()` — 시스템 프롬프트 생성 |
| `src/lib/ai/encryption.ts` | API 키 AES 암호화/복호화 |
| `src/app/api/ai/copilot/route.ts` | 코파일럿 SSE 스트리밍 |
| `src/app/api/ai/command/route.ts` | AI 편집 커맨드 |
| `src/app/api/projects/[id]/lora/generate/route.ts` | QLoRA 학습 SSE |
| `src/components/editor/plate-editor.tsx` | 메인 에디터 |
| `src/components/editor/editor-kit.tsx` | Plate 플러그인 조합 |
| `src/hooks/use-auto-save.ts` | 자동저장 훅 |
| `src/components/settings/ai-settings-page.tsx` | AI 설정 UI (5개 탭) |
| `src/components/settings/lora-settings-section.tsx` | LoRA 생성 UI |
| `drizzle/0004_glorious_captain_america.sql` | 최신 마이그레이션 |
| `scripts/qlora_trainer.py` | QLoRA 학습 스크립트 |
| `HANDOFF.md` | 세션 간 컨텍스트 핸드오프 문서 |

---

*최종 업데이트: 2026-03-09*
