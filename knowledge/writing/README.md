# Muse Novel 창작 지식 베이스

이 디렉터리는 사람이 읽는 위키이자 Muse Novel의 AI가 검색해서 사용하는 참고 자료입니다.
`knowledge/writing` 아래 어느 하위 디렉터리에든 Markdown 파일을 추가하면 다음 검색부터 자동으로 반영됩니다.

## 문서 형식

```markdown
---
id: unique-document-id
title: 문서 제목
category: 기획
tags: [키워드1, 키워드2, 키워드3]
summary: 검색 결과와 LLM 문맥에 들어갈 한 문장 요약
---

# 문서 제목

직접 작성한 본문...
```

필수 항목은 `id`, `title`, `category`, `tags`, `summary`입니다. `id`는 전체 디렉터리에서 유일해야 합니다.
문서를 수정하거나 새 파일을 추가하면 서버를 재시작하지 않아도 파일 변경 시각을 감지해 다시 읽습니다.

반복해서 실행할 수 있는 작업 절차는 `kind: skill`로 기록합니다. 스킬 문서에는 입력, 실행 순서,
통과 조건과 실패 시 확인할 항목을 함께 적어야 집필 에이전트가 단순 배경지식이 아니라 실행 가능한
체크리스트로 활용할 수 있습니다.

외부 위키 디렉터리를 쓰려면 서버 환경 변수 `WRITING_KNOWLEDGE_DIR`에 절대 경로를 지정합니다.
Windows 프로젝트를 WSL에서 볼 때 기본 위치는 `/mnt/d/WorkPlace/musenovel/knowledge/writing`입니다.

## 권한이 확인된 외부 자료 가져오기

직접 작성한 원고, 사용 허락을 받은 자료, 적용 지역에서 공개 도메인임을 확인한 자료는 다음 명령으로 가져올 수 있습니다. 긴 파일은 검색하기 좋은 약 6,000자 단위 문서로 자동 분할됩니다.

```bash
bun run knowledge:import -- \
  --input /path/to/reference.txt \
  --id public-domain-reference \
  --title "참고 작품" \
  --summary "장면과 문체를 비교하기 위한 권리 확인 자료" \
  --category "외부 자료" \
  --kind reference \
  --tags "공개 도메인,장면,문체" \
  --license "Public domain 확인" \
  --source-url "https://source.example/item" \
  --rights-confirmed yes
```

현대 상업 소설 원문은 허가 없이 가져오지 않습니다. 특정 작품은 원문 대신 직접 작성한 장르 관습·구조·문체 분석을 추가합니다.

## 공개 인터넷 자료 동기화

`knowledge/sources/mediawiki-writing.json`에는 라이선스와 출처를 검토한 MediaWiki 자료 목록이 있습니다. 현재 목록에는 공개 글쓰기 교재와 한국어 문학·장르·역사·사회·과학 배경 자료가 포함됩니다.

```bash
# 내려받을 자료 확인
bun run knowledge:sync -- --dry-run yes

# 전체 동기화
bun run knowledge:sync

# 일부 자료만 별도 폴더로 동기화
bun run knowledge:sync -- \
  --source wikibooks-fiction-technique,kowiki-wuxia \
  --output-dir /path/to/knowledge/writing/external
```

각 문서는 최대 6,000자 단위로 분할되고 원본 URL, 라이선스, 접근일을 기록합니다. 존재하지 않거나 너무 짧은 페이지는 건너뜁니다. CC BY-SA 자료를 재배포할 때는 출처 표시와 동일조건 배포 의무를 확인해야 합니다.

새 자료를 추가하거나 동기화한 뒤에는 메타데이터, 중복 ID, 외부 자료의 출처·라이선스를 검사합니다.

```bash
node scripts/audit-writing-knowledge.mjs
```

## 작성 원칙

- 타인의 책이나 유료 강의 내용을 복사하지 말고 직접 요약합니다.
- 한 문서는 한 가지 판단이나 작업에 집중합니다.
- 정의만 적지 말고 적용 절차, 점검 질문, 흔한 실패를 포함합니다.
- 작품마다 달라질 수 있는 취향을 절대 규칙처럼 쓰지 않습니다.
- 출처가 있다면 문서 마지막에 링크를 기록합니다.
