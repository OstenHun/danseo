# 기술 방향 검토

요약: 첫 CLI는 TypeScript·Node.js·yaml·Ajv로 구현했다. Node 22·24를 지원하고 개발에는 24를 권장한다. 파일 읽기·검사·내보내기에 한정하며 웹·편집·자체 모델은 후속이다. 초기 후보 비교는 결정 배경으로 보존한다.

## 첫 구현에서 확정한 스택

현재 런타임 기준은 [지원 정책](RUNTIME_SUPPORT.md)이 소유한다. Node 22·24 지원, 24 개발 권장, 26 사전 검사를 구분하며 `@types/node`는 지원 하한인 22 계열을 사용한다. 아래 첫 구현 시점의 버전 선택은 과거 기록이다.

2026-10-21 사용자 구현 요청에 따라 TypeScript 5.9.3, Node.js 24.x, yaml 2.9.1, Ajv 8.20.0을 채택했다. 정확한 의존성과 무결성은 package-lock.json이 소유한다. CLI 옵션은 [Node parseArgs](https://nodejs.org/docs/latest-v24.x/api/util.html#utilparseargsconfig), 검사는 Node 기본 test runner를 사용한다. 별도 CLI 프레임워크·DB·서버·LLM SDK는 없다.

선택 이유는 현재 작업이 파일 구조 검증·근거 내보내기이며 향후 웹과 같은 core를 재사용하기 때문이다. [yaml](https://eemeli.org/yaml/)은 frontmatter를 읽고 [Ajv](https://ajv.js.org/guide/getting-started.html)는 공개 JSON Schema를 검사한다. 본문과 주석은 YAML 재직렬화 없이 원본 문자열로 보존한다. 저장 편집기의 round-trip은 아직 구현하지 않았으므로 그 성능을 채택 근거로 주장하지 않는다. Python 파서가 필요해지면 별도 어댑터로 평가한다.

현재 사용법은 [CLI](CLI.md), 검증·남은 범위는 [첫 구현 기록](CLI_IMPLEMENTATION.md)이 소유한다. 아래의 미확정·미실행 문장은 최초 설계 시점 기록이다.

기록: PTP-001 / 2026-10-21 KST. 상태: 1차 조사·설계 제안. 사용자 확정은 터미널 실행 우선까지다. 설치·구현·성능 측정·독립 리뷰는 수행하지 않았다.

## 검토 순서

1. 실행 방식과 핵심 흐름: 이번 검토. CLI를 제품의 사용 경로로 두고 웹 검토 화면과 공존시킨다.
2. 카드 계약과 보존 범위: 두 기존 카드의 본문·주장·근거 위치·적용 판단을 대조한다.
3. 구현 언어와 저장 처리: 작은 읽기→수정→저장→재열기 실험으로 선택한다.
4. 웹 화면과 시각 탐색: 편집·비교·근거 확인 동선을 정한 뒤 UI와 그래프 라이브러리를 비교한다.
5. 기존 도구 연동과 공개 패키지: 입력 형식·오류 처리·라이선스·설치성을 확인한다.

전체 기술 스택을 한 번에 확정하지 않는다. 요구사항은 [PRD](PRD.md), 폴더 책임은 [STRUCTURE](STRUCTURE.md), 카드 의미는 [CARD_MODEL](CARD_MODEL.md)이 소유한다.

## Decision Frame — 이번 판단의 범위

- Frame Status: recommendation_ready — 터미널 실행을 허용하는 개인 로컬 MVP의 첫 실험 선택에 한정한다.
- Consequence Tier: FOCUSED — 공개 계약·원본 이전 없이 되돌릴 수 있는 실험 후보 선정이다. 최종 아키텍처 채택은 아니다.
- Evidence Disposition: EXPERIMENT_FIRST.
- 질문: 같은 파일을 사람과 agent가 재사용하는 흐름을 어떤 최소 실행 구조로 검증할 것인가?
- 제약: Windows PowerShell 기준, 개인 파일 기반, 수동 작성 가능, 모델 키 없이 검증·열람·내보내기 가능, 원본 이동 없음. 상세 경계는 PRD 참조.
- 기준: 내용 보존, 오류 시 원본 보호, 웹/CLI 규칙 일치, 실행 준비 부담, 실제 필요한 외부 도구와의 연결 비용. 임의 점수나 가중치는 부여하지 않는다.
- 미확인: 언어별 사용자의 숙련도, 작성 비용, 카드 규모, 정확한 파일 보존 요구, Python 연구 도구의 직접 통합 필요성.
- 완료 조건: 첫 실행 방향과 후보별 반전 조건, 공식 근거, 다음 검증을 연결한다. 이번 조사만으로 PTP-001 완료를 선언하지 않는다.

## 실행 방식 비교

| 방식 | 동작과 유리한 조건 | 부담·실패 조건 | 이번 위치 |
| --- | --- | --- | --- |
| 로컬 CLI + 브라우저 | 명령으로 파일 검사·내보내기, 필요할 때 로컬 프로세스를 띄워 웹 편집. 터미널 사용자가 주요 대상일 때 적합 | 프로세스 종료·포트·파일 쓰기 충돌 처리가 필요. localhost 자체가 접근 통제를 보장하지 않음 | 사용자 선택과 맞는 우선 검토 경로 |
| 브라우저 단독 | 정적 앱이 사용자가 고른 폴더에 접근. 설치 최소화가 최우선일 때 적합 | 폴더 선택 API의 브라우저 지원과 권한 제약. 파일 업로드/다운로드 대체는 원래 폴더에 저장하는 경험과 다름 | 대상 브라우저를 제한하거나 무설치가 우선이 되면 재검토 |
| 설치형 데스크톱 | Tauri 또는 Electron으로 창·파일 접근을 제공. 클릭 실행과 OS 통합이 중요할 때 적합 | 설치물 배포·업데이트·프로세스 경계 관리가 추가됨. 실제 크기·메모리·설치 시간은 미측정 | 설치형 요구가 생길 때 별도 비교 |

브라우저 폴더 선택은 지원 범위와 사용자 동작 제약이 있다([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)). Tauri는 Rust core와 OS WebView, Electron은 Node.js main과 renderer를 사용한다([Tauri](https://v2.tauri.app/concept/process-model/), [Electron](https://www.electronjs.org/docs/latest/tutorial/process-model)). 이 사실은 제품별 성능 우열을 입증하지 않는다.

CLI는 개발 중 임시 화면에 한정하지 않는다. Gemini CLI와 Aider는 터미널을 정식 사용 환경으로 제공한다([Gemini CLI](https://github.com/google-gemini/gemini-cli), [Aider](https://aider.chat/)). 이 사례를 전체 생태계의 점유율 근거로 쓰지는 않는다.

## Viable Options — 로컬 실행 경로의 구현 후보

| 비교 항목 | TypeScript + Node.js | Python + FastAPI |
| --- | --- | --- |
| 실행 구성 | TS core를 CLI와 로컬 웹 API가 호출하고 브라우저 UI가 결과를 표시 | Python core를 CLI와 FastAPI가 호출하고 브라우저 UI가 결과를 표시 |
| 유리한 조건 | 웹 편집·구조 검증·파일 입출력이 중심. 브라우저와 순수 처리 함수를 공유하려는 경우 | Python 기반 근거 추출·평가 도구를 프로세스 내부에서 직접 활용하는 비중이 큰 경우 |
| 공통 제약 충족 경로 | 로컬 파일만으로 읽기·검사·내보내기. 모델 키 의존 없음 | 같은 흐름 구현 가능. FastAPI/Pydantic은 로컬 요청·데이터 검증에 활용 가능 |
| 비용 | 런타임 한 계열로 개발 가능하지만 파일 저장 안정성과 API 경계는 직접 설계해야 함 | 풍부한 Python 도구와 연결 가능하지만 JS 화면과의 계약 생성·검사를 관리해야 함 |
| 주요 실패 | 타입 선언만 믿고 외부 파일 검사를 생략하거나, 공유 core에 Node 전용 API를 섞음 | 서버 모델과 화면 모델이 어긋나거나, 선택적 연구 도구가 기본 설치 의존성으로 번짐 |
| 전환 비용 | 파일 계약을 유지하면 처리기 교체 가능. Node 파일 API는 Tauri에서 그대로 실행되지 않음 | 파일 계약을 유지하면 처리기 교체 가능. UI와의 직렬화 계약은 유지 필요 |
| 지지·반대 근거 | Node 파일 API, Ajv, 브라우저/Node용 YAML 도구가 있음. 이것만으로 보존·성능은 보장되지 않음 | FastAPI는 Pydantic 기반 검증을 제공하고 Pydantic은 JSON Schema를 생성할 수 있음. 이것만으로 UI 연동이 자동 완성되지는 않음 |
| 선택을 뒤집는 조건 | 핵심 동선에 Python 전용 처리가 필수이거나 사용자의 Python 유지 비용이 크게 낮으면 재검토 | Python 직접 통합이 선택 사항이고 웹/core 공유의 실제 이득이 크면 TS 경로 재검토 |
| 최소 반증 확인 | 두 카드 저장 왕복·잘못된 참조 거부·같은 core의 CLI/웹 재사용 가능성을 확인 | 같은 카드 계약에서 Python 직접 연동의 구체 이득을 확인. 동등한 전체 앱을 먼저 두 번 만들지 않음 |

근거: [Node 파일 API](https://nodejs.org/api/fs.html), [Ajv](https://ajv.js.org/guide/getting-started.html), [YAML](https://eemeli.org/yaml/), [FastAPI](https://fastapi.tiangolo.com/features/), [Pydantic JSON Schema](https://docs.pydantic.dev/latest/concepts/json_schema/).

## Robustness Check — 반대 근거와 선택 조건

TS 우선 실험의 이유는 현재 PRD가 웹·카드·내보내기를 요구하고 자체 추출·모델 실행을 제외하기 때문이다. 언어 자체의 우월성 주장은 아니다. Python 연동이 핵심 요구로 바뀌거나 사용자 숙련도 차이가 유지 부담을 뒤집으면 다시 비교한다.

가장 강한 반대 근거는 Markdown/YAML 편집의 보존 비용이다. `yaml`은 주석과 빈 줄을 다룰 수 있지만 공식 문서도 특히 후행 주석의 연결이 완전히 안정적이지 않다고 설명한다. 라이브러리 채택으로 바이트 단위 보존을 약속하지 않는다. 본문 보존·필드 의미 보존·서식 보존의 수준을 먼저 나눈다([YAML comments](https://eemeli.org/yaml/#comments-and-blank-lines)).

두 후보 모두 실패할 수 있는 공통 지점은 파일 충돌과 불명확한 카드 계약이다. 따라서 파서만 바꿔 데이터 모델 문제를 해결했다고 보지 않는다. 후보 순서를 바꾸어도 TS는 웹 중심, Python은 직접 연구 도구 통합 중심이라는 조건부 판단은 같다. 독립 검토는 수행하지 않았다.

## Recommendation — 첫 실험과 구조 제안

결론: experiment first. **TypeScript + Node.js를 첫 실험 후보**로 두며, 채택 확정은 카드 계약 검증 뒤에 한다. 지금 의존성을 설치하거나 기존 문서의 미정 상태를 확정으로 바꾸지 않는다.

예상 흐름은 workspace 파일 → 읽기/검증 → 프로젝트별 조회 → CLI 내보내기 또는 웹 비교다. 웹 저장은 같은 검증을 거쳐 파일 처리기로 돌아간다. CLI 검사·내보내기는 웹 서버 없이 실행하고, 웹을 사용할 때만 로컬 서버를 실행한다.

- `core`: 구조·참조 검사, 프로젝트별 선택, 관계와 비교 데이터 생성, 근거 묶음 생성. 파일 시스템·HTTP·UI 의존을 넣지 않는다.
- `adapters`: Markdown/YAML 읽기·쓰기와 외부 서지 가져오기. 저장 책임을 한 경계에 모은다.
- `cli`: core를 호출하는 사용자/agent용 명령. 안정적인 종료 코드와 필요 시 구조화 출력은 후속 계약에서 정한다.
- `web`: 사람이 편집·비교·근거를 확인하는 화면. 웹 서버의 코드 위치는 구현 착수 시 정한다.
- `skills`: 기존 agent가 어떤 카드를 읽고 원문으로 언제 돌아갈지 안내한다. 웹앱 내 자체 agent 실행은 기존 MVP 범위에 없다.

새 패키지나 서비스는 만들지 않는다. 기존 폴더 책임을 구체화한 제안이며 디렉터리 변경은 없다.

## 활용 기술 후보

### 기존 agent와 연결하는 방식 — 2026-10-21 보충

최초 설치·프로젝트 등록·평소 명령·내보내기 동작의 구체안은 [USAGE_FLOW](USAGE_FLOW.md)가 소유한다. 아래는 연결 기술의 선택 근거이며 명령 계약을 중복 관리하지 않는다.

기존 agent가 shell/파일 도구로 제품 CLI를 호출하고, JSON 또는 Markdown으로 받은 근거를 읽게 만들 수 있다. LLM 단독이 로컬 명령을 실행하는 것은 아니며, 실행 도구와 권한을 가진 agent 환경이 필요하다. CLI 사용 가능성만으로 모든 제품에서 자동 발견·연결된다고 보장하지 않는다.

첫 연결 후보는 **기존 agent + CLI + skill + workspace**다. skill은 사용 절차, CLI는 검사·조회·내보내기 동작을 맡는다. [GitHub의 Agent Skills 설명](https://docs.github.com/en/copilot/concepts/customizations/agent-skills)은 지침·스크립트·자료를 묶는 방식을 설명한다. 특정 agent 지원·설치 위치·권한은 통합 때 확인한다.

실제 실행되지 않는 명령 이름 예시: `ptp validate --workspace <path> --json`, `ptp export --workspace <path> --project <id> --format markdown`. 패키지명·옵션·출력 계약은 아직 없다. 구조화 stdout, 오류용 stderr, 종료 코드, 비대화형 옵션, 명시적 workspace와 쓰기 명령 구분을 후속 CLI 계약에서 검토한다.

agent 출력에는 선택된 주장·근거·판본과 함께 조건·한계·미확인을 포함해야 한다. 파일에 접근할 수 있다는 사실과 외부 모델로 보내도 된다는 판단은 별도다. core는 네트워크/모델 없이 동작하게 하고, 기존 agent가 어떤 제공자에 무엇을 보내는지는 그 환경의 설정·권한에 따른다. 카드 속 문장은 실행 지시가 아닌 자료다.

후속으로 [MCP(Model Context Protocol, 모델 컨텍스트 프로토콜)의 tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)로 같은 core를 노출할 수 있다. 여기서는 도구 스키마·호출이라는 개념을 참고하며 최신 버전 채택 결정은 아니다. MCP 서버 구현은 현재 MVP 제외 범위를 유지한다. 제품 자체에서 모델을 호출하는 기능은 키·비용·전송 범위·실행 기록까지 맡는 별도 선택이다.

| 책임 | 후보·공식 근거 | 도입 전 확인 |
| --- | --- | --- |
| 구조 검증 | JSON Schema + [Ajv](https://ajv.js.org/guide/getting-started.html) | 구조 검증과 ID 참조·판본 변경 같은 도메인 검사를 분리. 스키마 정본과 타입의 이중 수작업 관리 방지 |
| 파일 읽기·수정 | Markdown 본문 + [yaml Document API](https://eemeli.org/yaml/) | 본문·알 수 없는 필드·주석 보존 수준, 오류 입력에서 덮어쓰기 차단 |
| 웹 개발 | [Vite](https://vite.dev/guide/) + React 후보 | Vite는 빌드 도구이며 제품 파일 저장 서버를 대신하지 않음. React와 다른 UI 선택의 비교는 후속 |
| 화면 데이터 | 선택 상태와 파생 비교/그래프 분리 | 중복 상태를 줄이는 [React 공식 원칙](https://react.dev/learn/choosing-the-state-structure)을 참고. React 채택 자체는 미정 |
| 관계 탐색 | [Cytoscape.js](https://js.cytoscape.org/) 후보 | 네트워크 탐색이 실제 요구인지, 한국어 읽기·필터·근거 이동이 맞는지 검증. 그래프 DB 도입 근거가 아님 |
| 서지 가져오기 | [Zotero CSL JSON](https://www.zotero.org/support/dev/data_formats) 후보 | 지원 형식이라는 사실과 첨부파일·주석·판본·locator의 보존은 별도. 전체 Zotero 라이브러리 이전을 보장하지 않음 |
| 근거 수집 확장 | [PaperQA](https://github.com/Future-House/paper-qa) | 모델·임베딩·파서 설정이 있는 별도 실행 도구. 핵심 카드 동선이 검증된 뒤 선택적으로 검토 |

기존 제품의 내부 코드를 복사하거나 fork하는 것은 이번 제안에 포함하지 않는다. 읽기·검토의 재사용과 라이브러리 의존성 채택을 구분한다. 정확한 버전·라이선스 조합·유지보수 상태·설치 호환성은 실제 도입 시 확인한다.

## Discriminating Experiment — PTP-001에서 먼저 볼 것

- 가설: 작은 공통 계약으로 길고 상세한 연구 비교 카드와 짧은 실험 조언 카드를 표현하고, 저장 후 의미와 본문을 보존할 수 있다.
- 환경·자료: Windows PowerShell, 두 개인 원본은 읽기만 한다. 작업 복사본은 `work/`, 공개 예제는 합성 자료로 분리한다.
- 대조: 입력 원문·구조화 필드·ID 연결과 저장 후 결과. 속도 우열 측정이 아니므로 반복 벤치마크 숫자를 만들지 않는다.
- 제안 통과 기준: 두 카드의 필수 근거·조건·적용 판단 손실 0건, 수정하지 않은 본문 동일, 잘못된 참조 감지, 읽기 오류 시 원본 변경 0건. unknown 필드와 주석의 처리 정책은 실행 전에 고정한다.
- 저장 검증: 앱이 읽은 뒤 외부 파일이 바뀐 경우 덮어쓰기 거부, 한글·공백 경로, 쓰기 실패를 확인한다. 파일 해시 확인만으로 동시 수정 경쟁이 완전히 해결된다고 주장하지 않는다.
- 비용·범위: PTP-001의 기존 반나절 상한 재사용. 유료 호출·원문 업로드·기존 원본 수정 없음. AI가 구현·검사하며 사용자의 이해를 대신 입증하지 않는다.
- 결과 연결: 보존 통과 시 TS 저장 경로 채택 검토. 파서 서식 문제면 파서/보존 계약 재검토. 카드 의미가 손실되면 언어 교체보다 카드 모델을 먼저 수정. Python 필수 통합이 드러나면 언어 비교 재개.
- 다음 검증 시점: 카드 필드/보존 수준을 정한 뒤, 웹앱을 구축하기 전에 실행한다. 이번에는 실험을 실행하지 않았다.

## 이번 조사 확인과 남은 일

초기 조사에서는 PRD·구조·카드 모델·재사용 문서와 두 카드의 관련 부분, 공식 기술 문서·저장소를 대조했다. 논문 결과 자체를 새로 검증한 것은 아니다. 개인 대조 로그는 공유 예제와 분리해 보존한다. 현재 구현·설치·CI는 [CLI 구현](CLI_IMPLEMENTATION.md)과 [공개 준비](OPEN_SOURCE.md)를 따른다.

사용자는 터미널 실행 우선과 단계별 외부 근거 검토를 선택했다. AI는 조사·후보 비교·구조와 검증 제안을 작성했다. 이번 결과는 기술 채택 전 탐색이므로 커리어 사례 확정이나 구현 성과로 다루지 않는다.
