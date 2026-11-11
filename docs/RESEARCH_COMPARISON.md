# 주제의 연구 비교 그래프

요약: 선택한 논문의 현재 원문 지지 주장을 비교 기준으로 묶어 읽는다. 논문·기준을 고르면 조건·판본·PDF 위치·분석 문서를 열고, 원문 관계와 AI 제안을 구분해 거른다.

## 열기와 재개

3단계의 [분석 문서](PAPER_ANALYSIS.md)와 공통 Paper·주장별 검토를 준비한다. 에이전트가 주제 질문과 `comparison-input`을 읽고 주제 폴더에 `comparison.json`을 작성한다. 기준과 묶음 이유는 AI 해석이며 CLI가 논문을 읽거나 기준을 추론하지 않는다.

```sh
node dist/cli.js topic comparison-input --dir /my/topic
node dist/cli.js topic compare --dir /my/topic
```

출력한 `url`을 데스크톱 브라우저에서 연다. 읽기 전용 서버는 `127.0.0.1`에서만 실행되고 종료는 터미널의 Ctrl+C다. 기본 `--port 0`은 빈 포트를 선택한다. URL은 실행마다 바뀌며 외부 서버·모델로 자료를 보내지 않는다. `--json`은 현재 그래프만 출력하고 종료한다.

화면을 다시 열거나 **현재 근거로 다시 열기**를 누르면 선택·PDF·분석 문서·주장 검토·관계 파일을 새로 읽는다. 실패하면 이전 근거를 지우고 원인을 표시한다. 외부 편집은 자동 감시하지 않으므로 편집 뒤 다시 연다. PDF·문서 링크도 선택과 파일 해시를 재확인하며 다른 판본으로 조용히 바꾸지 않는다.

## 비교 기준과 상세 선택

아래는 합성 참조 예다. `question`은 주제 질문과 같아야 한다. `key`는 선택한 논문의 키이고 `claim_id`는 그 논문의 분석 문서에 비교 후보로 기록한 주장 ID다. 다른 주제의 논문은 거부한다.

```json
{
  "version": 1,
  "question": "두 연구는 결과를 어떻게 평가했나?",
  "criteria": [{
    "id": "evaluators",
    "title": "평가자와 판정 방식",
    "rationale": "사람 선호와 모델 답안 평가의 역할·척도 차이를 확인한다.",
    "refs": [{"key": "paper-a", "claim_id": "evaluation"}, {"key": "paper-b", "claim_id": "evaluation"}]
  }]
}
```

최대 30개 기준을 둔다. 한쪽에 현재 유효한 지지 주장이 없으면 **이 기준으로 확인한 근거 없음**으로 표시한다. 미대조·일부 지지·충돌·필수 수정·손상 검토·변경된 근거는 확인된 비교에서 제외한다. 다른 주제의 답이나 관련 없는 주장으로 빈 기준을 채우지 않는다.

첫 화면의 노드는 논문과 기준 두 종류다. 논문 선택은 그 논문의 기준별 근거를, 기준 선택은 논문별 주장·조건·한계·판본·PDF 쪽/절/표를 보여준다. 목록 버튼은 지도와 같은 선택을 제공하며 Tab·Enter·Space로 조작한다. PDF·분석 문서는 별도 탭에서 열고 Markdown은 원문 텍스트로 표시한다. 서로 다른 표본·척도의 수치를 순위화하지 않는다.

## 원문 관계와 AI 제안

공통 workspace의 `relations`에 [relations-1 schema](../schemas/relations.schema.json)의 YAML/JSON 파일 하나를 명시한다. 파일은 그 workspace 안에 있어야 하며 경로 밖 파일·링크는 읽지 않는다. 기록한 관계만 표시하고 다른 주제 논문으로 확장하지 않는다.

