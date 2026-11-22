import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNode } from './helpers/run-node.js';

test('English viewer guidance preserves supplied Korean and English research prose and original quotations', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'danseo-language-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const renderer = fileURLToPath(
    new URL('../skills/danseo/scripts/render-research-view.mjs', import.meta.url),
  );
  const fixture = new URL(
    '../skills/danseo/assets/project-application.v2.example.json',
    import.meta.url,
  );
  for (const [name, prose] of [
    ['ko', '한국어 요청의 설명을 보존합니다. 원문 인용: "Original source".'],
    ['en', 'Preserve the requested English explanation. Original quotation: "원문 그대로".'],
  ] as const) {
    const candidate = JSON.parse(readFileSync(fixture, 'utf8'));
    candidate.title = prose;
    candidate.description = prose;
    candidate.applications[0].interpretation = prose + ' </script><script>throw 1</script>';
    const originalTitle = candidate.papers[0].title;
    const input = join(root, name + '.json');
    const output = join(root, name + '.html');
    writeFileSync(input, JSON.stringify(candidate));
    const result = runNode([renderer, input, '--out', output]);
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(output, 'utf8');
    assert.match(html, /<html lang="en">/);
    assert.match(html, />Fit all<|>Fit all<\/button>/);
    assert.match(html, />Skip to content</);
    const payload = /<script type="application\/json" id="candidate">([\s\S]*?)<\/script>/.exec(
      html,
    );
    assert.ok(payload);
    const preserved = JSON.parse(payload[1]!);
    assert.equal(preserved.title, prose);
    assert.equal(preserved.description, prose);
    assert.equal(
      preserved.applications[0].interpretation,
      candidate.applications[0].interpretation,
    );
    assert.equal(preserved.papers[0].title, originalTitle);
    assert.equal(readFileSync(input, 'utf8'), JSON.stringify(candidate));
    assert.ok(!html.includes('</script><script>throw 1</script>'));
  }
});
