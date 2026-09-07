# Windows AI 모델 실행 메뉴

`Start-Muse-AI.bat`을 더블클릭합니다. Windows PowerShell 5.1 또는 PowerShell 7과 WSL Ubuntu의 systemd 서비스로 동작합니다. 관리자 암호를 파일에 저장하지 않으며 WSL root 사용자로 지정된 서비스만 제어합니다.

- `1`: 기존 SuperQwen3.8 27B Abliterated
- `2`: Kanana-2 30B-A3B Instruct 2601
- `3`: 이미지 생성 모델(설정 후)
- 모델 선택 후 `1` 실행·전환, `2` 중지, `3` 로그 확인
- `S`: 상태 및 API 준비 여부 확인, `G`: GPU 메모리 확인, `C`: 설정 편집

같은 exclusive group의 다른 모델이 실행 중이면 전환 전에 확인을 받습니다. 등록되지 않은 서비스나 WSL 전체를 종료하지 않습니다. 메뉴를 닫아도 모델 서비스는 계속 실행됩니다. GPU 메모리를 반환하려면 해당 모델의 중지를 선택하세요.

## 최초 연결

기본 예시는 `Ubuntu`의 `llama-qwen38.service`에 연결합니다. 기존 서비스의 모델 경로와 실행 옵션을 그대로 사용합니다. 시작 후 단순 프로세스 상태뿐 아니라 `/health` 응답을 확인하며 최대 600초 기다립니다. 실패 시 최근 로그를 표시하고 서비스는 자동으로 종료하지 않습니다.

SuperQwen과 Kanana는 `story`, `ghost` 기능을 함께 제공하는 상호 배타적 프로필입니다. 전환하면 같은 GPU와 8080 포트를 사용하는 다른 텍스트 모델을 먼저 중지합니다. 이미지 항목은 기본적으로 미설정입니다.

| 필드 | 의미 |
| --- | --- |
| `service` | 실제 설치한 서비스 이름, 예: `muse-image.service` 또는 `muse-ghost.service` |
| `healthUrl` | WSL 내부에서 준비 상태를 확인할 HTTP 주소 |
| `apiBaseUrl` | Muse Novel에 입력할 API 기본 주소의 로컬 예시 |
| `model` | API가 제공하는 모델 ID 또는 체크포인트 이름 |
| `capabilities` | `story`, `ghost`, `image` 중 이 프로필이 제공하는 기능 |
| `exclusiveGroup` | 같은 GPU·포트를 사용해 동시에 실행하면 안 되는 프로필 묶음 |

서로 다른 모델에는 다른 서비스와 포트를 사용하세요. `healthUrl`은 모델 로딩 완료 후 HTTP 성공 상태를 반환해야 합니다. 설정은 `models.local.json`에 저장되며 Git 추적에서 제외됩니다. 확인되지 않은 서비스명을 넣으면 `not installed`로 표시됩니다.

Muse Novel 연결 규격은 스토리 LLM의 `/v1/chat/completions`, Ghost Text의 `/v1/completions`, 이미지 생성의 현재 지원 제공자 `Automatic1111` 또는 `Diffusers API`입니다. ComfyUI는 별도 연동 없이 이 두 이미지 API와 호환되지 않습니다. 검색과 에이전트 실행은 Muse Novel 웹 서버가 담당합니다.

다른 장비에서 웹 서버를 실행한다면 `127.0.0.1` 대신 해당 서버에서 접근 가능한 Windows/WSL 주소를 Muse Novel에 입력해야 합니다. 실행 메뉴는 방화벽·포트 전달·Muse Novel 설정을 자동 변경하지 않습니다.

## 명령줄

```powershell
.\Start-Muse-AI.ps1 -Action Validate
.\Start-Muse-AI.ps1 -Action Status
.\Start-Muse-AI.ps1 -Action Start -Model qwen
.\Start-Muse-AI.ps1 -Action Switch -Model kanana
.\Start-Muse-AI.ps1 -Action Switch -Model image
.\Start-Muse-AI.ps1 -Action Stop -Model kanana
```

다른 배포판이나 경로에서는 `-ConfigPath`로 JSON 파일을 지정할 수 있습니다. 기본 로컬 설정이 없을 때만 예시를 사용하며, 명시한 다른 파일이 없으면 오류를 표시합니다.
