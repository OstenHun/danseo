# 성능 주장의 표 대조

요약: 성능 비교 문장을 원문 표의 조건·지표·각주와 연결한다. 표에서 계산한 범위·동률·열세·미보고를 그대로 표시하고, 근거 누락·과장·낡은 검토는 HTML 생성 전에 차단한다. 원문 전사와 의미 전체는 자동 인증하지 않는다.

## 기본 절차

별도 검증 요청 없이 화면 제목·짧은 이름·주제, 관계 이유, 연결 주장·조건·한계·노트, 현재 주장 검토 이유/범위와 source.scope를 모두 살핀다. 정확한 논문 제목과 stale로 표시된 과거 검토 이력은 원문/기록 보존 대상으로 제외하며 현재 성능 결론으로 재사용하지 않는다. 성능 주장에는 수치뿐 아니라 “일관되게 능가”, “필적”, “성능을 개선”처럼 수치 없는 비교도 포함한다. 방법을 결합했다는 사실은 모든 조건의 성능 향상을 뜻하지 않는다.

1. `node <skill>/scripts/render-verified-research-view.mjs candidate.json --performance-plan`으로 필드별 미해결 검토 목록을 얻는다. 각 항목의 `path`, `text_sha256`을 보존한다. 자동으로 모든 항목을 non-performance로 바꾸지 않는다.
2. 성능 문장을 확인하면 해당 표의 원문 화면을 다시 읽는다. 생성기·모델 크기·학습/평가 분할·데이터셋·지표와 방향·비교 방법·재현/인용 여부·결측·동률·오차/유의성·각주를 확인한다. 다른 생성기의 행이나 다른 지표의 열을 섞지 않는다. 본문이 “항상 우수”라고 하더라도 표의 예외가 있으면 그 예외를 보존한다.
3. evidence v2의 `tables`에 연속된 표 전체 블록과 완전한 헤더·캡션/각주를 담는다. 원문 발췌에서 불리한 행·열을 지우거나 값·기호를 고치지 않는다. 인접 본문에만 있는 비교 조건도 검토 scope와 별도 조건 항목에 남긴다.
4. 성능 필드의 `kind`는 `table-comparison`, `comparison`은 아래 계약이다. `comparisonText()`가 계산한 문장을 정확히 사용한다. 방법 설명과 성능 비교가 섞였으면 방법 설명은 statement/rationale에 남기고 성능 문장을 별도 conditions/notes 항목으로 나눈다. 원래의 유효한 조건·한계를 삭제하지 않는다.
5. 성능 비교가 아닌 필드는 이유와 함께 `non-performance`, `comparison:null`로 기록한다. 애매한 필드를 억지로 면제하거나 표현을 바꿔 탐지기를 피하지 않는다. 검증할 수 없는 성능 주장은 원본 초안에 보존하고 완성 HTML 생성을 멈춘 뒤 필요한 원문을 보고한다. 후보를 수정하면 목록과 해시를 갱신하고 다시 검사한다.

## Evidence v2 추가 계약

[개요·수량 evidence](evidence-gate.md)의 `version`을 2로 하고 `tables`, `performance` 배열을 추가한다. 성능 주장이 없어도 필드별 검토 목록은 필요하다. 예전 v1 evidence는 새 생성에서 거절하며 기존 HTML 파일은 바꾸지 않는다.

각 table:

```json
{
  "id": "Table1", "source_id": "S.1", "page": 2,
  "quote": "Task-A Task-B\nAccuracy Accuracy\nGenerator-A\nBaseline 70 67.3\nMethod 74 67.2\nTable 1. Test split; no significance test.",
  "header": "Task-A Task-B\nAccuracy Accuracy",
  "footer": "Table 1. Test split; no significance test.",
  "columns": [
    {"label":"Task-A","metric":"Accuracy","direction":"higher"},
    {"label":"Task-B","metric":"Accuracy","direction":"higher"}
  ],
  "conditions": ["Generator-A"],
  "review": {"checked_by":"actual reviewer","checked_at":"2026-11-16T00:00:00Z","scope":"Actual original table, full headers, rows and footnotes read"}
}
```

