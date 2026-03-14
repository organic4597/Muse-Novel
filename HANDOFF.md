# muse-novel 작업 핸드오프

> 새 세션에서 이 파일을 불러와 컨텍스트를 복원하세요.

---

## 프로젝트 개요

소설 작성 보조 웹앱. Next.js 15 App Router + SQLite (Drizzle ORM) + Plate.js 에디터.

---

## 기술 스택 & 제약사항 (중요)

- **Next.js 15** App Router, React 19, **React Compiler** 사용 중
  - `useMemo`, `useCallback`, `React.memo` **성능 최적화 용도 금지**
- **Tailwind v4** syntax
- `useEffectEvent` 사용, `eslint-disable` 금지
- **No `Textarea` shadcn** — plain `<textarea>` with manual className
- **No `Select` shadcn** — plain `<select>` with manual className
- DB: **SQLite + Drizzle ORM**, 마이그레이션: `npx drizzle-kit generate` → `npx drizzle-kit push`
- 커밋 메시지: 극도로 간결하게 (문법 희생해도 됨)
- 검증: `npx tsc --noEmit` + `npx vitest run` (309 tests) 항상 통과해야 함

---

## 완료된 작업 전체 목록

### 버그 수정 3종
| 버그 | 수정 파일 |
|------|-----------|
| 에디터 툴바 잘림 | `src/components/editor/fixed-toolbar.tsx`, `fixed-toolbar-buttons.tsx` — flex-wrap 적용 |
| 챕터 삭제 불가 | `src/components/chapter/chapter-sidebar.tsx` — 삭제 버튼 + 핸들러 추가 |
| 세계관 항목 삭제 | `src/components/worldbuilding/world-entry-list.tsx` optimistic 삭제, `world-entry-detail.tsx` `onDeleted` prop |

### KoboldCpp 프로바이더 + contextSize
| 작업 | 파일 |
|------|------|
| `ProviderType`에 `'koboldcpp'` 추가 | `src/lib/ai/types.ts` |
| Provider factory koboldcpp case | `src/lib/ai/provider-factory.ts` — `createOpenAICompatible` 사용, baseUrl `http://localhost:5001` |
| health-check koboldcpp case 추가 | `src/lib/ai/health-check.ts` |
| AI 설정 UI — KoboldCpp 탭 + contextSize 필드 | `src/components/settings/ai-settings-page.tsx` |
| ai-settings API route koboldcpp + contextSize | `src/app/api/projects/[id]/ai-settings/route.ts` |
| DB queries contextSize | `src/lib/db/queries/ai-settings.ts` |
| Schema: `contextSize` on `aiProviderSettings` | `src/lib/db/schema.ts` |

### QLoRA 통합
| 작업 | 파일 |
|------|------|
| Schema: `activeLoraId` 기반 LoRA 라이브러리 사용 | `src/lib/db/schema.ts`, `src/lib/db/queries/loras.ts` |
| Drizzle migration | `drizzle/0004_glorious_captain_america.sql` |
| QLoRA 학습 스크립트 | `scripts/qlora_trainer.py` |
| SSE 진행률 API + 취소 + 상태 복구 | `src/app/api/projects/[id]/lora/generate/route.ts`, `src/app/api/projects/[id]/lora/cancel/route.ts`, `src/app/api/projects/[id]/lora/training-status/route.ts` |
| LoRA 설정 UI (진행률 바 + 취소 + 이름 변경) | `src/components/settings/lora-settings-section.tsx` |
| 프로젝트 설정 페이지에 LoRA 섹션 추가 | `src/app/(main)/projects/[id]/settings/page.tsx` |

### 외부 API 스타일 주입 조건
| 작업 | 파일 |
|------|------|
| KoboldCpp일 때 writing style 주입 skip | `src/app/api/ai/copilot/route.ts` — `isKoboldCpp` 체크 추가 |

---

## 현재 DB 스키마 요약

```
projects
  id, title, genre, synopsis, settingsJson
  writingStyleSample, writingStyleDescription
  activeWritingStyleProfileId
  loraPath           ← 신규
  loraGeneratedAt    ← 신규
  createdAt, updatedAt

ai_provider_settings
  id, projectId, providerType, apiKeyEncrypted
  modelName, baseUrl
  contextSize        ← 신규
  isDefault, createdAt, updatedAt

chapters
  id, projectId, title, order, contentJson
  outline, summary, memo, wordCount
  createdAt, updatedAt

characters, characterRelationships
worldEntries, worldEntryLinks, worldEntryTags
writing_style_profiles
```

