# 창작 지식 베이스

`knowledge/writing/`의 Markdown 문서를 사람이 읽는 위키와 AI 검색 자료로 함께 사용합니다. 소설 작법, 장르 관습, 대사, 플롯, 퇴고, 역사·문화 배경처럼 작품과 독립된 지식을 축적하는 공간입니다.

## 기능

- `/writing-knowledge`에서 카테고리 탐색과 검색
- 관련 문서를 LLM용 제한 길이 문맥으로 구성
- 스토리 구상, 설정 제안, 집필 에이전트에서 관련 지식 자동 참조
- 실행 중 파일 변경 감지와 재인덱싱
- 임베딩 연결 시 의미 검색, 장애 시 키워드 검색
- 문서 해시 기반 벡터 캐시 재사용

## 문서 추가

`knowledge/writing/README.md`의 frontmatter 규격을 따릅니다. `id`는 전체 문서에서 유일해야 합니다.

```markdown
---
id: dialogue-revision
title: 대사 퇴고
category: 대사
tags: [대사, 퇴고, 서브텍스트]
summary: 대사의 목적과 반복을 점검하는 방법
---

# 대사 퇴고

본문...
```

한 문서에 너무 많은 분야를 넣기보다 AI가 검색하기 좋은 하나의 기술·주제로 나누고, 요약과 태그에 동의어를 포함하세요.

## 외부 디렉터리와 Docker

기본 폴더 대신 다른 위치를 쓰려면 `WRITING_KNOWLEDGE_DIR`을 절대 경로로 지정합니다. WSL에서는 예를 들어 `/mnt/d/path/to/Muse-Novel/knowledge/writing`처럼 Windows 드라이브 경로를 연결할 수 있습니다.

Docker 운영에서는 호스트 지식 폴더를 읽기 전용으로 마운트하고 환경 변수를 컨테이너 경로로 지정합니다.

```bash
-v /path/to/writing-knowledge:/app/knowledge/writing:ro
-e WRITING_KNOWLEDGE_DIR=/app/knowledge/writing
```

## 가져오기와 동기화

- 권한이 확인된 로컬 텍스트: `bun run knowledge:import`
- 공개 MediaWiki 자료: `bun run knowledge:sync`
- 지식 품질 점검: `bun run knowledge:audit`

원문을 무단 복제하지 말고 라이선스, 출처 URL, 가져온 범위와 수정 여부를 기록합니다. 커뮤니티 팁은 사실 자료가 아니라 경험적 조언으로 구분합니다.

## 의미 검색 캐시

벡터는 기본적으로 SQLite 옆 `writing-knowledge-vectors.json`에 원자적으로 저장됩니다. 다른 위치는 `WRITING_KNOWLEDGE_VECTOR_CACHE_PATH`로 지정합니다. 모델 가중치나 pooling 방식이 바뀌면 `EMBEDDING_REVISION` 또는 `EMBEDDING_POOLING`도 변경해 오래된 벡터 캐시를 무효화하세요.

최초 의미 인덱스가 준비되는 동안에도 요청은 키워드 검색으로 진행됩니다.
## 작품 설정과의 구분

- 창작 지식: 일반적인 작법·장르·배경 지식
- 세계관 항목: 특정 작품에서 확정된 설정
- 작가 노트: 반드시 지켜야 할 짧고 높은 우선순위의 원칙
- 지속 상태 메모: 현재 시점의 위치·부상·소지품·기술 변화

같은 내용을 여러 위치에 복제하기보다 성격에 맞는 한 곳에 기록해야 충돌이 줄어듭니다.
