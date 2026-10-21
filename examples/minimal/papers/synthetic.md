---
schema_version: draft-2
type: paper
id: paper-synthetic
source:
  version: synthetic-v1
  url: https://example.invalid/synthetic
review:
  status: draft
  reason: 실제 논문이 아닌 동작 검사용 합성 자료다.
claims:
  - id: C-DEMO-01
    statement: 설정 A에서는 12점, 별도 표본의 설정 B에서는 9점을 보고한다.
    locators:
      - type: table
        value: "1"
  - id: C-DEMO-02
    statement: 같은 항목이 표 2에서는 0.02, 표 3에서는 0.03으로 보고되어 있다.
    locators:
      - type: table
        value: "2"
      - type: table
        value: "3"
# Unknown fields and comments must survive reading and export.
demo_extension: preserve-me
---
# 합성 논문 · 조건과 불일치

요약: 실제 연구가 아닌 CLI 검사 예제다. 서로 다른 조건과 미해결 수치가 내보내기에서 유지되는지 확인한다.

## 조건과 한계

A는 100개, B는 25개 입력을 사용했다는 가상 설정이다. 12와 9를 직접 차감해 개선이라고 말하지 않는다. 지표는 성공률이 아니다.

## 미해결

표 2의 0.02와 표 3의 0.03은 원문 확인이 필요하다는 합성 사례다. 임의로 정답을 선택하지 않는다. URL은 동작 예시이며 실제 논문 주소가 아니다.
