# Muse Novel 프로젝트 문서

## 제품 개요

한국어 소설 창작을 위한 로컬 우선 집필 도구입니다. 프로젝트, 챕터,
등장인물, 세계관, AI 보조 작성, 이미지 생성 API 연동을 제공합니다.

## 기술 구성

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS + Radix UI
- Plate.js editor
- Drizzle ORM + SQLite / Turso
- Vercel AI SDK

## 실행 책임

Muse Novel이 담당하는 범위:

- UI와 Route Handler
- 프로젝트·원고·설정 DB
- 자동저장과 로컬 복구
- 프롬프트 구성
- 외부 API 호출과 연결 테스트
- 생성 이미지 로컬 저장

Muse Novel이 담당하지 않는 범위:

- Python 환경 설치
- GPU 선택과 VRAM 조정
- llama-server 시작·종료
- Diffusers 모델 로드
- LoRA 학습 프로세스와 작업 큐

## 외부 API

| 서비스 | 설정 범위 | 필수 경로 |
|---|---|---|
| Local LLM | 전역/프로젝트 | `/health`, `/v1/models`, OpenAI 호환 생성 API |
| Diffusers | 프로젝트 | `/health`, `/generate` |
| Automatic1111 | 프로젝트 | `/sdapi/v1/txt2img` |
| 태그 추천 | 전역 | `/health`, `/recommend`, `/translate` |
| LoRA | 프로젝트 | 현재 `/health` 테스트만 지원 |

세부 요청·응답 형식은 `docs/wiki/External-Services.md`를 참고합니다.

## 데이터 저장

- SQLite 기본 경로: `data/sqlite.db`
- 외부 API URL: `external_service_settings`
- 스토리 구상 임시 세션: browser localStorage
- API 키: AES-256-GCM 암호화
- 원고 복구본: 챕터별 localStorage

## 주요 경로

```text
src/app/                         UI 및 Route Handlers
src/components/editor/           Plate 편집기
src/components/settings/         AI·외부 API 설정
src/lib/ai/                      AI provider와 prompt
src/lib/db/                      schema와 query
src/lib/external-services/       외부 API 공통 클라이언트
src/lib/image-gen/               이미지 API 호출과 결과 저장
drizzle/                         DB migrations
e2e/                             Playwright 회귀 테스트
```

## 개발 규칙

- React Compiler 사용
- 성능 목적의 불필요한 `useMemo`, `useCallback`, `React.memo` 지양
- Tailwind CSS v4 문법 사용
- API 입력은 Zod 등으로 검증
- 프로젝트 하위 엔티티는 projectId 소유 관계 확인

## 검증 기준

```bash
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
```
