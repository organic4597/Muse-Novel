# Muse Novel 로컬 AI 통합 적용 계획

기준일: 2026-09-07

이 문서는 현재 Muse Novel 코드와 Windows/WSL 장비 상태, 공개 모델 자료를 기준으로 작성한 구현 계획이다. 모델 설치 완료 기록이나 품질 보증서가 아니다.

## 결정

기본 검증 모델은 `kakaocorp/kanana-2-30b-a3b-instruct-2601`로 정한다. 하나의 non-thinking Instruct 모델을 스토리 구상, 검색어 계획, World assistant, 집필 에이전트, Ghost Text에 공용으로 사용한다. 사용자가 장문 생성과 직접 집필을 교대로 수행한다는 전제이므로 한 서비스와 한 모델 슬롯으로 시작한다.

| 프로필 | 목적 | 초기 구성 |
| --- | --- | --- |
| Kanana Unified | 한국어 스토리 작업과 Ghost Text 공용 | 30B-A3B Instruct, Q4_K_M, 16K context, 두 GPU 분산 |
| Kanana Fast | Ghost 지연 비교 및 저사양 대안 | Kanana-2-3B-Instruct, 품질 우선 양자화, 한 GPU |
| SuperQwen Full | 검열 완화가 필요한 창작과 기존 품질 비교 | 현재 SuperQwen3.8 27B abliterated 서비스 보존 |
| Image | 캐릭터·지형 이미지 생성 | Muse Novel 호환 API 모델 선정 후 별도 등록 |

Kanana Unified가 안정적으로 올라가면 32K context를 별도 시험한다. Ghost Text에는 실제로 필요한 앞뒤 문맥만 보내므로 16K로도 충분한지 먼저 검증한다. MTP draft 모델, mmproj, 비전 인코더는 초기 서비스에 추가하지 않는다.

## 선정 근거

