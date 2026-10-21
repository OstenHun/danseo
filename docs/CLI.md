# 최소 CLI 사용법

요약: Node.js 22·24 LTS에서 명시한 논문·적용 파일을 읽고 검사해 agent용 묶음으로 내보낸다. 새 설치에는 24를 권장한다. 자체 LLM·서버는 없으며 전역 skill이나 대상 프로젝트 설정을 자동 변경하지 않는다.

[English setup](CLI.en.md)

## 첫 실행

이 절이 첫 실행 명령과 agent 연결 입력의 정본이다. 지원하는 Node.js 22.x·24.x와 빌드가 준비됐다면 아래에서 시작한다. 준비되지 않았다면 [설치와 빌드](#설치와-빌드)를 먼저 읽는다.

Agent에게 다음 네 값을 전달한다. 기존 handoff나 프로젝트 지침에 있으면 다시 입력하지 않는다.

```text
Tool root: <도구 저장소의 절대 경로>
Research workspace: <workspace.json이 있는 폴더의 절대 경로>
Project ID: <등록한 ID>
Skill: <도구 저장소>/skills/danseo/SKILL.md
```

아래는 도구 저장소 루트에서 PowerShell로 예제를 실행하는 명령이다. 개인 자료에는 CLI 경로·workspace·project ID를 전달받은 값으로 바꾼다. 경로에 공백이 있으면 shell에 맞게 인용한다. CLI를 처음 보거나 버전이 달라졌다면 먼저 `node ./dist/cli.js --help`로 지원 옵션을 확인한다.

1. 구조와 연결을 검사하고 해당 프로젝트의 Application ID·검토 상태를 찾는다. 오류가 나면 내보내기 전에 진단을 확인한다.

   ```powershell
   node ./dist/cli.js validate --workspace ./examples/minimal --json
   node ./dist/cli.js list --workspace ./examples/minimal --project demo --json
   ```

2. 목록에서 질문에 맞는 Application을 골라 내보낸다. 아래 `app-demo`는 위 예제의 ID다. 후보가 여러 개면 질문과 대조하며 임의로 첫 항목을 선택하지 않는다.

   ```powershell
   node ./dist/cli.js export --workspace ./examples/minimal --project demo --application app-demo --include-drafts --format markdown
   ```

   예제는 draft이므로 `--include-drafts`를 썼다. 개인 자료에서도 draft/needs-recheck를 탐색에 포함할 때만 이 옵션을 명시하고 답변에 상태를 남긴다. 상태가 승격되지는 않는다. 단일 기록을 따로 점검할 때만 `show`를 쓴다. export가 이미 전문을 포함하므로 show는 필수 선행 단계가 아니다.

3. 묶음의 `Current question (selected section)`에서 지정된 현재 질문 절의 본문과 위치·해시를 **판단 전에** 읽는다. 원본 파일 전체나 과거 스냅샷으로 대신하지 않는다. 이후 근거 독해·원문 복귀는 [skill](../skills/danseo/SKILL.md#판단과-원문-복귀)을 따른다. 이 읽기까지가 연결 흐름이며 export 성공만으로 프로젝트 질문에 답한 것이 아니다.

Skill은 위 연결값과 이 절을 사용한다. README를 다시 읽을 필요는 없다. shell이 없는 채팅에는 사람이 만든 묶음과 현재 질문을 함께 전달한다.

## 설치와 빌드

처음 저장소를 준비할 때만 지원하는 Node.js와 npm으로 아래를 실행한다. 새 설치에는 Node.js 24.x 최신 패치를 권장한다. 준비된 평가·기존 빌드를 읽는 작업에서는 반복하지 않는다. 공개 npm 패키지는 아직 없으며 같은 이름의 외부 패키지를 설치하지 않는다.

```powershell
npm ci
npm run build
```

`npm run danseo -- <명령>`도 가능하지만 npm의 안내가 stdout 앞에 붙으므로 agent 자동 호출에는 `node <절대 설치 경로>/dist/cli.js`를 사용한다. npm bin 이름은 danseo이며 로컬 패키지 설치 후 사용할 수 있다. 전역 설치는 필요하지 않다.

현재 제품명은 Danseo, CLI·패키지·배포 skill 식별자는 `danseo`다. 이전 작업명과 `ptp` 명령이 나오는 기록은 당시의 이력이며 현재 사용법은 이 문서를 따른다. 명칭 변경은 [결정 기록](NAMING.md)에 있다.

## 개인 자료 연결

선택한 개인 폴더에 아래와 같은 workspace.json을 작성한다. 제품 소스 저장소에 사적 경로를 커밋하지 않는다. 경로는 예시이며 실제 파일로 바꾼다.

```json
{
  "schema_version": "workspace-1",
  "records": ["papers/example.md", "projects/demo/application.md"],
  "projects": [
    {"id": "demo", "root": "../my-project", "question_source": "docs/question.md", "question_section": "현재 질문"}
  ]
}
```

records와 root는 workspace 기준 상대 경로 또는 절대 경로다. 기존 카드가 다른 폴더에 있으면 그 파일을 직접 지정해도 되며 이동·복사할 필요가 없다. question_source는 프로젝트 root 안의 상대 파일 경로다. question_section은 `#`를 뺀 ATX 제목의 정확한 텍스트다. 해당 제목부터 같거나 상위 수준의 다음 제목 직전까지 하위 절을 포함한다. 코드 fence 안의 제목은 무시하고, 없는 제목·중복 제목은 실패한다. 제목 자동 anchor나 부분 일치는 사용하지 않는다. JSON의 Windows 경로는 `/` 또는 이스케이프한 `\\`를 사용한다. 프로젝트 ID는 Application.project_id와 같아야 한다.

명시한 records만 읽는다. 폴더 재귀 검색·원문 다운로드·Markdown 링크 재귀 읽기는 하지 않는다. 원문 URL과 문서 내 링크는 내용 검증 대상이 아니며 agent가 필요할 때 확인한다. 별도 project.md 계획 대신 현재 연결 정보의 정본은 workspace.json이다. 더 풍부한 프로젝트 설명은 question_source 문서가 소유한다.

## 명령과 출력

| 명령 | 동작 |
| --- | --- |
| validate --workspace PATH --json | schema·ID·참조·페이지 범위·프로젝트/질문 경로 검사. draft는 경고 |
| list --workspace PATH [--project ID] --json | 연결된 기록 목록. 프로젝트 필터로 다른 적용 기록 제외 |
| show --workspace PATH --paper ID | Paper 원문 그대로 출력. --application ID도 지원 |
| export --workspace PATH --project ID --application ID | Application과 관련 Paper 전체 내보내기. 동일 Paper 한 번 포함 |

show/export는 `--format markdown`(기본) 또는 `--format json`을 지원한다. `--json`은 JSON 출력의 단축 옵션이다. show의 JSON에는 raw, path, source_directory, sha256과 파싱 데이터가 있다. export JSON의 records에는 content, source_path, source_directory, sha256이 있다. 상대 링크는 원본 파일 위치에서 해석한다.

export의 기본값은 source-checked Paper만 허용한다. 탐색용으로 draft/needs-recheck를 포함하려면 `--include-drafts`를 넣는다. 상태는 그대로 유지된다. source-checked도 기록자의 선언이며 CLI는 과거 확인의 진실성을 검증하지 않는다. bundle-2의 question에는 지정한 절의 본문·원본 경로·절·줄 범위(1부터)·전체 파일 및 발췌 SHA-256을 포함한다. question_section 없는 기존 workspace는 조회/검사는 가능하지만 export는 QUESTION_SECTION_REQUIRED로 실패한다. 전체 파일로 대체하지 않는다. 묶음은 읽기 권한을 제한하는 샌드박스가 아니므로 외부 agent의 원본 전체 읽기를 막으려면 호스트에서 읽기 도구도 제한해야 한다.

`--out <새 파일>`은 export에서만 지원한다. 상위 폴더가 존재해야 하며 기존 파일을 덮어쓰지 않는다. 출력 실패 시 부분 파일이 생길 수 있으므로 실패한 출력은 사용하지 말고 별도 새 파일로 다시 실행한다. 원본 입력은 수정하지 않는다. 파일당 2 MiB, 묶음 256 KiB 제한을 넘으면 내용을 자르지 않고 실패한다. 기록 수 상한은 1,000개다.

stdout은 결과, stderr는 진단이다. JSON 모드에서는 진단도 JSON이다. 종료 코드는 0 성공, 2 입력·구조·참조·검토 조건 오류, 3 파일 접근/쓰기 실패다. 잘못된 옵션을 무시하지 않는다. 한 workspace의 기록이 잘못되면 부분 성공 대신 오류를 내므로 먼저 validate를 해결한다.

현재 지원하지 않는 명령: init, import, project add, ask, serve. workspace.json과 카드는 파일 편집기로 준비한다. PDF 자동 요약, 카드 편집·재직렬화, MCP, 웹 UI, 모델 provider 연동은 후속이다.

## 페이지별 원문 텍스트 연결

Paper의 `source.text_path`는 카드 폴더 기준 JSON 경로다. 이미 허용된 공식 PDF와 기존 추출 도구로 준비한 텍스트를 연결하며 CLI가 다운로드·OCR·추출을 수행하지 않는다. 다음은 공개용 합성 예제다.

```yaml
source:
  version: synthetic-v1
  url: https://example.invalid/paper.pdf
  text_path: synthetic-pages.json
```

```json
{
  "source_url": "https://example.invalid/paper.pdf",
  "version": "synthetic-v1",
  "pdf_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "extractor": "synthetic fixture; 실제 원문 아님",
  "pages": [{"page": 1, "text": "합성 페이지 텍스트"}]
}
```

export는 URL/판본 일치·구조·페이지 양수/중복을 검사하고 source_texts에 페이지 본문과 텍스트 SHA-256을 포함한다. 일부 페이지만 연결할 수 있다. 파일이 없거나 잘못됐으면 부분 출력 없이 실패한다. source.text_path가 없으면 원문 미연결 경고를 남기며 기존 카드를 사용할 수 있다. validate는 카드·질문 구조/참조를 확인하고, 원문 텍스트 파일 검사는 선택 Paper의 export에서 수행한다.

pdf_sha256은 준비자가 계산한 PDF 해시 선언이다. CLI는 PDF를 다시 열어 일치 여부를 확인하지 않는다. 텍스트/화면 확인, 추출 성공/정확성은 따로 기록한다. 페이지 번호만 추출되거나 표 열이 섞이면 성공으로 쓰지 않고 다른 기존 도구나 필요한 원문 화면을 확인한다. 답변의 claim별 조건·한계 의미 대조는 skill과 agent의 책임이며 구조 통과가 의미 통과는 아니다.

## Agent와 skill의 기본 구성

배포 skill은 [SKILL.md](../skills/danseo/SKILL.md)이며 agents/openai.yaml은 표시 이름·기본 프롬프트를 제공한다. 별도 자율 agent 프로세스나 모델 프리셋은 없다. 현재 선택한 agent/모델이 CLI를 호출한다.

연결 입력과 실행 순서는 [첫 실행](#첫-실행)을 재사용한다. 반복 사용 시 네 값을 대상 프로젝트의 기존 지침에 수동 병합한다. 모델 키·백그라운드 서버가 필요하지 않지만 기존 agent의 외부 모델 전송 설정은 별개다.

지원되는 agent의 skill 폴더에 설치할 때는 이 저장소의 skills/danseo 폴더를 사용한다. 설치 위치는 해당 agent의 문서를 따른다. 같은 이름의 전역 skill이 이미 있으면 자동 교체하지 않는다. 이번 개발은 저장소의 skill 파일만 작성했으며 전역 등록이나 자동 발견 성공을 뜻하지 않는다.

## 개발 검증

`npm test`는 공개 합성 예제를 임시 한글·공백 폴더에 복사하여 읽기·검사·내보내기와 실패 처리를 검사한다. 본문·주석·미지 필드를 raw로 보존하며 UTF-8을 엄격하게 읽는다. YAML을 고쳐 저장하는 round-trip 편집기는 이번 범위에 없다. 개인 예제 실행 근거는 로컬 work에 두며 공개 패키지에는 포함하지 않는다.
