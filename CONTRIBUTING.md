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
