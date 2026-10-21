# 설치·실행·프로젝트 연결 설계

요약: 로컬 CLI와 기존 agent를 연결하는 초기 설계를 보존한다. 현재 validate/list/show/export와 수동 workspace 설정은 구현했으며 실제 명령은 CLI 사용법을 따른다. 편의 등록·가져오기 명령은 후속이다.

현재 구현 정본은 [CLI 사용법](CLI.md)이다. 아래는 구현 전 설계 기록으로, init/import/project add는 아직 없다. 프로젝트 연결은 별도 project.md 대신 workspace.json에 명시한다. 나머지 조건·참조·외부 자료 자동 수집 금지 원칙은 유지했다.

2026-10-21 KST / PTP-001·PTP-002 설계 제안. 패키지·CLI·설치형 skill은 아직 구현되지 않았다. 아래 명령은 기대 인터페이스이며 지금 실행하는 사용법이 아니다. 기술 후보의 선정 기준은 [TECH_DIRECTION](TECH_DIRECTION.md)이 소유한다.

## 세 가지 위치와 두 실행 주체

| 구성 | 역할 | 연결 방식 |
| --- | --- | --- |
| Paper to Project 설치본 | 카드 조회·검사·내보내기를 수행하는 프로그램과 배포 skill | 개발 때는 이 저장소를 빌드하여 실행, 배포 후에는 버전을 정해 설치 |
| 개인 연구 workspace | 공통 Paper와 프로젝트별 Application 보관 | CLI에 --workspace로 명시. 제품 설치 위치와 별도이며 실제 경로는 사용자 선택 |
| 적용 대상 프로젝트 | 현재 질문·코드·실험의 정본 | workspace의 project.md에 프로젝트 루트와 질문 문서 위치를 등록. 프로젝트 전체를 복제하지 않음 |
| 기존 agent | 질문 해석, 근거 독해, 필요한 원문 확인, 제안·개발 작업 | 사용자가 프로젝트에서 대화하고 agent가 shell/파일 도구로 CLI와 자료를 읽음 |
| CLI | 결정적인 파일 처리 | LLM 없이 동작. 답변 생성·논문 이해·모델 실행을 스스로 수행하지 않음 |

프로젝트 연결은 로컬 경로와 문서 참조 등록이다. GitHub OAuth, 원격 저장소 업로드, 코드 실행이나 프로젝트 전체 스캔을 뜻하지 않는다. 공개 도구를 개발하는 저장소와 도구를 적용하는 프로젝트는 같은 곳일 수도 있지만 역할은 구분한다. 원격 서비스 연결은 첫 사용의 필수 조건이 아니다.

project.md에는 ID, 표시 이름, 프로젝트 루트, 현재 질문 정본 참조를 최소 정보로 제안한다. 정확한 직렬화는 구현 전 결정하며 Paper/Application의 필수 필드를 늘리지 않는다. 질문 정본은 root 기준으로 해석하고 이동·누락 시 오류를 낸다. 스냅샷은 정본을 대체하지 않는다. 기존 연결에 같은 ID로 덮어쓰기하지 않고 변경을 명시적으로 처리한다.

## 처음 한 번의 준비

1. 도구를 설치하거나 개발 저장소를 빌드한다.
2. 개인 연구 workspace를 초기화한다. 기존 파일이 있으면 덮어쓰지 않는다.
3. 프로젝트 ID와 루트, 현재 질문 문서를 등록한다.
4. 기존 형식의 Paper/Application을 명시적으로 가져오거나 템플릿으로 작성한다. PDF 등록과 카드 가져오기는 다른 작업이다.
5. 기존 agent에 CLI 위치, workspace 경로, 프로젝트 ID를 알려준다. 지원되는 skill 설치는 읽기 절차를 재사용하는 선택 단계다.

첫 개발 실행은 TypeScript/Node 후보를 채택한 경우 `npm ci → npm run build → node <설치위치>/dist/cli.js ...`를 목표로 한다. package.json·lockfile·빌드가 생기고 검사되기 전에는 동작하지 않는다. 배포 단계에서는 검증된 패키지의 bin으로 `ptp` 명령을 노출하는 안을 제안한다. 현재 명칭의 패키지를 검색 없이 설치하거나 이름이 같은 외부 패키지로 대체하지 않는다. 패키지명·지원 Node 버전·배포 경로·라이선스는 아직 미정이다.

명령 노출은 [npm package.json의 bin](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin)과 같은 기존 배포 기능을 사용할 수 있다. 이 사실이 본 프로젝트의 패키지나 설치 성공을 의미하지 않는다.

## 기대 명령 흐름

아래 경로는 설명용 가상 경로다. 새 디렉터리를 만들거나 외부 프로젝트에 실제로 연결하지 않았다. `$researchWorkspace`는 선택한 자료 공간, `$targetProject`는 적용 대상 프로젝트다. `ptp`는 설치 후 사용할 가칭이다.

```powershell
$researchWorkspace = 'C:/Research/my-library'
$targetProject = 'C:/Projects/my-project'

# 최초 등록: workspace 안에만 기록
ptp init --workspace "$researchWorkspace"
ptp project add --workspace "$researchWorkspace" --id demo --root "$targetProject" --question-source 'docs/question.md'

# native 카드 1개 또는 명시한 묶음 가져오기; 임의 PDF 자동 요약 아님
ptp import --workspace "$researchWorkspace" --from 'C:/Research/incoming/cards'

# 평소 사용: 구조 확인 → 자료 탐색 → 질문에 쓸 묶음
ptp validate --workspace "$researchWorkspace" --json
ptp list --workspace "$researchWorkspace" --project demo --json
ptp show --workspace "$researchWorkspace" --paper paper-example --format markdown
ptp export --workspace "$researchWorkspace" --project demo --application app-example --include-drafts --format markdown --out "$researchWorkspace/exports/context.md"
```

