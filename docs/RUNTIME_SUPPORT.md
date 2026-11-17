# Runtime support

Summary: Support Node 22 and 24 LTS, recommend Node 24 for development, and treat Node 26 as an early compatibility check. Support metadata, CI configuration and actual executions are separate evidence.

This policy describes current operating rules. Detailed execution records stay local. Check relevant official releases when changing support; this translation changes no runtime or CI configuration.

<a id="ci-실행-범위와-패치-기준"></a>

<a id="현재-기준"></a>

<a id="선택-이유와-node-18"></a>

<a id="검사와-실제-근거"></a>

<a id="업데이트와-지원-변경"></a>

<a id="ptp-012-비교-화면의-실행-근거"></a>

<a id="비교-프런트-typescript-전환-검사"></a>

<a id="공통-helper분석비교-테스트-typescript-전환--2026-11-12"></a>

<a id="남은-테스트도구-typescript-전환--2026-11-12"></a>

<a id="독립-관계-html-근거-검사--2026-11-15"></a>

## Supported versions

| Category | Policy | Meaning |
| --- | --- | --- |
| Supported | Node 22.x / 24.x LTS | Use current security/bugfix patches; engines is `^22.0.0 \|\| ^24.0.0` |
| Recommended development | Node 24 | `.node-version` records 24; automatic adoption depends on the version manager |
| Early compatibility | Node 26 | A passing experiment does not promote it to supported/recommended |
| Outside declared support | Node 18, 20 and other undeclared series | This does not prove all execution is impossible |

`engines` is metadata and npm may only warn; the CLI does not claim to reject every unsupported runtime. Testing selected patches does not verify every patch in a series. Node types use the 22 series to reduce accidental higher-version API use; type checks do not replace execution.

