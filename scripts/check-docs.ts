import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Compare with the upload set, not only files present in a maintainer's workspace.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const included = new Set(files);
let checked = 0;
for (const file of files.filter((file) => file.endsWith('.md'))) {
  const source = readFileSync(file, 'utf8');
  // The Korean alternative is the word for "Summary", kept by Korean translations.
  const summary = source.match(/^(?:요약|Summary): (.+)$/m)?.[1];
  if (summary) assert.ok([...summary].length <= 200, `${file}: summary exceeds 200 characters`);
  const prose = source.replace(/```[\s\S]*?```/g, '');
  const targets = [...prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1] ?? '');
  targets.push(...[...prose.matchAll(/(?:src|srcset)="([^"]+)"/g)].map((match) => match[1] ?? ''));
  for (const href of targets) {
    const clean = href.split('#')[0];
    if (!clean || /^[a-z]+:/i.test(clean)) continue;
    const target = path.posix
      .normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(clean)))
      .replace(/\/$/, '');
    assert.ok(
      included.has(target) || files.some((candidate) => candidate.startsWith(`${target}/`)),
      `${file}: target absent from Git upload set: ${href}`,
    );
    checked++;
  }
}
console.log(
  `Documentation: ${checked} relative file/image targets included; summary lengths passed.`,
);
