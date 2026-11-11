# 공개 준비

요약: 한국어 기본·영어 안내와 탐색→수집→분석→비교를 공개 후보로 준비한다. 로컬 전용 편집기·학습 화면은 제외한다. 파일·이력·설치를 점검하며 저장소와 npm 게시 차단은 private으로 유지한다.

갱신: 2026-11-12 KST / PTP-004. 기준 main `d5fbc4b30018f166b853b5006aedb2cf5858073c`. [OstenHun/danseo](https://github.com/OstenHun/danseo)는 비공개이며 외부 공개·npm 게시·정식 릴리스는 수행하지 않았다.

## 이번 공개 후보

README는 작은 로고·한 줄 소개·합성 데이터의 실제 비교 화면을 먼저 보여주고, 네 단계 기능·설치·문서로 이어진다. 기존 카드 내보내기의 상세 명령은 접힌 안내에 보존했다. `assets/readme/comparison-preview.jpg`는 실제 논문·개인 자료를 포함하지 않는 합성 화면이며 npm 배포물에도 포함한다. 이미지의 합성 여부는 양쪽 README에서 명시한다.

- 한국어 `README.md`를 기본으로 두고 상단에 짧은 영어 소개와 `README.en.md`를 연결한다. [영어 실행 안내](CLI.en.md)도 같은 네 단계와 준비 조건을 설명한다. skill·UI·일부 진단은 한국어다.
- 포함: 탐색 회차·선택 보존, 에이전트가 제공한 PDF 수집·기존 파일 연결, 논문별 분석·재개, 현재 원문 지지 주장만 사용하는 읽기 전용 연구 비교, 기존 Paper/Application 검사·내보내기.
- 제외: 로컬 개발본의 카드 편집기·별도 학습 HTML 생성 skill. 이 기능을 포함시키기 위한 추가 개발·이전은 공개 조건으로 삼지 않는다.
- 검색·PDF 다운로드·실제 독해·주장 검토·비교 기준 작성은 기존 에이전트와 검토자가 맡는다. 자체 LLM·자동 과학적 검증·자동 실험은 제공하지 않는다.
- 이번 문서와 점검 결과는 별도 공개 준비 브랜치에서 작성했다. 아래 점검은 로컬 검증 시점의 기록이며 GitHub 반영·해당 head의 CI·자동 리뷰는 PR에서 확인한다. 브랜치 반영과 main 병합·저장소 공개 전환은 구분한다.

## 공개 준비 점검 · 2026-11-12

| 항목 | 확인과 경계 |
| --- | --- |
| 기준 소스 CI | main `d5fbc4b`의 [실행 43099628098](https://github.com/OstenHun/danseo/actions/runs/43099628098) 7개 작업 성공. Windows·Ubuntu Node22/24, macOS Node24와 비차단 Node26 사전 검사 |
| 파일·이력 | origin 브랜치 9개의 도달 가능한 commit34개·blob254개와 현재 업로드 파일을 검사. 개인 자료 경로·알려진 인증 패턴·실제 maintainer 절대 경로 발견 없음. 별도 비공개 백업 원격은 공개 대상이 아님 |
| 작성자·브랜드 | 이메일은 GitHub noreply 범위. PNG6개 metadata는 `Software=Figma`, SVG6개에 metadata·script·외부 href 없음. 라이선스 원문 속 upstream 저자 정보는 정당한 고지로 보존 |
| 배포 경계 | package.json의 files 허용 목록과 실제 tarball 설치 검사 사용. work/workspaces/private·개인 PDF·개발 출력과 테스트/도구 소스를 배포하지 않음 |
| 로컬 설치·회귀 | Windows Node24.22.2의 새 worktree에서 잠긴 의존성 설치·빌드, 전체80/80과 tarball 설치·새 프로세스 재개·PDF·분석·비교 자산 검사 통과. 제한 환경의 임시 파일 rename 실패를 보존하고 일반 사용자 환경에서 재검증 |

이번 점검의 실제 명령·파일 해시·설치/회귀 로그·읽기 검수와 판정은 로컬 `work/public-alpha-prep-20261112/RESULT.md`가 소유한다. 합성 예제·기존 회귀와 공개 CI가 외부 재현 경로다. 알려진 패턴 검사이며 모든 비밀·취약점 부재의 보증이 아니다. 원격 PR 본문·댓글·Actions 로그·artifact 전체의 본문 감사는 이 Git 파일·이력 검사에 포함하지 않았다.

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

- 현재 소스는 CLI, 카드·주제·원문·분석·비교 core, 읽기 전용 비교 서버/화면과 공통 지도로 구성한 단일 패키지다. [폴더 구성](STRUCTURE.md)을 따른다.
- Git 업로드 파일, 새 main에서 도달 가능한 commit·blob, 실제 npm tarball을 각각 대조한다.
- 개인 파일 경로·계정 정보·자격증명 패턴과 바이너리 metadata를 점검하며 의존성 라이선스의 저자 연락처는 프로젝트의 개인 정보와 구분한다.
- 소스 저장소에는 계획·기여 문서를 둘 수 있다. npm 배포물은 package.json의 files 허용 목록으로 제한하고 설치된 CLI로 검사한다.
- 최소 Node 22·권장 24, Node 26 사전 검사에 대해 Windows·Ubuntu CI를 실행한다. 최신 head와 [CI 결과](https://github.com/OstenHun/danseo/actions?query=branch%3Amain)를 함께 확인한다.

점검은 알려진 개인 자료와 파일·패턴·metadata 범위의 확인이다. 미지의 모든 비밀이나 코드 취약점이 없다는 포괄적 보증이 아니며 CI는 독립 사람 리뷰를 대신하지 않는다. 자세한 백업·파일 해시·실행 로그는 비공개 로컬 기록으로 보존한다.

## 공개 전환할 때

이번에는 아래 전환 작업을 실행하지 않는다. 공개 준비 문서가 로컬에 있는 상태와 GitHub 반영·공개를 구분한다.

1. 검증한 문서 변경을 검토·승인된 GitHub 흐름으로 반영한 뒤 실제 공개할 head의 파일·tarball·최신 CI를 대조한다. 변경된 이력·서버 기록이 있으면 해당 공개 범위를 다시 확인한다.
2. 별도 공개 전환 요청이 있을 때만 저장소 visibility를 바꾼다. npm의 `private: true`는 유지하며 npm 게시·태그는 별도 결정이다.
3. [GitHub 비공개 취약점 신고](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)를 활성화하고 실제 사용 가능한 주소를 SECURITY.md에 연결한다. 현재 private 상태에서 운영 중으로 표시하지 않는다.
4. 로그아웃한 외부 독자의 README·소스 내려받기·첫 실행·신고 링크와 공유 미리보기를 확인한다. 현재 비공개이므로 익명 접근 성공은 미검증이다.

공유 이미지 등록·어두운 테마·외부 독자 접근 검사는 전환 확인 목록이다. npm 게시·태그·안정 스키마·편집·사용 효과 평가는 별도 후속이다.

## PTP-012의 배포 경계

이하 절은 각 작업 당시의 범위 기록이다. PR의 현재 병합·공개 상태는 위 최신 기준과 GitHub를 따른다.

[초안 PR #4](https://github.com/OstenHun/danseo/pull/4)는 3단계 병합 main 위의 연구 비교 기능만 포함한다. [읽기 전용 비교 화면](RESEARCH_COMPARISON.md), 현재 지지 주장·관계 투영, 합성 회귀와 설치본 자산 검사를 추가했다. Cytoscape3.34.4의 MIT 원문을 고지한다.

실제 STaR·Lightman PDF, 주제별 분석 문서, 원문 검토 JSON, 로컬 서버 URL·개인 경로·로그·캡처는 `work/`의 검증 사본에만 두고 PR·tarball에 넣지 않는다. `npm pack --dry-run` 파일 목록, 실제 설치 package-smoke와 PR 변경 파일 목록을 대조한다. 최신 CI·리뷰·원문/화면 확인 범위는 같은 PR에 연결하며 사람 평가·재현·병합·공개 전환과 구분한다.

## 비교 프런트 TypeScript 전환의 포함 범위

2026-11-12 로컬 전환은 비교 컨트롤러·공통 지도·브라우저 타입 선언과 필요한 빌드·회귀·문서만 포함한다. 설치 패키지에는 변환한 일반 JavaScript 자산을 넣고, 최신 재빌드 뒤 현재 빌드와 설치 자산 바이트를 대조했다. 개인 자료·보류한 편집기 전환·화면 캡처·리뷰 원문은 포함하지 않는다. [실행 목록](../TASKS.md)과 [빌드 경계](RESEARCH_COMPARISON.md#프런트-개발과-타입-검사)를 따른다. 커밋·게시·공개 전환·새 PR·병합·배포는 이번 검증에 포함하지 않았다.

## 남은 테스트·도구 TypeScript 전환 — 2026-11-12

테스트·설치 검사·빌드/문서 도구의 작성 소스를 .ts로 전환했다. 개발용 build/·build-tools/·tests/·scripts/는 tarball에 포함하지 않으며 설치 검사가 이 제외 조건과 최신 제품 자산을 대조한다. 제품 JavaScript·타입 선언과 브라우저 실행·외부 라이브러리 산출물은 배포에 필요해 유지한다. [개발 방법](../CONTRIBUTING.md#공통-테스트-fixture-수정)과 [실행 목록](../TASKS.md)에서 이번 로컬 검증·리뷰와 미실행 CI·공개 범위를 구분한다.
