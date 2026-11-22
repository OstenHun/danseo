// Portable view helpers. Keep both distributed skill copies byte-identical.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIEW_CORE_VERSION = 1;
export const fail = (message) => {
  throw new Error(message);
};
export function object(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at}: expected object`);
  for (const key of Object.keys(value))
    if (!keys.includes(key)) fail(`${at}: unknown field ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${at}: missing ${key}`);
}
export function text(value, at) {
  if (typeof value !== 'string' || !value.trim()) fail(`${at}: expected nonempty text`);
}
export function list(value, at) {
  if (!Array.isArray(value)) fail(`${at}: expected array`);
}
export function oneOf(value, choices, at) {
  if (!choices.includes(value)) fail(`${at}: expected ${choices.join(' | ')}`);
}
export function ids(values, known, at) {
  list(values, at);
  if (new Set(values).size !== values.length) fail(`${at}: duplicate reference`);
  for (const value of values) if (!known.has(value)) fail(`${at}: unknown reference ${value}`);
}
export function unique(items, at, pattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/) {
  list(items, at);
  const result = new Map();
  items.forEach((item, i) => {
    if (typeof item?.id !== 'string' || !pattern.test(item.id)) fail(`${at}[${i}]: invalid id`);
    if (result.has(item.id)) fail(`${at}: duplicate id ${item.id}`);
    result.set(item.id, item);
  });
  return result;
}
export function httpUrl(value, at) {
  text(value, at);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${at}: invalid URL`);
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    fail(`${at}: expected HTTP(S) URL without credentials`);
}
export const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const cspHash = (value) => createHash('sha256').update(value).digest('base64');
export function inlineAssets(candidate, cssPaths, jsPath, expectedVersion) {
  if (expectedVersion !== VIEW_CORE_VERSION)
    fail('Shared view core version mismatch; reinstall the complete skill folder');
  const lf = (file) => readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  return {
    style: cssPaths.map(lf).join('\n'),
    script: (Array.isArray(jsPath) ? jsPath : [jsPath]).map(lf).join('\n'),
    json: JSON.stringify(candidate).replace(
      /[<>&\u2028\u2029]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    ),
  };
}
export function runView(args, validate, render, describe) {
  if (!(args.length === 2 && args[1] === '--check') && !(args.length === 3 && args[1] === '--out'))
    fail('Expected candidate.json --check | candidate.json --out new-view.html');
  const [input, , output] = args;
  if (output && path.extname(output).toLowerCase() !== '.html') fail('Output must end in .html');
  const bytes = readFileSync(input);
  const data = validate(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')));
  const html = render(data);
  const receipt = {
    ok: true,
    candidate_sha256: hash(bytes),
    ...describe(data),
    checks: 'structure-only',
    visual_review: 'not-run',
  };
  if (output) {
    writeFileSync(output, html, { encoding: 'utf8', flag: 'wx' });
    receipt.output = path.resolve(output);
    receipt.output_sha256 = hash(html);
  }
  return receipt;
}
export function cliEntry(metaUrl, run) {
  if (
    process.argv[1] &&
    process.argv[1] !== '-' &&
    realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1])
  ) {
    try {
      console.log(JSON.stringify(run(process.argv.slice(2))));
    } catch (error) {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    }
  }
}
