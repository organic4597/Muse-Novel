# Muse Novel 위키

Muse Novel은 한국어 소설을 기획하고 집필하기 위한 로컬 우선 AI 작업실입니다. 웹 서버가 프로젝트·원고·설정·검색·에이전트 루프를 관리하고, LLM과 이미지 생성기는 교체 가능한 외부 HTTP API로 연결합니다.

## 처음 사용하는 순서

1. [설치 및 실행](Getting-Started)에서 로컬 또는 Docker로 서버를 시작합니다.
2. 첫 접속에서 [초기 설정 코드와 관리자 계정](Security)을 만듭니다.
3. 상단 **AI 환경**에서 [LLM·검색·임베딩 API](AI-Configuration)를 연결하고 테스트합니다.
4. 홈의 스토리 구상 또는 새 소설 버튼으로 프로젝트를 만듭니다.
5. 작품 정보에서 집필 기준을 정하고 캐릭터·세계관·지도를 구성합니다.
6. 집필 화면에서 챕터, 작가 노트, 지속 상태 메모, 일관성 검사와 집필 에이전트를 사용합니다.

## 기능별 문서

### 기획과 집필

- [주요 기능과 현재 지원 범위](Features)
- [스토리 구상](Story-Planning)
- [집필 작업실·자동 저장·상태 메모](Writing-Workspace)
- [Ghost Text 자동완성](Ghost-Text)

### 캐릭터와 세계관

- [세계관 항목·카테고리·World assistant](World-Building)
- [세계관 지도와 핀](World-Maps)
- [기존 설정 AI 수정과 복원](Setting-Revisions)
- [캐릭터·세계관 이미지와 LoRA](Image-Generation)

### AI 지식과 검색

- [AI 연결과 모델 설정](AI-Configuration)
- [창작 지식 베이스](Writing-Knowledge)
- [SearXNG 웹 조사와 참고처](Web-Research)
- [외부 API 계약](External-Services)

### 설치·운영·개발

- [설치 및 실행](Getting-Started)
- [로그인과 운영 보안](Security)
- [운영·백업·업데이트](Operations)
- [브랜치와 릴리즈 운영](Branching-and-Release)
- [트러블슈팅](Troubleshooting)
- [아키텍처](Architecture)
- [기술 분석](Tech-Deep-Dive)
- [디자인 시스템](Design-System)
- [로드맵](Roadmap)

## 현재 상태

프로젝트·챕터·캐릭터·세계관·지도, 스토리 구상 스트리밍, World assistant 승인/거부, 설정 수정 이력, 창작 지식 검색과 집필 에이전트는 사용할 수 있습니다.

Ghost Text는 기본 자동완성 흐름은 있으나 품질·속도·장문 일관성을 더 개선해야 하는 **미완성 우선 개발 기능**입니다. 캐릭터 이미지 생성은 외부 Diffusers/Automatic1111 API 연결을 제공하지만 LoRA 실제 적용 결과는 외부 서버 구현에 좌우됩니다. 지형·건물·도시 등 세계관 항목 이미지 생성은 후속 작업입니다.

## 기술 구성

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS v4, Radix UI, Plate.js
- Drizzle ORM, SQLite 기본 / Turso 선택
- Vercel AI SDK와 OpenAI 호환 provider
- SearXNG, OpenAI 호환 임베딩, 외부 이미지·태그 API
