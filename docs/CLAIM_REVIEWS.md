# 주장별 원문 검토 JSON

요약: 분석한 주장과 PDF를 고정하고 검토 결과를 해시로 등록한다. CLI는 원문·주장 현재성과 파일 무결성을 대조하며, 실제 페이지 독해와 의미 판정은 검토자가 수행한다. 검토 등록은 카드 전체 상태를 바꾸지 않는다.

## 고정 입력

workspace 안의 상대 경로에 UTF-8 JSON을 쓴다. `card_sha256`은 당시 카드 파일의 해시이며 주장 현재성은 주장별 내용으로 판단한다. 아래 해시 자리에는 실제 64자리 소문자 SHA-256을 넣는다. Paper의 `source.version`, `source.url`, 검토할 `claims` 전체 객체를 그대로 복사하고 실제 PDF 해시를 계산한다. 조건·한계·확장 필드를 빼면 현재 주장과 다르게 판정된다. `text_path`가 있으면 `text_sha256`도 기록한다.

```json
{
  "run_id": "source-review-001",
  "papers": [{
    "paper_id": "paper-a",
    "card_sha256": "<card SHA-256>",
    "source": {"version": "actual edition", "url": "https://example.org/a", "pdf_sha256": "<PDF SHA-256>"},
    "claims": [{"id": "c1", "statement": "Author-reported result", "conditions": "Evaluation conditions", "locators": [{"type": "pdf-page-range", "start": 3, "end": 3}, {"type": "table", "value": "1"}]}]
  }]
}
```

## 검토 결과

`input_sha256`은 고정 입력 파일 바이트의 해시다. `source_checks`에는 검토자가 실제 읽은 PDF의 해시를 넣는다. 입력의 모든 주장에 정확히 한 판정을 남긴다. 독립 검토는 `independent-source-review`, 같은 검토자의 후속 대조는 `same-reviewer-delta`로 기록한다. 이 이름만으로 독립성이 증명되지는 않는다.

```json
{
  "input_sha256": "<input SHA-256>",
  "reviewer": "actual reviewer",
  "review_type": "independent-source-review",
  "reviewed_at": "2026-11-11T00:00:00Z",
  "claims": [{
    "paper_id": "paper-a", "claim_id": "c1", "verdict": "supported",
    "reason": "Describe the actual comparison with the source.",
    "evidence": [{"pdf_page": 3, "section": "Table 1", "note": "Compared result, unit, sample and condition."}],
    "required_changes": []
  }],
  "source_checks": [{"paper_id": "paper-a", "pdf_sha256": "<PDF SHA-256>"}]
}
```

판정은 `supported`, `partially_supported`, `contradicted`, `insufficient_evidence` 중 하나다. 마지막 경우를 제외하면 PDF 쪽·절·대조 메모가 필요하다. 검토자·이유·위치·메모는 공백만으로 채울 수 없다. `reviewed_at`은 실제 달력 날짜와 ISO 8601의 `Z` 또는 명시적 UTC 오프셋을 쓰고, 소수점은 비교 정밀도와 같은 밀리초(최대 3자리)까지만 허용한다. UTF-8이 손상된 입력·결과는 보류한다. 실제로 읽지 못했다면 원문 지지로 쓰지 않는다. 검토 결과도 workspace 안에 보존하고 이전 파일을 덮어쓰지 않는다.

## 등록과 확인

기존 `workspace.json`의 기록·프로젝트를 보존하고 다음 선택 필드를 추가한다. 결과 파일 해시는 실제 저장된 바이트로 계산한다.

```json
{
  "claim_reviews": [{"input": "reviews/input.json", "result": "reviews/result.json", "result_sha256": "<result SHA-256>"}]
}
```

`topic comparison-input`이 입력·결과·PDF·현재 주장을 대조한다. 더 최신의 부정·수정 대기·변경 판정이 있으면 예전 지지 판정으로 돌아가지 않는다. 같은 시각의 중복 기록은 정리할 때까지 보류한다. JSON의 구조·해시 일치는 의미 판정이나 독립 검토 완료를 자동 보증하지 않는다. [분석과 재개](PAPER_ANALYSIS.md).
