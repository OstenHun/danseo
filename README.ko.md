<div align="center">

<h1>Danseo</h1>

<picture>
  <source media="(prefers-color-scheme: dark) and (max-width: 640px)" srcset="assets/brand/banner-compact-dark.svg">
  <source media="(max-width: 640px)" srcset="assets/brand/banner-compact-light.svg">
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg">
  <img src="assets/brand/banner-light.svg" alt="Danseo — 논문 근거를 프로젝트의 판단으로 연결합니다." width="100%">
</picture>

**논문의 근거를, 내 프로젝트의 판단으로.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node.js 22 또는 24 LTS](https://img.shields.io/badge/node-22%20%7C%2024%20LTS-43853d.svg)
![Development preview](https://img.shields.io/badge/status-development_preview-orange.svg)

한국어 · [English](README.md) · [Skill 설치](#skill-설치) · [논문 그래프 요청](#논문-그래프-생성-요청) · [빠른 시작](#빠른-시작) · [문서](docs/README.ko.md) · [기여하기](CONTRIBUTING.md)

</div>

요약: 기존 AI 에이전트와 논문을 찾고, 고른 논문의 원문·답변·비교 근거를 로컬 파일로 연결한다. CLI와 읽기 전용 연구 비교 화면을 제공하는 개발 프리뷰다.

논문을 읽고 나면 결과가 나온 조건, 확인한 원문 위치, 내 프로젝트에 적용할 수 있는지를 다음 대화에서도 이어 볼 수 있어야 한다.

Danseo(단서)는 그 판단에 필요한 실마리를 남긴다. 논문 자체의 주장과 프로젝트별 적용 판단을 나누고, 같은 논문의 근거를 여러 프로젝트에서 참조한다.

## 논문을 찾는 순간부터 비교할 때까지

| 단계 | 남기는 기록 |
| --- | --- |
| **탐색·선택** | 검색 회차와 고정 번호, 고를 당시의 출처·판본·추천 이유 |
| **원문 수집** | PDF 관리 사본 또는 기존 파일 연결, 제목·저자·판본 확인과 초고 사용 동의 |
| **분석·재개** | 공통 Paper 카드와 주제별 Markdown 답변·메모, 후속 질문과 다음 읽을 위치 |
| **연구 비교** | 현재 원문과 대조해 지지를 확인한 주장, 평가 조건·한계·원문 위치와 AI 제안 이유 |

`topic compare`의 지도에서 논문이나 기준을 골라 PDF와 분석 문서를 열 수 있다. 원문에 명시된 관계와 AI 제안을 구분하고, 바뀌거나 없어진 근거는 보류한다. [비교 화면 사용법](docs/RESEARCH_COMPARISON.md)

**검색·다운로드·실제 독해·비교 기준 작성은 기존 에이전트가 맡는다.** Danseo는 그 기록을 파일로 연결하며, 자체 LLM이나 자동 논문 요약 서비스가 아니다. 비교에는 에이전트가 준비한 Paper 카드·주장별 검토·`comparison.json`이 필요하다.

## Skill 설치

**논문 관계 그래프를 독립 HTML로 만들려면 Node.js 22 또는 24와 `skills/danseo` 폴더 전체만 있으면 된다.** npm 패키지 설치·빌드·서버 실행은 필요하지 않다. Codex, Claude Code 또는 Antigravity CLI를 먼저 설치하고 로그인한 뒤, 해당 에이전트가 논문 파일을 읽고 Node 명령을 실행할 수 있는 환경에서 사용한다. 일반 웹 채팅에 폴더 경로만 붙이는 방식은 지원하지 않는다.

### 1. GitHub에서 내려받기

```sh
git clone https://github.com/OstenHun/danseo.git
cd danseo
node --version
```

Git이 없으면 저장소의 **Code → Download ZIP**으로 내려받아 압축을 풀고, `README.md`와 `skills`가 있는 폴더에서 터미널을 연다. `SKILL.md`만 복사하면 생성기와 디자인 파일이 빠지므로 **`danseo` 폴더 전체**를 설치한다.

### 2. 사용할 에이전트에 설치하기

아래는 모든 프로젝트에서 사용하는 개인 설치 경로다. `~`는 사용자 홈 폴더다. Argon 안내는 **Antigravity CLI(`agy`)에서 Argon 모델을 사용하는 환경**을 뜻한다.

| 에이전트 | 설치할 폴더 | 새 채팅에서 호출 |
| --- | --- | --- |
| Codex | `~/.agents/skills/danseo` | `$danseo` 또는 skill 선택 메뉴 |
| Claude Code | `~/.claude/skills/danseo` | `/danseo` |
| Argon · Antigravity CLI | `~/.gemini/config/skills/danseo` | `/danseo` |

설치 경로와 호출 방식: [Codex 공식 안내](https://developers.openai.com/codex/skills/) · [Claude Code 공식 안내](https://code.claude.com/docs/en/skills) · [Antigravity 공식 안내](https://antigravity.google/docs/skills/). Argon 모델은 `agy models`로 사용 가능한 이름을 확인하고 선택한다.

사용하는 운영체제의 예시를 펼쳐 **대상 경로 한 줄만 선택**해 실행한다. 기존 설치가 있으면 아래 명령은 중단한다. Codex의 기존 `~/.codex/skills/danseo`나 프로젝트별 설치가 있다면 중복 설치하지 말고, 에이전트가 표시하는 기존 경로부터 확인한다.

<details>
<summary><strong>Windows · PowerShell</strong></summary>

저장소 루트에서 실행한다. 아래 기본값은 Codex다. Claude·Argon은 주석의 경로로 `$danseoTarget` 한 줄을 바꾼다.

```powershell
$danseoTarget = Join-Path $HOME '.agents/skills/danseo'
# Claude Code: Join-Path $HOME '.claude/skills/danseo'
# Argon (agy): Join-Path $HOME '.gemini/config/skills/danseo'

if (Test-Path -LiteralPath $danseoTarget) { throw "기존 설치를 확인하세요: $danseoTarget" }
New-Item -ItemType Directory -Force -Path (Split-Path $danseoTarget -Parent) | Out-Null
Copy-Item -LiteralPath './skills/danseo' -Destination $danseoTarget -Recurse -ErrorAction Stop
node --test "$danseoTarget/scripts/research-evidence.test.mjs"
```

</details>

<details>
<summary><strong>macOS·Linux · Bash 또는 Zsh</strong></summary>

저장소 루트에서 실행한다. 아래 기본값은 Codex다. Claude·Argon은 주석의 경로로 `danseo_target` 한 줄을 바꾼다.

```sh
danseo_target="$HOME/.agents/skills/danseo"
# Claude Code: danseo_target="$HOME/.claude/skills/danseo"
# Argon (agy): danseo_target="$HOME/.gemini/config/skills/danseo"

if [ -e "$danseo_target" ] || [ -L "$danseo_target" ]; then
  printf '기존 설치를 확인하세요: %s\n' "$danseo_target"
else
  mkdir -p "$(dirname "$danseo_target")" &&
    cp -R ./skills/danseo "$danseo_target" &&
    node --test "$danseo_target/scripts/research-evidence.test.mjs"
fi
```

</details>

테스트 결과의 `fail 0`은 포함된 검증기 회귀 검사가 통과했다는 뜻이다. 모델의 skill 인식이나 실제 논문 독해까지 확인한 결과는 아니다.

### 3. 새 채팅에서 확인하기

새 채팅을 열어 위 표의 호출로 Danseo를 선택하고 [아래 요청 예시](#논문-그래프-생성-요청)를 보낸다. 목록에 없으면 앱이나 CLI를 재시작하고, `<설치 경로>/SKILL.md`와 `scripts`, `references`, `assets`가 같은 폴더에 있는지 확인한다. 그래도 인식되지 않으면 **설치된 `SKILL.md`의 절대 경로를 명시해 읽도록 요청**한다. 다른 폴더의 동명 skill을 읽었다면 사용하려는 경로를 지정한다.

GitHub의 변경이 복사한 설치본에 자동 반영되지는 않는다. 업데이트할 때는 최신 소스를 받은 뒤 기존 `danseo` 폴더를 skill 검색 경로 밖에 백업하고, 폴더 전체를 다시 복사해 검사한다.

## 논문 그래프 생성 요청

세 에이전트에서 같은 요청을 사용할 수 있다. 아래 경로는 **내 컴퓨터의 실제 절대 경로**로 바꾼다. Codex에서는 `$danseo`, Claude Code·Argon에서는 `/danseo`를 먼저 선택하거나 요청 앞에 붙인다.

```text
Danseo skill로 이 논문들의 관계 그래프를 독립 HTML로 만들어줘.
논문 폴더: C:/research/my-topic/papers
연구 질문: 각 논문은 검색 결과의 근거를 답변에 어떻게 연결하고 평가하나?
결과 폴더: C:/research/my-topic/output
```

macOS·Linux에서는 `/Users/me/research/my-topic/papers` 또는 `/home/me/research/my-topic/papers` 같은 실제 경로를 쓴다. 에이전트가 해당 PDF를 읽을 수 있어야 하며, 웹에서 논문을 추가로 찾게 하려면 검색·다운로드 도구도 필요하다.

Danseo의 기본 흐름은 **원문·판본 확인 → 관계와 근거 작성 → 원문/AI 구분 → 개요·수량 검사 → 공통 HTML 생성 → 실제 화면 확인**이다. 원문 관계에는 페이지·절 등 확인 위치를 남기고, AI가 제안한 연결은 제안 상태로 유지한다. HTML과 함께 후보 JSON·검증 근거 파일을 보존하므로 이후 수정에서도 같은 생성기를 쓸 수 있다. [원문 검증 절차](skills/danseo/references/relation-verification.md) · [자동 검사 범위](skills/danseo/references/evidence-gate.md)

디자인과 검증 절차를 매번 따로 요청하지 않아도 된다. PC·노트북에서 사용하는 데스크톱 화면을 기준으로 검수한다. 짧은 논문 이름·주제별 배치·선택한 논문의 연결을 기본으로 사용하며, 근거 상태와 관계 종류를 걸러 보거나 전체 연결을 켤 수 있다. 전체 제목과 관계 데이터는 상세에 보존하며 주제 분류는 AI의 편집상 해석으로 구분한다. 자동 skill 선택은 호스트 설정에 따라 다르므로 발견되지 않으면 위의 명시 호출을 사용한다.

정상 결과에서는 논문 노드와 연결을 선택해 근거·조건·원문/AI 표시를 확인할 수 있다. 검사 실패는 원문과 입력을 고친 뒤 다시 확인하며, 브라우저 도구가 없어 실제 화면을 확인하지 못했다면 그 범위를 밝힌다. **자동 검사 통과는 모든 관계 해석이 타당하다는 인증이 아니다.** 원문 의미 대조와 화면 확인은 별도 단계다.

기존 결과를 다시 검토할 때도 같은 skill을 호출한다.

```text
이전에 만든 후보 JSON과 검증 근거 파일, 원문 PDF를 다시 대조해줘.
자료 폴더: C:/research/my-topic/output
원문 관계와 AI 제안이 섞였거나 기록·문서·쌍의 수량이 다르면 바로잡고,
기존 결과를 보존한 새 HTML로 만들어줘. 실제 화면을 확인한 범위도 알려줘.
```

## 빠른 시작

### 전체 CLI로 주제·카드 관리하기

논문 탐색 이력·Paper 카드·프로젝트별 적용 판단을 파일로 관리하려면 아래 전체 CLI를 준비한다. 독립 그래프만 만들 때는 위 skill 설치로 충분하다.

**Node.js 22 또는 24 LTS와 npm**이 필요하다. 새 설치에는 24의 최신 패치를 권장한다. 공개 저장소를 clone하거나 Download ZIP으로 소스를 내려받는다. npm에는 아직 게시하지 않았으므로 이름이 같은 외부 패키지를 설치하지 않는다.

내려받은 소스 폴더에서 실행한다.

```sh
npm ci
npm run build
node ./dist/cli.js validate --workspace ./examples/minimal --json
```

합성 예제는 `ok: true`, 기록 3개·프로젝트 2개와 `draft` 경고를 출력한다. 경고는 정상이며 검사는 구조·참조만 확인한다. [지원 환경](docs/RUNTIME_SUPPORT.md)

### 내 주제로 시작하기

파일을 읽고 명령을 실행할 수 있는 AI 에이전트에 Danseo 폴더의 절대 경로와 개인 주제 폴더를 알려준다. 논문 탐색에는 에이전트의 검색 기능도 필요하다.

```text
이 Danseo 폴더의 skills/danseo/SKILL.md를 읽고,
내 개인 주제 폴더에서 연구 질문에 맞는 논문을 찾아줘.
출처·판본·추천 이유를 보여주면 내가 고를게.
```

1. 후보를 고르고 같은 폴더에서 “고른 논문 원문을 모아줘”로 이어간다.
2. “1번 논문을 읽고 이 질문에 답해줘”로 답과 원문 위치를 남긴다.
3. “확인한 근거로 두 논문을 비교해줘”로 비교 기준과 화면을 준비한다.

새 채팅에서도 같은 도구·skill·주제 폴더를 알려준다. [탐색·수집](docs/CLI.md#주제-채팅에서-논문-찾기) → [분석·재개](docs/PAPER_ANALYSIS.md) → [비교](docs/RESEARCH_COMPARISON.md)

<details>
<summary><strong>이미 있는 카드와 프로젝트에 연결하기</strong></summary>

Paper는 논문의 주장과 출처를, Application은 프로젝트의 적용 판단을 기록한다. [합성 workspace](examples/minimal/workspace.json)처럼 카드와 프로젝트를 명시적으로 등록하고, [CLI 첫 실행](docs/CLI.md#첫-실행)의 네 연결값을 에이전트에 전달한다.

`validate`는 구조·참조를 검사하고, `list`/`show`는 카드를 조회한다. `export`는 현재 질문과 관련 카드 전문을 Markdown/JSON으로 내보낸다. 본문·주석·확장 필드와 원문 위치를 보존하며 `--out`은 새 파일만 만든다.

```sh
node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
```

합성 예제는 draft이므로 `--include-drafts`를 쓴다. 이 옵션은 검토 상태를 바꾸지 않는다. [카드 모델](docs/CARD_MODEL.md)

</details>

## 내 자료와 판단은 로컬에

- 개인 PDF·주제 기록·카드는 제품 소스와 분리해 보관한다. 내보낸 묶음에는 카드 전문과 로컬 절대 경로가 들어가므로 외부 공유 전에 확인한다.
- CLI에는 모델 키·DB·상시 서버가 필요하지 않으며 자체 외부 요청도 보내지 않는다. 비교 화면을 실행할 때만 로컬 읽기 전용 서버를 열고 Ctrl+C로 종료한다. 에이전트의 외부 검색·다운로드·모델 전송은 해당 도구의 설정과 권한을 따른다.
- 저자 주장·AI 해석·프로젝트 관찰·채택 결정을 구분한다. 구조 검사와 원문 지지 검토는 논문 재현이나 사용자 이해의 인증이 아니다.

## 문서

| 시작할 곳 | 내용 |
| --- | --- |
| [CLI 안내](docs/CLI.md) · [시작하기](docs/CLI.en.md) | 설치와 주제별 흐름 |
| [분석](docs/PAPER_ANALYSIS.md) · [비교](docs/RESEARCH_COMPARISON.md) | 논문 답변과 원문 근거 |
| [Skill](skills/danseo/SKILL.md) · [연동](docs/AGENT_COMPATIBILITY.md) | 근거 읽기와 연결 조건 |
| [문서 목록](docs/README.ko.md) · [공개 범위](docs/OPEN_SOURCE.md) | 데이터 형식과 공유 조건 |

## 개발 상태

`0.1.0-dev.1` 개발 프리뷰다. CLI와 파일 형식은 바뀔 수 있다. 공개 후보에는 탐색·수집·분석·비교와 기존 카드 내보내기를 포함한다. 카드 편집기·별도 학습 HTML skill·자동 실험·사이트 제출·MCP 서버는 포함하지 않는다. 연구 비교 웹앱은 데스크톱용이다. 독립 논문 관계 HTML도 PC·노트북 사용을 대상으로 한다.

자동 검사와 설치본 확인은 실제 사람의 사용·학습 효과와 구분한다. [지원 환경](docs/RUNTIME_SUPPORT.md) · [현재 범위와 후속 작업](TASKS.md)

## 기여와 라이선스

버그 재현, 더 쉬운 안내, 합성 예제와 다른 환경의 실행 결과를 환영한다. [기여 안내](CONTRIBUTING.md)와 [보안 안내](SECURITY.md)를 먼저 읽고, 개인 논문·연구 노트·모델 로그를 공개 첨부하지 않는다.

코드·문서·skill·합성 예제는 [MIT License](LICENSE)를 따른다. 외부 논문·데이터·사용자 자료의 권리는 원저작자에게 남는다. [외부 의존성 고지](THIRD_PARTY_NOTICES.md) · [브랜드 자료](assets/brand/README.md)
