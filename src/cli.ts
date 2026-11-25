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
  type Workspace,
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
       danseo topic <init|search|import|select|unselect|show|sources|collect|unavailable|decide> --dir <topic-folder> [options]
       danseo topic <analysis-open|analysis-save|analysis-list|comparison-input> --dir <topic-folder> [options]
       danseo topic compare --dir <topic-folder> [--port 0 | --json]
From a source checkout, after npm run build, run from the repository root: node ./dist/cli.js --help
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

function parseCliArguments() {
  return parseArgs({
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
}
type CliOptions = ReturnType<typeof parseCliArguments>['values'];

function requireWorkspaceCommand(positionals: string[]): WorkspaceCommand {
  const command = positionals[0];
  if (positionals.length !== 1 || !isWorkspaceCommand(command)) {
    throw new DanseoError('USAGE', help);
  }
  return command;
}

function rejectUnsupportedOptions(command: WorkspaceCommand, options: CliOptions) {
  const commandOptions: readonly string[] = workspaceOptionsByCommand[command];
  for (const key of Object.keys(options)) {
    if (commonWorkspaceOptions.includes(key) || commandOptions.includes(key)) continue;
    throw new DanseoError('OPTION', `${command}: unsupported option --${key}`);
  }
}

function outputFormat(options: CliOptions) {
  const format = options.json ? 'json' : (options.format ?? 'markdown');
  if (
    !['json', 'markdown'].includes(format) ||
    (options.json && options.format && options.format !== 'json')
  )
    throw new DanseoError('FORMAT', 'Specify json or markdown.');
  return format;
}

// Returns the checked workspace path.
function requireCommandInputs(command: WorkspaceCommand, options: CliOptions) {
  if (!options.workspace?.trim())
    throw new DanseoError('WORKSPACE_REQUIRED', 'Provide a --workspace path.');
  if (
    command === 'show' &&
    Number(Boolean(options.paper)) + Number(Boolean(options.application)) !== 1
  )
    throw new DanseoError('SHOW_ID', 'Specify exactly one of --paper or --application.');
  if (command === 'export' && (!options.project || !options.application))
    throw new DanseoError('EXPORT_IDS', 'Both --project and --application are required.');
  return options.workspace;
}

function renderValidation(ws: Workspace, format: string) {
  const report = {
    ok: true,
    records: ws.cards.length,
    projects: ws.projects.length,
    warnings: ws.warnings,
    scope: 'structure-and-references-only',
  };
  return format === 'json'
    ? prettyJson(report)
    : `Validation passed: ${report.records} records / ${report.projects} projects
${ws.warnings.join('\n')}\n`;
}

function renderList(ws: Workspace, options: CliOptions, format: string) {
  const rows = listCards(ws, options.project);
  return format === 'json'
    ? prettyJson(rows)
    : rows.map((row) => `${row.id}\t${row.type}\t${row.status}\t${row.title}`).join('\n') + '\n';
}

// Also writes the relative-link base to stderr for Markdown output.
function showOutput(ws: Workspace, options: CliOptions, format: string) {
  const card = getCard(
    ws,
    (options.paper ?? options.application)!,
    options.paper ? 'paper' : 'application',
  );
  const sourceDirectory = resolve(card.path, '..');
  const output =
    format === 'json' ? prettyJson({ ...card, source_directory: sourceDirectory }) : card.raw;
  if (format !== 'json') process.stderr.write(`Relative links resolve from: ${sourceDirectory}\n`);
  return output;
}

function exportBundle(ws: Workspace, options: CliOptions) {
  return buildBundle(
    ws,
    options.project!,
    options.application!,
    options['include-drafts'] ?? false,
  );
}

// Also writes bundle warnings to stderr.
function exportOutput(bundle: Awaited<ReturnType<typeof buildBundle>>, format: string) {
  const output = renderBundle(bundle, format);
  if (bundle.warnings.length)
    process.stderr.write(
      format === 'json'
        ? JSON.stringify({ warnings: bundle.warnings }) + '\n'
        : `Includes unreviewed material: ${bundle.warnings.join('; ')}\n`,
    );
  return output;
}

// Synchronous on purpose: stderr notes and the output are written without an await between them.
function commandOutput(
  command: Exclude<WorkspaceCommand, 'export'>,
  ws: Workspace,
  options: CliOptions,
  format: string,
) {
  if (command === 'validate') return renderValidation(ws, format);
  if (command === 'list') return renderList(ws, options, format);
  return showOutput(ws, options, format);
}

async function deliverOutput(output: string, options: CliOptions, format: string) {
  if (options.out) {
    const outputPath = resolve(options.out);
    await writeNewFile(outputPath, output);
    process.stderr.write(
      format === 'json' ? JSON.stringify({ written: outputPath }) + '\n' : `Saved: ${outputPath}\n`,
    );
  } else process.stdout.write(output);
}

async function main() {
  if (process.argv[2] === 'topic') return runTopic(process.argv.slice(3));
  const { values: options, positionals } = parseCliArguments();
  if (options.help) {
    process.stdout.write(help);
    return;
  }
  const command = requireWorkspaceCommand(positionals);
  rejectUnsupportedOptions(command, options);
  const format = outputFormat(options);
  const workspace = requireCommandInputs(command, options);
  const ws = await loadWorkspace(workspace);
  const output =
    command === 'export'
      ? exportOutput(await exportBundle(ws, options), format)
      : commandOutput(command, ws, options, format);
  await deliverOutput(output, options, format);
}

main().catch((error) => {
  const structured =
    process.argv.includes('--json') ||
    process.argv.includes('--format=json') ||
    process.argv.some((arg, i, argv) => arg === '--format' && argv[i + 1] === 'json');
  const known = error instanceof DanseoError;
  const detail = { code: known ? error.code : 'CLI_ERROR', message: (error as Error).message };
  process.stderr.write(
    structured ? JSON.stringify({ error: detail }) + '\n' : `${detail.code}: ${detail.message}\n`,
  );
  process.exitCode = known ? error.exitCode : 2;
});
