# 아키텍처

## 책임 분리

```text
브라우저
  → Next.js UI / Route Handlers
      ├─ 인증·프로젝트·원고·설정·지도 DB
      ├─ 자동 저장·복구·후보 승인·수정 이력
      ├─ 프롬프트·검색 계획·에이전트 루프·대기열
      ├─ SearXNG / 임베딩 / 태그 / 이미지 API
      └─ LLM 추론 API
```

Muse Novel 웹 서버가 모든 업무 흐름을 통제합니다. LLM 서버에는 검색 도구, 데이터베이스, 에이전트 프레임워크를 설치하지 않으며 모델 파일·GPU·VRAM·Python 프로세스도 Muse Novel이 시작하거나 종료하지 않습니다.

## 프론트엔드

- Next.js 16 App Router와 React 19
- 필요한 화면만 Client Component로 구성
- Plate.js 집필 편집기
- Tailwind CSS v4, Radix UI
- 큰 편집기·집필 지능·상태 패널은 동적 로드
- 지도는 별도 지도 엔진 없이 SVG와 Pointer Events 사용

## 서버와 데이터

- Next.js Route Handlers가 UI와 외부 API 사이의 신뢰 경계
- Zod 등으로 요청 크기와 형식 검증
- Drizzle ORM과 SQLite 기본, Turso 선택
- 프로젝트 하위 항목은 projectId 소유 관계 확인
- 지도 핀 일괄 저장, 설정 이력과 복원은 트랜잭션 처리
- 업로드 파일은 인증된 `/uploads` 경로로 제공

## 인증

첫 실행에서 단일 관리자 계정을 생성합니다. 비밀번호는 무작위 salt와 scrypt로 보호하며, 세션은 HMAC 서명 쿠키를 사용합니다. 페이지·API·업로드는 세션 검증을 거치고 변경 요청은 Origin을 검사합니다. [로그인과 운영 보안](Security)을 참고하세요.

## AI 요청

provider factory가 OpenAI, Anthropic, Ollama, NVIDIA, KoboldCpp와 OpenAI 호환 Local LLM을 공통 인터페이스로 감쌉니다. 전역 설정과 프로젝트별 설정을 해석한 뒤 서버 대기열에서 우선순위·취소·제한 시간을 관리합니다.

스토리 구상과 집필 에이전트는 스트리밍을 사용합니다. 검색이 필요한 요청은 LLM이 짧은 검색 계획을 제안하지만 URL 검증, SearXNG 호출, 출처 정리와 반복 횟수 통제는 웹 서버가 수행합니다.

## 기억과 지식

- 작품 기억: 프로젝트, 챕터, 캐릭터, 세계관, 지속 상태 메모
- 창작 지식: `knowledge/writing` Markdown
- 의미 검색: 외부 OpenAI 호환 임베딩 API
- fallback: 키워드 검색
- 벡터 캐시: DB 옆 JSON 사이드카

## 이미지와 지도

이미지 생성은 Muse Novel이 프롬프트를 만들고 외부 Diffusers/Automatic1111 API를 호출해 결과를 업로드 저장소와 DB에 보관합니다. 지도 업로드는 Sharp로 표시본·고해상도본·썸네일을 만든 뒤 정규화 좌표 핀을 저장합니다.

## 장애 격리

LLM, 검색, 임베딩, 이미지 API가 중단돼도 로그인된 사용자는 기존 원고와 설정을 계속 읽고 편집할 수 있습니다. 의미 검색 장애는 키워드 검색으로 전환하고, 부분 출력은 완료 신호가 없으면 자동 반영하지 않습니다.

세부 규격은 [외부 API 계약](External-Services), 운영 방식은 [운영·백업·업데이트](Operations)를 참고하세요.
