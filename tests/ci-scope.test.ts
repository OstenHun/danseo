import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';

const classifier = resolve('build-tools/ci-scope.js');

test('CI scope uses real PR diffs and falls back to full checks', () => {
  const folder = mkdtempSync(join(tmpdir(), 'danseo-ci-'));
  const output = join(folder, '.git', 'step-output');
  function git(...args: string[]): string {
    return execFileSync('git', args, { cwd: folder, encoding: 'utf8' }).trim();
  }
  function write(path: string): void {
    const target = join(folder, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'fixture\n');
  }
  function commit(): string {
    git('add', '-A');
    git(
      '-c',
      'user.name=CI test',
      '-c',
      'user.email=ci@example.invalid',
      'commit',
      '-qm',
      'fixture',
    );
    return git('rev-parse', 'HEAD');
  }
  function classify(
    base: string,
    head: string,
    event = 'pull_request',
    cwd = folder,
    merge = head,
  ): string {
    writeFileSync(output, '');
    const result = execFileSync(process.execPath, [classifier], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        DANSEO_CI_EVENT: event,
        DANSEO_CI_BASE: base,
        DANSEO_CI_HEAD: head,
        DANSEO_CI_MERGE: merge,
        GITHUB_OUTPUT: output,
      },
    });
    assert.equal(readFileSync(output, 'utf8'), result);
    return result.trim();
  }
  try {
    git('init', '-q');
    write('src/main.ts');
    write('docs/old.md');
    write('docs/rules.md');
    const base = commit();
    const changes: Array<[string[], 'docs' | 'full']> = [
      [['README.md', 'README.en.md', 'docs/한글 안내.md', 'assets/readme/demo.jpg'], 'docs'],
      [['src/new.ts'], 'full'],
      [['README.md', 'package.json'], 'full'],
      [['skills/danseo/SKILL.md'], 'full'],
      [['AGENTS.md'], 'full'],
      [['other.md'], 'full'],
    ];
    for (const [paths, expected] of changes) {
      git('reset', '--hard', base);
      for (const path of paths) write(path);
      assert.equal(classify(base, commit()), `scope=${expected}`, paths.join(', '));
    }
    git('reset', '--hard', base);
    git('mv', 'src/main.ts', 'docs/moved.md');
    assert.equal(classify(base, commit()), 'scope=full', 'code renamed into docs');
    git('reset', '--hard', base);
    git('rm', 'src/main.ts');
    assert.equal(classify(base, commit()), 'scope=full', 'code deletion');
    git('reset', '--hard', base);
    git('rm', 'docs/old.md');
    const docsHead = commit();
    assert.equal(classify(base, docsHead), 'scope=docs', 'docs deletion');
    assert.equal(classify(base, docsHead, 'workflow_dispatch'), 'scope=full', 'manual always full');
    assert.equal(classify(base, base), 'scope=full', 'empty diff');
    assert.equal(classify('', docsHead), 'scope=full', 'missing SHA');
    assert.equal(classify('--help', docsHead), 'scope=full', 'invalid SHA');
    assert.equal(classify('0'.repeat(40), docsHead), 'scope=full', 'missing commit');
    assert.equal(
      classify(base, docsHead, 'pull_request', folder, ''),
      'scope=full',
      'missing merge SHA',
    );
    const nonRepo = join(folder, 'no-repo');
    mkdirSync(nonRepo);
    // An invalid gitdir prevents discovery of the parent fixture repository.
    writeFileSync(join(nonRepo, '.git'), 'gitdir: missing\n');
    assert.equal(classify(base, docsHead, 'pull_request', nonRepo), 'scope=full');
    git('reset', '--hard', base);
    git('switch', '-qc', 'feature');
    writeFileSync(join(folder, 'docs/rules.md'), 'updated rules\n');
    const featureHead = commit();
    git('switch', '-qc', 'base-advance', base);
    mkdirSync(join(folder, 'skills/danseo/references'), { recursive: true });
    git('mv', 'docs/rules.md', 'skills/danseo/references/rules.md');
    const advancedBase = commit();
    git(
      '-c',
      'user.name=CI test',
      '-c',
      'user.email=ci@example.invalid',
      'merge',
      '-qm',
      'merge fixture',
      featureHead,
    );
    const merged = git('rev-parse', 'HEAD');
    assert.equal(git('diff', '--name-only', `${advancedBase}...${featureHead}`), 'docs/rules.md');
    assert.equal(
      git('diff', '--name-only', advancedBase, merged),
      'skills/danseo/references/rules.md',
    );
    assert.equal(
      classify(advancedBase, featureHead, 'pull_request', folder, merged),
      'scope=full',
      'base renamed an edited document into a runtime skill',
    );
    git('switch', '-qc', 'base-code', base);
    write('src/base-only.ts');
    const codeBase = commit();
    git(
      '-c',
      'user.name=CI test',
      '-c',
      'user.email=ci@example.invalid',
      'merge',
      '-qm',
      'merge fixture',
      featureHead,
    );
    assert.equal(
      classify(codeBase, featureHead, 'pull_request', folder, git('rev-parse', 'HEAD')),
      'scope=docs',
      'unrelated code already on the base is not part of this PR',
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('workflow runs one PR job with explicit manual compatibility choices', () => {
  const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.os.options, [
    'ubuntu-latest',
    'windows-latest',
    'macos-latest',
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.node.options, ['22', '24', '26']);
  assert.match(workflow.concurrency.group, /pull_request.number \|\| github.run_id/);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.deepEqual(Object.keys(workflow.jobs), ['test']);
  const job = workflow.jobs.test;
  assert.equal(job.strategy, undefined);
  assert.match(job['runs-on'], /inputs.os \|\| 'ubuntu-latest'/);
  assert.match(job.env.DANSEO_NODE, /inputs.node \|\| '24'/);
  const docs = job.steps.find((step: { run?: string }) => step.run === 'npm run check:docs');
  assert.ok(docs);
  assert.equal(docs.if, undefined);
  for (const run of [
    'npm test',
    'node dist/cli.js validate --workspace examples/minimal --json',
    'npm run test:package',
  ]) {
    assert.equal(
      job.steps.find((step: { run?: string }) => step.run === run)?.if,
      "steps.scope.outputs.scope != 'docs'",
      run,
    );
  }
});
