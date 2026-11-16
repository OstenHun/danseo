# Brand assets

Summary: Danseo's mark combines a folded paper and terminal prompt. Use the included SVG/PNG assets and preserve their colors, proportions and attribution.

These assets can be used directly from the repository. The maintainer keeps the editable Figma source separately; access to it is not required.

## Design direction

The product name is **Danseo (단서)**. The package, CLI, and research skill identifier is `danseo`. Danseo means ‘clue’ in Korean. Name or trademark exclusivity is not established.

The mark represents a developer tool for connecting research with project decisions. A folded paper contains `>_`; an orange path connects evidence to a project. The artwork is not an app screenshot or an experimental result.

| Role | Value |
| --- | --- |
| Ink — background or primary text | `#18221F` |
| Paper — light background or primary text | `#F4F6F1` |
| Orange — connections and emphasis | `#F58A4B` |
| Secondary text on dark banners | `#AAB5AD` |
| Secondary text on light banners | `#43584A` |
| English title | Manrope ExtraBold |
| English supporting text | Manrope Medium |
| Korean text | Noto Sans KR Medium |
| CLI description | IBM Plex Mono Medium |

Use orange for paths and emphasis, not small body text. These colors and fonts describe the brand draft; they do not establish the web app's design system.

## Files and uses

Every asset has SVG and PNG versions. Text in the editable Figma source remains editable; text in the distributed SVGs is outlined to avoid installed-font differences. The assets contain no font files, external images, or scripts.

| File | Size | Use |
| --- | --- | --- |
| [banner-dark.svg](banner-dark.svg) · [PNG](banner-dark.png) | 1600 × 640 | Dark README |
| [banner-light.svg](banner-light.svg) · [PNG](banner-light.png) | 1600 × 640 | Light README and fallback |
| [banner-compact-dark.svg](banner-compact-dark.svg) · [PNG](banner-compact-dark.png) | 800 × 640 | Narrow dark README |
| [banner-compact-light.svg](banner-compact-light.svg) · [PNG](banner-compact-light.png) | 800 × 640 | Narrow light README |
| [icon.svg](icon.svg) · [PNG](icon.png) | 512 × 512 | Square project icon |
| [social-preview.svg](social-preview.svg) · [PNG](social-preview.png) | 1280 × 640 | GitHub social-preview upload |

The README's `<picture>` selects a banner by viewport width and color scheme. Renderers without that support use the regular light banner. The social-preview PNG can be uploaded through GitHub repository settings. Preparing files is separate from changing the repository settings or account avatar.

## Editing and exporting

Edit text and vectors in the relevant Figma frame, then export SVG and PNG at the listed dimensions. Outline SVG text and export PNG at 1×. Recheck regular and compact banners in both color schemes after changes. Break Korean text at word or phrase boundaries, avoiding isolated syllables or particles.

The logo is an original vector design. OpenCodex logos, images, and copy were not reproduced. Graphics use the repository's [MIT License](../../LICENSE). See [font and artwork notices](../../THIRD_PARTY_NOTICES.md#fonts-used-in-brand-assets). Name or trademark exclusivity has not been established.