---

## ProviderType

```typescript
export type ProviderType = 'ollama' | 'nvidia' | 'openai' | 'anthropic' | 'koboldcpp';
```

---

## KoboldCpp 설정 정보

- OpenAI 호환 API: `http://localhost:5001/v1/chat/completions`
- `createOpenAICompatible` from `@ai-sdk/openai-compatible` 로 래핑
- LoRA 적용 실행 예: `./koboldcpp --model <model.gguf> --lora <loraPath> --contextsize 32768 --gpulayers -1`

---

## QLoRA 구조

### Python 학습기 (`scripts/qlora_trainer.py`)
- argparse: `--input`, `--output`, `--model`, `--epochs`, `--seq-length`, `--lora-r`, `--lora-alpha`
- stdout JSON 스트리밍: `{"stage": "loading|tokenizing|training|saving|done|error", "progress": 0-100, "message": "..."}`
- 완료 시: `{"stage": "done", ..., "output": "<adapter_model.safetensors 경로>"}`
- 실행: `uv run python scripts/qlora_trainer.py --input <txt> --output <dir> --model Qwen/Qwen2.5-14B`
- 의존: transformers, peft, bitsandbytes, trl, datasets, accelerate, safetensors

### SSE API (`/api/projects/[id]/lora/generate`)
- POST body: `{ name?: string, textContent?: string, textContents?: string[] }`
- 챕터 텍스트 또는 업로드 파일 → 임시 파일 저장 → `scripts/qlora_trainer.py` spawn
- 전역 락 파일로 동시 학습 1건만 허용
- 출력 디렉토리: `loras/library/<name>-<id>/`

---

## Copilot Route 스타일 주입 로직

```typescript
// src/app/api/ai/copilot/route.ts
const isKoboldCpp = providerSettings?.providerType === 'koboldcpp';
const activeProfile = await getActiveWritingStyleProfile(db, projectId);
if (!isKoboldCpp && activeProfile?.description) {
  systemPrompt = `${systemPrompt}\n\n## 문체 스타일\n${activeProfile.description}`;
}
// KoboldCpp는 LoRA로 스타일 적용하므로 system prompt 주입 생략
```

---

## 검증 상태

- `npx tsc --noEmit` ✅ 0 errors
- `npx vitest run` ✅ 309/309 pass

---

## 알려진 이슈 / 세션 노트

- `todowrite` 도구가 현 세션에서 "Maximum call stack size exceeded"로 완전 고장 → 페이지 새로고침으로 해결
- `write` 도구 동일 오류 발생 시 → bash heredoc으로 파일 작성

---

## 주요 파일 경로 빠른 참조

```
/muse-novel/
├── scripts/
│   └── doc_to_lora_runner.py          ← Doc-to-LoRA Python 브리지
├── drizzle/
│   └── 0004_glorious_captain_america.sql ← 최신 마이그레이션
├── src/
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── types.ts               ← ProviderType (koboldcpp 포함)
│   │   │   ├── provider-factory.ts    ← koboldcpp createOpenAICompatible
│   │   │   └── health-check.ts        ← koboldcpp case 추가됨
│   │   └── db/
│   │       ├── schema.ts              ← loraPath, loraGeneratedAt, contextSize
│   │       └── queries/
│   │           └── ai-settings.ts     ← contextSize 포함
│   ├── app/
│   │   ├── api/
│   │   │   ├── ai/copilot/route.ts    ← isKoboldCpp 스타일 주입 조건
│   │   │   └── projects/[id]/
│   │   │       ├── ai-settings/route.ts
│   │   │       └── lora/generate/route.ts ← SSE LoRA 생성 API
│   │   └── (main)/projects/[id]/settings/page.tsx ← LoRA 섹션 포함
│   └── components/
│       └── settings/
│           ├── ai-settings-page.tsx   ← KoboldCpp탭, contextSize 필드
│           └── lora-settings-section.tsx ← LoRA 생성 UI
```
