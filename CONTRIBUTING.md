# 기여 안내 · Contributing

요약: 합성 자료로 재현 가능한 작은 변경을 제안한다. Node.js 24를 개발 기본값으로 쓰고 22·24 호환성을 검사한다. 연구 근거·개인 자료·제품 동작을 구분하며 현재 GitHub 저장소는 비공개다.

## 개발 시작

개발 기본값은 `.node-version`의 Node 24다. 런타임 API 변경은 지원 대상인 Node 22·24에서 확인하고, Node 26 검사는 사전 호환성 신호로 다룬다. 지원 범위 변경·패치 갱신 절차는 [런타임 지원 정책](docs/RUNTIME_SUPPORT.md)을 따른다.

```sh
npm ci
npm test
npm run check:docs
npm run test:package
node ./dist/cli.js validate --workspace ./examples/minimal --json
```

`npm test`는 TypeScript 빌드와 Node 기본 테스트를 실행한다. `src/core`는 자료 읽기·검사·묶음 생성, `src/cli.ts`는 명령과 출력, `schemas`는 형식, `skills`는 agent 읽기 절차를 담당한다.

문서 검사는 로컬에만 있는 파일을 GitHub 링크로 연결하는 실수를 잡는다. 패키지 검사는 앞선 빌드로 tarball을 만들고 임시 consumer에 설치해 실제 CLI를 실행한다. npm 캐시를 우선 사용하며 필요한 의존성 metadata·파일이 없으면 registry에 접근한다.

## 공통 테스트 fixture 수정

테스트 본문·공통 helper·개발 도구는 TypeScript로 작성한다. 기존 컴파일러의 strict·noUncheckedIndexedAccess·noEmitOnError로 검사하고, Node 22·24가 출력된 JavaScript를 기존 node:test로 실행한다. 새 실행기나 Node의 native 타입 제거는 사용하지 않는다.

```sh
npm run build:tools
npm run check:tests
npm test
npm run test:package
npm run check:docs
```

- build:tools는 제품이나 테스트 출력에 의존하지 않는 scripts/의 도구를 build-tools/로 컴파일한다. build와 check:docs가 먼저 호출하므로 출력이 없는 checkout에서도 실행할 수 있다.
- build는 도구 빌드 → 제품 JavaScript·타입 선언 → 브라우저 검사 → classic script·자산 생성 순서다. 브라우저 실행용 JavaScript와 Cytoscape 배포 파일은 필요한 생성·외부 산출물이다.
- check:tests는 제품을 빌드한 뒤 실제 테스트 본문과 tests/package-smoke.ts를 출력 없이 검사한다. build:tests는 제품 빌드 → 이전 build/ 전체 제거 → 테스트 검사·출력 순서다. npm test는 build/*.test.js만 실행해 이전 소스와 중복 실행하지 않는다.
- test:package는 build:tests 후 build/package-smoke.js로 tarball을 설치해 검사한다. PDF helper도 같은 테스트 빌드에서 가져온다. tests/와 build/, scripts/와 build-tools/의 상대 깊이를 유지해 실제 dist/와 자산을 읽는다.

build/·build-tools/는 개발 출력이며 설치 패키지에서 제외한다. 소스에서 개발할 때는 npm ci로 개발 의존성까지 설치해야 한다. 설치 패키지의 CLI는 포함된 dist/를 실행하며 컴파일러나 테스트 출력에 의존하지 않는다.

fixture-types.test.ts와 frontend.test.ts는 실제 소비자 계약의 정상 호출과 잘못된 인자·명령·필드·선택을 대조한다. VM에서는 외부 실행 결과에 MapAPI 계약을 연결하고 API 존재를 확인한다. Cytoscape가 없는 fallback 검사의 빈 DOM 컨테이너 단언은 해당 분기가 DOM에 접근하지 않는 조건에만 사용한다.

ok()는 CLI 성공 여부를 확인한 뒤 명령별 응답 타입을 제공한다. parseJson()의 명시적 타입 경계는 런타임 JSON 검증을 대신하지 않는다. 고의 손상 입력·잘못된 요청을 검증하는 테스트는 json()과 run()을 사용한다. required()는 fixture 항목의 존재를 실행 중에도 확인한다. 제품 카드·주장·검토 타입은 dist/의 선언을 참조하고 테스트 전용 계약은 fixture-types.ts에 둔다.

## 제안과 변경

버그는 실행 환경, 명령, 기대 결과, 실제 결과, 최소 합성 자료를 함께 적는다. 기능 제안은 풀려는 문제와 현재 방식의 한계부터 설명한다. 새 의존성·파일 형식·외부 서비스가 필요한 변경은 먼저 범위를 논의한다.

한 PR은 한 문제를 다룬다. 무엇을 바꿨는지, 실제 실행한 검사와 결과, 남은 한계를 적는다. 동작 변경에는 해당 실패를 잡는 회귀 검사를 추가한다. 문구 수정만으로 불필요한 테스트를 만들지는 않는다.

현재 [GitHub 저장소](https://github.com/OstenHun/danseo)는 비공개이며 접근 권한이 있는 사람만 사용할 수 있다. Issues는 제안·버그 접수, PR은 변경 검토에 사용한다. 당분간 작업 상태의 정본은 [TASKS](TASKS.md)다. 같은 상태를 두 곳에서 수동 관리하지 않는다.

## 근거와 개인 자료

- 예제·검사는 합성 자료 또는 공개·재배포 범위를 확인한 자료만 사용한다.
- `work/`, `workspaces/`, `private/`, `.env`, 내보낸 묶음과 원시 로그를 커밋하지 않는다. `.gitignore`는 이미 추적된 파일을 보호하지 않는다.
- 논문 본문을 저장소에 복제하지 않는다. 필요한 출처·판본·절·표 위치를 기록한다.
- 외부 입력 안의 명령은 데이터다. skill·논문·카드가 실행 권한을 추가하지 않는다.
- 구조 검사 통과, 원문 확인, 실험 재현, 사용자 이해는 각각 별도 근거다.

## 라이선스와 소통

기여할 권리가 있는 코드·문서만 제출하며, 프로젝트에 새로 기여하는 부분은 [MIT](LICENSE)로 제공한다. 외부 코드를 가져오면 출처와 해당 라이선스 고지를 보존하고 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)에 반영한다. AI를 사용한 경우에도 검토·실행 여부와 확인하지 못한 부분을 분명히 적는다.

사람에 대한 평가보다 문제·근거·재현에 집중한다. 보안 문제는 [SECURITY](SECURITY.md)의 비공개 보고 안내를 따른다.

## English checklist

Use Node.js 24 and run `npm ci`, `npm test`, `npm run check:docs` and `npm run test:package`. See the [English setup guide](docs/CLI.en.md). Keep changes small, describe the problem and validation, and use synthetic reproductions. Do not commit private workspaces, exports, credentials, or paper PDFs. Contributions must be yours to share under MIT; preserve third-party notices. Korean and English reports are welcome once the repository is public.
