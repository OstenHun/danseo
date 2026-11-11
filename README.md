# Danseo

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="assets/brand/banner-compact-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/brand/banner-compact-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg">
  <img src="assets/brand/banner-light.svg" alt="Danseo — 논문 근거를 프로젝트의 판단으로 연결합니다." width="100%">
</picture>

**논문의 근거를, 내 프로젝트의 판단으로.**

Local research evidence tools for your AI agent: find, collect, revisit, and compare papers. [English guide](README.en.md)

요약: 기존 AI 에이전트로 논문을 찾고, 고른 원문과 논문별 답변·비교 근거를 로컬 파일에 남긴다. CLI와 읽기 전용 연구 비교 화면을 제공하는 개발 프리뷰다.

Danseo(단서)는 논문에서 프로젝트의 다음 판단에 필요한 실마리를 찾는다는 뜻이다. [이름과 표기](docs/NAMING.md)에 명명 이유와 확인 범위를 정리했다.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node.js 22 또는 24 LTS](https://img.shields.io/badge/node-22%20%7C%2024%20LTS-43853d.svg)
![Development preview](https://img.shields.io/badge/status-development_preview-orange.svg)

한국어 · [English](README.en.md) · [빠른 시작](#빠른-시작) · [CLI 문서](docs/CLI.md) · [기여 안내](CONTRIBUTING.md)

## 왜 만들었나

논문을 읽은 뒤 구현이나 실험에 적용하려면 요약만으로는 부족하다. 어떤 조건에서 나온 결과인지, 원문의 어디를 확인했는지, 지금 프로젝트에도 적용할 수 있는지 함께 남겨야 한다. 다음 대화에서도 이 판단을 다시 꺼내 쓸 수 있어야 한다.

Danseo는 논문 기록과 프로젝트의 적용 판단을 나누어 연결한다. 같은 논문을 여러 프로젝트에서 사용해도 근거는 공유하고, 적용 여부는 각 프로젝트에서 결정한다.

```text
Paper       논문 주장 · 평가 조건 · 원문 위치 · 검토 상태
   ↓ 주장 ID로 연결
Application 프로젝트 질문 · 적용/실험/보류 판단
   ↓ validate → export
Agent       근거 묶음 읽기 → 현재 조건 대조 → 필요한 원문 확인
```

## 빠른 시작

**Node.js 22.x 또는 24.x LTS와 npm**이 필요하며, 새 설치에는 **24.x 최신 패치**를 권장한다. 현재 저장소는 비공개이므로 접근 권한이 있어야 내려받을 수 있다. 아직 npm에 배포하지 않았으므로 이름이 같은 패키지를 설치하지 않는다. [지원 정책](docs/RUNTIME_SUPPORT.md)에 지원·권장·검증 범위를 구분했다.

처음 내려받은 소스 폴더에서 아래 명령으로 합성 예제를 실행한다. 준비된 빌드가 있으면 그대로 사용한다.

```sh
npm ci
npm run build
node ./dist/cli.js validate --workspace ./examples/minimal --json
node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
```

개인 자료를 에이전트에 연결할 때는 [CLI 첫 실행](docs/CLI.md#첫-실행)의 네 연결값을 확인한다. 영어 안내는 [English setup](docs/CLI.en.md), 근거 읽기와 원문을 열지 못할 때의 대응은 [배포 skill](skills/danseo/SKILL.md)에 있다.

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

### 내 주제로 논문 찾고 이어 읽기

파일을 읽고 명령을 실행할 수 있는 AI 에이전트에 Danseo 폴더의 절대 경로, `skills/danseo/SKILL.md`, 개인 주제 폴더를 알려준다. 논문을 찾으려면 에이전트에 검색 기능도 필요하다.

```text
이 Danseo 폴더의 skills/danseo/SKILL.md를 읽고,
내가 지정한 개인 주제 폴더에서 연구 질문에 맞는 논문을 찾아줘.
후보의 출처·판본·추천 이유를 보여주면 내가 고를게.
```

후보를 고른 뒤에는 같은 폴더에서 “고른 논문 원문을 모아줘”, “1번 논문을 읽고 이 질문에 답해줘”, “지금 확인한 근거로 두 논문을 비교해줘”로 이어간다. 새 채팅에도 같은 도구·skill·주제 폴더를 알려준다. 단계별 입력과 준비 조건은 [탐색·수집](docs/CLI.md#주제-채팅에서-논문-찾기) → [논문별 분석](docs/PAPER_ANALYSIS.md) → [비교 화면](docs/RESEARCH_COMPARISON.md)에서 확인한다.

## 현재 제공하는 기능

| 기능 | 하는 일 |
| --- | --- |
| `validate` | 형식과 연결 검사 |
| `list` / `show` | 목록 조회와 원본 읽기 |
| `export` | 질문과 근거 내보내기 |
| 근거 보존 | 원문과 상태 보존 |
| Agent skill | 조건 대조와 원문 확인 |
| 탐색·선택 | 검색 회차·고정 번호와 선택 당시 출처·판본·추천 이유 저장 |
| 원문 수집 | 에이전트가 받은 PDF의 관리 사본 저장 또는 기존 파일 연결, 제목·저자·판본 확인과 초고 동의 기록 |
| 논문별 분석·재개 | 공통 Paper 카드와 주제별 Markdown 답변·메모 연결, 후속 답변 추가와 새 프로세스에서 재개 |
| `topic compare` | 현재 내용에 유효한 ‘원문 지지’ 판정이 있는 주장의 읽기 전용 비교 그래프, 조건·PDF·AI 제안 이유 보기 |

내보낸 묶음에는 지정한 질문 절, Application·Paper 전문과 연결한 원문 텍스트가 포함된다. 본문·주석·확장 필드는 원본대로 보존한다.

**검색·다운로드·실제 독해·비교 기준 작성은 에이전트가 맡는다.** 비교에는 Paper 카드·주장별 검토·`comparison.json`이 필요하며 에이전트가 [배포 skill](skills/danseo/SKILL.md)에 따라 준비한다. CLI가 논문의 주장을 자동으로 확인하지 않는다.

CLI에는 모델 키·데이터베이스·상시 서버가 필요하지 않으며 자체적으로 외부 요청을 보내지 않는다. 주제 명령은 지정한 개인 폴더에 선택·원문·분석 기록을 저장한다. `topic compare`를 실행할 때만 로컬 읽기 전용 서버를 열며 Ctrl+C로 종료한다. 카드를 내보낼 때 `--out`은 새 파일만 만든다. 에이전트의 검색·다운로드·모델 호출은 해당 도구의 기능과 권한을 따른다.

## 내 자료를 에이전트에 연결하기

1. [합성 workspace](examples/minimal/workspace.json)를 참고해 개인 자료 폴더에 `workspace.json`을 만든다. 읽을 카드와 프로젝트를 명시적으로 등록한다.
2. [CLI 문서](docs/CLI.md#첫-실행)의 네 연결값과 명령을 사용한다. 준비된 빌드·연결값이 있으면 재사용한다.
3. [배포 skill](skills/danseo/SKILL.md)에 따라 묶음과 현재 질문을 읽고, 필요한 원문을 확인한 뒤 적용 여부를 판단한다. 내보내기 성공만으로 질문에 답한 것은 아니다.

Paper는 논문 주장과 출처를, Application은 그 주장을 프로젝트에서 어떻게 다룰지 기록한다. 저자 주장, AI 해석, 프로젝트 관찰, 채택 결정을 구분한다. 세부 필드는 [카드 모델](docs/CARD_MODEL.md)과 [스키마](schemas/card.schema.json)를 참고한다.

**자료 공유 범위:** 내보낸 묶음에는 카드 전문과 로컬 절대 경로가 들어간다. 다른 사람이나 외부 AI에 전달하기 전에 내용을 확인한다. 에이전트가 외부 모델에 자료를 보내는지는 해당 에이전트의 설정과 권한에 달려 있다.

## 개발 상태와 로드맵

현재 버전은 `0.1.0-dev.1`이다. 카드 스키마와 CLI는 아직 안정 호환성을 약속하지 않는다.

- **이번 공개 후보:** 탐색 → 수집 → 논문별 분석·재개 → 연구 비교, 기존 카드 검사·내보내기와 에이전트용 skill, 합성 예제.
- **이번 소스에 미포함:** 로컬 개발본의 카드 편집기와 별도 학습 HTML 생성 skill.
- **별도 평가:** 실제 사람의 새 채팅 사용·이해·학습 효과. 데스크톱 사용을 대상으로 하며 모바일 지원·검수는 범위 밖이다.

PDF 자동 요약, 자체 LLM, 자동 실험·사이트 제출, MCP 서버는 현재 제공하지 않는다. main `d5fbc4b`의 Windows·Ubuntu Node 22/24와 macOS Node 24 CI를 통과했다. Node 26은 비차단 사전 호환성 검사다. 현재 저장소는 비공개다. 최신 공개 후보의 검사와 남은 전환 절차는 [공개 준비](docs/OPEN_SOURCE.md), 플랫폼별 근거는 [런타임 지원](docs/RUNTIME_SUPPORT.md), 작업 상태는 [TASKS](TASKS.md)를 따른다.

## 문서와 기여

| 목적 | 문서 |
| --- | --- |
| 실행·오류·workspace 설정 | [CLI 사용법](docs/CLI.md) |
| 논문 탐색·수집·분석·비교 | [주제 흐름](docs/TOPIC_WORKFLOW.md) · [분석과 재개](docs/PAPER_ANALYSIS.md) · [연구 비교](docs/RESEARCH_COMPARISON.md) |
| 에이전트 연결과 확인 범위 | [Skill](skills/danseo/README.md) · [호환성 기록](docs/AGENT_COMPATIBILITY.md) |
| 데이터 형식·저장 위치 | [카드 모델](docs/CARD_MODEL.md) · [구조](docs/STRUCTURE.md) |
| 제품 범위·설계·개발 기록 | [문서 색인](docs/README.md) |
| 수정·제안·검증 | [기여 안내](CONTRIBUTING.md) · [보안 안내](SECURITY.md) |

버그 재현 방법, 이해하기 어려운 문서에 대한 피드백, 합성 예제, 다른 환경에서의 실행 결과로 기여할 수 있다. 개인 논문·연구 노트·모델 대화 로그는 공개 이슈나 PR에 첨부하지 않는다.

## 라이선스

로고·README 배너·공유 이미지의 원본과 사용법은 [브랜드 자료](assets/brand/README.md)에 있다.

프로젝트 코드·문서·skill·합성 예제는 [MIT License](LICENSE)를 따른다. 외부 논문·데이터·사용자가 연결한 자료의 권리는 원저작자에게 남는다. 의존성의 라이선스와 고지는 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)에 정리했다.
