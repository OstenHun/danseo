# 실행 목록

요약: 파일 기반 CLI·논문별 분석·연구 비교 화면을 구현했다. 원문 지지와 AI 제안을 구분하며 단계별 실행 근거를 아래에 연결한다. 카드 편집·독립 효과 평가는 후속이다.

갱신: 2026-11-12 KST. 작업 상태의 정본이며 `PTP-*`는 유지하는 식별자다. Done은 해당 항목의 완료 조건에만 적용한다.

## 독립 관계 HTML의 근거 검사 — 2026-11-15 / Local verification

- portable Danseo skill에 공통 그래프 생성기·자산·원문 검증 절차를 묶었다. 웹앱의 native 비교 API와 분리된 실행 경로다.
- 관계 상태 기반 개요와 원문 발췌에 연결된 기록/쌍 수량(함께 나온 문서 수 포함)을 코드로 검사하고 실패 시 HTML을 저장하지 않는다. 기존 CLI의 관계 출력은 새 검사 경로로 안내한다.
- 합성 정상·실패 회귀는 `npm run test:research-evidence`에 포함한다. 실제 논문 자료와 개인 실행 로그는 배포하지 않는다. 검사 범위·제외·사용법은 [근거 검사](skills/danseo/references/evidence-gate.md)에 기록한다.

## 저장소 공개 전환 — 2026-11-14

