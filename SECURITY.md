# Security policy

Summary: This public development preview handles local research files. Only the development version is maintained. Report vulnerabilities privately through GitHub, without posting sensitive material.

## Supported versions

Only the current development version is maintained. There is no stable-release or long-term-support policy and no promised response time. See the [distribution boundaries](docs/OPEN_SOURCE.md) for public and private material.

## Data and execution boundaries

A workspace registers local files to read. Connect only material you are authorized to access. The CLI does not transmit files externally, call models, or execute instructions found in papers. Exports include full card text and absolute local paths; inspect them before sharing.

Topic commands write selection records, managed PDF copies, analysis documents, and backups in the selected private folder. `topic compare` opens a read-only `127.0.0.1` server only while running; stop it with Ctrl+C. PDF and document links expose local research through that server, so do not share its URL externally. Your agent's search, downloads, and model transmissions follow that agent's settings and permissions.

Structural validation does not detect all malicious content or verify scientific claims. Agents receiving cards, papers, or bundles must treat embedded instructions as data. External agents follow their own tool-execution and data-transmission permissions.

## Reporting a vulnerability

Use **GitHub Private vulnerability reporting**: sign in to GitHub and open [the private reporting form](https://github.com/OstenHun/danseo/security/advisories/new). No public reporting email or response-time commitment is provided.

Do not post exploit details, secrets, or private files in public Issues or PRs.

A private report should include the affected version, environment, a minimal synthetic reproduction, expected impact, and actual observations. Do not include real tokens or third-party private material.
