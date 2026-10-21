# 프로젝트 운영

요약: 개인 개발의 파일 기반 CLI 프로젝트다. PRD·TASKS를 정본으로 관리하고 비공개 GitHub와 Windows·Ubuntu CI를 사용한다. 공개 전환과 npm 배포는 별도 결정이다.

갱신: 2026-10-21 KST. 개인 개발 / 파일 기반 로컬 MVP / [OstenHun/danseo](https://github.com/OstenHun/danseo).

## 정본

- [PRD](PRD.md): 제품 범위와 완료 조건.
- [TASKS](../TASKS.md): 작업 상태. GitHub 저장소를 만들었다고 tracker를 자동 전환하지 않는다.
- [STRUCTURE](STRUCTURE.md)·[CARD_MODEL](CARD_MODEL.md): 코드·자료 경계와 형식.
- [CLI](CLI.md)·[English setup](CLI.en.md): 실제 실행.
- [공개 준비](OPEN_SOURCE.md): 업로드·검증·공개 전 결정.

## 운영 원칙

개인 workspace와 제품 소스를 분리한다. 명시적인 파일만 읽으며 계정·DB·상시 서버·모델 API를 기본 구성에 추가하지 않는다. 데이터가 필요한 검사에는 합성 예제를 사용한다.

이슈는 제안·버그 접수, PR은 변경 검토에 사용할 수 있다. 작업 상태를 여러 tracker에 이중 관리하지 않는다. CI와 수정자 확인은 사람의 독립 리뷰를 대신하지 않는다.

## 다시 검토할 시점

공동 개발자 합류, 공개 릴리스, 안정 API·데이터 형식, 외부 사용자 데이터 수집, 클라우드 동기화, 자료 이전 또는 tracker 변경 시 운영 범위를 다시 정한다. 현재 스키마와 CLI는 개발 프리뷰다.

MIT를 적용했으며 npm 오게시를 막기 위해 package.json의 private 설정을 유지한다. GitHub 공개 여부와 npm 게시 여부는 별개다.
