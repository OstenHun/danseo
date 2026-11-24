import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCandidate, run, validateCandidate } from './render-learning-view.mjs';
import { openLearningView } from './learning-dom.mjs';

const sample = JSON.parse(
  readFileSync(new URL('../assets/learning-view.example.json', import.meta.url), 'utf8'),
);
const fresh = () => structuredClone(sample);

test('English, Korean and legacy UI preserve all authored data and navigation', () => {
  for (const language of ['en', 'ko', undefined]) {
    const data = fresh();
    if (language === undefined) delete data.language;
    else data.language = language;
    // Authored text is never translated. The Korean title words mean "source title"; the
    // quoted word means "original text".
    data.concepts[0].title = '원문 제목 <original>';
    data.concepts[0].body = ['Keep this exact quotation: 원문'];
    const html = renderCandidate(data),
      korean = language !== 'en';
    assert.ok(html.includes(`<html lang="${language ?? 'ko'}">`));
    assert.ok(html.includes(korean ? '추천 학습 순서' : 'Suggested learning order'));
    assert.deepEqual(JSON.parse(html.match(/id="candidate">(.*?)<\/script>/s)[1]), data);
    const page = openLearningView(data, '#concept=input');
    assert.equal(page.elements.get('concept-title').textContent, data.concepts[0].title);
    assert.equal(page.elements.get('explanation').textContent, data.concepts[0].body[0]);
    assert.equal(page.elements.get('count').textContent, korean ? '4개 개념' : '4 concepts');
    assert.equal(page.elements.get('previous').disabled, true);
    page.elements.get('next').click();
    assert.equal(page.elements.get('concept-title').textContent, data.concepts[1].title);
    assert.equal(page.activeElement, page.elements.get('concept-title'));
    assert.ok(!page.elements.get('announcement').textContent.includes('{'));
    assert.ok(
      page.elements
        .get('sources')
        .textContent.includes(korean ? '원문 미확인' : 'Source not checked'),
    );
    page.select('prediction');
    assert.equal(page.elements.get('next').disabled, true);
    page.location.hash = '#concept=unknown';
    assert.equal(
      page.elements.get('concept-title').textContent,
      data.concepts.find((c) => c.id === data.start).title,
    );
  }
});

test('unsupported locale values fail instead of silently producing a different UI', () => {
  for (const language of ['fr', 'KO', '', null, 1, {}]) {
    const data = fresh();
    data.language = language;
    assert.throws(() => renderCandidate(data), /candidate.language/);
  }
});

test('portable candidate preserves both incoming relations without inferring reading order', () => {
  const data = fresh();
  data.reading_order.reverse();
  assert.equal(validateCandidate(data), data);
  const html = renderCandidate(data);
  assert.equal(
    renderCandidate(structuredClone(data)),
    html,
    'Same candidate and assets must produce identical bytes',
  );
  const embedded = JSON.parse(
    html.match(/<script type="application\/json" id="candidate">(.*?)<\/script>/s)[1],
  );
  assert.deepEqual(embedded, data);
  assert.equal(embedded.relations.filter((relation) => relation.to === 'prediction').length, 2);
});

test('order-only content and one concept work without synthetic edges or sources', () => {
  const data = fresh();
  data.view = 'path';
  data.start = 'input';
  data.concepts = [data.concepts[0]];
  data.reading_order = ['input'];
  data.relations = [];
  data.sources = [];
  assert.doesNotThrow(() => renderCandidate(data));
  data.view = 'map';
  assert.throws(() => validateCandidate(data), /meaningful relations/);
});

test('invalid start, missing/repeated concepts and dangling references fail before rendering', () => {
  const changes = [
    (data) => {
      data.start = 'missing';
    },
    (data) => {
      data.reading_order.pop();
    },
    (data) => {
      data.reading_order.push('input');
    },
    (data) => {
      data.concepts.push(structuredClone(data.concepts[0]));
    },
    (data) => {
      data.concepts[0].evidence.push('missing');
    },
    (data) => {
      data.relations[0].to = 'missing';
    },
    (data) => {
      data.relations[0].evidence.push('missing');
    },
    (data) => {
      data.relations.push(structuredClone(data.relations[0]));
    },
    (data) => {
      data.concepts[0].body = [];
    },
  ];
  for (const change of changes) {
    const data = fresh();
    change(data);
    assert.throws(() => validateCandidate(data));
  }
});

test('a source relation needs actual declared evidence; AI relations stay proposals', () => {
  const data = fresh();
  data.relations[0].origin = 'source';
  assert.throws(() => validateCandidate(data), /agent-checked evidence/);
  data.relations[0].evidence = ['synthetic-note'];
  assert.throws(() => validateCandidate(data), /agent-checked evidence/);
  data.sources[0].verification = 'agent-checked';
  assert.doesNotThrow(() => validateCandidate(data));
  assert.equal(data.relations[1].origin, 'ai');
});

test('cycles and more than eight concepts do not force a misleading chain or truncate content', () => {
  const data = fresh();
  data.relations.push({
    from: 'prediction',
    to: 'scores',
    label: 'Feedback for explanation',
    origin: 'ai',
    evidence: [],
  });
  for (let i = 0; i < 20; i++) {
    const concept = structuredClone(data.concepts[0]);
    concept.id = `extra-${i}`;
    concept.title = 'A concept whose long title runs through several words in turn ' + i;
    data.concepts.push(concept);
    data.reading_order.push(concept.id);
  }
  const html = renderCandidate(data);
  assert.ok(html.includes('extra-19'));
  assert.equal(data.relations.length, 4);
});

