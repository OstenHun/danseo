# 문서 안내

요약: 사용자는 CLI와 skill부터, 기여자는 데이터 모델과 실행 목록부터 읽는다. 설계 제안·과거 검증 기록은 현재 구현과 구분하며 공개 준비 상태는 OPEN_SOURCE가 소유한다.

## 사용하기

- [CLI](CLI.md): 실제 명령, workspace 설정, 오류와 출력.
- [English setup](CLI.en.md): source installation, private workspaces, agent setup and source-access failures.
- [Skill](../skills/danseo/SKILL.md): agent의 자료 읽기와 원문 복귀 절차.
- [Agent 호환성](AGENT_COMPATIBILITY.md): 확인한 연결과 남은 검사.

## 개발하기

- [런타임 지원](RUNTIME_SUPPORT.md): 지원·권장 버전, 실제 검사, 업데이트와 지원 종료 기준.
- [이름과 표기](NAMING.md): Danseo의 의미, CLI·skill 식별자와 중복 검색 범위.
- [기여 안내](../CONTRIBUTING.md) · [실행 목록](../TASKS.md).
- [카드 모델](CARD_MODEL.md) · [폴더 구조](STRUCTURE.md).
- [PRD](PRD.md): 구현된 기능보다 넓은 MVP 요구사항과 후속 범위.
- [평가 계획](../evals/README.md): 제품 검사와 활용 효과 평가의 구분.
- [프로젝트 운영](PROJECT_SETUP.md) · [공개 준비](OPEN_SOURCE.md).

## 설계와 과거 기록

[기존 도구 검토](REUSE.md), [기술 방향](TECH_DIRECTION.md), [사용 흐름 제안](USAGE_FLOW.md), [초기 구성 기록](BOOTSTRAP.md), [CLI 구현 기록](CLI_IMPLEMENTATION.md)을 보존한다. 각 기록의 시점·미검증 범위를 따른다. 과거의 미구현·라이선스 미정 표시는 현재 상태가 아닐 수 있다.

기록에 나오는 `work/` 근거는 로컬 비공개 자료이며 공개 저장소에 포함하지 않는다. 공개 독자가 실행할 수 있는 검사는 [합성 예제](../examples/minimal/workspace.json)와 테스트다. 개인 실험 기록을 공개 재현 결과로 취급하지 않는다.