[Kanana-2-30B-A3B-Instruct-2601 공식 모델 카드](https://huggingface.co/kakaocorp/kanana-2-30b-a3b-instruct-2601)는 전체 30B, 활성 3B의 MLA·MoE 구조와 32K context를 명시한다. 공식 비교에서 KMMLU 68.26, HAERAE 75.57, IFBench 48.30을 기록했다. 한국어 지식과 지시 준수가 필요한 Muse Novel에 적합하지만 한국어 소설 자동완성 전용 평가는 아니므로 실제 원고 평가가 필요하다.

[Kanana-2-3B-Instruct 공식 모델 카드](https://huggingface.co/kakaocorp/kanana-2-3b-instruct)는 2026-07-27 공개된 한국어 중심 소형 모델이다. 같은 카드의 직접 비교에서 Qwen3.5-2B보다 KoMT-Bench, IFBench, KMMLU, HAERAE, KoSimpleQA가 높다. 30B MoE의 최초 응답 시간이 목표를 넘을 때 속도 대안으로 사용한다.

[Qwen3.5-35B-A3B 공식 모델 카드](https://huggingface.co/Qwen/Qwen3.5-35B-A3B)는 전체 35B, 활성 3B, Apache-2.0, 강한 범용·다국어 성능을 제공한다. Kanana의 라이선스 또는 실행 호환성이 맞지 않을 때 2순위 품질 후보로 둔다. Ghost Text에서는 thinking을 반드시 비활성화해야 한다.

이들 공식 평가는 서로 다른 평가 환경을 포함하므로 점수만으로 Ghost 품질 순위를 확정하지 않는다. 커서 앞뒤 연결, 한국어 문체, 첫 토큰 지연과 실제 수락률을 최종 기준으로 삼는다.

## 검열 완화 모델 판단

현재 공개 검색에서 Kanana-2-30B-A3B 또는 Kanana-2-3B를 기반으로 하며 제작 과정, 파일, 라이선스와 사용 사례가 충분히 확인되는 abliterated·uncensored 파생 모델은 찾지 못했다. 이름만 비슷한 비공식 변형을 기본 설치 대상으로 삼지 않는다.

Kanana Base 또는 Mid 체크포인트는 검열 완화 Instruct 모델이 아니다. 대화 지시, JSON 출력, 도구 호출과 안전한 중단 조건이 약해질 수 있어 스토리 에이전트와 Ghost를 하나로 처리하는 모델로 사용하지 않는다.

검열 완화가 필요한 창작에는 이미 설치된 SuperQwen3.8-27B-abliterated를 비교 프로필로 보존한다. Kanana 자체의 거절률이 실제 문학 요청에서 문제가 되는지 먼저 측정한다. 자체 ablation 또는 비공식 파생 모델 도입은 한국어 문체·지시 준수 저하와 Kanana License의 파생물 조건을 검토한 뒤 별도 실험으로만 진행한다.

## 현재 Ghost Text 동작과 문제점

현재 클라이언트는 900ms 입력 정지 후 단어·문장 경계에서 요청한다. 커서 앞 최대 6,000자와 뒤 최대 1,500자, 작품 설정과 활성 문체 프로필을 서버에서 조합한다. 자동 요청은 최대 80토큰, 명시적 재생성은 최대 120토큰을 요청하고 결과를 최대 180자로 정리한다. 커서가 바뀐 오래된 응답은 폐기하고 같은 문맥은 짧게 캐시한다.

개선이 필요한 항목은 다음과 같다.

1. Ghost가 프로젝트·전역 기본 제공자를 그대로 사용한다. 전용 제공자 선택과 공용 제공자 선택을 명시적으로 지원해야 한다.
2. `qwen-local` 분기는 `/v1/completions`에 수동 프롬프트를 보낸다. Kanana Instruct는 `/v1/chat/completions`와 모델의 chat template를 사용해야 한다.
3. 모델이 지원하는 native FIM을 확인하지 않은 상태에서 일반 `<CURSOR>` 문자열을 사용한다. Instruct 모델에는 앞뒤 문맥을 분리한 system/user 메시지 방식으로 고정한다.
4. 같은 llama-server의 긴 생성이 슬롯을 점유하면 자동 Ghost는 빈 결과를 반환한다. 공용 모델 모드에서는 이를 정상적인 busy 상태로 UI와 진단 화면에 표시한다.
5. 매 요청마다 전달하는 작품 설정과 문체 정보가 Ghost에 필요한 범위를 넘을 수 있다. 고정 prefix 캐시가 재사용되도록 메시지 순서와 cache key를 정리한다.
6. 30초 클라이언트 timeout은 자동완성 UX 기준으로 너무 길다. 모델 벤치마크 후 자동 요청은 3초 안팎, 명시적 재생성은 더 긴 별도 제한으로 나눈다.
7. 생성 성공 여부만 기록하고 사용자 수락률과 첫 응답 지연을 측정하지 않는다. 개인 원문을 저장하지 않는 익명 성능 지표가 필요하다.

## 목표 구조

```text
Windows 통합 실행 메뉴
  ├─ Kanana Unified       ─┐
  ├─ Kanana Fast          ─┼─ WSL llama.cpp API만 제공
  ├─ SuperQwen Full       ─┤
  └─ Image                ─┘

Muse Novel 웹 서버
  ├─ 역할별 제공자 선택과 상태 확인
  ├─ 검색·기억·에이전트 루프
  ├─ Ghost 문맥·문체 조립과 결과 검증
  └─ DB·파일 저장
```

LLM 서버는 모델 추론만 담당한다. SearXNG 검색, 작품 기억 검색, 프롬프트 구성, 재시도, 승인·거부와 데이터 변경은 Muse Novel 서버에서 실행한다.

## 구현 단계

### 1. 역할별 제공자 설정

- 프로젝트 AI 설정에 `storyProviderId`와 선택적 `ghostProviderId`를 추가한다.
- Ghost 제공자를 지정하지 않으면 스토리 제공자를 사용한다. Kanana Unified는 두 역할이 같은 provider를 가리킨다.
- 설정 화면에서 Story와 Ghost의 URL, 모델 ID, health, 예상 역할을 구분해서 보여준다.
- 기존 데이터는 현재 기본 제공자를 Story와 Ghost의 공용 기본값으로 마이그레이션한다.

### 2. Ghost 호출 경로 정리

- 로컬 Instruct 모델도 `/v1/chat/completions`를 사용한다.
- system 메시지에는 출력 계약과 문체 규칙, user 메시지에는 prefix·cursor·suffix를 분리한다.
- Kanana chat template가 실제 적용되는지 `/apply-template` 또는 짧은 API 시험으로 확인한다.
- 자동 요청은 한 문장 이내, 명시적 요청은 최대 두 문장으로 제한한다.
- 프롬프트 캐시 재사용률을 높이고 취소된 요청 결과는 저장하지 않는다.

### 3. 실행 메뉴를 역할이 아닌 프로필 중심으로 변경

- 현재 `story/image/ghost` 고정 구조를 `profiles[]`와 `capabilities[]` 구조로 바꾼다.
- Kanana Unified에는 `story`, `ghost` capability를 함께 부여한다.
- GPU를 공유하는 프로필에는 같은 exclusive group을 지정해 시작 전 현재 모델을 안전하게 중지한다.
- 상태, health, 로그, GPU 메모리, Muse Novel에 입력할 endpoint를 한 화면에 표시한다.
- 메뉴 종료와 모델 중지를 구분한다.

### 4. WSL 서비스 구성

- 기존 `llama-qwen38.service`는 그대로 보존한다.
- `llama-kanana2.service`와 선택적 `llama-kanana2-fast.service`를 별도 작성한다.
- 최초 Unified 설정은 Q4_K_M, context 16384, KV cache q4, parallel 1, 두 GPU layer split으로 시작한다.
- 모델 alias, `/health`, `/models`, chat template와 한국어 출력 시험을 통과해야 메뉴에 READY로 표시한다.
- 서비스 간 포트 충돌과 동시에 두 대형 모델이 올라가는 상황을 방지한다.

### 5. 고정 평가 세트

사용자가 평가에 사용하도록 허용한 원고로 최소 30개 Ghost 입력과 10개 스토리 요청을 만든다. 원문 자체는 로그나 측정 DB에 저장하지 않는다.

Ghost 평가지표:

- warm 상태 첫 응답 시간 p50·p95
- 전체 요청 완료 시간
- 앞 문장 반복과 뒤 문장 복사 비율
- 시점·시제·호칭 충돌
- 금지된 메타 설명 출력
- Tab 전체 수락과 부분 수락 비율
- 빈 제안과 timeout 비율

스토리 평가지표:

- 검색 필요성 판단과 JSON 형식 성공률
- 요청 항목 누락률
- 기존 설정과의 충돌
- 장면 인과와 인물 동기 유지
- 긴 출력 중단·잘림 비율

### 6. 비교 및 채택

1. 현재 SuperQwen Full을 기준선으로 측정한다.
2. Kanana Unified를 같은 입력으로 측정한다.
3. Unified의 자동 Ghost p95가 목표를 넘으면 Kanana Fast를 측정한다.
4. Kanana가 반복적으로 문학 요청을 거절할 때만 검열 완화 대안을 별도 평가한다.
5. 품질·지연·안정성 결과와 라이선스 검토가 끝난 모델만 기본 프로필로 지정한다.

초기 UX 목표는 warm 자동 Ghost p50 1초 내외, p95 2초 안팎이다. 이는 목표값이며 모델 설치 전 성능 보장이 아니다. 품질이 유의미하게 좋아진다면 명시적 재생성에는 더 긴 지연을 허용한다.

## 완료 조건

- 한 모델을 Story와 Ghost 공용 또는 각각 다른 provider로 선택할 수 있다.
- 장문 요청 중 Ghost가 생략되면 사용자가 busy 상태를 확인할 수 있다.
- 모델 교체 후 Muse Novel 재시작 없이 health와 모델 ID를 다시 확인할 수 있다.
- 원고 중간 커서에서 앞뒤 문맥을 반복하지 않는 제안을 만든다.
- 30개 Ghost 평가와 10개 스토리 평가 결과가 모델별로 저장된다.
- 검열 완화 여부는 모델 이름이 아니라 실제 문학 요청 거절률로 비교한다.
- 이미지 생성 모델은 텍스트 모델과 독립된 프로필로 실행·중지할 수 있다.
