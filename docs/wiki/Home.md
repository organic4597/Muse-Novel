# Muse Novel

Muse Novel은 한국어 소설 창작을 위한 AI 보조 웹앱입니다. 프로젝트, 챕터, 등장인물, 세계관을 통합 관리하고, 홈 화면의 스토리 구상 탭에서 아이디어를 정리한 뒤 바로 새 소설 프로젝트로 전환할 수 있습니다.

## 주요 기능

- 소설 프로젝트 생성 및 관리
- 챕터 작성과 자동 저장
- 등장인물 / 세계관 정리
- AI 보조 작성 및 편집 명령
- 스토리 구상 탭을 통한 대화형 기획
- 전역 AI 설정 페이지 / 프로젝트별 AI 설정 분리
- 한국어 프롬프트 태그 추천과 번역
- 다크 모드 지원

## 빠른 링크

- [설치 및 실행](Getting-Started)
- [주요 기능](Features)
- [아키텍처 개요](Architecture)
- [스토리 구상 기능](Story-Planning)

## 현재 구조

- 프론트엔드: Next.js 16, React 19, Tailwind CSS v4
- 백엔드: Next.js Route Handlers, Drizzle ORM
- 데이터베이스: SQLite 기본, Turso 선택 지원
- AI 계층: Vercel AI SDK 기반 다중 provider 추상화
- 태그 추천: Python 상주 서버 + 한국어 번역/임베딩 검색

## 대상 사용자

- 한국어 소설 작가
- 개인 로컬 환경에서 집필 보조 도구가 필요한 사용자
- 캐릭터/세계관/챕터 관리를 한 앱 안에서 하고 싶은 사용자
