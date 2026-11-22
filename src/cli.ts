#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import {
  loadWorkspace,
  listCards,
  getCard,
  buildBundle,
  renderBundle,
  writeNewFile,
  DanseoError,
} from './core/index.js';
import { runTopic } from './core/topic.js';

const workspaceOptionsByCommand = {
  validate: [],
  list: ['project'],
  show: ['paper', 'application'],
  export: ['project', 'application', 'include-drafts', 'out'],
};
type WorkspaceCommand = keyof typeof workspaceOptionsByCommand;
const commonWorkspaceOptions = ['workspace', 'format', 'json'];

const help = `Danseo — local evidence CLI
Usage: danseo <${Object.keys(workspaceOptionsByCommand).join('|')}> --workspace <directory> [options]
       danseo topic <init|search|select|unselect|show|sources|collect|unavailable|decide> --dir <topic-folder> [options]
       danseo topic <analysis-open|analysis-save|analysis-list|comparison-input> --dir <topic-folder> [options]
       danseo topic compare --dir <topic-folder> [--port 0 | --json]
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

function isWorkspaceCommand(command: string | undefined): command is WorkspaceCommand {
  return command !== undefined && Object.hasOwn(workspaceOptionsByCommand, command);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2) + '\n';
}

async function main() {
  if (process.argv[2] === 'topic') return runTopic(process.argv.slice(3));
  const { values: options, positionals } = parseArgs({
    strict: true,
    allowPositionals: true,
    options: {
      workspace: { type: 'string' },
      project: { type: 'string' },
      paper: { type: 'string' },
      application: { type: 'string' },
      format: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'boolean' },
      'include-drafts': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (options.help) {
    process.stdout.write(help);
    return;
  }
  const command = positionals[0];
  if (positionals.length !== 1 || !isWorkspaceCommand(command)) {
    throw new DanseoError('USAGE', help);
  }
  const commandOptions: readonly string[] = workspaceOptionsByCommand[command];
  for (const key of Object.keys(options)) {
    if (commonWorkspaceOptions.includes(key) || commandOptions.includes(key)) continue;
    throw new DanseoError('OPTION', `${command}: unsupported option --${key}`);
  }
  const format = options.json ? 'json' : (options.format ?? 'markdown');
  if (
    !['json', 'markdown'].includes(format) ||
    (options.json && options.format && options.format !== 'json')
  )
    throw new DanseoError('FORMAT', 'Specify json or markdown.');
  if (!options.workspace?.trim())
    throw new DanseoError('WORKSPACE_REQUIRED', 'Provide a --workspace path.');
  if (
    command === 'show' &&
    Number(Boolean(options.paper)) + Number(Boolean(options.application)) !== 1
  )
    throw new DanseoError('SHOW_ID', 'Specify exactly one of --paper or --application.');
  if (command === 'export' && (!options.project || !options.application))
    throw new DanseoError('EXPORT_IDS', 'Both --project and --application are required.');
  const ws = await loadWorkspace(options.workspace);
  let output: string;
  if (command === 'validate') {
    const report = {
      ok: true,
      records: ws.cards.length,
      projects: ws.projects.length,
      warnings: ws.warnings,
      scope: 'structure-and-references-only',
    };
    output =
      format === 'json'
        ? prettyJson(report)
        : `Validation passed: ${report.records} records / ${report.projects} projects
${ws.warnings.join('\n')}\n`;
  } else if (command === 'list') {
    const rows = listCards(ws, options.project);
    output =
      format === 'json'
        ? prettyJson(rows)
        : rows.map((r) => `${r.id}\t${r.type}\t${r.status}\t${r.title}`).join('\n') + '\n';
  } else if (command === 'show') {
    const card = getCard(
      ws,
      (options.paper ?? options.application)!,
      options.paper ? 'paper' : 'application',
    );
    const sourceDirectory = resolve(card.path, '..');
    output =
      format === 'json' ? prettyJson({ ...card, source_directory: sourceDirectory }) : card.raw;
    if (format !== 'json')
      process.stderr.write(`Relative links resolve from: ${sourceDirectory}\n`);
  } else {
    const bundle = await buildBundle(
      ws,
      options.project!,
      options.application!,
      options['include-drafts'] ?? false,
    );
    output = renderBundle(bundle, format);
    if (bundle.warnings.length)
      process.stderr.write(
        format === 'json'
          ? JSON.stringify({ warnings: bundle.warnings }) + '\n'
          : `Includes unreviewed material: ${bundle.warnings.join('; ')}\n`,
      );
  }
  if (options.out) {
    const outputPath = resolve(options.out);
    await writeNewFile(outputPath, output);
    process.stderr.write(
      format === 'json' ? JSON.stringify({ written: outputPath }) + '\n' : `Saved: ${outputPath}\n`,
    );
  } else process.stdout.write(output);
}

main().catch((error) => {
  const structured =
    process.argv.includes('--json') ||
    process.argv.includes('--format=json') ||
    process.argv.some((x, i, a) => x === '--format' && a[i + 1] === 'json');
  const known = error instanceof DanseoError;
  const detail = { code: known ? error.code : 'CLI_ERROR', message: (error as Error).message };
  process.stderr.write(
    structured ? JSON.stringify({ error: detail }) + '\n' : `${detail.code}: ${detail.message}\n`,
  );
  process.exitCode = known ? error.exitCode : 2;
});