The user selected minimum 22/recommended 24 after considering Node 18. Revisit 18 only for actual demand with exact environment, owner and exit conditions; successful tests do not provide upstream security maintenance. [Official schedule](https://github.com/nodejs/Release/blob/main/schedule.json) · [EOL policy](https://nodejs.org/en/about/eol).

Danseo's runtime is separate from the target project's runtime: Node 24 can read records about a Node 18 project. Danseo does not change global PATH/Node or target-project settings. Revisit packaging alternatives only when actual installation constraints require them.

## CI execution scope and patch floors

Automatic CI runs one Ubuntu/Node 24 PR job, with no push trigger; newer commits cancel older runs for that PR. Documentation-only changes run installation, tool type checks and documentation links/summaries. The authoritative path allowlist is [scripts/ci-scope.ts](../scripts/ci-scope.ts); both PR changes and merged-result paths are checked. Code/configuration/skill/unknown paths or failed change-list inspection require full regression, synthetic examples and installed-tarball checks. README.ko.md currently takes the safe full-check route.

Use Actions **Run workflow** for Ubuntu/Windows/macOS and Node 22/24/26 when needed. Manual runs always perform full checks, including documentation changes, and do not cancel other manual runs. Controls require the workflow on the default branch. Node 26 failures are recorded even though it is a pre-support probe. This does not end Node 22 support or prove every OS combination on every PR.

Current CI patch floors are 22.23.4 and 24.22.1; it selects the latest available patch in each selected series and logs the actual version. [Official distribution list](https://nodejs.org/dist/index.json). No fresh release/security audit is implied by this translation.

Full checks register PDFs through Unicode/space-containing paths and reopen in new processes to compare path/hash/copy counts. CI does not test native macOS app folder-permission dialogs.

## Verification and actual evidence

Use the current PR Checks and [PR workflow runs](https://github.com/OstenHun/danseo/actions/workflows/ci.yml?query=event%3Apull_request), alongside [distribution boundaries](OPEN_SOURCE.md). Old main runs support only their old source. Keep exact execution versions and logs in local work records or the relevant PR Checks; they are not first-use prerequisites.

The current suite covers file/reference structure, raw content, project separation, errors, no-overwrite, source selection/resumption/review currentness, browser contracts and installed assets/PDFs. `npm run test:package` builds a tarball and tests an isolated consumer. Build and test tools compile with existing strict TypeScript into `build-tools/` and `build/`; installed code runs `dist/`. Browser classic scripts and third-party Cytoscape are expected generated/vendor outputs. See [development contracts](../CONTRIBUTING.md#editing-shared-test-fixtures).

Separate GitHub runner checks from all Linux distributions, native permission UX, screen readers, user comprehension and usefulness. Preserve skipped symlink branches explicitly. Local downloaded Node ZIPs, when used, are hash-checked and unpacked without replacing global runtimes.

The [first-install research-view checks](OPEN_SOURCE.md#first-install-research-views) used Windows/Node 24.22.3, complete copied skills and fresh subscription Claude Sonnet/medium sessions (observed `claude-sonnet-5-5`). Structure, verified generation and malformed-draft repair ran as actual agent commands. English/Korean model-written output and representative graph/evidence states were read in desktop Chrome at 1280×800 and 1440×900. The published standalone path has status/type filters and map/list selection; it does not contain the separate local native app's text search or history interface. These observations do not extend CI support to untested hosts, automatic discovery or all browser states.

### Named-paper orientation observations

On Windows with Node 24.22.3, fresh project copies were exercised through Codex CLI 0.163.0 (requested `gpt-6.1-sol`/high) and Claude Code 2.1.325 (Sonnet/medium; observed `claude-sonnet-5-5`). English and Korean requests only named the focal paper; they supplied neither skill names, paper lists nor prepared summaries. Both hosts selected the installed skill and generated prior/follow-up neighborhoods with separate concept backgrounds:

| Native host | Request language | Papers | Relations | Concept backgrounds |
| --- | --- | --- | --- | --- |
| Codex | English | 7 | 9 | 3 |
| Codex | Korean | 6 | 7 | 2 |
| Claude | English | 11 | 13 | 3 |
| Claude | Korean | 8 | 11 | 2 |

These are finite behavior samples, not required counts or exhaustive literature coverage. Existing subscription logins were reused; this was not a new physical PC, new global user account or desktop-app installation. Actual discovery/tool records and unchanged model-authored inputs were checked locally. Final views are regenerated through the verified generator; a bare paper-map URL selects its registered focal Paper without stealing keyboard focus, while explicit overview/deep links retain their meaning. Newly created Papers remained draft; original-source access and current citation checks were kept separate. The [original-source gate](../skills/danseo/references/evidence-gate.md#original-source-checks) rejects missing or stale original archives without certifying source meaning, publisher authenticity or reader understanding. Raw model logs and downloaded originals are not distributed.

Desktop checks sample the four maps at 1280×800 and 1440×900 rather than every record or gesture. Graphs preserve an interacted camera when resized; use Fit all to reframe clipped cards. Current standalone Paper nodes show the source-linked first-publication year, or Publication year unknown when metadata is absent. Details retain the recorded date precision and selected edition date; a year in a title is not a substitute for publication metadata.

## Updating support

1. Review security/bugfix patches first and test them. Pin dependencies through the lockfile and use `npm ci`; do not blindly upgrade every major.
2. Probe new Node series before adoption. Verify LTS transition, dependencies, installation and OS support, then update engines/CI/docs/development defaults together. A larger version number or one passing test is insufficient.
3. Announce approaching series EOL in release notes. Treat removal as a user-impacting change; prefer a major release once stable. Even in this preview, document the change and migration target.
4. If a dependency/API raises the floor, compare maintenance cost with needed behavior and check actual consumer transitions. Never claim untested support.

Check [official status](https://nodejs.org/en/about/previous-releases) and [schedule](https://github.com/nodejs/Release/blob/main/schedule.json) when revisiting policy. This document configures no monitoring, scheduled updates or global runtime replacement.
