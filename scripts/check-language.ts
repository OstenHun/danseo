import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// English is the repository language (AGENTS.md#language). Korean may stay only in
// marked translations, in the Markdown constructs stripped below, or within the per-file
// line counts recorded in the baseline. The baseline must match: it can neither grow
// nor keep an allowance that is no longer used.
const baselinePath = 'scripts/language-baseline.json';
const hangul = /\p{Script=Hangul}/u;
const binary = /\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i;
// Strict decoding, so text saved as UTF-16 fails instead of passing as replacement characters.
const utf8 = new TextDecoder('utf-8', { fatal: true });

function isTranslation(file: string): boolean {
  return /\.ko\.(md|json)$/.test(file);
}

function stripAllowed(line: string): string {
  return (
    line
      // Earlier Korean heading anchors kept so existing links still resolve.
      .replace(/<a id="[^"]*"><\/a>/g, '')
      // A link to a Korean translation may name its language in Korean.
      .replace(/\[[^\]]*\]\([^)\s]*\.ko\.md(?:#[^)\s]*)?\)/g, '')
      // A link's #fragment may point at those Korean anchors. Paths and titles still count.
      .replace(/\]\([^)\s#\p{Script=Hangul}]*#[^)\s]*\)/gu, ']')
      // The product name's Korean origin.
      .replace(/\(단서\)/g, '')
  );
}

function koreanLines(file: string): number {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; // Deleted, not yet staged.
    throw error;
  }
  let source: string;
  try {
    source = utf8.decode(bytes);
  } catch {
    source = '\0';
  }
  if (source.includes('\0')) throw new Error(`${file}: not UTF-8 text; save it as UTF-8`);
  const markdown = file.endsWith('.md');
  return source.split('\n').filter((line) => hangul.test(markdown ? stripAllowed(line) : line))
    .length;
}

// Tracked files only, so a local scratch note never fails the check or enters the baseline.
const files = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((file) => file && file !== baselinePath && !binary.test(file) && !isTranslation(file));

const counts = new Map<string, number>();
for (const file of files) {
  const count = koreanLines(file);
  if (count > 0) counts.set(file, count);
}

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Language: baseline rewritten with ${counts.size} files.`);
  process.exit(0);
}

const baseline = new Map(
  Object.entries(JSON.parse(readFileSync(baselinePath, 'utf8')) as Record<string, number>),
);
let failed = false;
for (const file of new Set([...counts.keys(), ...baseline.keys()])) {
  const count = counts.get(file) ?? 0;
  const allowed = baseline.get(file) ?? 0;
  if (count > allowed) {
    failed = true;
    console.error(
      `${file}: ${count} lines contain Korean (baseline ${allowed}). ` +
        'Write it in English, or see AGENTS.md#language for allowed exceptions.',
    );
  } else if (count < allowed) {
    failed = true;
    console.error(
      `${file}: ${count} lines contain Korean, fewer than the baseline ${allowed}. ` +
        'Run `npm run check:language -- --update` to lower it.',
    );
  }
}
if (failed) process.exit(1);
console.log(`Language: ${files.length} files checked; Korean matches the baseline.`);
