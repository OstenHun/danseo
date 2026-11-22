import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

/**
 * Runs a Node script with the current runtime and returns its result.
 *
 * A child that produced no exit code never ran to completion: it failed to
 * start or was killed. Its `stderr` is then empty, so an assertion on `status`
 * would hide the cause, and `assert.notEqual(status, 0)` would pass by accident.
 * Fail here instead and name the cause.
 */
export function runNode(args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (result.error || result.status === null) {
    const cause = result.error
      ? `${(result.error as NodeJS.ErrnoException).code ?? 'error'}: ${result.error.message}`
      : `killed by ${result.signal ?? 'an unknown signal'}`;
    throw new Error(`Child process did not exit normally (${cause}): node ${args.join(' ')}`, {
      cause: result.error,
    });
  }
  return result;
}
