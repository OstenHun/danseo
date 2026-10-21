# Danseo

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="assets/brand/banner-compact-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/brand/banner-compact-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg">
  <img src="assets/brand/banner-light.svg" alt="Danseo — 논문 근거를 프로젝트의 판단으로 연결합니다." width="100%">
</picture>

**논문의 근거를, 내 프로젝트의 판단으로.**

요약: 논문 주장·원문 위치·프로젝트 적용 판단을 파일로 연결하고, 기존 AI agent가 읽을 근거 묶음으로 내보내는 로컬 CLI다. 현재 개발 프리뷰이며 CLI와 skill을 제공한다.

Danseo(단서)는 논문에서 프로젝트의 다음 판단에 필요한 실마리를 찾는다는 뜻이다. [이름과 표기](docs/NAMING.md)에 명명 이유와 확인 범위를 정리했다.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node.js 22 또는 24 LTS](https://img.shields.io/badge/node-22%20%7C%2024%20LTS-43853d.svg)
![Development preview](https://img.shields.io/badge/status-development_preview-orange.svg)

한국어 · [English](README.en.md) · [빠른 시작](#빠른-시작) · [CLI 문서](docs/CLI.md) · [기여 안내](CONTRIBUTING.md)

## 왜 만들었나

논문을 읽은 뒤 구현이나 실험에 적용하려면 요약만으로는 부족하다. 어떤 조건에서 나온 결과인지, 원문의 어디를 확인했는지, 지금 프로젝트에도 적용할 수 있는지 함께 남겨야 한다. 다음 대화에서도 이 판단을 다시 꺼내 쓸 수 있어야 한다.

Danseo는 논문에 대한 기록과 프로젝트의 적용 판단을 나누어 연결한다. 같은 논문을 여러 프로젝트에서 사용해도 근거는 공유하고, 적용 여부는 각 프로젝트에서 결정한다.

```text
Paper       논문 주장 · 평가 조건 · 원문 위치 · 검토 상태
   ↓ 주장 ID로 연결
Application 프로젝트 질문 · 적용/실험/보류 판단
   ↓ validate → export
Agent       근거 묶음 읽기 → 현재 조건 대조 → 필요한 원문 확인
```

## 빠른 시작

**Node.js 22.x 또는 24.x LTS와 npm**이 필요하며, 새 설치에는 **24.x 최신 패치**를 권장한다. 내려받은 소스 폴더에서 실행한다. 아직 npm에 배포하지 않았으므로 이름이 같은 패키지를 설치하지 않는다. [지원 정책](docs/RUNTIME_SUPPORT.md)에 최소 지원·권장·검증 범위를 구분했다.

처음 내려받은 소스 폴더에서는 아래 명령으로 합성 예제를 실행한다. 이미 준비된 빌드는 다시 설치하지 않는다.

```sh
npm ci
npm run build
node ./dist/cli.js validate --workspace ./examples/minimal --json
```

개인 자료와 agent의 네 연결값은 [CLI 첫 실행](docs/CLI.md#첫-실행), 영어 설정은 [English setup](docs/CLI.en.md)을 따른다. 근거 독해와 원문 접근 실패 대응은 [배포 skill](skills/danseo/SKILL.md)에 있다.

합성 예제의 `validate` 결과:

```json
{
  "ok": true,
  "records": 3,
  "projects": 2,
  "warnings": [
    "paper-synthetic: draft — 원문 검토 완료가 아닙니다."
  ],
  "scope": "structure-and-references-only"
}
```

`ok`는 파일 구조와 참조가 유효하다는 뜻이다. 논문 내용의 사실성이나 재현 성공을 검증하지 않는다. 예제는 실제 연구가 아니므로 `draft` 경고가 정상이며, 내보낼 때 `--include-drafts`를 명시한다. 이 옵션으로 검토 상태가 바뀌지는 않는다.

## 현재 제공하는 기능

| 기능 | 하는 일 |
| --- | --- |
| `validate` | 형식과 연결 검사 |
| `list` / `show` | 목록 조회와 원본 읽기 |
| `export` | 질문과 근거 내보내기 |
| 근거 보존 | 원문과 상태 보존 |
| Agent skill | 조건 대조와 원문 확인 |

내보내기에는 지정 질문 절, Application·Paper 전문과 연결한 원문 텍스트가 포함된다. 본문·주석·확장 필드는 원본대로 보존한다.

CLI 실행에는 모델 키·데이터베이스·상시 서버가 필요하지 않다. CLI는 네트워크 요청을 보내거나 입력 카드를 수정하지 않는다. `--out`을 지정하면 새 출력 파일만 만든다.

## 내 자료와 agent에 연결하기

1. [합성 workspace](examples/minimal/workspace.json)를 참고해 개인 자료 폴더에 `workspace.json`을 만든다. 읽을 카드와 프로젝트를 명시적으로 등록한다.
2. [CLI 문서](docs/CLI.md#첫-실행)의 네 연결값과 명령을 사용한다. 준비된 빌드·연결값이 있으면 재사용한다.
3. [배포 skill](skills/danseo/SKILL.md)에 따라 묶음과 현재 질문을 읽고, 필요한 원문을 확인한 뒤 적용 여부를 판단한다. 내보내기 성공만으로 질문에 답한 것은 아니다.

Paper는 논문 주장과 출처를, Application은 그 주장을 프로젝트에서 어떻게 다룰지 기록한다. 저자 주장, AI 해석, 프로젝트 관찰, 채택 결정을 구분한다. 세부 필드는 [카드 모델](docs/CARD_MODEL.md)과 [스키마](schemas/card.schema.json)를 참고한다.

**자료 공유 범위:** 내보낸 묶음에는 카드 전문과 로컬 절대 경로가 들어간다. 다른 사람이나 외부 AI에 전달하기 전에 내용을 확인한다. 연결한 agent가 외부 모델에 자료를 보내는지는 해당 agent의 설정과 권한에 달려 있다.

## 개발 상태와 로드맵

현재 버전은 `0.1.0-dev.1`이다. 카드 스키마와 CLI는 아직 안정 호환성을 약속하지 않는다.

- **구현됨:** 파일 읽기, 구조·참조 검사, Markdown/JSON 내보내기, agent용 skill, 합성 예제.
- **다음:** 카드 편집과 저장 왕복 검증, 새 환경 설치·agent 연결 확인.
- **이후:** 로컬 웹앱, 비교 표, 근거 패널, 관계 그래프.

PDF 자동 요약, 자체 LLM, 자동 실험·사이트 제출, MCP 서버는 현재 제공하지 않는다. GitHub Actions의 Windows·Ubuntu에서 Node 22·24 각각 빌드와 테스트 26개, 합성 예제 검사, 패키지 구성 검사를 통과했다. Node 26도 사전 검사를 통과했다. 현재 저장소는 비공개다. 자세한 진행 상황은 [TASKS](TASKS.md), 실행 근거와 한계는 [공개 준비 기록](docs/OPEN_SOURCE.md)에 있다.

## 문서와 기여

| 목적 | 문서 |
| --- | --- |
| 실행·오류·workspace 설정 | [CLI 사용법](docs/CLI.md) |
| Agent 연결과 확인 범위 | [Skill](skills/danseo/README.md) · [호환성 기록](docs/AGENT_COMPATIBILITY.md) |
| 데이터 형식·저장 위치 | [카드 모델](docs/CARD_MODEL.md) · [구조](docs/STRUCTURE.md) |
| 제품 범위·설계·개발 기록 | [문서 색인](docs/README.md) |
| 수정·제안·검증 | [기여 안내](CONTRIBUTING.md) · [보안 안내](SECURITY.md) |

버그 재현, 설명이 어려운 문서, 합성 예제, 다른 환경에서의 실행 결과부터 기여할 수 있다. 개인 논문·연구 노트·모델 대화 로그는 공개 이슈나 PR에 첨부하지 않는다.

## 라이선스

로고·README 배너·공유 이미지의 원본과 사용법은 [브랜드 자료](assets/brand/README.md)에 있다.

프로젝트 코드·문서·skill·합성 예제는 [MIT License](LICENSE)를 따른다. 외부 논문·데이터·사용자가 연결한 자료의 권리는 원저작자에게 남는다. 의존성의 라이선스와 고지는 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)에 정리했다.
