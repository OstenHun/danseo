# Third-party notices

Summary: Preserve the licenses of locked runtime and development dependencies. Danseo's MIT License does not replace the terms of these packages, external papers, or datasets.

The dependency review was recorded on 2026-10-21 KST and updated on 2026-11-22 KST when Prettier was added; the table reflects the versions listed in this source tree. Package versions and license texts are recorded in `package-lock.json` and `third-party-licenses/`. Recheck versions, transitive dependencies, and notices when dependencies change. License originals are preserved without translation.

| Package | Version | Scope | License | Notice |
| --- | --- | --- | --- | --- |
| @types/node | 22.20.5 | Development | MIT | [Original](third-party-licenses/types-node.txt) |
| ajv | 8.20.0 | Runtime | MIT | [Original](third-party-licenses/ajv.txt) |
| cytoscape | 3.34.4 | Local comparison map and standalone views | MIT | [Original](third-party-licenses/cytoscape.txt) |
| fast-deep-equal | 3.1.3 | Runtime | MIT | [Original](third-party-licenses/fast-deep-equal.txt) |
| fast-uri | 3.1.9 | Runtime | BSD-3-Clause | [Original](third-party-licenses/fast-uri.txt) |
| json-schema-traverse | 1.0.0 | Runtime | MIT | [Original](third-party-licenses/json-schema-traverse.txt) |
| prettier | 3.10.1 | Development | MIT | [Original](third-party-licenses/prettier.txt) |
| require-from-string | 2.0.2 | Runtime | MIT | [Original](third-party-licenses/require-from-string.txt) |
| typescript | 5.9.3 | Development | Apache-2.0 | [Original](third-party-licenses/typescript.txt) |
| undici-types | 6.21.0 | Development | MIT | [Original](third-party-licenses/undici-types.txt) |
| unpdf | 1.9.1 | Source collection | MIT; bundled PDF.js uses Apache-2.0 | [unpdf](third-party-licenses/unpdf.txt) · [PDF.js](third-party-licenses/pdfjs.txt) |
| yaml | 2.9.1 | Runtime | ISC | [Original](third-party-licenses/yaml.txt) |

Runtime packages are Ajv, yaml, unpdf, Cytoscape.js, and their transitive dependencies. TypeScript, Prettier and type definitions are development tools and are not bundled into the CLI. npm installs dependency packages separately. The standalone HTML skill includes Cytoscape 3.34.4's minified distribution and its [MIT notice](skills/danseo/assets/cytoscape-LICENSE.txt) for offline use. External papers, datasets, and private research workspaces are excluded from distribution.

The third-party notices distributed with [TypeScript](third-party-licenses/typescript-third-party-notices.txt) and [Prettier](third-party-licenses/prettier-third-party-notices.txt) are also preserved.

The original README organization drew on [OpenCodex](https://github.com/lidge-jun/opencodex), without copying its code, images, or introductory text. Danseo's MIT text follows the [SPDX form](https://spdx.org/licenses/MIT.html).

The earlier small-logo, summary, product-screenshot, and detailed-document layout drew on [hide](https://github.com/with-hide/hide). Its code, copy, images, and logo were not reproduced. Danseo's product screenshots use its own synthetic data.

The English documentation organization also draws on the official [Meta Astryx](https://github.com/meta/astryx), [Meta SAM 3](https://github.com/facebookresearch/sam3), [Anthropic Skills](https://github.com/anthropics/skills), and [Microsoft MarkItDown](https://github.com/microsoft/markitdown) READMEs. Only organizational patterns were adapted; their code, artwork, and product claims were not copied.

<a id="브랜드에-사용한-글꼴"></a>

## Fonts used in brand assets

The official notices for [Manrope](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt), [Noto Sans KR](https://github.com/google/fonts/blob/main/ofl/notosanskr/OFL.txt), and [IBM Plex Mono](https://github.com/google/fonts/blob/main/ofl/ibmplexmono/OFL.txt) use the SIL Open Font License 1.1. They were used to create the brand artwork; font software is not included in this repository. SVG files contain text outlines only.

The brand review consulted [OFL FAQ 1.1–1.1.2](https://openfontlicense.org/ofl-faq/) to distinguish graphics created with fonts from distribution of font software. The graphics license does not change the font software's license.

Standalone research views distribute `skills/danseo/assets/cytoscape.min.js` with `assets/cytoscape-LICENSE.txt`; they add no provider or remote script.