위 표는 합성 예시다. 실제 주체·시각·발췌를 사용한다. quote는 해시로 고정된 원문 추출 페이지의 연속 부분이어야 하며 header/footer는 각각 블록의 시작/끝이다. 지원하는 헤더는 전체 열 이름 한 줄과 같은 순서의 지표 한 줄이다. 두 줄의 모든 항목을 일치시켜 다른 열의 지표나 방향을 빌리는 것을 막는다. 행은 조건 헤더 뒤의 `방법명 값 값 ...` 형식이다. 모든 숫자 행을 읽으며 열 수 불일치·중복·부분 삭제를 거절한다. 값은 최대 15자리 유효숫자의 유한 십진수 또는 미보고 `-`/`—`다. 0이 아닌 수의 절댓값이 2.2250738585072014e-308 미만이거나 Number 변환에서 0으로 사라지면 거절한다. 방법명이 별도 숫자 토큰으로 끝나는 행(예: GPT 4)도 누락 셀과 구분할 수 없어 거절한다. 지수·오차범위·다단 병합 등 미지원 표는 임의로 숫자를 정리해 통과시키지 않는다.

Accuracy, FactScore, F1, EM, Exact Match, BLEU, ROUGE, Precision, Recall, AUROC/AUC는 높을수록, Loss, Perplexity, Latency, Error Rate, WER/CER는 낮을수록 좋은 것으로 검사한다. 다른 지표는 `direction_quote`에 `QualityX: higher is better` 또는 `QualityX 높을수록 좋음`처럼 지표 하나와 방향만 담은 정확한 원문 발췌를 넣는다(콜론과 마지막 마침표는 선택). 여러 지표의 방향이 섞인 문장 전체는 허용하지 않는다. 방향 정의가 불명확하면 미확인으로 남긴다.

각 performance 항목:

```json
{
  "path":"/papers/0/claims/0/conditions/0",
  "text_sha256":"<exact displayed text SHA-256>",
  "kind":"table-comparison",
  "reason":"Same-generator comparison; retain the Task-B exception",
  "comparison":{
    "table_id":"Table1",
    "pairs":[{"condition":"Generator-A","method":"Method","baseline":"Baseline"}],
    "assertion":"report"
  }
}
```

`pairs`는 실제 비교할 조건 범위다. 각 조건에서 정확한 행 라벨을 쓰며 `Self-RAG*` 같은 각주 기호를 유지한다. 선택한 조건의 모든 열을 비교한다. 범위를 좁히면 최종 문장도 그 범위로 한정된다. `all-better`는 동률·열세·미보고가 하나라도 있으면 실패한다. 일반적으로 `report`를 사용해 결과와 예외를 그대로 보고한다. 서로 다른 논문의 서로 다른 평가 조건은 하나의 우열 비교로 만들지 않는다.

`performance-evidence.mjs`의 `readTable(table, pages)`는 `Map<source_id, Map<page, text>>`를 받아 표를 읽고, `comparisonText(parsed, comparison)`은 표시 문장을 반환한다. `performancePlan(candidate)`은 경로·해시만 만들며 성능 여부를 판단하거나 승인하지 않는다. 전사 표에 숫자 배열을 따로 제출하지 않고 원문 행에서 직접 숫자를 읽는다.

## 차단과 한계

저장 직전 검사는 모든 대상 필드의 검토·현재 해시·원문 연결, 발췌 일치, 표의 열/행 정합성, 같은 조건의 계산과 정확한 표시 문자열을 확인한다. 열세·동률·미보고가 있으면 모든 조건 우월 주장을 차단한다. 알려진 비교 표현을 non-performance로 면제할 수도 없다.

원문 추출·블록 경계·조건 분류·비교 범위의 의미는 에이전트가 원문을 보고 검토한다. 모든 언어의 성능 표현을 찾아내는 분류기나 위조된 PDF/추출본 검출기는 아니다. 잘못된 non-performance 분류나 좁게 고른 범위는 검토 오류가 될 수 있다. 모든 필드 검토를 요구해 누락을 줄이지만 `source_semantics:not-certified`는 유지한다. 평균의 개선을 모든 개별 조건의 개선이나 통계적 유의성으로 바꾸지 않는다.


