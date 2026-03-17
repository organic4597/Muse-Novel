# 스토리 구상 기능

## 목적

홈 화면에서 AI와 대화하며 소설 아이디어를 구상하고, 합의된 설정을 바로 실제 프로젝트 데이터로 전환하기 위한 기능입니다.

## 사용자 흐름

1. 홈 화면에서 `스토리 구상` 탭 진입
2. 아이디어를 자유롭게 입력하거나 추천 문장으로 시작
3. AI가 대화를 통해 설정을 점진적으로 구체화
4. 우측 `기획 초안` 패널에서 구조화 결과 확인 (대화 전에도 항상 표시됨)
5. `이 설정으로 소설 만들기` 클릭
6. 새 프로젝트, 등장인물, 세계관, 1장 개요 생성

## draft 구조

- title
- genre
- synopsis
- premise
- tone
- themes[]
- characters[]
- worldEntries[]
- firstChapterOutline

## 저장 정책

- 기획 중 데이터는 브라우저 localStorage에만 저장
- 적용 시에만 DB에 엔티티 생성
- 원본 draft는 `projects.settingsJson.ideationSnapshot`으로 보존

## AI 설정 정책

- 홈 스토리 구상은 전역 AI 설정 페이지(`/settings/ai`)의 공용 AI 설정을 우선 사용
- 공용 설정이 없으면 환경 변수 provider fallback

## Qwen3 Base 모델 응답 처리

Qwen3 Base 모델은 응답 앞에 `<think>…</think>` 추론 블록을 출력합니다. `parseStoryPlanningResponse` (`src/lib/ai/story-planning-prompt.ts`)에서 이 블록을 자동으로 제거한 뒤 JSON을 파싱합니다. 이 처리 없이는 draft가 업데이트되지 않고 우측 패널이 빈 상태로 유지됩니다.

## 우측 기획 초안 패널

`DraftPanel`과 `ApplyDraftPanel`은 draft 내용 유무와 관계없이 항상 렌더링됩니다.

- 내용 없음: 플레이스홀더 표시
- 내용 있음: 구조화 draft 표시
- 적용 버튼: draft 내용이 없거나 적용 중일 때 비활성화

## 범위

### 포함

- 대화형 아이데이션
- 구조화 draft 갱신
- 프로젝트 일괄 생성

### 제외

- 서버 저장형 구상 세션
- 실시간 토큰 스트리밍
- 협업 편집
- 기획 버전 히스토리
