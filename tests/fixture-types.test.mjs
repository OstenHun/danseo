import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import ts from 'typescript';

test('shared fixture contracts reject invalid inputs, command names and response fields', () => {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.tests.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const probe = resolve('tests/helpers/consumer-probe.ts').replaceAll('\\', '/');
  function diagnostics(source) {
    const host = ts.createCompilerHost(parsed.options);
    const original = host.getSourceFile;
    host.getSourceFile = (file, language, ...rest) => file === probe
      ? ts.createSourceFile(file, source, language) : original(file, language, ...rest);
    return ts.getPreEmitDiagnostics(ts.createProgram([...parsed.fileNames, probe], parsed.options, host));
  }
  const positive = `import { setup, answer, claim } from './analysis-fixture.js';
    import { pdf } from './source-pdf.js';
    import type { TestContext } from 'node:test';
    declare const context: TestContext;
    const fixture = setup(context);
    pdf(['Paper', 'continued title'], 'Example Author', ['Journal', '2024']);
    const response = fixture.collect(fixture.topic, 'B', 'Preprint v2', 'draft');
    response.ready[0]?.file.sha256;
    fixture.review(fixture.a, 'supported', '2026-11-10T12:00:00Z', ['Check conditions']);
    fixture.save(fixture.open(), answer({ overview: undefined, claim_ids: [] }));
    fixture.ok(fixture.topic, 'comparison-input').claims;
    fixture.card('A', { edition: 'v1', path: 'synthetic.pdf' }, [claim('c1')]);
    fixture.json('invalid-input.json', { deliberately: 'malformed input is permitted' });`;
  assert.deepEqual(diagnostics(positive).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
  const invalid = diagnostics(positive + `
    pdf(42, 'Author', 'v1');
    fixture.collect(fixture.topic, 'Z');
    fixture.review(fixture.a, 'approved');
    fixture.ok(fixture.topic, 'soruces');
    fixture.ok(fixture.topic, 'sources').readys;
    fixture.save({ document_sha256: 42 });
  `);
  assert.deepEqual(invalid.map(d => d.code).sort(), [2345, 2345, 2345, 2345, 2551, 2322].sort());
});
