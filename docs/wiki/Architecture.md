# 아키텍처 개요

## 전체 구조

- UI: Next.js App Router + Client Components
- API: Route Handlers
- DB: Drizzle ORM + SQLite / Turso
- AI: provider-factory 기반 다중 provider 추상화
- 태그 추천: 별도 Python HTTP 서버

## 주요 계층

### 홈 화면

- 소설 목록 탭
- 스토리 구상 탭
- 공용 AI 설정 사용

### 프로젝트 작업 영역

- 챕터 작성
- 등장인물 관리
- 세계관 관리
- 프로젝트별 AI 설정

### AI 계층

- 공용 AI 설정: 홈 스토리 구상 탭
- 프로젝트별 AI 설정: 집필/편집 기능
- fallback: 환경 변수 provider

### 태그 추천 계층

- `scripts/tag_recommender_server.py`
- `src/lib/tag-recommender-client.ts`
- 한국어 번역 + 태그 임베딩 검색

## 데이터 저장 전략

- 로컬 우선 구조
- 스토리 구상 세션은 localStorage 저장
- 확정 시에만 DB 엔티티 생성
- draft snapshot은 `projects.settingsJson`에 저장

## 최근 데이터베이스 변경

- `loras.project_id` nullable
- `ON DELETE SET NULL`로 공유 LoRA 보존