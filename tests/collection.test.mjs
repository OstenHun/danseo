import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

// One real text page with an xref table; a renamed text file cannot exercise PDF parsing.
function pdf(title, author, edition) {
  const content = `BT /F 12 Tf 20 730 Td (${title}) Tj 0 -20 Td (${author}) Tj 0 -20 Td (${edition}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let data = '%PDF-1.4\n';
  const offsets = [];
  for (const [i, obj] of objects.entries()) { offsets.push(data.length); data += `${i + 1} 0 obj\n${obj}\nendobj\n`; }
  const xref = data.length;
  data += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('');
  return Buffer.from(data + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'danseo-collection-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  function run(...args) {
    return spawnSync(process.execPath, [cli, 'topic', ...args, '--dir', dir], { encoding: 'utf8' });
  }
  function ok(...args) {
    const proc = run(...args);
    assert.equal(proc.status, 0, proc.stderr);
    return JSON.parse(proc.stdout);
  }
  function batch(papers) {
    const path = join(dir, 'query.json');
    writeFileSync(path, JSON.stringify({ query: 'example', papers }));
    ok('search', '--input', path);
  }
  const path = join(dir, 'download');
  function collect(id, edition = 'Journal 2024', extra = [], kind = 'published') {
    return ok('collect', '--id', id, '--round', '1', '--edition', edition, '--proof', edition,
      '--kind', kind, ...(extra.length ? extra : ['--pdf',path]));
  }
  const copies = () => readdirSync(dir).filter(name => /^source-.*\.pdf$/.test(name));
  ok('init', '--question', 'A research question');
  return { dir, path, run, ok, batch, collect, copies };
}
const paper = key => ({ key, title: 'Paper ' + key, authors: 'Alice Reader', edition: 'Journal 2024',
  source: 'https://example.com/' + key, year: 2024, reason: 'Compare ' + key, scope: 'abstract' });

test('local HTTP download, reuse and later supply preserve the selected round and earlier bytes', async t => {
  const { dir,path,ok,run,batch,collect,copies } = fixture(t);
  batch(['A','B','C','D'].map(paper));
  const emptyFiles = readdirSync(dir);
  assert.deepEqual(ok('sources').rows, []);
  assert.notEqual(run('collect','--id','1','--round','1').status, 0);
  assert.deepEqual(readdirSync(dir), emptyFiles);
  ok('select','--ids','1,2,3','--round','1','--note','Reader choice');
  batch([{ ...paper('A'), edition: 'Journal 2025', source: 'https://example.com/A2' }]);
  const topicBefore = readFileSync(join(dir,'topic.json'));
  const server = createServer((req,res) => res.end(req.url === '/A' ? pdf('Paper A','Alice Reader','Journal 2024') : '<html>Abstract</html>'));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => server.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  async function download(suffix) { writeFileSync(path, Buffer.from(await (await fetch(url+suffix)).arrayBuffer())); }
  await download('/A');
  const a = collect('1',undefined,['--pdf',path,'--url',url+'/A']).ready[0];
  assert.equal(a.paper.edition, 'Journal 2024');
  assert.equal(a.paper.note, 'Reader choice');
  assert.equal(a.file.origin, 'public');
  const existing = join(dir,'already-owned.pdf');
  writeFileSync(existing, pdf('Paper B','Alice Reader','Journal 2024'));
  const previous = collect('2',undefined,['--existing',existing]).ready;
  assert.equal(previous[1].file.path, existing);
  assert.deepEqual(collect('2',undefined,['--existing',existing]).ready, previous);
  await download('/C');
  const missing = collect('3',undefined,['--pdf',path,'--url',url+'/C']).rows[2];
  assert.match(missing.failure.reason,/PDF/);
  assert.equal(missing.failure.source, url+'/C');
  assert.equal(copies().length,1);
  assert.deepEqual(ok('sources').ready,previous);
  writeFileSync(path,pdf('Paper C','Alice Reader','Journal 2024'));
  const supplied = collect('3');
  assert.equal(supplied.ready[2].file.origin,'provided');
  assert.deepEqual(supplied.ready.slice(0,2), previous);
  assert.deepEqual(supplied,ok('sources'));
  assert.equal(copies().length,2);
  assert.deepEqual(readFileSync(join(dir,'topic.json')),topicBefore);
  writeFileSync(existing,'changed');
  assert.equal(ok('sources').rows[1].files[0].status,'needs-recheck');
  rmSync(a.file.path);
  assert.deepEqual(ok('sources').ready.map(x=>x.paper.key),['C']);
  assert.notEqual(run('unavailable','--id','4','--round','1','--reason','not selected').status,0);
});

test('draft consent binds to the actual bytes and round, then yields to the publication', t => {
  const {path,batch,ok,collect,run} = fixture(t);
  batch([paper('A')]);
  ok('select','--ids','1');
  const put = edition => { writeFileSync(path,pdf('Paper A','Alice Reader',edition)); return collect('1',edition,[],'draft'); };
  const decide = (hash,answer) => ok('decide','--id','1','--round','1','--sha',hash,'--answer',answer);
  const pending=put('Preprint v1');
  assert.equal(pending.ready.length,0);
  const hash=pending.rows[0].files[0].sha256;
  assert.equal(decide(hash,'decline').ready.length,0);
  assert.equal(ok('sources').rows[0].files[0].decision,'declined');
  assert.equal(decide(hash,'accept').ready[0].file.edition,'Preprint v1');
  const revised=put('Preprint v2');
  assert.equal(revised.rows[0].files[1].decision,'pending');
  assert.equal(revised.ready[0].file.sha256,hash);
  assert.notEqual(run('decide','--id','1','--round','2','--sha',hash,'--answer','accept').status,0);
  writeFileSync(path,pdf('Paper A','Alice Reader','Journal 2024'));
  assert.equal(collect('1').ready[0].file.edition,'Journal 2024');
  batch([{...paper('A'),edition:'v3'}]);
  ok('unselect','--ids','1');
  ok('select','--ids','1','--round','2');
  assert.deepEqual(ok('sources').ready,[]);
});

test('mismatched identity, unknown edition, interrupted and missing files stay retryable', t => {
  const {path,dir,batch,ok,collect,copies,run}=fixture(t);
  batch([paper('A')]); ok('select','--ids','1');
  for (const bytes of [pdf('Different title','Alice Reader','Journal 2024'), pdf('Paper A','Other Author','Journal 2024'),
    pdf('Paper A','Alice Reader','Journal 2025'),pdf('Paper A','Alice Reader','Journal 2024').subarray(0,-90),
    Buffer.from('%PDF-1.4\ngarbage\n%%EOF')]) {
    writeFileSync(path,bytes);
    const result=collect('1');
    assert.equal(result.ready.length,0);
    assert.ok(result.rows[0].failure.reason);
    assert.deepEqual(copies(),[]);
  }
  rmSync(path);
  assert.ok(collect('1').rows[0].failure.reason);
  const waiting=ok('unavailable','--id','1','--round','1','--reason','PDF download permission denied');
  assert.equal(waiting.rows[0].failure.reason,'PDF download permission denied');
  writeFileSync(join(dir,'sources.json'),'{}');
  assert.notEqual(run('unavailable','--id','1','--round','1','--reason','retry').status,0);
  assert.equal(readFileSync(join(dir,'sources.json'),'utf8'),'{}');
});
