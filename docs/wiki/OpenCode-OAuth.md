# ChatGPT OAuth · OpenCode 호환 모듈

Muse Novel은 OpenCode의 MIT 라이선스 OpenAI Codex OAuth 구현에서 인증·토큰 갱신·Responses 요청 변환에 필요한 부분만 서버 모듈로 포함합니다. OpenCode 프로세스, 코딩 에이전트, 파일·명령·브라우저 도구를 실행하지 않습니다.

참조한 원본은 `anomalyco/opencode`의 `d6855b6b47a8433462ac6aeeba882ccf734cb7f1` 커밋이며 라이선스 전문은 `docs/licenses/opencode-oauth-MIT.txt`에 보존합니다. 이 연동은 OpenCode 호환 구현이고 범용 OpenAI API OAuth 규격을 의미하지 않습니다.

## 연결 방법

1. **AI 환경**으로 이동합니다.
2. 공통 연결에서는 Provider를 **ChatGPT OAuth (OpenCode 호환)**으로 선택합니다. 작품별 설정에서는 **ChatGPT OAuth** 탭을 선택합니다.
3. **ChatGPT로 로그인**을 누릅니다.
4. OpenAI 로그인 페이지를 열고 표시된 일회용 코드를 입력합니다.
5. 연결됨 상태에서 사용할 모델을 선택합니다.
6. **공통 기본 AI로 사용** 또는 **이 작품의 기본 AI로 사용**을 누릅니다.

기존 API·로컬 LLM 설정은 삭제되지 않습니다. 작품별 기본 제공자가 공통 기본 제공자보다 우선합니다.

## 내부 동작

```text
OpenCode 호환 Device OAuth
  → Access/Refresh Token 발급
  → AES-256-GCM 암호화 저장
  → 만료 전 Refresh Token 단일 갱신
  → ChatGPT Account ID·지역 정보 헤더 구성
  → Codex Responses 엔드포인트 호출
  → 기존 AI SDK 텍스트·SSE·JSON 흐름으로 반환
```

토큰은 일반 AI 제공자 테이블이나 브라우저로 전달하지 않습니다. 기본 위치는 `data/auth/opencode-oauth/credential.json`이며 암호화 키는 기존 Muse Novel의 `data/.encryption-key` 또는 `ENCRYPTION_KEY`를 사용합니다. 인증 파일과 암호화 키를 함께 공개하거나 Git에 커밋하지 마세요.

## 호환 범위와 제한

- 스토리 구상, 스토리라인 대화, World Assistant, 원고 작성·비평·일관성 검사처럼 기존 `generateText`, `streamText`, 구조화 JSON을 사용하는 기능에서 선택할 수 있습니다.
- 모델 도구 목록은 항상 빈 배열로 고정합니다. 웹 검색·지식 검색·에이전트 반복·저장·승인은 Muse Novel 서버가 담당합니다.
- 이미지 생성과 임베딩은 기존 전용 제공자를 사용합니다.
- Ghost Text에서 일반 AI 상속을 선택하면 기술적으로 호출할 수 있지만 지연과 구독 한도 때문에 로컬 전용 모델을 권장합니다.
- Codex 구독 백엔드는 일반 OpenAI API와 지원 옵션이 다릅니다. `max_output_tokens`는 OpenCode 구현과 동일하게 전송하지 않으며, 목표 분량은 프롬프트와 결과 검증으로 관리합니다.
- OpenCode/OpenAI의 OAuth 또는 비공개 백엔드 계약이 바뀌면 호환 모듈 업데이트가 필요할 수 있습니다.

연결 해제는 Muse Novel이 저장한 암호화 OAuth 자격 증명만 삭제합니다. 서버에 별도로 설치된 OpenCode의 인증 파일과 기존 API 설정에는 영향을 주지 않습니다.
