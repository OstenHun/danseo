import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const rootDocs = new Set([
  'README.md',
  'README.en.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'TASKS.md',
  'LICENSE',
]);

function isDocumentation(path: string): boolean {
  return (
    rootDocs.has(path) ||
    /^docs\/.+\.md$/.test(path) ||
    /^assets\/(brand|readme)\/.+\.(svg|png|jpg|jpeg|webp|gif)$/.test(path)
  );
}

function selectScope(): 'docs' | 'full' {
  const {
    DANSEO_CI_EVENT: event,
    DANSEO_CI_BASE: base,
    DANSEO_CI_HEAD: head,
    DANSEO_CI_MERGE: merge,
  } = process.env;
  if (
    event !== 'pull_request' ||
    !base ||
    !head ||
    !merge ||
    ![base, head, merge].every((sha) => /^[a-f0-9]{40}$/.test(sha))
  ) {
    return 'full';
  }

  try {
    // Disabling renames exposes both paths, so moving code into docs cannot hide it.
    // Also inspect the effective merge: the base may have moved a document into a skill.
    const changes = [[`${base}...${head}`], [base, merge]].map((revisions) => {
      const changed = execFileSync(
        'git',
        ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', ...revisions],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      return changed.split('\0').filter(Boolean);
    });
    return changes.every((paths) => paths.length > 0 && paths.every(isDocumentation))
      ? 'docs'
      : 'full';
  } catch {
    // Missing history or an unreadable diff must never skip runtime checks.
    return 'full';
  }
}

const scope = selectScope();
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
console.log(`scope=${scope}`);
