# 런타임 지원 정책

요약: Node 22·24 LTS를 지원 계열로 두고 새 설치·개발에는 24를 권장한다. Node 26은 사전 호환성 검사 대상이다. 지원 선언·CI 설정·실제 실행 결과를 구분하고 패치 갱신과 지원 종료를 관리한다.

갱신: 2026-10-21 KST / PTP-004. 최소 지원 22·권장 24·Node 18은 실제 수요 발생 시 검토하는 기준을 사용자가 확정했다. GitHub 비공개 저장소의 Windows·Ubuntu CI 실행을 확인했다.


## CI 실행 범위와 패치 기준

자동 CI는 PR당 Ubuntu·Node 24 작업 하나만 실행한다. push 이벤트는 사용하지 않으며 같은 PR에 새 커밋이 올라오면 이전 실행을 취소한다. 문서 전용 변경은 설치·도구 타입 검사·문서 링크/요약 검사로 끝낸다. README·기여/보안/고지 문서·TASKS·LICENSE, `docs/`의 Markdown과 README 이미지 경로만 문서로 분류한다. PR 변경과 병합될 결과의 경로를 모두 확인하며 코드·설정·skill·알 수 없는 경로·변경 목록 확인 실패는 전체 회귀·합성 예제·tarball 설치 검사까지 실행한다.

다른 환경이 필요한 변경은 Actions의 **Run workflow**에서 OS(Ubuntu·Windows·macOS)와 Node(22·24·26)를 선택한다. 수동 실행은 문서 변경에도 전체 검사하며 다른 수동 실행을 취소하지 않는다. 새 입력 화면은 이 workflow가 기본 브랜치에 반영된 뒤 사용할 수 있다. Node 26은 사전 호환성 검사 대상으로 유지하며 수동 실패도 실행 결과에 표시한다. 이 설정은 Node 22 지원을 종료하거나 모든 OS 조합을 매 PR마다 검증했다는 뜻이 아니다.

CI는 22.23.4 이상인 22.x와 24.22.1 이상인 24.x 중 최신 출시 패치를 선택하고 실행 버전을 로그에 출력한다. 전체 검사는 설치본으로 한글·공백 경로의 PDF를 등록하고 새 프로세스에서 경로·해시·사본 수를 대조한다. Mac 앱의 권한 대화상자는 이 CLI 검사 범위 밖이다.