`list`에서 찾은 실제 ID를 show/export에 넣는다. init·project add·import·--out은 쓰기가 있고 validate/list/show는 읽기 작업이다. import의 첫 범위는 이 도구의 native 카드이며 PDF·Zotero 지원은 별도 어댑터 계약이다. 모든 명령에서 workspace를 명시해 현재 폴더만으로 잘못 선택하지 않게 한다.

## 평소 agent와 쓰는 방법

사용자는 적용 대상 프로젝트에서 기존 agent를 열고 “이 workspace의 프로젝트 demo와 app-demo 적용 기록을 참고해서 비교군 후보를 검토해줘”처럼 요청한다. 최초에는 CLI 실행 경로와 workspace를 함께 알려준다. 이후 해당 agent가 지원하는 프로젝트 지침에 연결 정보를 둘 수 있으나, 도구가 기존 AGENTS.md나 전역 skill을 자동 수정하지 않는다.

agent는 CLI로 validate/list/show/export를 호출한다. skill에는 명령 사용, 상태 해석, 원문 복귀 조건과 기록 절차를 둔다. CLI가 없거나 shell 접근이 안 되면 사람이 내보낸 Markdown을 전달하거나 현재처럼 파일을 직접 읽을 수 있다. skill 설치가 실행 파일 설치·모델 연결·디렉터리 접근 권한을 대신하지 않는다.

[Agent Skills 명세](https://agentskills.io/specification)는 SKILL.md와 선택적 스크립트·참고 자료를 묶고 필요에 따라 상세 자료를 읽는 구조를 정의한다. 이를 절차 배포에 참고하되, 모든 agent의 설치 경로·도구 권한·동작이 같다고 보장하지 않는다. 첫 제품 통합은 현재 사용하는 agent 한 곳에서 실제 실행으로 검증한다. 다른 agent와 자체 MCP 서버는 이후 호환 범위다.

질문은 기존 agent에 입력한다. 첫 CLI에는 자연어 답을 생성하는 ask 명령을 넣지 않는다. 별도 provider 키나 자체 agent runtime 없이 core 동선을 검증할 수 있다. 외부 모델이 읽는 내용과 전송 여부는 기존 agent 환경을 따르며 로컬 저장만으로 로컬 추론을 뜻하지 않는다.

## 내보내기 계약 초안

- 입력은 workspace·프로젝트 ID·Application ID다. 프로젝트 소속이 다르면 오류를 낸다.
- 출력은 프로젝트 연결 정보, 선택 Application의 필드·본문, 연결된 Paper의 필드·본문, 판본·현재 상태·이력·원문 위치다. 같은 Paper는 한 번만 포함한다.
- 외부 프로젝트 문서의 링크는 보존하되 내용을 재귀적으로 가져오지 않는다. agent가 현재 질문 정본과 필요한 실험을 별도로 읽으며 접근 실패를 밝힌다.
- 기본 export는 미검토 Paper를 조용히 빼고 성공하지 않는다. draft/needs-recheck가 있으면 진단과 함께 실패하고, 탐색용 --include-drafts를 명시하면 경고와 현재 상태를 포함한다. 이는 검토 상태 승격이 아니다.
- stdout은 요청한 Markdown/JSON만, 진단은 stderr에 둔다. `--json`에서는 오류도 구조화하고 대화형 질문 없이 종료한다. 종료 코드는 성공 0, 입력·참조 오류 2, 파일 접근 실패 3을 제안한다. validate의 draft는 경고이며 구조 오류와 구분한다.
- --out은 지정 파일에만 쓰고 기존 파일이 있으면 덮어쓰지 않는다. 출력이 너무 크면 조용히 자르지 않고 실패해 범위를 조정하게 한다. 선택할 Application 수를 줄일 수 있지만 주장만 남겨 조건·한계를 버리지는 않는다.
- 초안 답변이나 실험 제안을 자동으로 accepted/source-checked로 저장하지 않는다. 갱신은 작성 요청에 따라 별도로 수행하며 원문 확인과 프로젝트 판단의 소유 위치를 유지한다.

## 구현 순서와 실제 완료 조건

첫 수직 기능은 `기존 두 예시 읽기 → validate → show → export → 기존 agent가 프로젝트 질문에 답하기`다. 수동 파일 준비로 시작할 수 있고 init/import/project add 편의 명령은 그다음이다. 웹 UI는 같은 core를 사용해 후속 구현한다. CLI가 동작하기 전에 웹·MCP·자체 LLM 실행을 동시에 만들지 않는다.

완료 여부는 한글·공백 경로의 실제 실행, 잘못된 참조·누락 파일·다른 프로젝트 ID 처리, draft 포함의 명시성, 조건·한계 보존, 원본 무변경, 기존 agent 한 곳의 실제 호출과 원문 복귀 행동으로 판단한다. 스키마 통과와 답변 품질은 별도로 기록한다. 설치 명령·통합·속도·품질은 이번 설계에서 아직 검증하지 않았다.