- 공개 전 파일·전체 branch/PR 이력·이슈/댓글·Actions 로그를 검사했다.
- 사용자 승인으로 저장소를 public으로 전환하고 비공개 취약점 신고를 활성화했다.
- 개인 workspace와 별도 비공개 백업은 공개 대상에서 제외했다. [공개 범위와 검사 한계](docs/OPEN_SOURCE.md), [신고 경로](SECURITY.md).
- 차단됐던 CI를 공개 후 재실행했다. 최종 head의 CI·리뷰·병합 상태는 [PR #9](https://github.com/OstenHun/danseo/pull/9)에서 확인한다. 실행 결과와 기존 로컬 작업 보존의 정본은 로컬 `work/public-release-20261114/RESULT.md`다. npm 게시·배포·사용자 효과 평가와 구분한다.

## 공개 후보 안내·범위·설치 점검 — 2026-11-12 / Local verification

- 한국어 README를 기본으로 유지하고 짧은 영어 소개·영어 README/실행 안내를 최신 탐색→수집→분석→비교 흐름과 맞췄다. 카드·검토·비교 기준 준비는 에이전트의 역할이며 자동 독해·과학적 검증으로 안내하지 않는다.
- README 구성 후속: 작은 로고·합성 비교 화면·짧은 기능 설명·설치·문서 순서로 두 언어를 정리하고 상세 카드 안내를 접었다. 원본 제품 화면 캡처 한 장과 해당 npm 파일 허용 목록을 추가했으며 제품 코드·의존성은 변경하지 않았다. 참고 구성과 이미지 출처는 [외부 고지](THIRD_PARTY_NOTICES.md)를 따른다.
- 기준 main `d5fbc4b`에 있는 기능만 후보에 포함한다. 로컬 전용 카드 편집기·별도 학습 HTML skill은 보존하되 이번 공개 대상에는 넣지 않는다. [포함·제외와 전환 절차](docs/OPEN_SOURCE.md).
- Windows Node24.22.2의 새 worktree 설치·빌드, 전체80/80, 실제 tarball 설치·재개·PDF·현재 주장·비교 자산 검사를 확인했다. 동일 main의 GitHub CI7개 성공도 대조했다. 문서·이력·파일·새 소스 복사·읽기 검수의 최신 근거는 로컬 `work/public-alpha-prep-20261112/RESULT.md`가 소유한다.
- 위 검증은 로컬 문서 작업의 결과이며 제품 동작·의존성은 변경하지 않았다. GitHub 반영과 해당 head의 CI·자동 리뷰는 PR에서 확인한다. 병합·저장소 공개·npm 게시는 별도이며 익명 접근과 취약점 신고 활성화는 공개 전환 시점의 확인으로 남긴다.

## CI 실행량 조정 — 2026-11-12

- 자동 실행은 PR당 Ubuntu·Node 24 작업 하나로 줄이고 push 중복을 제거한다. 문서 전용은 링크·요약과 도구 타입 검사, 코드·설정·skill·분류 실패는 전체 검사다. 같은 PR의 이전 실행만 취소한다.
- 다른 OS·Node는 수동 선택으로 전체 검사한다. 지원 계열과 보안 패치 하한은 유지한다. [실행 기준과 수동 실행 조건](docs/RUNTIME_SUPPORT.md#ci-실행-범위와-패치-기준).
- 실제 Git diff의 문서·코드·혼합·이름 변경·삭제·빈 목록·실패와 workflow 실행 조건을 회귀로 확인한다. 최신 로컬·PR CI·리뷰 근거는 로컬 `work/public-alpha-prep-20261112/RESULT.md`와 [PR #9](https://github.com/OstenHun/danseo/pull/9)에 연결한다. 병합·공개 전환은 하지 않는다.

## 남은 JavaScript 테스트·도구 TypeScript 전환 — 2026-11-12 / Local verification

- 최신 원격 main 856ad2c에서 남은 테스트6개와 도구5개의 npm·import·CI·패키지 사용처를 확인했다. 모두 필요해 기능은 유지하고 .ts로 전환했다. 설치 검사는 tests/package-smoke.ts로 옮겨 제품·테스트 출력에 대한 빌드 순환을 피했다. 불필요한 구현 삭제나 언어 통계 설정 변경은 없다.
- scripts/는 제품보다 먼저 build-tools/에, 테스트·설치 검사는 제품 선언을 사용해 build/에 strict 컴파일한다. npm test는 생성된 테스트만 실행하고 이전 출력을 제거한다. [개발·검사 방법](CONTRIBUTING.md#공통-테스트-fixture-수정).
- Windows / Node24.22.2·22.23.4에서 전체80/80과 설치 패키지를 통과했다. Node22는 생성 폴더를 비우고 의존성 설치·문서 도구 bootstrap부터 확인했다. 기존 테스트 이름·assertion 수·PDF4건과 제품 산출물31개의 바이트 동일성, stale 테스트 제거, 문서231개를 대조했다.
- 실제 명령·출력 보존·설치본·독립 완료 리뷰와 한계의 로컬 정본은 work/remaining-javascript-typescript-20261112/RESULT.md다. 이번 변경의 커밋·푸시·PR·CI·병합·배포는 수행하지 않는다.

## 공통 helper·분석·비교 테스트 TypeScript 전환 — 2026-11-12

- 공통 helper2개와 분석·비교 테스트 본문을 .ts로 전환했다. 분석 테스트의 중복 준비 함수를 통합하고 JSDoc 검사 설정을 테스트용 strict 빌드로 교체했다. [수정·검사 방법](CONTRIBUTING.md#공통-테스트-fixture-수정).
- 기존 컴파일러로 제품의 JavaScript·타입 선언을 dist/에 만들고 테스트를 build/에 출력한다. 실제 제품 빌드를 테스트하며 기존 Node 22·24 실행 조건과 실패·재개 검사를 유지한다. 새 런타임·의존성·제품 기능은 도입하지 않는다.
- Windows / Node 24.22.2에서 strict 테스트 빌드, 전체80/80, 설치 tarball, 문서226개 검사를 확인했다. 분석22개·비교15개의 이름과 기존 assertion을 보존했고 PDF4건·주장2건·답변3건과 제품 실행 산출물18개의 동일성을 대조했다. 오래된 테스트 출력은 재빌드 전에 제거한다. 다른 OS·Node의 이 diff CI와 GitHub 커밋·푸시·게시·병합은 수행하지 않았다.

## 비교 프런트 TypeScript 전환 — 2026-11-12

- 비교 화면·공통 지도를 strict TypeScript로 전환하고 기존 `Comparison`·Cytoscape 타입과 선택·DOM·준비 상태를 연결했다. 일반 `defer` script 출력과 서버 NodeNext 빌드를 분리했다. [구조·빌드·검사](docs/RESEARCH_COMPARISON.md#프런트-개발과-타입-검사).
- Windows / Node 24.22.2에서 전체 회귀 79/79, `npm run test:package`의 최신 재빌드·설치 자산 대조, `npm run check:docs`를 확인했다. `tests/frontend.test.mjs`와 `scripts/package-smoke.mjs`가 재현 가능한 검사다. 현재 작업은 로컬 diff이며 새 커밋·GitHub CI·게시·병합 결과가 아니다.

## PTP-012 — 주제의 연구 비교 그래프

- 3단계 PR #3의 `11051a8`에서 분리한 후 병합 main `b3522c4`와 동일 트리를 확인했다. `topic compare`는 현재 `comparison-input`과 주제의 명시적 기준을 읽고 기존 관계·지도·Fieldnotes UI로 투영한다. [사용법·형식·재개·경계](docs/RESEARCH_COMPARISON.md).
- 현재 지지 주장만 기준별로 표시하며 한쪽 근거 없음·AI 묶음 이유·원문 관계 방향·인용 위치·필터·0개·근거 변경 보류를 구분한다. 읽기 전용 loopback은 매 열기에서 재검사하며 파일 링크는 판본·문서 해시에 고정한다.
- Windows / Node 24.22.2 전체 75/75, 4단계 후속 회귀와 지도 배치 검사, 설치본·문서·개발 포함/제외 의존성 감사 0건을 확인했다. 실제 STaR v2 PDF 7쪽 Table 1/§4.4, Lightman v1 PDF 10쪽 Table 1/§5, 2쪽 인용·15쪽 참고문헌을 대조했다. 추가 3주장은 독립 AI 대조 후 locator 한 곳을 고쳐 재확인했다. 원문 224/234 불일치는 보존한다.
- 1440×960·1280×800 실제 화면과 키보드·필터 0개/복원·변경 후 재개·실패 시 비우기 및 합성 다중 관계/대조 쪽/ID 경계를 확인했다. 최신 CI·완료 리뷰는 [초안 PR #4](https://github.com/OstenHun/danseo/pull/4)에서 확인한다. 로컬 근거는 `work/ptp012-comparison/RESULT.md`가 소유한다. 실제 PDF·분석 문서·검토 JSON은 PR·패키지에 포함하지 않는다. 전체 1~4단계 통합 인수·병합·사람의 이해와 학습 효과는 별도다.

## PTP-011 — 논문별 분석과 재개

- 2단계 `0903667` 위 별도 브랜치에서 `analysis-open/save/list`와 `comparison-input`을 구현했다. 같은 주제의 논문별 문서에 답·메모를 보존하고 같은 판본의 공통 Paper를 여러 주제에서 재사용한다. [사용법과 의존성](docs/PAPER_ANALYSIS.md) · [원문 검토 계약](docs/CLAIM_REVIEWS.md).
- Windows / Node 24.22.2에서 `npm test` 60/60, `npm run test:package`, `npm run check:docs`와 기존 합성 카드 검증을 통과했다. `tests/analysis.test.mjs`는 문서 보존·판본 전환·검토 무결성·PDF 교체와 초고 동의의 경합·변경 근거 제외·동시 재선택을, 패키지 검사는 한글·공백 경로의 설치 CLI 재개를 확인한다. 실제 두 PDF의 A→B→새 프로세스 A, 다른 주제의 동일 Paper, 주장→표 대조와 최신 CI·독립 리뷰·남은 확인은 [초안 PR #3](https://github.com/OstenHun/danseo/pull/3)에 기록한다.
- 4단계 비교 기준·그래프와 병합은 별도 범위다. 문서 저장·구조 검사·원문 지지·연구 재현·사용자 이해를 구분한다. 사람의 새 채팅·macOS 앱 폴더 권한 UI·학습 효과는 확인하지 않았다.

## PTP-010 — 선택한 논문의 원문 수집

- `topic sources`에서 선택 당시 서지정보·이유와 PDF 실제 판본을 이어 읽는다. `collect`는 공개 다운로드·직접 제공 파일을 저장하거나 같은 판본의 기존 파일을 연결한다. `decide`가 초고별 응답을 보존한다. [사용법](docs/CLI.md#고른-논문의-원문-모으기)
- 자동 검사는 합성 PDF·로컬 HTTP 응답으로 선택 회차, 오류·재시도, 초고 결정, 새 프로세스 재개를 확인한다. Windows / Node 24에서 `npm test`, `npm run check:docs`, `npm run test:package`와 기존 합성 카드 검증을 실행했다. 실제 공개 PDF와 재개 전후 결과, 최신 CI 및 한계는 [초안 PR #2](https://github.com/OstenHun/danseo/pull/2)에 기록한다.

## PTP-009 — 주제 채팅의 논문 탐색과 선택 / PR verification

- 기존 에이전트가 확인한 후보를 3~5편 제시하고 `topic` CLI가 카드 없는 개인 주제 폴더에 질문·검색 회차·선택을 저장한다. 후보가 부족하면 0~2편도 기록한다. 추가 검색과 재개 후에도 번호와 선택 당시 출처·판본·추천 이유를 유지한다. [사용법](docs/CLI.md#주제-채팅에서-논문-찾기) · [1~4단계 요구사항과 이번 범위](docs/TOPIC_WORKFLOW.md).
- 분리한 브랜치에서 Windows / Node v24.22.0으로 `npm test` 30/30, `npm run check:docs`, `npm run test:package`, `node dist/cli.js validate --workspace examples/minimal --json`을 통과했다. 소스의 `tests/topic.test.mjs`와 `scripts/package-smoke.mjs`가 선택 → 추가 검색 → 새 프로세스 재개와 잘못된 입력·잠금 충돌 시 원본 보존을 확인한다. 최신 head CI·제출된 리뷰는 [draft PR #1](https://github.com/OstenHun/danseo/pull/1)에서 확인한다. 이전 혼합 작업 트리의 Windows 133개 통과와 로컬 리뷰를 이 head의 검증으로 간주하지 않는다.
- 개인 논문·실사용 기록·검증 폴더는 커밋하지 않는다. 2단계 원문 수집과 기존 그래프·카드 편집·디자인은 후속 PR 범위다. 추천 품질·새 채팅의 지시 준수·사용자 이해는 별도 평가 대상이다.

## PTP-000 — 프로젝트 시작 / Done

로컬 코드·문서·자료 경계를 구성했다. 제품 완성이나 공개 릴리스를 뜻하지 않는다. [초기 구성](docs/BOOTSTRAP.md).

## PTP-001 — 두 사용처의 공통 카드 계약 / In Progress

- 구현: Paper/Application의 schema, 명시적 workspace, 원본 읽기·참조 검사·원문 문자열 내보내기.
- 공개 검사: 하나의 Paper를 두 프로젝트에서 사용하는 [합성 예제](examples/minimal/workspace.json), 원본·주석·확장 필드 보존과 오류 경계 테스트.
- 남은 완료 조건: 카드 수정·재직렬화·재열기의 저장 왕복과 동시 수정 보호. 읽기·내보내기 보존을 편집 왕복 완료로 계산하지 않는다.
- 정본: [카드 모델](docs/CARD_MODEL.md), [CLI](docs/CLI.md).

## PTP-002 — 카드에서 agent용 근거 묶음 / In Progress

- 구현: validate/list/show/export, 현재 질문 절과 출처 위치·해시, 선택 Paper의 연결 원문 텍스트, [배포 skill](skills/danseo/SKILL.md).
- 연결 범위: 명시적인 skill 읽기와 CLI 호출은 확인했으나 자동 발견·새 장치 설치·독립 답변 품질 평가는 미검증이다.
- 남은 완료 조건: 새 질문에서 조건 누락·원문 복귀·답변 오류를 독립적으로 비교한다. 내보내기 성공과 근거 독해 성공은 별도로 기록한다.
- 정본: [호환성](docs/AGENT_COMPATIBILITY.md), [영문 설정](docs/CLI.en.md).

## PTP-003 — 로컬 웹앱의 저장·탐색 / Backlog

카드 생성·수정·저장·재열기, 프로젝트 전환, 비교 표·근거 패널·관계 그래프. 저장 계약과 오류 복구를 먼저 정하고 구현한다. 상세 [요구사항](docs/PRD.md).

## PTP-004 — 사용 비교와 공개 알파 준비 / In Progress

- 준비: Danseo 명칭, 한국어·영문 소개, MIT·의존성 고지, 합성 예제, 기여 안내, 비공개 GitHub와 Windows·Ubuntu CI.
- 공개 준비 정리: 개인 실행 상세를 로컬에 보존하고 공유 문서를 현재 상태 중심으로 정리한다. Git에 없는 로컬 파일을 공개 링크로 요구하지 않는다.
- 확정: 저작권자는 OstenHun, 기존 이력은 비공개 백업 뒤 공개용 새 이력으로 정리, 보안 신고는 GitHub 비공개 신고만 사용한다. 저장소는 private으로 유지한다.
- 확인과 다음 행동의 정본: [공개 준비](docs/OPEN_SOURCE.md), [런타임 지원](docs/RUNTIME_SUPPORT.md), [효과 평가 계획](evals/README.md).

세부 개인 실행 로그와 원본은 공유 저장소의 재현 자료가 아니다. 공개 재현에는 합성 예제·테스트와 GitHub CI를 사용한다. AI가 작성·실행한 결과를 사람의 직접 구현·독립 이해·연구 재현으로 표시하지 않는다.
