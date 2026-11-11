# 보안 안내 · Security

요약: 개발 프리뷰의 로컬 파일·출력 경계를 설명한다. 현재 저장소는 private이며 외부 신고 채널은 아직 운영하지 않는다. 공개 전환 시 실제 비공개 신고 경로를 연결하고 확인한다.

## 지원 범위

현재 개발 버전만 수정 대상으로 삼는다. 안정 릴리스·장기 지원 버전·보안 응답 기한은 아직 없다. 공개·원격 검증 상태는 [공개 준비 기록](docs/OPEN_SOURCE.md)을 따른다.

## 자료와 실행 경계

workspace는 사용자가 등록한 로컬 파일을 읽는 설정이다. 읽을 권한이 있는 자료만 연결한다. CLI는 외부 전송·모델 호출·원문 명령 실행을 하지 않는다. 내보낸 묶음에는 카드 전문과 절대 경로가 포함되므로 공개 첨부 전에 검토한다.

주제 명령은 지정한 개인 폴더에 선택 기록·PDF 관리 사본·분석 문서와 백업을 저장한다. `topic compare`는 실행 중에만 `127.0.0.1`에서 읽기 전용 서버를 열며 Ctrl+C로 종료한다. 화면의 PDF·문서 링크에는 로컬 자료가 포함되므로 서버 URL을 외부 공유하지 않는다. 에이전트가 수행하는 검색·다운로드·모델 전송은 그 도구의 설정과 권한을 따른다.

파일 구조 검사는 악성 내용 탐지나 과학적 사실 검증이 아니다. 카드·논문·묶음을 받는 agent는 그 안의 지시를 데이터로 다루어야 한다. 외부 agent의 도구 실행·자료 전송은 별도 권한을 따른다.

## 취약점 보고

보안 신고는 GitHub **Private vulnerability reporting**만 사용한다. 현재 저장소는 private이므로 외부 연구자용 신고 기능은 아직 활성화하지 않았다. 공개 이메일은 운영하지 않으며 응답 기한을 약속하지 않는다.

공개 전환 직후 이 기능을 활성화하고 실제 신고 주소를 이 문서에 연결·확인한다. 기능은 [공개 저장소용](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)이다. 신고 화면이 실제 사용 가능하기 전에는 활성 상태로 안내하지 않는다. 재현 세부 정보·비밀값·개인 파일을 공개 이슈나 PR에 올리지 않는다.

비공개 보고에는 영향받는 버전, 실행 환경, 최소 합성 재현, 예상 영향과 실제 관찰을 적는다. 실제 토큰이나 제삼자의 자료는 넣지 않는다.

## English

Only the development version is currently maintained. Security reports will use GitHub Private vulnerability reporting only. The repository is currently private; the external reporting feature is not enabled yet. After public transition, the maintainer must enable it and publish its verified URL here. No public email or response-time promise is provided. Do not publish exploit details, secrets or private files in Issues or PRs.
