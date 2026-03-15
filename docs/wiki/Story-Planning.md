# 스토리 구상 기능

## 목적

홈 화면에서 AI와 대화하며 소설 아이디어를 구상하고, 합의된 설정을 바로 실제 프로젝트 데이터로 전환하기 위한 기능입니다.

## 사용자 흐름

1. 홈 화면에서 `스토리 구상` 탭 진입
2. 아이디어를 자유롭게 입력하거나 추천 문장으로 시작
3. AI가 대화를 통해 설정을 점진적으로 구체화
4. 우측 `기획 초안` 패널에서 구조화 결과 확인
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

- 홈 스토리 구상은 공용 AI 설정 우선
- 공용 설정이 없으면 환경 변수 provider fallback

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