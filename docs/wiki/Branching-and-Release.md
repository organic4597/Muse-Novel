# 브랜치와 릴리즈 운영

Muse Novel 저장소와 `main`, `release`, `develop`, `hotfix` 브랜치는 모두 공개합니다. GitHub 기본 브랜치는 `main`이며 외부 사용자는 안정 배포가 필요할 때 `release` 또는 버전 태그를 사용합니다.

## 브랜치 역할

| 브랜치 | 역할 | 일반 커밋 |
| --- | --- | --- |
| `develop` | 일상 개발과 기능 통합 | 허용 |
| `main` | develop에서 올라온 릴리즈 후보 검증 | 직접 작업 지양 |
| `hotfix` | main/release에서 발견된 긴급 버그 수정 | 버그 수정만 |
| `release` | 외부 사용자가 받을 검증 완료 상태 | 검증된 병합만 |

## 일반 개발

```text
develop
  → 기능 구현·테스트
  → main 병합
  → 통합·운영 검증
  → release 병합
  → 버전 태그
```

새 작업은 `develop`을 최신 상태로 받은 뒤 진행합니다. 기능 단위 브랜치가 필요하면 `feature/<짧은-이름>`을 임시로 만들고 완료 후 develop에 병합·삭제합니다.

## 핫픽스

```text
release 또는 main의 문제 확인
  → hotfix를 해당 기준점으로 동기화
  → 최소 수정·회귀 테스트
  → main과 develop에 모두 병합
  → 최종 검증 후 release 반영
```

hotfix를 release에만 반영하면 다음 develop 병합에서 같은 버그가 되살아날 수 있으므로 main과 develop에도 반드시 역병합합니다.

## release 반영 조건

- TypeScript 검사 통과
- 관련 Vitest 회귀 테스트 통과
- DB migration과 기존 데이터 보존 확인
- 로그인·AI 연결·핵심 집필 흐름 확인
- README와 위키의 현재 지원 범위 갱신
- 비밀, 실제 서버 주소, 개인 경로와 런타임 데이터가 Git에 없는지 확인

Ghost Text처럼 미완성인 기능은 release에 포함할 수 있지만 README와 위키에 제한을 명확히 표시합니다.

## 권장 명령

```bash
git switch develop
git pull --ff-only origin develop

# 개발 완료 후
git switch main
git merge --no-ff develop

# 검증 완료 후
git switch release
git merge --no-ff main
git tag -a vX.Y.Z -m "Muse Novel vX.Y.Z"
```

병합 전에는 원격 최신 상태를 받고 충돌을 해결합니다. `release`의 강제 푸시와 이미 공개한 버전 태그 변경은 피합니다.
