# 외부 의존성 고지

요약: lockfile에 고정된 런타임·개발 의존성의 라이선스와 원문을 보존한다. 프로젝트의 MIT는 이들 패키지나 외부 논문·데이터의 라이선스를 대체하지 않는다.

확인: 2026-10-21 KST. 아래 버전은 package-lock.json과 설치된 package.json·LICENSE를 대조했다. 설치된 패키지의 라이선스 원문을 변경 없이 third-party-licenses에 복사했다. 의존성을 바꾸면 버전·전이 의존성과 고지도 다시 확인한다.

| 패키지 | 버전 | 범위 | 라이선스 | 고지 |
| --- | --- | --- | --- | --- |
| @types/node | 22.20.5 | 개발 | MIT | [원문](third-party-licenses/types-node.txt) |
| ajv | 8.20.0 | 런타임 | MIT | [원문](third-party-licenses/ajv.txt) |
| cytoscape | 3.34.4 | 로컬 비교 지도 | MIT | [원문](third-party-licenses/cytoscape.txt) |
| fast-deep-equal | 3.1.3 | 런타임 | MIT | [원문](third-party-licenses/fast-deep-equal.txt) |
| fast-uri | 3.1.9 | 런타임 | BSD-3-Clause | [원문](third-party-licenses/fast-uri.txt) |
| json-schema-traverse | 1.0.0 | 런타임 | MIT | [원문](third-party-licenses/json-schema-traverse.txt) |
| require-from-string | 2.0.2 | 런타임 | MIT | [원문](third-party-licenses/require-from-string.txt) |
| typescript | 5.9.3 | 개발 | Apache-2.0 | [원문](third-party-licenses/typescript.txt) |
| undici-types | 6.21.0 | 개발 | MIT | [원문](third-party-licenses/undici-types.txt) |
| unpdf | 1.9.1 | 원문 수집 | MIT, 내장 PDF.js는 Apache-2.0 | [unpdf](third-party-licenses/unpdf.txt) · [PDF.js](third-party-licenses/pdfjs.txt) |
| yaml | 2.9.1 | 런타임 | ISC | [원문](third-party-licenses/yaml.txt) |

런타임 패키지는 Ajv·yaml·unpdf·Cytoscape와 전이 의존성이다. TypeScript와 타입 정의는 개발 도구이며 CLI에 번들하지 않는다. npm은 각 의존성 패키지를 별도로 설치한다. 독립 HTML skill에는 오프라인 실행을 위해 Cytoscape 3.34.4의 minified 배포본과 [MIT 원문](skills/danseo/assets/cytoscape-LICENSE.txt)을 함께 포함한다. 외부 논문·데이터·로컬 연구 workspace는 이 저장소의 배포물에 포함하지 않는다.

TypeScript가 함께 제공하는 [제삼자 고지 원문](third-party-licenses/typescript-third-party-notices.txt)도 보존했다.

README 구성은 [OpenCodex](https://github.com/lidge-jun/opencodex)를 참고했으며 코드·이미지·소개 문구를 복제하지 않았다. 프로젝트 MIT 원문은 [SPDX](https://spdx.org/licenses/MIT.html) 형식에 따른다.

README의 작은 로고·요약·실행 화면·상세 문서 배치는 [hide](https://github.com/with-hide/hide)의 구성을 참고했다. hide의 코드·문구·이미지·로고는 복제하지 않았다. Danseo의 화면 이미지는 합성 데이터로 실행한 자체 제품의 캡처다.

## 브랜드에 사용한 글꼴

[Manrope](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt), [Noto Sans KR](https://github.com/google/fonts/blob/main/ofl/notosanskr/OFL.txt), [IBM Plex Mono](https://github.com/google/fonts/blob/main/ofl/ibmplexmono/OFL.txt)의 공식 고지는 SIL Open Font License 1.1이다. 브랜드 제작에 사용했으며 폰트 소프트웨어 자체는 이 저장소에 포함하지 않는다. SVG에는 해당 문구의 윤곽선만 들어 있다.

폰트로 만든 로고·그래픽과 폰트 소프트웨어의 배포를 구분하는 [OFL FAQ 1.1–1.1.2](https://openfontlicense.org/ofl-faq/)를 확인했다. 프로젝트의 그래픽 라이선스가 폰트 소프트웨어의 라이선스를 바꾸지 않는다.
