# 관계 HTML의 개요·수량 검사

요약: 개요를 관계 상태에서 생성하고 기록·문서·쌍의 수량을 원문 파일·쪽·발췌에 연결해 검사한다. 통과한 후보만 HTML로 저장하며 논문 전체 의미와 화면 검수는 별도로 확인한다.

## 기본 생성 흐름

Claude, Argon, Codex 모두 같은 Node 생성기를 사용한다. 관계 분석에서는 먼저 [원문 검증](relation-verification.md)을 수행한다. 이 검사는 그 과정을 대체하지 않는다.

1. version 2 `paper-relations` 후보를 만들고 원문 확인 관계와 AI 제안을 나눈다. AI 관계는 `origin:ai`, `status:proposed`, `review:null`로 유지한다.
2. `node <skill>/scripts/render-verified-research-view.mjs candidate.json --overview`의 JSON으로 `description`, `view_reason`, `scope`를 갱신한다. 관계 상태가 바뀌면 재생성한다. 기존 개요의 유효한 범위·제외 조건은 해당 논문의 notes나 source.scope에 보존하고, 원본 후보를 덮어쓰지 않는다.
3. 아래 evidence.json을 만든다. 인식된 수량 문장은 별도 조건/노트 항목으로 분리하고 `countText`의 형식으로 적는다. 원래 문장의 실험 조건·한계·지표·방향은 인접 항목에 보존한다. 숫자를 지우거나 한글 수사로 바꿔 검사를 피하지 않는다.
4. `node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --check`를 실행한다. 실패하면 지정된 필드와 원문으로 돌아간다.
5. 동일한 후보와 evidence로 `node <skill>/scripts/render-verified-research-view.mjs candidate.json --evidence evidence.json --out new-view.html`을 실행한다. 저장 직전에 다시 검사하며 기존 파일은 덮어쓰지 않는다.
6. 실제 화면의 원문/AI 표시·수량·근거 선택·글자 읽기를 확인한다. 실패한 결과를 완성본으로 전달하지 않고 남은 확인을 명시한다.

기존 `render-research-view.mjs --check`는 구조 검사만 한다. 관계 HTML의 기존 `--out`은 차단되며 위 생성기를 사용해야 한다. `project-application` 출력은 기존 명령을 사용한다. 순수 `renderCandidate()`는 라이브러리 함수이며 검증 완료 API가 아니다.

## Evidence 형식

모든 경로는 evidence.json 디렉터리 아래의 상대 경로다. 원본 PDF와 추출 JSON의 SHA-256을 실제 바이트로 계산한다. 링크의 실경로도 디렉터리 안에 있어야 한다. 각 파일은 32 MiB 이하이며 더 큰 자료는 이 생성기에서 지원하지 않는다.

```json
{
  "version": 1,
  "sources": [{
    "id": "S.Example",
    "document_path": "source.pdf",
    "document_sha256": "<64 lowercase hex characters>",
    "text_path": "pages.json",
    "text_sha256": "<64 lowercase hex characters>"
  }],
  "counts": [{
    "path": "/papers/0/claims/0/conditions/0",
    "source_id": "S.Example",
    "page": 2,
    "quote": "17 records (15 documents, 60 pairs)",
    "items": [
      {"unit": "records", "value": 17},
      {"unit": "documents", "value": 15},
      {"unit": "pairs", "value": 60}
    ]
  }]
}
```

위 예시는 합성 자료다. 해당 필드의 정확한 표시 문자열은 `원문 수량 (S.Example, p. 2): 17개 레코드, 15개 문서, 60개 쌍.`이다. 등호나 해석 문장을 끼워 넣으면 실패한다. `research-evidence.mjs`의 `countMentions(quote)`와 `countText(binding)`를 재사용할 수 있다.

추출 JSON은 `{"pdf_sha256":"<original PDF hash>","pages":[{"page":2,"text":"..."}]}` 형식이다. PDF 해시 연결, 쪽 번호, 공백 정규화한 발췌 포함 여부, 발췌의 수량 값·단위 순서를 검사한다. source_id는 후보의 sources와 해당 claim.evidence(노트이면 해당 논문의 claim)에 연결돼야 한다. 새 값/단위나 출처를 추측해서 채우지 않는다. 수량이 없으면 sources/counts가 빈 배열인 evidence를 쓴다.

## 검사 범위와 한계

- 자동 수량 검사 대상: papers의 notes, claims.statement, conditions, limitations에서 아라비아 숫자로 쓴 records/pairs 또는 레코드/기록/쌍이 있는 필드다. 그 필드에 함께 나온 documents/문서 수도 대조한다. 문서 수만 단독으로 있는 검색 설정(예: 상위 5개 문서)은 자동 검사 대상이 아니며 agent가 원문 대조한다. 쉼표 천 단위와 괄호 속 쌍 기호를 지원한다. 다른 수량·한글 수사·임의 자연어 동치는 자동 인증하지 않는다.
- 개요 검사는 세 개의 구조적 요약 필드에 적용한다. 제목·관계 이유·claim 자유 문장까지 의미 판정하는 기능이 아니다. 관계의 origin/status 자체가 타당한지는 원문 검증의 책임이다.
- 해시는 이후 원문/추출본 변경을 잡고 발췌 검사는 제출된 추출본과의 일치를 확인한다. 추출본을 신뢰할 수 있는지, PDF에 그 내용이 실제로 있는지는 원문 화면 대조가 필요하다. 사용자 자료를 모델이 변조해 해시까지 바꾸는 공격을 인증하는 도구가 아니다.
- 영수증의 `source_semantics:not-certified`, `visual_review:not-run`을 의미/시각 검수 완료로 바꾸어 보고하지 않는다. 별도 검수 근거와 함께 전달한다.

개발 회귀 검사는 `node --test <skill>/scripts/research-evidence.test.mjs`로 실행한다. 합성 검사와 실제 논문 실행 결과를 구분한다.
