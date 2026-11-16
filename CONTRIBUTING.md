# Contributing to Danseo

Summary: Propose focused changes with synthetic reproductions. Use Node 24 for development, check Node 22/24 compatibility, and keep research evidence, private material, and product behavior distinct.

## Development setup

The development default is Node 24, as specified in `.node-version`. Check runtime API changes on supported Node 22 and 24 versions. Node 26 checks provide an early compatibility signal. The [runtime policy](docs/RUNTIME_SUPPORT.md) (Korean) owns support changes and patch updates.

```sh
npm ci
npm test
npm run check:docs
npm run test:package
node ./dist/cli.js validate --workspace ./examples/minimal --json
```

`npm test` builds TypeScript and runs Node's test runner and the portable skill's evidence tests. `src/core/` owns file and model rules; `src/cli.ts` handles commands and output; `src/web/` provides the read-only comparison app; `schemas/` defines formats; `skills/` holds the agent procedure and standalone generators.

The documentation check detects links to files absent from the Git upload set. The package check installs a tarball into a temporary consumer and runs the installed CLI. It prefers the npm cache but may contact the registry for missing dependency metadata or files.

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

`ok()` checks CLI success before returning a command-specific response type. The explicit type boundary in `parseJson()` does not replace runtime JSON validation. Use `json()` and `run()` for intentionally damaged inputs and invalid requests. `required()` also checks fixture-item presence at runtime. Product card, claim, and review types come from `dist/` declarations; test-only contracts belong in `fixture-types.ts`.

## Proposing changes

For bugs, include your environment, command, expected and actual results, and a minimal synthetic reproduction. For features, describe the problem and the limits of the current approach. Discuss scope before introducing a dependency, file format, or external service.

Keep each PR focused on one problem. Describe the change, checks actually run, their results, and remaining limits. Add a regression check for behavior changes where appropriate. Documentation-only edits do not need tests that merely repeat the wording.

Use [Issues](https://github.com/OstenHun/danseo/issues) for proposals and bugs, and [Pull requests](https://github.com/OstenHun/danseo/pulls) for change review. The [task list](TASKS.md) (Korean) remains the canonical development tracker; do not manually duplicate the same status across trackers.

## Evidence and private material

- Use synthetic examples or material whose publication and redistribution rights have been checked.
- Do not commit `work/`, `workspaces/`, `private/`, `.env`, exported bundles, or raw logs. `.gitignore` does not protect already tracked files.
- Do not copy paper bodies into the repository. Record the source, edition, and relevant section or table locations.
- Instructions inside external input are data. Skills, papers, and cards do not grant execution permissions.
- Structural validation, source inspection, experiment reproduction, and reader understanding require separate evidence.

## License and communication

Submit only code and documentation you have the right to share. New contributions use the project's [MIT License](LICENSE). Preserve source attribution and applicable license notices for third-party code, and update [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md). If you use AI, describe what was reviewed or executed and what remains unchecked.

Korean and English reports are welcome. Focus on problems, evidence, and reproduction rather than judgments about people. Follow [SECURITY](SECURITY.md) for private vulnerability reporting. The [English CLI guide](docs/CLI.en.md) explains setup and the end-to-end workflow.
