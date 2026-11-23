import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// Correctness rules are errors. Readability rules are warnings: they point at code to clean up
// and do not fail CI, except in files already cleaned up, where a block below makes them errors.
// Prettier owns layout, so no formatting rules are enabled here.

// Globals are listed by hand so the toolchain adds no package beyond ESLint itself.
const nodeGlobals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  performance: 'readonly',
  process: 'readonly',
  queueMicrotask: 'readonly',
  setImmediate: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  structuredClone: 'readonly',
};

const browserGlobals = {
  Blob: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  HTMLElement: 'readonly',
  MutationObserver: 'readonly',
  Node: 'readonly',
  ResizeObserver: 'readonly',
  URL: 'readonly',
  cancelAnimationFrame: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  cytoscape: 'readonly',
  document: 'readonly',
  getComputedStyle: 'readonly',
  history: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  requestAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
};

// Thresholds follow the distribution of violations measured on the code when the linter was added.
const readabilityRules = {
  'max-lines-per-function': ['warn', { max: 60, skipBlankLines: true, skipComments: true }],
  complexity: ['warn', { max: 15 }],
  'max-depth': ['warn', { max: 4 }],
  'id-length': [
    'warn',
    // `t` is the node:test context and `a`, `b` are sort comparator arguments.
    { min: 2, properties: 'never', exceptions: ['_', 'i', 'j', 'k', 't', 'a', 'b'] },
  ],
  'no-nested-ternary': 'warn',
};

// Classic scripts that the generated HTML pages load into the browser.
const browserScripts = ['skills/*/assets/*.js'];

export default defineConfig([
  {
    // Third-party and generated files, and local-only folders.
    ignores: [
      '.archify/**',
      '.venv/**',
      'build-tools/**',
      'build/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'outputs/**',
      'private/**',
      'skills/danseo/assets/cytoscape.min.js',
      'work/**',
      'workspaces/**',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    // The core recommended set applies to TypeScript too; typescript-eslint then turns off
    // the core rules that the compiler or its own version of a rule replaces.
    files: ['**/*.{js,mjs,cjs,ts}'],
    extends: [js.configs.recommended],
  },
  { files: ['**/*.ts'], extends: [tseslint.configs.recommended] },
  {
    files: ['**/*.{js,mjs}'],
    ignores: browserScripts,
    languageOptions: { sourceType: 'module', globals: nodeGlobals },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: nodeGlobals },
  },
  {
    files: browserScripts,
    languageOptions: { sourceType: 'script', globals: browserGlobals },
  },
  {
    // Dropping a field with `const { field, ...rest } = value` is a normal way to omit it.
    files: ['**/*.{js,mjs,cjs}'],
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['**/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  { files: ['**/*.{js,mjs,cjs,ts}'], rules: readabilityRules },
  {
    // Files already cleaned up: readability rules are errors here so warnings cannot return.
    // ESLint ignores a path that matches nothing, so update this list when one of these files moves.
    // Every skill script except tests is covered, including scripts added later.
    files: [
      'skills/*/scripts/*.mjs',
      'src/cli.ts',
      'src/core/analysis.ts',
      'src/core/claim-state.ts',
      'src/core/collection.ts',
      'src/core/comparison.ts',
      'src/core/dependencies.ts',
      'src/core/index.ts',
      'src/core/reviews.ts',
      'src/core/source-pdf.ts',
      'src/core/topic.ts',
      'src/views/research-map.ts',
      'src/web/browser-types.d.ts',
      'src/web/comparison-server.ts',
      'src/web/comparison.ts',
    ],
    ignores: ['**/*.test.mjs'],
    rules: Object.fromEntries(
      Object.entries(readabilityRules).map(([rule, setting]) => [
        rule,
        Array.isArray(setting) ? ['error', ...setting.slice(1)] : 'error',
      ]),
    ),
  },
  {
    // Long test functions and the fake DOM that tests load are mostly fixture data, so only
    // the length rule is relaxed.
    files: ['tests/**', '**/*.test.mjs', 'skills/*/scripts/*-dom.mjs'],
    rules: { 'max-lines-per-function': 'off' },
  },
]);
