import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import ts from 'typescript';

// The strict browser check runs first in npm build. Emit only the two classic
// script entries; type-only queries must never pull Node modules into the page.
await mkdir(new URL('../dist/web/', import.meta.url), { recursive: true });
for (const file of ['web/comparison', 'views/research-map']) {
  const source = await readFile(new URL('../src/' + file + '.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    fileName: file + '.ts',
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None, moduleDetection: ts.ModuleDetectionKind.Legacy }
  });
  await writeFile(new URL('../dist/web/' + file.split('/').at(-1) + '.js', import.meta.url), outputText);
}

// The browser contract is type-only; tests use it alongside the server declarations.
await copyFile(new URL('../src/web/browser-types.d.ts', import.meta.url), new URL('../dist/web/browser-types.d.ts', import.meta.url));
