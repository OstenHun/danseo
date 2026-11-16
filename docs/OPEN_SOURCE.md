# Distribution and private-data boundaries

Summary: Distribute the Danseo source, portable skill and synthetic examples. Keep private papers, workspaces, raw logs and internal development records local; inspect exported content before sharing.

## What belongs in the repository

- Product source, schemas, build/test tools and public usage documentation.
- The complete portable `skills/danseo` folder and its bundled generators/assets.
- Synthetic fixtures, examples and an evaluation plan with no private answer keys.
- License, dependency attribution, contribution and security guidance.

Use [source installation](../README.md#install-the-skill). The package is marked `private: true`; do not replace these instructions with an unrelated npm package of the same name. The npm `files` allowlist controls tarball contents; verify the actual archive with `npm run test:package`.

## What stays local

Private PDFs, research records, learner responses, absolute-path handoffs, credentials, raw provider/browser logs, review packets and dated implementation notes belong outside distributed source. `work/`, `workspaces/` and `private/` are local-only ignored areas. Do not copy another project's authoritative records into this repository.

Git ignore rules do not remove already tracked content. Inspect files and package contents before publishing. Changing current documents does not erase prior Git commits; history removal is a separate action.

## Sharing research output

Exports may contain full card text and absolute paths. Inspect them before sharing and verify source permissions. A public paper URL does not automatically grant rights to redistribute its PDF. Distinguish synthetic demonstrations from actual paper results and source checking from reproduction or understanding.

Keep author claims, AI interpretations, project observations and adoption decisions distinct. The [skill](../skills/danseo/SKILL.md) owns source procedures; [runtime support](RUNTIME_SUPPORT.md) and [contribution checks](../CONTRIBUTING.md) describe supported execution and verification.

## Reports and contributions

Use [CONTRIBUTING](../CONTRIBUTING.md) for reproducible synthetic reports and [SECURITY](../SECURITY.md) for private vulnerability reporting. Do not attach private originals or raw model logs to public issues.
