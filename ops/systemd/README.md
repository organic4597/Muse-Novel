# Muse Novel 로컬 임베딩 서비스

`muse-embedding.service`는 생성용 GPU를 점유하지 않고 Qwen3-Embedding-0.6B를 CPU에서 실행합니다.
기본 모델 경로는 다음과 같습니다.

```text
/opt/models/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf
```

검증한 공식 Qwen Q8 파일의 SHA-256은 다음과 같습니다.

```text
06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439
```

모델 출처는 `Qwen/Qwen3-Embedding-0.6B-GGUF`이며 라이선스는 Apache-2.0입니다.

예제 서비스는 안전한 기본값으로 `127.0.0.1:8081`에만 바인딩하고 API 키를 요구합니다. Muse Novel이
다른 컨테이너나 호스트에서 실행된다면 unit의 `--host`를 해당 환경에서 접근 가능한 사설 주소로
바꾸고 방화벽에서 호출 서버만 허용합니다. 실제 서버 주소는 저장소에 커밋하지 않습니다.

## 설치

```bash
sudo install -d -m 700 /etc/muse-novel
openssl rand -hex 32 | sudo tee /etc/muse-novel/embedding-api-key >/dev/null
sudo chmod 600 /etc/muse-novel/embedding-api-key
sudo install -m 644 ops/systemd/muse-embedding.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now muse-embedding.service
```

Muse Novel 컨테이너에는 다음 환경값을 전달합니다.

```text
EMBEDDING_BASE_URL=http://<WSL_LAN_IP>:8081
EMBEDDING_MODEL=Qwen3-Embedding-0.6B
EMBEDDING_API_KEY=<embedding-api-key 파일과 같은 값>
```

`/api/external-services/test` 또는 운영 진단 화면에서 연결을 확인합니다. API 키 원문은 로그,
진단 응답, 저장소에 남기지 않습니다.
