# 이름과 표기

요약: 사용자가 제품명을 Danseo(단서)로 확정했다. 패키지·CLI·배포 skill은 danseo로 통일한다. 동명 공개 저장소는 다른 분야이며 이름의 유일성·상표 권리·패키지 등록 성공을 보장하지 않는다.

작성: 2026-10-21 KST / PTP-004 / 상태: 사용자 확정, 로컬 변경.

## 이름의 의미

Danseo(단서)는 논문에서 프로젝트의 다음 판단에 필요한 실마리를 찾는다는 뜻이다. 논문 주장·원문 위치·조건을 보존하면서 프로젝트별 적용 판단에 연결하는 제품 범위를 나타낸다.

영문 설명은 **From papers to project decisions.** 한국어 설명은 **논문의 근거를, 내 프로젝트의 판단으로.** 이름의 의미를 모르는 독자에게는 짧은 설명을 함께 제공한다. 해외 사용자의 발음·기억·첫인상은 아직 검증하지 않았다.

## 현재 식별자

| 대상 | 표기 |
| --- | --- |
| 제품명 | Danseo |
| 한국어 뜻 | 단서 |
| 패키지 이름 | `danseo` |
| 프로젝트 폴더 이름 | `danseo`가 목표이며 현재 활성 경로의 잠금으로 이동 대기 |
| CLI / npm script | `danseo` / `npm run danseo -- <명령>` |
| 배포 skill / 호출 | `skills/danseo` / `$danseo` |
| schema draft 식별자 | `https://danseo.invalid/card-draft-2.json` — 실제 네트워크 주소가 아님 |

초기 작업명은 `paper-to-project`, 명령은 `ptp`였다. 과거 결과의 실제 실행 명령·경로와 `PTP-*` 작업 ID를 보존한다. 과거 문서의 미구현 상태와 명령 예시는 현재 사용법이 아니며 [CLI](CLI.md)가 현재 실행법을 소유한다. 기존 전역 skill 설치본은 별도 산출물이므로 자동 교체하지 않았다.

## 중복 조사

2026-10-21 KST에 공개 웹 검색과 아래 공개 API를 직접 조회했다. 이 결과는 해당 시점의 조사 범위이며 이름을 예약하지 않는다.

| 확인 대상 | 결과 | 해석 |
| --- | --- | --- |
| [GitHub 이름 검색](https://github.com/search?q=danseo+in%3Aname&type=repositories) / [공개 API](https://api.github.com/search/repositories?q=danseo%20in%3Aname&per_page=100) | 응답 200, 9개 결과, incomplete_results=false | 정확히 `danseo`인 저장소 [SeoDan15/danseo](https://github.com/SeoDan15/danseo)를 확인 |
| 동명 저장소의 metadata·파일 목록·index.html | HTML·CSS·JS로 된 개인 편지 페이지, README와 라이선스 표시 없음 | 현재 연구·근거 도구와 분야가 다르다. 공개 저장소 존재와 오픈소스 라이선스 제공 여부는 별개 |
| [npm danseo](https://registry.npmjs.org/danseo) | HTTP 404, Not found | 공개 조회에서 해당 패키지를 찾지 못함. 등록 허용·예약의 증거는 아님 |
| [PyPI danseo](https://pypi.org/pypi/danseo/json) | HTTP 404, Not Found | 동일 |
| [crates.io danseo](https://crates.io/api/v1/crates/danseo) | HTTP 404, crate does not exist | 동일 |

웹 검색에서 [DANSEO 추리 게임](https://www.kpopvisage.com/danseo)과 [Danseo라는 게임 제작자](https://danseo.itch.io/)도 확인했다. 따라서 이름이 완전히 유일하다고 설명하지 않는다. 현재 조사에서 같은 이름의 유사 연구 도구는 확인하지 못했다.

도메인 등록과 상표는 조사하지 않았다. 이번 조사는 법적 권리·혼동 가능성의 최종 판단이나 외부 서비스의 이름 등록 가능성 확인을 대신하지 않는다. 공개 배포 시점에는 사용할 소유자·저장소·패키지 식별자를 다시 조회하고 실제 등록 결과를 확인한다.

## 변경과 확인 범위

README·현재 사용 문서·패키지 metadata·lockfile·CLI 도움말·오류 클래스·배포 skill·카드 schema 식별자와 Figma·SVG·PNG의 이름을 맞췄다. 기존 PTP 작업 ID와 과거 검사 결과는 이력으로 남긴다. 실제 파일·설치·실행·이미지 검사는 [실행 목록](../TASKS.md)의 PTP-004에 연결한다. 이후 사용자 요청으로 [OstenHun/danseo](https://github.com/OstenHun/danseo)를 비공개로 생성·push했다. 공개 npm 게시·상표 출원은 수행하지 않았다.
