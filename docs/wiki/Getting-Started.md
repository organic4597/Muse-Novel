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

주요 항목:

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

## 프로덕션 실행

```bash
bun run build
bun run start
```

## DB 명령

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```