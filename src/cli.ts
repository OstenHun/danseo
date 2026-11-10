#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { loadWorkspace, listCards, getCard, buildBundle, renderBundle, writeNewFile, DanseoError } from './core/index.js';

import { runTopic } from './core/topic.js';

const help = `Danseo — local evidence CLI
Usage: danseo <validate|list|show|export> --workspace <directory> [options]
       danseo topic <init|search|select|unselect|show> --dir <topic-folder> [options]
  validate                         Check schema, IDs, references and project paths
  list [--project <id>]             List records
  show --paper <id>                 Original Paper (or --application <id>)
  export --project <id> --application <id> [--include-drafts] [--out <new-file>]
  --json / --format json            Machine-readable output (default: markdown)
  --help                           This help
Workspace: workspace.json names records, projects and question_section (exact ATX title).
Export embeds the selected question section and optional source.text_path page text.
Exit: 0 success; 2 invalid input/evidence; 3 file access failure.
No LLM, network requests or recursive imports. Only topic actions update topic records.\n`;

async function main() {
  if (process.argv[2] === 'topic') return runTopic(process.argv.slice(3));
  const { values: v, positionals } = parseArgs({ strict: true, allowPositionals: true, options: {
    workspace: { type: 'string' }, project: { type: 'string' }, paper: { type: 'string' }, application: { type: 'string' },
    format: { type: 'string' }, out: { type: 'string' }, json: { type: 'boolean' },
    'include-drafts': { type: 'boolean' }, help: { type: 'boolean', short: 'h' }
  } });
  if (v.help) { process.stdout.write(help); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || !command || !['validate', 'list', 'show', 'export'].includes(command)) throw new DanseoError('USAGE', help);
  const allowed: Record<string, string[]> = {
    validate: [], list: ['project'], show: ['paper', 'application'], export: ['project', 'application', 'include-drafts', 'out']
  };
  for (const key of Object.keys(v)) if (!['workspace','format','json'].includes(key) && !allowed[command]!.includes(key)) {
    throw new DanseoError('OPTION', `${command}: 지원하지 않는 옵션 --${key}`);
  }
  const format = v.json ? 'json' : v.format ?? 'markdown';
  if (!['json','markdown'].includes(format) || (v.json && v.format && v.format !== 'json')) throw new DanseoError('FORMAT', 'json 또는 markdown을 지정하세요.');
  if (!v.workspace?.trim()) throw new DanseoError('WORKSPACE_REQUIRED', '--workspace 경로가 필요합니다.');
  if (command === 'show' && Number(Boolean(v.paper)) + Number(Boolean(v.application)) !== 1) throw new DanseoError('SHOW_ID', '--paper 또는 --application 중 하나를 지정하세요.');
  if (command === 'export' && (!v.project || !v.application)) throw new DanseoError('EXPORT_IDS', '--project와 --application이 필요합니다.');
  const ws = await loadWorkspace(v.workspace);
  let output: string;
  if (command === 'validate') {
    const report = { ok: true, records: ws.cards.length, projects: ws.projects.length, warnings: ws.warnings, scope: 'structure-and-references-only' };
    output = format === 'json' ? JSON.stringify(report, null, 2) + '\n' : `검사 통과: ${report.records}개 기록 / ${report.projects}개 프로젝트\n${ws.warnings.join('\n')}\n`;
  } else if (command === 'list') {
    const rows = listCards(ws, v.project);
    output = format === 'json' ? JSON.stringify(rows, null, 2) + '\n' : rows.map(r => `${r.id}\t${r.type}\t${r.status}\t${r.title}`).join('\n') + '\n';
  } else if (command === 'show') {
    const card = getCard(ws, (v.paper ?? v.application)!, v.paper ? 'paper' : 'application');
    output = format === 'json' ? JSON.stringify({ ...card, source_directory: resolve(card.path, '..') }, null, 2) + '\n' : card.raw;
    if (format !== 'json') process.stderr.write(`상대 링크 기준: ${resolve(card.path, '..')}\n`);
  } else {
    const bundle = await buildBundle(ws, v.project!, v.application!, v['include-drafts'] ?? false);
    output = renderBundle(bundle, format);
    if (bundle.warnings.length) process.stderr.write(format === 'json' ? JSON.stringify({ warnings: bundle.warnings }) + '\n' : `미검토 자료 포함: ${bundle.warnings.join('; ')}\n`);
  }
  if (v.out) {
    await writeNewFile(resolve(v.out), output);
    process.stderr.write(format === 'json' ? JSON.stringify({ written: resolve(v.out) }) + '\n' : `저장: ${resolve(v.out)}\n`);
  } else process.stdout.write(output);
}

main().catch(error => {
  const structured = process.argv.includes('--json') || process.argv.includes('--format=json') || process.argv.some((x,i,a) => x === '--format' && a[i+1] === 'json');
  const known = error instanceof DanseoError;
  const detail = { code: known ? error.code : 'CLI_ERROR', message: (error as Error).message };
  process.stderr.write(structured ? JSON.stringify({ error: detail }) + '\n' : `${detail.code}: ${detail.message}\n`);
  process.exitCode = known ? error.exitCode : 2;
});