- 기존 `source/target/kind/origin/status/rationale/created_by/snapshots/evidence_refs`와 선택적 `review`를 사용한다. `cites/extends/compares`는 관계를 진술한 논문 → 인용·확장·비교 대상이다. 대칭 관계를 만들지 않는다.
- `source-checked`에는 `origin: source`, 출발 논문의 실제 주장 참조, 확인 주체와 시간대가 있는 시각이 필요하다. AI 제안·읽기 순서는 원문 관계로 승격하지 않는다.
- `snapshots.dependencies`의 `relation-dependencies-1` 지문으로 양쪽 판본·파일, 관계 종류·방향·이유, 명시적으로 참조한 주장 전체(조건·한계 포함)와 현재 지지를 대조한다. 지문 없는 옛 기록·삭제된 기존 근거는 해당 관계만 보류한다. 옛 축약 지문이나 로케일별 정렬로 만든 일부 확장 필드 지문은 다시 확인해야 한다. `held_relations.current_dependencies`는 실제 재대조 뒤 기록할 후보일 뿐 대조·채택 완료가 아니다. `null`이면 누락된 근거부터 확인한다. 경고를 없애기 위해 자동 복사하지 않는다.
- 양쪽 표에 원문 지지가 있어도 두 표를 묶은 판단은 AI다. 기준 연결은 **AI 분류**, 연구 간 연결은 **원문 관계** 또는 **AI 제안**과 구체적 이유로 표시한다.

**원문에 명시된 관계만**은 현재 유효한 `source/source-checked` 연구 간 관계만 남긴다. 자료 탐색용 논문·기준과 AI 분류 연결은 유지한다. 지도·목록·상세에 같은 필터를 적용하고 숨긴 제안의 이유도 닫는다. 0개이면 이유를 표시하고 필터를 풀면 제안을 복원한다. 원문·주장·위치·관계가 바뀌면 영향받은 결과를 보류한다.

## 경계와 확인 범위

3단계의 선택 회차·판본·PDF 해시·최신 주장별 검토 규칙을 재사용한다. 화면은 판정을 만들거나 Paper·문서를 수정하지 않는다. 원문 지지는 기록자의 대조 범위이며 재현·사용자 이해·학습 효과의 인증이 아니다.

서버는 임의 경로 대신 현재 검증한 PDF·문서만 반환한다. 실행별 임의 URL, Host/Origin·메서드 제한, no-store, CSP와 텍스트 출력으로 외부 페이지 요청·경로 순회·HTML 실행을 제한한다. 같은 사용자 권한의 악성 로컬 프로그램을 격리하지는 않는다.

[실행 목록](../TASKS.md)의 PTP-012와 `tests/comparison.test.mjs`에 검증을 연결한다. 선행 Windows·Ubuntu Node 22/24, macOS Node 24 CI와 Node 26 비차단 검사를 유지한다. macOS 앱 폴더 권한 UI·스크린리더·사람의 실제 분석 효과는 별도 확인이다. 전체 1~4단계 통합 인수와 병합은 이번 범위 밖이다.

## 재사용 출처

로컬 개발본의 `research-map.ts`, `reader-base.css`, `dependencies.ts`, `relations.schema.json`을 선별해 재사용했다. 지도에 비교 투영만 추가하고 기존 scene을 보존했다. 기존 [Figma 초안](https://www.figma.com/design/IQKRYDlSKcOV0Bltv7qO6C?node-id=11-2)의 지도·근거 패널 구조와 현재 Fieldnotes 토큰을 사용한다. Figma 레이어는 수정하지 않았다.

## 프런트 개발과 타입 검사

비교 컨트롤러는 `src/web/comparison.ts`, 공통 지도는 `src/views/research-map.ts`다. 화면 계약은 `src/web/browser-types.d.ts`에서 기존 core의 `Comparison`과 Cytoscape 타입을 참조한다. 응답의 선택 논문은 원문·분석 문서가 준비되지 않을 수 있으며, 화면 ID가 있다는 사실만으로 PDF 링크를 만들지 않는다. 응답 타입 표시는 런타임 JSON 검증이 아니다. 서버의 기존 파일·원문·검토 검사를 유지한다.

`npm run build`는 NodeNext 서버 빌드와 별도의 strict 브라우저 검사를 먼저 실행한다. 이어 두 브라우저 엔트리만 일반 script로 출력하고 HTML·CSS·설치된 Cytoscape 자산을 복사한다. 브라우저에는 Node import나 ESM 표식을 출력하지 않으며 기존 Cytoscape → 지도 → 비교 컨트롤러의 `defer` 순서를 유지한다. JavaScript 사본을 소스에 따로 두지 않는다.

`npm test`는 필드 오타·잘못된 선택 종류·미준비 원문 접근을 거부하는 타입 검사와 일반 script 문법·기존 지도 분기 검사를 포함한다. `npm run test:package`도 최신 소스를 재빌드한 뒤 설치본 자산과 현재 빌드의 바이트를 대조한다. 테스트 통과와 실제 화면 검증·사람의 사용 평가는 구분한다.