test('unknown fields cannot silently embed learner answers or verification state', () => {
  const privateData = fresh();
  privateData.concepts[0].learner_answer = 'private';
  assert.throws(() => validateCandidate(privateData), /unknown field/);
  const data = fresh();
  data.understood = true;
  assert.throws(() => validateCandidate(data), /unknown field/);
});

test('active URL schemes and embedded credentials are rejected', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///secret.pdf',
    'https://user:password@example.org/paper',
    '/relative.pdf',
  ]) {
    const data = fresh();
    data.sources[0].url = url;
    assert.throws(() => renderCandidate(data));
  }
});

test('untrusted text remains data and CSP binds the shipped inline assets', () => {
  const data = fresh();
  const payload = '</script><script>alert("x")</script><img src=x onerror=alert(1)>';
  data.title = payload;
  data.concepts[0].body = [payload];
  const html = renderCandidate(data);
  assert.ok(!html.includes(payload));
  assert.ok(html.includes('&lt;/script&gt;'));
  const embedded = JSON.parse(
    html.match(/<script type="application\/json" id="candidate">(.*?)<\/script>/s)[1],
  );
  assert.equal(embedded.concepts[0].body[0], payload);
  for (const [tag, directive] of [
    ['style', 'style-src'],
    ['script', 'script-src'],
  ]) {
    const asset = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].at(-1)[1];
    const digest = createHash('sha256').update(asset).digest('base64');
    assert.ok(html.includes(`${directive} 'sha256-${digest}'`));
  }
});

test('CLI checks without output, reports hashes and never overwrites an existing output', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'danseo-learning-'));
  const input = path.join(scratch, 'candidate.json'),
    output = path.join(scratch, 'view.html');
  writeFileSync(input, JSON.stringify(sample));
  const check = run([input, '--check']);
  assert.equal(check.checks, 'structure-only');
  assert.equal(check.visual_review, 'not-run');
  const receipt = run([input, '--out', output]);
  const bytes = readFileSync(output);
  assert.equal(receipt.output_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => run([input, '--out', output]), /EEXIST/);
  assert.deepEqual(readFileSync(output), bytes);
  assert.throws(() => run([input, '--out', input]), /\.html/);
  assert.throws(() => run([input, '--check', 'extra']), /Expected/);
});

test('a junction/symlink skill installation actually runs the CLI entry point', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'danseo-learning-link-'));
  const linked = path.join(scratch, 'linked-skill');
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), linked, 'junction');
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(linked, 'scripts/render-learning-view.mjs'),
      path.join(linked, 'assets/learning-view.example.json'),
      '--check',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(JSON.parse(stdout).ok, true);
});

test('CRLF asset checkouts emit the same bytes and browser-normalized CSP hashes as LF', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'danseo-learning-crlf-'));
  const copied = path.join(scratch, 'skill');
  cpSync(fileURLToPath(new URL('..', import.meta.url)), copied, { recursive: true });
  for (const asset of ['learning-view.js', 'learning-view.css']) {
    const file = path.join(copied, 'assets', asset);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'));
  }
  const isolated = await import(
    pathToFileURL(path.join(copied, 'scripts/render-learning-view.mjs')).href
  );
  const html = isolated.renderCandidate(sample);
  assert.equal(html, renderCandidate(sample));
  for (const [tag, directive] of [
    ['style', 'style-src'],
    ['script', 'script-src'],
  ]) {
    const content = [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
      .at(-1)[1]
      .replace(/\r\n?/g, '\n');
    assert.ok(
      html.includes(
        `${directive} 'sha256-${createHash('sha256').update(content).digest('base64')}'`,
      ),
    );
  }
});

test('concept IDs sharing DOM names remain selectable and skip preserves reload state', () => {
  const data = fresh();
  data.concepts[0].id = 'concept-title';
  data.reading_order[0] = 'concept-title';
  data.relations[0].from = 'concept-title';
  validateCandidate(data);
  const page = openLearningView(data);
  page.select('concept-title');
  assert.equal(page.elements.get('concept-title').textContent, data.concepts[0].title);
  page.elements.get('next').click();
  assert.equal(page.elements.get('concept-title').textContent, data.concepts[1].title);
  const hash = page.location.hash;
  page.elements.get('skip').click();
  assert.equal(page.location.hash, hash);
  assert.equal(page.activeElement, page.elements.get('concept-title'));
  const reopened = openLearningView(data, hash);
  assert.equal(reopened.elements.get('concept-title').textContent, data.concepts[1].title);
  const direct = openLearningView(data, '#concept=concept-title');
  assert.equal(direct.elements.get('concept-title').textContent, data.concepts[0].title);
});

test('relation-only evidence keeps locator, checked scope and independent-review limit visible', () => {
  const data = fresh();
  data.language = 'ko';
  data.concepts.forEach((concept) => {
    concept.evidence = [];
  });
  data.relations[1].origin = 'source';
  data.relations[1].evidence = ['synthetic-note'];
  data.sources[0].verification = 'agent-checked';
  data.sources[0].locator = 'RELATION-ONLY-LOCATION';
  data.sources[0].scope = 'RELATION-ONLY-SCOPE';
  validateCandidate(data);
  const page = openLearningView(data);
  const text = page.elements.get('sources').textContent;
  assert.ok(text.includes('RELATION-ONLY-LOCATION'));
  assert.ok(text.includes('RELATION-ONLY-SCOPE'));
  // Korean UI labels: "relation evidence" and "independent review".
  assert.ok(text.includes('관계 근거'));
  assert.ok(text.includes('독립 검토'));
});
