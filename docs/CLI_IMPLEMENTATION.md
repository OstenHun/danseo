# CLI 구현과 확인 범위

요약: TypeScript·Node.js로 읽기·검사·내보내기와 배포 skill을 구현했다. 원본 문자열·질문 절·연결 원문 텍스트를 보존하며 카드 편집·저장 왕복·독립 답변 품질 평가는 후속이다.

갱신: 2026-10-21 KST / PTP-001·PTP-002. 실제 사용법은 [CLI](CLI.md), 설치는 [English setup](CLI.en.md)도 제공한다.

## 구현한 것

- workspace.json에 명시된 기록을 읽고 JSON Schema·ID·주장 참조·프로젝트 경로를 검사한다.
- validate/list/show/export로 원본 문자열과 주석·확장 필드를 보존해 내보낸다.
- 현재 질문의 지정 절, 원본 위치·줄 범위·파일/발췌 해시를 묶는다.
- 연결된 페이지별 원문 텍스트는 선택 Paper의 export에서 검사·동반한다.
- 같은 Paper를 두 프로젝트에서 참조하는 합성 예제를 제공한다.
- 기존 agent가 읽는 skill을 제공하며 자체 agent·모델 SDK·서버는 포함하지 않는다.

core는 src/core/index.ts, CLI는 src/cli.ts, 형식은 schemas가 소유한다. TypeScript·yaml·Ajv 버전은 lockfile로 고정하고 [런타임 지원](RUNTIME_SUPPORT.md)에 맞춘다.

## 검사

기본 회귀 검사는 한글·공백 경로, 참조·상태·페이지 오류, 중복 ID/YAML, BOM·CRLF·주석·원본 보존, 출력 덮어쓰기 차단, 크기 제한과 프로젝트 격리를 포함한다. 원문 텍스트 연결과 현재 질문 절의 누락·중복도 검사한다.

`npm test`는 빌드와 테스트를 실행하고 `npm run check:docs`는 문서 링크의 대상이 Git 업로드 집합에 있는지 확인한다. `npm run test:package`는 빌드된 tarball을 별도 consumer에 설치해 도움말·합성 검사·내보내기를 실행한다. Windows·Ubuntu의 실제 원격 결과는 [CI](https://github.com/OstenHun/danseo/actions?query=branch%3Amain)와 [공개 준비](OPEN_SOURCE.md)에 연결한다.

## 남은 범위

편집·재직렬화 저장 왕복, 동시 수정 보호, init/import/project add, 웹 UI, MCP, PDF 추출기와 자동 skill 발견은 구현 또는 검증 후 별도로 선언한다. CLI 통과는 논문 사실·독립 재현·agent 답변 품질·사용자 이해의 증명이 아니다.

자세한 개인 실행 이력은 공유 예제와 분리해 로컬에 보존했다. 과거 실행의 명령·테스트 수를 현재 버전의 결과로 재사용하지 않는다.
