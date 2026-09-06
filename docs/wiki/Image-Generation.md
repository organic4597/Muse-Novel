# 이미지 생성과 LoRA

## 현재 지원 범위

캐릭터 상세에서 외부 이미지 API를 이용해 다음 유형을 생성할 수 있습니다.

- profile: 얼굴·상반신 중심
- full-body: 전신과 의상
- illustration: 장면형 삽화

캐릭터 설정, 기본 프리셋, 번역·추천 태그, 사용자 추가 태그를 합쳐 prompt를 만들고 생성 결과를 프로젝트 갤러리에 저장합니다. provider는 Diffusers API 또는 Automatic1111/Forge를 선택할 수 있습니다.

## 설정 순서

1. **AI 환경**에서 대상 프로젝트를 선택합니다.
2. 이미지 provider, Base URL, 모델, 해상도, steps, sampler, CFG와 기본 negative prompt를 저장합니다.
3. 연결 테스트를 실행합니다.
4. 캐릭터 상세에서 이미지 생성 창을 엽니다.
5. 생성 유형과 추가 태그를 선택하고 prompt를 확인합니다.
6. 생성 결과를 검토해 갤러리와 대표 이미지로 사용합니다.

## LoRA 현재 상태

- 로컬 LoRA 레지스트리 목록 조회
- 다운로드 여부와 trigger words 표시
- 캐릭터 생성 요청에서 LoRA ID와 가중치 선택
- trigger words를 생성 prompt에 결합
- Diffusers API 요청에 `loraId`, `loraWeight` 전달
- LoKR는 현재 미지원 안내

실제 LoRA 파일 로드와 가중치 적용은 외부 이미지 서버가 해당 필드를 지원해야 합니다. 연결 테스트가 성공했다는 사실만으로 결과 이미지에 LoRA가 반영됐다고 단정하지 말고 외부 서버 로그와 출력 결과를 함께 확인하세요.

Muse Novel 내부에서 LoRA 학습 시작·취소·진행률 복구·완료 모델 등록을 전부 관리하는 기능은 아직 완성되지 않았습니다.

## 아직 구현 예정

- 프로젝트·캐릭터별 LoRA 프리셋과 실제 적용 검증
- 도시·종파·건물·던전·자연 지형 등 세계관 항목 이미지 생성
- 지도 특정 영역과 지형 설명을 참고한 생성
- 동일 인물·장소의 외형 일관성을 위한 seed·prompt·LoRA 기록
- 생성 결과 승인·거부·재생성과 지도 핀 상세 연결
- image-to-image, inpaint, ControlNet

## 운영 주의

Muse Novel은 GPU 프로세스를 시작하거나 종료하지 않습니다. CUDA·VRAM·모델 로드·작업 큐 오류는 외부 이미지 서버 로그에서 확인합니다. API 계약은 [외부 API 계약](External-Services), 로드맵은 [로드맵](Roadmap)을 참고하세요.

