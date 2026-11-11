# 실행 목록

요약: 파일 기반 CLI·schema·skill은 구현했다. 카드 편집·저장 왕복·웹앱·독립 효과 평가는 후속이며 공개 준비는 비공개 저장소에서 진행한다.

갱신: 2026-11-11 KST. 작업 상태의 정본이며 `PTP-*`는 유지하는 식별자다. Done은 해당 항목의 완료 조건에만 적용한다.

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