2026-11-11 KST 조회에서 11월 보안 공지는 배포 예고였고, 공식 배포 목록에는 22.23.4와 24.22.2가 있었다. npm 패키지 감사의 결과는 PR의 잠금 파일 기준으로 따로 기록한다. [10월 보안 패치](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases/) · [11월 공지](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases/) · [배포 목록](https://nodejs.org/dist/index.json)

## 현재 기준

공개 후보 준비(2026-11-12): main `d5fbc4b`에서 문서만 수정한 별도 worktree를 Windows Node24.22.2/npm11.21.1로 새 설치·빌드하고 전체80/80과 실제 tarball 설치·주제 재개·PDF·분석·비교 자산 검사를 통과했다. 제한 실행 환경에서는 임시 파일 rename 권한으로 회귀가 실패했고 같은 소스를 일반 Windows 사용자 환경에서 재검증했다. main의 [CI43099628098](https://github.com/OstenHun/danseo/actions/runs/43099628098)는 Windows·Ubuntu Node22/24, macOS Node24와 비차단 Node26 두 작업을 포함해7개 성공이다. 이번 로컬 문서 diff의 새 원격 CI는 실행하지 않았다. 상세 로그·새 소스 복사 확인은 로컬 `work/public-alpha-prep-20261112/RESULT.md`, 공개 범위는 [공개 준비](OPEN_SOURCE.md)를 따른다.

| 구분 | 기준 | 의미 |
| --- | --- | --- |
| 지원 계열 | Node 22.x·24.x LTS | 각 계열의 최신 패치를 사용한다. `package.json`의 engines는 `^22.0.0 || ^24.0.0`이다 |
| 새 설치·개발 권장 | Node 24.x 최신 패치 | `.node-version`에 24를 기록한다. 도구가 이 파일을 자동 적용하는지는 해당 버전 관리자의 동작에 따른다 |
| 사전 호환성 검사 | Node 26.x Current | 로컬 검사에 통과해도 지원·권장 계열로 자동 승격하지 않는다 |
| 지원 대상 밖 | Node 18·20 및 그 외 미선언 계열 | 공식 지원 종료와 유지 비용을 고려했다. 실행 불가를 입증했다는 뜻은 아니다 |

`engines`는 지원 범위 메타데이터이며 npm 기본 설정에서는 경고로 처리될 수 있다. 모든 비지원 실행을 CLI가 차단한다고 설명하지 않는다. 전체 22.x·24.x 패치를 각각 검증한 것은 아니며, 실행한 정확한 패치는 아래에 남긴다.

## 선택 이유와 Node 18

기존 `>=24 <25`는 24만 검증한 초기 개발 범위였다. 현재 소스는 파일·경로·해시·인수 처리와 Ajv·yaml을 사용하고, 이번 Node 22 빌드·테스트에서 24 전용 요구가 드러나지 않았다. 따라서 지원 중인 이전 LTS로 범위를 넓혔다. 타입 정의도 `@types/node` 22 계열로 맞춰 개발 중 더 높은 계열의 API를 무심코 추가할 가능성을 줄인다. 타입 검사만으로 실제 실행을 대신하지 않는다.

Node 18은 [공식 일정](https://github.com/nodejs/Release/blob/main/schedule.json)에 따라 2025-04-30 지원이 끝났고, Node 20도 2026-04-30 지원이 끝났다. 현재 설치 비중이 높다는 근거는 이번 작업에서 확보하지 않았다. [Node의 EOL 설명](https://nodejs.org/en/about/eol)은 지원 종료 뒤 일반 보안 수정이 제공되지 않고 의존성 지원도 줄어들 수 있음을 설명한다.

사용자는 Node 18 지원을 검토한 뒤 최소 지원을 22, 권장을 24로 확정하고 Node 18은 실제로 필요한 사용자가 생기면 검토하기로 했다. 해당 수요가 확인되면 필요한 Node 18 세부 버전·운영 조건·담당자·종료 시점을 정하고 설치·CLI·의존성을 검사해 별도 지원 여부를 결정한다. 테스트 통과만으로 Node 18 자체의 보안 유지가 확보되지는 않는다.

Danseo를 실행하는 Node와 자료를 읽을 대상 프로젝트의 Node는 별개다. 예를 들어 대상 프로젝트가 Node 18을 사용해도 Danseo는 별도 Node 24 환경에서 해당 자료를 읽을 수 있다. Danseo는 대상 프로젝트의 Node 설정이나 전역 Node를 자동 변경하지 않는다. 다른 실행 환경을 포함하는 패키징은 실제 설치 제약이 생기면 별도로 검토하며 현재 MVP에는 추가하지 않는다.

## 검사와 실제 근거

| 환경 | 이번 실행 | 결과 |
| --- | --- | --- |
| Windows / Node 22.23.3 | TypeScript 빌드, 기존 CLI 테스트 | 빌드 성공, 26/26 통과 |
| Windows / Node 24.22.0 | 같은 빌드의 기존 CLI 테스트 | 26/26 통과 |
| Windows / Node 26.12.0 | 같은 빌드의 기존 CLI 테스트 | 26/26 통과, 사전 검사 결과 |
| Windows / Node 22.23.3 / npm 10.9.9 | 새 소스 폴더의 offline 설치·빌드, 별도 consumer의 tgz 설치·CLI 검사·내보내기 | 각각 통과. 같은 Windows와 npm 캐시를 사용한 격리 설치이며 새 장치 검증은 아님 |
| GitHub Ubuntu / Node 24 | PR 자동 검사. 문서 전용이면 경량 검사, 나머지는 전체 회귀·합성 예제·실제 tarball 설치 | 해당 head의 CI 실행 결과를 확인한다 |
| GitHub Windows·macOS / Node 22·24·26 | 필요할 때 OS·Node를 선택하는 수동 전체 검사 | 실행한 조합만 근거로 남기며 Node 26은 지원 선언으로 자동 승격하지 않는다 |

기존 검사는 파일 구조·참조·원문 보존·프로젝트 분리·오류 출력·새 파일 생성 경계를 확인한다. CI는 실제 tarball 설치·도움말·합성 예제 검사·내보내기도 실행한다. 현재 실행 상태는 해당 PR의 Checks와 [PR 자동 실행 목록](https://github.com/OstenHun/danseo/actions/workflows/ci.yml?query=event%3Apull_request), [공개 준비](OPEN_SOURCE.md)에서 확인한다. main의 과거 실행은 그 당시 소스의 근거다. 과거 개발 이력과 실행 로그는 비공개 백업에 보존하며 새 저장소에서 열리지 않는 과거 run 링크를 사용 조건으로 요구하지 않는다. GitHub 러너 확인을 모든 Linux 배포판·macOS·사용 효과로 확대하지 않는다.

앞선 로컬 로그·다운로드 체크섬과 격리 설치 검사는 별도로 보존한다. 검증용 Node 22·26 ZIP은 공식 배포의 SHA-256 목록과 대조한 뒤 로컬 폴더에만 풀었으며 전역 설치·PATH는 바꾸지 않았다.

## 업데이트와 지원 변경

PTP-011은 PTP-010의 Windows·Ubuntu Node 22·24(26 사전 검사)와 macOS Node 24 CI, 보안 수정 하한 22.23.4·24.22.1을 이어 쓴다. 2026-11-11 KST 재확인한 공식 배포 목록의 최신 지원 패치는 22.23.4·24.22.2다. 11월 공지는 배포 예고와 실제 배포를 구분해 다음 검증 때 다시 확인한다. 이번 잠금 파일의 개발 의존성 포함·제외 `npm audit --package-lock-only`는 알려진 취약점 0건을 보고했다. 로컬 초기 검사는 Windows / Node 24.22.0, 최종 60개 회귀·설치 패키지 검사는 24.22.2에서 실행했다. 실제 CI Node 패치는 작업 로그에서 별도로 확인한다. [공식 배포 목록](https://nodejs.org/dist/index.json) · [보안 공지](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases) · [3단계 검증 범위](PAPER_ANALYSIS.md#의존성과-확인-범위).

1. 선택한 계열의 보안·버그 수정은 우선 검토하고 최신 패치로 검사한다. 의존성은 lockfile로 고정하고 `npm ci`로 재현한다. 모든 패키지를 무조건 최신 메이저로 올리지는 않는다.
2. 새 Node 계열은 사전 호환성 검사를 거친다. LTS 전환과 의존성·설치·지원 OS 검사를 확인한 뒤 engines·CI·문서·개발 기본값을 함께 갱신한다. 버전 번호가 크거나 테스트 한 번이 통과했다는 이유만으로 지원하지 않는다.
3. Node 계열의 EOL이 가까워지면 해당 계열 지원 종료를 다음 릴리스 기록에 예고한다. 지원 삭제는 사용자 환경에 영향을 주는 변경으로 취급하며, 안정 릴리스가 생기면 메이저 버전 변경을 기본으로 한다. 현재 개발 프리뷰에서도 변경과 이전 가능한 버전을 명시한다.
4. 새 의존성이나 API가 지원 하한을 올리면 기존 계열 유지 비용과 필요한 기능을 비교한다. 실제 소비자가 있으면 전환 조건을 확인하고, 검증하지 않은 범위를 지원한다고 선언하지 않는다.

정책 재검토 시 [공식 지원 상태](https://nodejs.org/en/about/previous-releases)와 [일정](https://github.com/nodejs/Release/blob/main/schedule.json)을 다시 확인한다. 이 문서는 백그라운드 감시·예약 업데이트나 전역 런타임 교체를 설정하지 않는다.

## PTP-012 비교 화면의 실행 근거

2026-11-11 연구 비교는 선행 Windows·Ubuntu Node22/24, macOS Node24와 Node26 비차단 행렬 및 보안 하한을 유지한다. 로컬은 Windows Node24.22.2다. [PR #4](https://github.com/OstenHun/danseo/pull/4)의 최신 head CI와 작업 로그에서 실제 Node 패치·전체 회귀·설치본 자산/PDF 반환 결과를 확인한다. 초기 Windows 짧은 경로·macOS 별칭 경로의 직접 API 검사 실패를 비교 진입점의 realpath 정규화로 수정했으며 파일 경계 검사는 유지했다. 지문 키는 로케일에 무관한 순서로 고정한다. [사용법과 제한](RESEARCH_COMPARISON.md).

개발 포함·제외 잠금 파일 감사와 [공식 Node 배포 목록](https://nodejs.org/dist/index.json)을 확인했으며 전역 런타임을 교체하지 않았다. macOS CI는 실행 환경 검사이며 앱의 폴더 권한 UI나 사람의 화면·학습 평가를 대신하지 않는다.

## 비교 프런트 TypeScript 전환 검사

2026-11-12 KST, Windows / Node 24.22.2에서 strict 서버·브라우저 빌드와 전체 79개 회귀를 통과했다. `npm run test:package`는 최신 소스를 재빌드해 별도 소비자 폴더에 tarball을 설치하고, HTTP 자산의 바이트와 일반 script 문법·현재 근거·PDF 반환을 검사한다. `npm run check:docs`도 통과했다. [실행 목록](../TASKS.md)의 전환 항목과 [개발 계약](RESEARCH_COMPARISON.md#프런트-개발과-타입-검사)을 따른다. 이번 로컬 diff의 다른 OS·Node 계열 및 GitHub CI는 미실행이며 기존 main의 CI와 구분한다.

## 공통 helper·분석·비교 테스트 TypeScript 전환 — 2026-11-12

공통 helper와 분석·비교 테스트는 기존 TypeScript 컴파일러로 검사·변환한다. 제품 dist/는 JavaScript와 타입 선언을, 테스트 전용 build/는 실행할 JavaScript를 담는다. Node 22·24에서 변환한 테스트와 기존 .mjs 테스트를 node:test로 실행하며 새 실행기나 native 타입 제거에 의존하지 않는다. [공통 fixture 개발](../CONTRIBUTING.md#공통-테스트-fixture-수정)과 [실행 목록](../TASKS.md)을 따른다. 이번 diff의 로컬 검사와 다른 OS·Node 계열 CI를 구분한다.

## 남은 테스트·도구 TypeScript 전환 — 2026-11-12

작성한 테스트와 개발 도구 전체를 기존 tsc로 strict 검사·변환한다. Node 22·24는 build/의 테스트와 build-tools/의 도구를 실행한다. 도구 빌드는 제품·테스트 출력에 의존하지 않아 깨끗한 checkout에서 시작하며, 설치 검사는 최신 제품·테스트 빌드 후 tarball의 CLI·HTTP 자산·PDF와 재개·원문 변경을 확인한다. 브라우저용 생성 JavaScript와 외부 Cytoscape는 유지한다. [개발 계약](../CONTRIBUTING.md#공통-테스트-fixture-수정)과 [현재 검증 상태](../TASKS.md)를 따른다. 기존 CI 설정은 유지하며 이번 미커밋 변경의 원격 CI를 실행한 것으로 표시하지 않는다.

이번 전환은 Windows / Node24.22.2와22.23.4에서 각각 전체80/80·tarball 설치 검사를 통과했다. Node22는 공식 SHA256을 대조한 로컬 실행 파일로 생성 폴더 없는 상태부터 검사했으며 전역 Node는 바꾸지 않았다. 다른 OS·이번 diff의 원격 CI·권한이 필요한 Windows symlink 분기 전체는 미확인이다.

## 독립 관계 HTML 근거 검사 — 2026-11-15

Windows Node 24.22.2의 별도 worktree에서 `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`(기존 82개 + 근거 검사 13개), `npm run check:docs`, `npm run test:package`를 실행해 통과했다. 이번 변경의 Linux·Node 22 및 원격 CI 결과는 미실행이다. portable 생성기는 외부 npm 없이 실행하며 같은 후보의 세 로컬 설치본 출력이 동일했다. 이 결과는 모델의 전체 의미 정확도를 보증하지 않는다. [검사 명령·한계](../skills/danseo/references/evidence-gate.md).
