import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateCandidate, renderCandidate } from './render-research-view.mjs';
import { overviewFor, verifyEvidence, verifyCompletion } from './research-evidence.mjs';
import { cliEntry, hash, fail } from './view-core.mjs';
import { performancePlan } from './performance-evidence.mjs';

const readJson = (bytes) => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));

function overview(candidate) {
  if (candidate.version !== 2 || candidate.mode !== 'paper-relations')
    fail('Overview requires version 2 paper-relations');
  return overviewFor(candidate);
}

function checkEvidenceArguments(args, option, action, output) {
  if (
    option !== '--evidence' ||
    !((args.length === 4 && action === '--check') || (args.length === 5 && action === '--out'))
  )
    fail(
      'Expected candidate.json --overview | candidate.json --evidence evidence.json --check | --out new.html [--complete]',
    );
  if (output && path.extname(output).toLowerCase() !== '.html') fail('Output must end in .html');
}

// Writes a new HTML file (never overwriting) and records its path and hash on the receipt.
function writeView(candidate, complete, evidence, output, receipt) {
  const html = renderCandidate(candidate, {
    complete,
    completionScope: complete ? evidence.completion.scope : null,
  });
  writeFileSync(output, html, { encoding: 'utf8', flag: 'wx' });
  receipt.output = path.resolve(output);
  receipt.output_sha256 = hash(html);
}

export function run(args) {
  const complete = args.at(-1) === '--complete';
  if (complete) args = args.slice(0, -1);
  const [input, option, evidenceFile, action, output] = args;
  if (complete && option !== '--evidence')
    fail('--complete requires --evidence with --check or --out');
  const bytes = readFileSync(input);
  const candidate = validateCandidate(readJson(bytes));
  if (args.length === 2 && option === '--performance-plan') return performancePlan(candidate);
  if (args.length === 2 && option === '--overview') return overview(candidate);
  checkEvidenceArguments(args, option, action, output);
  const evidenceBytes = readFileSync(evidenceFile);
  const evidence = readJson(evidenceBytes);
  const checks = verifyEvidence(candidate, evidence, path.dirname(path.resolve(evidenceFile)));
  if (complete) verifyCompletion(candidate, evidence, hash(bytes));
  else if (evidence.completion)
    fail('Completion evidence requires --complete; do not silently downgrade a completed delivery');
  const receipt = {
    ok: true,
    candidate_sha256: hash(bytes),
    evidence_sha256: hash(evidenceBytes),
    ...checks,
  };
  receipt.delivery = complete ? 'source-complete' : 'exploration';
  if (output) writeView(candidate, complete, evidence, output, receipt);
  return receipt;
}
cliEntry(import.meta.url, run);
