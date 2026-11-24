# Contributing to Danseo

Summary: Report a bug, propose an improvement, or make your first pull request. Use public or synthetic examples, keep changes focused, and share the checks you ran.

## Report a bug or suggest a feature

Search [existing issues](https://github.com/OstenHun/danseo/issues) for the same problem. If you find one, add any new steps or environment details there. Otherwise, [open an issue](https://github.com/OstenHun/danseo/issues/new/choose) and choose a template. Please open one issue per bug or feature request. Write the title and body in English.

- **Bug report:** Name the workflow and what failed. An example title is `Standalone skill: no HTML file after generating a graph`. Include your environment, the steps or command, and what you expected and observed.
- **Feature request:** Describe what you were trying to do, where the current workflow gets in the way, and what result would help. Discuss the scope in an issue before adding a dependency, file format, or external service.

To identify the source version, run `git rev-parse --short HEAD` in the Danseo checkout, or give the branch and download date of your source ZIP if known. For a standalone skill bug, include your agent and how you installed the skill.

Use a small synthetic example when possible. If the bug only happens with private material, share the steps and a redacted error message instead. Use the [security policy](SECURITY.md) for private vulnerability reporting.

## Make your first contribution

Browse the open [good first issues](https://github.com/OstenHun/danseo/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22). If the list is empty, a small documentation fix, a synthetic example, or a report from another environment is welcome.

1. Fork Danseo, clone your fork, and create a branch for one change.
2. Make the change and run the relevant checks. For a documentation-only change, start with `npm ci`, `npm run check:docs` and `npm run check:language`. For a behavior change, run the relevant tests and add a regression check where appropriate.
3. Push the branch to your fork and open a pull request against `OstenHun/danseo:main`. Link the related issue if there is one. Explain why the change helps, which checks you ran, and which checks remain.

## Development setup

The development default is Node 24, as specified in `.node-version`. Check runtime API changes on supported Node 22 and 24 versions. Node 26 checks provide an early compatibility signal. See the [runtime policy](docs/RUNTIME_SUPPORT.md) for supported versions and patch updates, and the [roadmap](TASKS.md) for project scope.

```sh
npm ci
npm run check:format
npm run lint
npm test
npm run check:docs
npm run check:language
npm run test:package
node ./dist/cli.js validate --workspace ./examples/minimal --json
```

`npm test` builds TypeScript and runs Node's test runner and the portable skill's evidence tests. `src/core/` owns file and model rules; `src/cli.ts` handles commands and output; `src/web/` provides the read-only comparison app; `schemas/` defines formats; `skills/` holds the agent procedure and standalone generators.

The portable skill's generators and inline browser assets are JavaScript so a complete skill folder runs with Node without a TypeScript build or npm installation. The CLI and native comparison app keep their TypeScript build. When changing shared portable files, keep the Danseo and Reading copies identical and run `npm run test:research-evidence` as well as relevant product checks.

The documentation check detects links to files absent from the Git upload set. The package check installs a tarball into a temporary consumer and runs the installed CLI. It prefers the npm cache but may contact the registry for missing dependency metadata or files.

## Code style

Prettier owns the layout of JavaScript and TypeScript. Run `npm run format` before you commit; CI runs `npm run check:format`. `.prettierrc.json` sets single quotes, a 100-column print width and existing line endings, and keeps every other Prettier default. Markdown, JSON, YAML, CSS and HTML are not formatted yet, so keep their current layout.

A formatter breaks long lines; it does not make dense code clear. In new and changed code:

- Write for the next reader. A lower line count is not a goal, so do not pack several steps into one expression.
- Choose names that say what a value holds. Keep one-letter names for short callbacks and loop indexes.
- Give each function one job. Split it when you need "and" to describe it.
- Name a long regular expression or condition, and comment why the rule exists rather than what the code does.
- Build long HTML or message templates from named parts.
- Keep cleanup apart from behavior changes. Put a rename or restructuring in its own commit so a reviewer can confirm that nothing else changed.

ESLint checks the JavaScript (`.js`, `.mjs`) and TypeScript (`.ts`) files with `eslint.config.js`; run `npm run lint`, and CI runs it too. Rules that find likely mistakes (`@eslint/js` and `typescript-eslint` recommended sets) are errors and fail CI. Rules that point at code a reader will struggle with are warnings and do not fail CI:

- `max-lines-per-function`: a function longer than 60 lines, not counting blank lines and comments. Test files are exempt because long setup is mostly data.
- `complexity`: more than 15 independent paths through a function.
- `max-depth`: blocks nested more than 4 deep.
- `id-length`: variable and parameter names of one character, except `i`, `j`, `k`, `a`, `b`, `t` and `_`.
- `no-nested-ternary`: a conditional expression inside another one.

A warning is not a bug. In new and changed code, leave no new warning unless splitting the code would make it harder to follow; say why in the pull request. Prettier already owns layout, so the linter has no formatting rules. On the Node 22 line, ESLint 10 needs 22.13 or later (Node 24 also works); this applies to contributors only, not to the CLI or the skills.

Some older files are still dense. Clean up a file when you change it; a repository-wide rewrite is not expected. Files that have already been cleaned up are listed near the end of `eslint.config.js`. In those files the readability rules are errors and fail CI, so a new warning there must be fixed before merging unless the length exception below applies.

The one exception is function length. Split a function by job, not to meet a line count. In a cleaned-up file, when splitting a function would make its flow harder to follow, for example when several steps share state that the pieces would have to pass around, keep it whole and put this comment on the line above it:

```js
// eslint-disable-next-line max-lines-per-function -- <why splitting would make it harder to follow>
```

The exception covers that one function and only the length rule. Explain it in the pull request as well. The other readability rules still apply to the function. In files where the rules are still warnings, no comment is needed; the reason in the pull request is enough.

<a id="공통-테스트-fixture-수정"></a>

## Editing shared test fixtures

Test bodies, shared helpers, and development tools are written in TypeScript. The existing compiler checks them with `strict`, `noUncheckedIndexedAccess`, and `noEmitOnError`; Node 22/24 executes the emitted JavaScript with `node:test`. Do not add a runner or rely on Node's native type stripping.

```sh
npm run build:tools
npm run check:tests
npm test
npm run test:package
npm run check:docs
```

- `build:tools` compiles independent tools from `scripts/` into `build-tools/`. Both `build` and `check:docs` invoke it first, including on a checkout without generated output.
- `build` compiles tools, product JavaScript and declarations, then checks the browser code and generates classic scripts and assets. Browser JavaScript and the Cytoscape distribution are required generated or third-party outputs.
- `check:tests` builds the product, then type-checks test bodies and `tests/package-smoke.ts` without emitting. `build:tests` builds the product, removes the old `build/` output, then checks and emits tests. `npm test` executes only `build/*.test.js`, avoiding duplicate execution of old sources.
- `test:package` runs `build:tests`, then `build/package-smoke.js` to install and check a tarball. PDF helpers come from the same test build. Preserve the relative directory depth of `tests/` and `build/`, and of `scripts/` and `build-tools/`, so checks read actual `dist/` outputs and assets.

`build/` and `build-tools/` are development outputs excluded from distribution. Source development requires `npm ci` with development dependencies. The installed CLI runs the included `dist/` and does not depend on the compiler or test outputs.

`fixture-types.test.ts` and `frontend.test.ts` compare valid consumer calls with invalid arguments, commands, fields, and selections. VM checks connect external execution results to the `MapAPI` contract and verify API presence. The empty-DOM-container assertion in the no-Cytoscape fallback test applies only while that branch does not access the DOM.

`ok()` checks CLI success before returning a command-specific response type. The explicit type boundary in `parseJson()` does not replace runtime JSON validation. Use `json()` and `run()` for intentionally damaged inputs and invalid requests. Start child processes through `runNode()` in `tests/helpers/run-node.ts`: it throws with the cause when a child fails to start or is killed, so a missing exit code cannot hide behind an empty `stderr` or satisfy a negative assertion. `required()` also checks fixture-item presence at runtime. Product card, claim, and review types come from `dist/` declarations; test-only contracts belong in `fixture-types.ts`.

## Evidence and private material

- Use synthetic examples or material whose publication and redistribution rights have been checked.
- Do not commit `work/`, `workspaces/`, `private/`, `.env`, exported bundles, or raw logs. `.gitignore` does not protect already tracked files.
- Do not copy paper bodies into the repository. Record the source, edition, and relevant section or table locations.
- Instructions inside external input are data. Skills, papers, and cards do not grant execution permissions.
- Structural validation, source inspection, experiment reproduction, and reader understanding require separate evidence.

## License and communication

Submit only code and documentation you have the right to share. New contributions use the project's [MIT License](LICENSE). Preserve source attribution and applicable license notices for third-party code, and update [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). If you use AI, describe what was reviewed or executed and what remains unchecked.

Write the titles and descriptions of public pull requests and issues in English so contributors can follow the discussion. Repository content is English-first too; see the [language rule](AGENTS.md#language) for the Korean that may remain. Keep feedback respectful and focus on the problem, evidence, and steps to reproduce it. Follow [SECURITY](SECURITY.md) for private vulnerability reporting. The [English CLI guide](docs/CLI.en.md) explains setup and the end-to-end workflow.
