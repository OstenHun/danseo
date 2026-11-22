import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runNode } from './helpers/run-node.js';

test('a child that exits returns its status and output, including a failing status', () => {
  const passed = runNode(['-e', 'process.stdout.write("done")']);
  assert.equal(passed.status, 0);
  assert.equal(passed.stdout, 'done');

  const failed = runNode(['-e', 'process.stderr.write("refused"); process.exit(3)']);
  assert.equal(failed.status, 3);
  assert.equal(failed.stderr, 'refused');
});

test('a child that cannot start fails with the cause instead of a null status', (t) => {
  const runtime = process.execPath;
  t.after(() => {
    process.execPath = runtime;
  });
  process.execPath = join(tmpdir(), 'danseo-missing-runtime');

  assert.throws(
    () => runNode(['-e', '']),
    /Child process did not exit normally \(ENOENT: .+\): node -e /,
  );
});
