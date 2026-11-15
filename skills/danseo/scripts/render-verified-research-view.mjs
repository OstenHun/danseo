import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateCandidate, renderCandidate } from './render-research-view.mjs';
import { overviewFor, verifyEvidence } from './research-evidence.mjs';
import { cliEntry, hash, fail } from './view-core.mjs';

export function run(args) {
  const [input, option, evidenceFile, action, output] = args;
  const bytes = readFileSync(input);
  const candidate = validateCandidate(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')));
  if (args.length === 2 && option === '--overview') {
    if (candidate.version !== 2 || candidate.mode !== 'paper-relations') fail('Overview requires version 2 paper-relations');
    return overviewFor(candidate);
  }
  if (option !== '--evidence' || !((args.length === 4 && action === '--check') || (args.length === 5 && action === '--out'))) fail('Expected candidate.json --overview | candidate.json --evidence evidence.json --check | --out new.html');
  if (output && path.extname(output).toLowerCase() !== '.html') fail('Output must end in .html');
  const evidenceBytes = readFileSync(evidenceFile);
  const evidence = JSON.parse(evidenceBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const checks = verifyEvidence(candidate, evidence, path.dirname(path.resolve(evidenceFile)));
  const receipt = { ok: true, candidate_sha256: hash(bytes), evidence_sha256: hash(evidenceBytes), ...checks };
  if (output) {
    const html = renderCandidate(candidate);
    writeFileSync(output, html, { encoding: 'utf8', flag: 'wx' });
    receipt.output = path.resolve(output); receipt.output_sha256 = hash(html);
  }
  return receipt;
}
cliEntry(import.meta.url, run);
