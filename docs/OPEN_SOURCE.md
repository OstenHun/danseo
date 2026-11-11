# 공개 준비

요약: 저작권자는 OstenHun, 보안 신고는 GitHub 비공개 신고로 정했다. 원본 이력은 별도 비공개 백업에 보존하고 공개 준비용 새 이력을 만든다. 저장소와 npm 게시 차단 설정은 계속 private으로 유지한다.

갱신: 2026-10-21 KST / PTP-004. [OstenHun/danseo](https://github.com/OstenHun/danseo). 외부 공개·npm 게시·정식 릴리스는 수행하지 않았다.

## 확정한 기준

PTP-011의 공개 코드·문서·자동 검사는 합성 예제를 사용한다. 실제 논문의 PDF, 개인 분석 문서·검토 JSON, 로컬 절대 경로와 실행 로그는 PR·배포 패키지에 넣지 않는다. 실제 PDF의 판본·표 대조 결과는 PR에 출처와 확인 범위만 남기며 개인 원문 파일을 첨부하지 않는다. [논문별 분석](PAPER_ANALYSIS.md).

- 저작권자: MIT의 OstenHun.
- 공개 준비 이력: 정리한 파일만 새 루트 커밋으로 구성한다. 초기 개인 개발 기록·이전 작성자 이메일·Actions 실행 이력은 별도 비공개 백업에 보존한다.
- 새 커밋 작성자: OstenHun, 계정의 GitHub noreply 이메일.
- 보안 신고: GitHub Private vulnerability reporting만 사용한다. 현재 private 저장소에서는 아직 외부 신고 기능을 활성화하지 않는다.

현재 파일을 지우거나 force push하는 것만으로 이전 서버의 commit·실행 로그까지 없어졌다고 보장하지 않는다. 그래서 백업 저장소와 새 준비 저장소를 별개로 둔다. 백업을 공개하거나 mirror push로 과거 refs를 다시 올리지 않는다.

## 공유할 자료와 제외할 자료

| 포함 | 제외 |
| --- | --- |
| 코드·schema·자동 검사·배포 skill | 개인 연구 workspace·원문 PDF·모델 원시 응답 |
| 한국어·영문 안내·합성 예제 | work/workspaces/private/outputs |
| MIT·의존성 고지·브랜드 SVG/PNG | 키·환경변수·개인 설정·로그·Git bundle |

공유 문서는 제품 사용·현재 구현·검증 범위 중심으로 유지한다. 개인 실행·계정·평가 기록이나 Figma 편집 원본의 접근 권한을 사용 조건으로 요구하지 않는다. 공개 재현 자료는 합성 예제와 테스트다.

## 파일 구성과 점검

- 현재 소스는 cli.ts와 core/index.ts로 나눈 단일 패키지다. 아직 구현하지 않은 web/adapters/별도 cli 폴더와 중복 .gitkeep는 제거했다. [폴더 구성](STRUCTURE.md)을 따른다.
- Git 업로드 파일, 새 main에서 도달 가능한 commit·blob, 실제 npm tarball을 각각 대조한다.
- 개인 파일 경로·계정 정보·자격증명 패턴과 바이너리 metadata를 점검하며 의존성 라이선스의 저자 연락처는 프로젝트의 개인 정보와 구분한다.
- 소스 저장소에는 계획·기여 문서를 둘 수 있다. npm 배포물은 package.json의 files 허용 목록으로 제한하고 설치된 CLI로 검사한다.
- 최소 Node 22·권장 24, Node 26 사전 검사에 대해 Windows·Ubuntu CI를 실행한다. 최신 head와 [CI 결과](https://github.com/OstenHun/danseo/actions?query=branch%3Amain)를 함께 확인한다.

점검은 알려진 개인 자료와 파일·패턴·metadata 범위의 확인이다. 미지의 모든 비밀이나 코드 취약점이 없다는 포괄적 보증이 아니며 CI는 독립 사람 리뷰를 대신하지 않는다. 자세한 백업·파일 해시·실행 로그는 비공개 로컬 기록으로 보존한다.

## 공개 전환할 때

1. 실제 업로드·tarball 목록, 작성자 metadata와 최신 CI를 다시 확인한다.
2. 공개 전환을 별도로 요청받으면 실행한다.
3. [GitHub 비공개 취약점 신고](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)를 활성화하고 실제 사용 가능한 주소를 SECURITY.md에 연결한다.
4. 로그아웃한 외부 독자의 README·설치·신고 링크와 공유 미리보기를 확인한다.

공유 이미지 등록·어두운 테마·외부 독자 접근 검사는 전환 확인 목록이다. npm 게시·태그·안정 스키마·편집·사용 효과 평가는 별도 후속이다.

## PTP-012의 배포 경계

[초안 PR #4](https://github.com/OstenHun/danseo/pull/4)는 3단계 병합 main 위의 연구 비교 기능만 포함한다. [읽기 전용 비교 화면](RESEARCH_COMPARISON.md), 현재 지지 주장·관계 투영, 합성 회귀와 설치본 자산 검사를 추가했다. Cytoscape3.34.4의 MIT 원문을 고지한다.

실제 STaR·Lightman PDF, 주제별 분석 문서, 원문 검토 JSON, 로컬 서버 URL·개인 경로·로그·캡처는 `work/`의 검증 사본에만 두고 PR·tarball에 넣지 않는다. `npm pack --dry-run` 파일 목록, 실제 설치 package-smoke와 PR 변경 파일 목록을 대조한다. 최신 CI·리뷰·원문/화면 확인 범위는 같은 PR에 연결하며 사람 평가·재현·병합·공개 전환과 구분한다.
