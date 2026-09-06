# Muse Novel 작업 핸드오프

## 현재 방향

한국어 소설 집필용 로컬 우선 Next.js 앱입니다. Muse Novel은 GPU·Python
프로세스를 직접 관리하지 않고 등록된 외부 HTTP API만 호출합니다.

## 핵심 스택

- Next.js 16 App Router, React 19, TypeScript
- Plate.js editor
- Drizzle ORM + SQLite / Turso
- Vercel AI SDK 다중 provider

## 외부 서비스

- Local LLM: OpenAI 호환 API
- Diffusers: `GET /health`, `POST /generate`
- Automatic1111 / Forge: `/sdapi/v1/txt2img`
- 태그 추천: `GET /health`, `POST /recommend`, `POST /translate`
- LoRA: 현재 URL 저장과 `GET /health` 테스트만 지원

설정은 `/settings/ai`에서 관리합니다. 세부 계약은
`docs/wiki/External-Services.md`를 참고하세요.

## 중요한 설계 결정

- 앱 서버는 기본적으로 `127.0.0.1`에만 바인딩
- 로컬 SQLite 자동 생성·마이그레이션
- 자동저장 시 localStorage 복구본을 먼저 기록
- 외부 API URL은 `external_service_settings`에 저장
- 이미지 결과는 base64로 받아 로컬 갤러리에 저장
- 프로세스 spawn, VRAM coordinator, QLoRA 로컬 학습기는 제거됨

## 검증 명령

```bash
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
```
