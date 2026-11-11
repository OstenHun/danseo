import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { get } from 'node:http';
import { runInNewContext } from 'node:vm';
import { setup } from './helpers/analysis-fixture.mjs';
import { buildComparison, relationState } from '../dist/core/comparison.js';
import { serveComparison } from '../dist/web/comparison-server.js';
import { loadWorkspace } from '../dist/core/index.js';
import { canonical } from '../dist/core/dependencies.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const answer = { overview: 'A study compares methods and reports accuracy.', question: 'How was the result evaluated?',
  answer: 'Reported percent accuracy, sample size and Table 1.', interpretation: 'AI, limited to this topic.',
  remaining_questions: 'Transfer unknown', resume: 'PDF p.1 Table 1', claim_ids: ['c1','c2'], comparison_claims: ['c1','c2'] };
async function fixture(t) {
  const f=setup(t);f.save(f.open(),answer);f.save(f.open(f.topic,'2',f.b),answer,f.topic,'2');f.review();f.review(f.b);
  f.comparison={version:1,question:'How did the two studies evaluate results?',criteria:[
    {id:'evaluation',title:'평가 대상과 척도',rationale:'AI: compare conditions without ranking different samples.',refs:[{key:'A',claim_id:'c1'},{key:'B',claim_id:'c1'}]},
    {id:'missing',title:'한쪽에서만 확인한 기준',rationale:'AI: B has no reviewed evidence for this criterion.',refs:[{key:'A',claim_id:'c1'}]}
  ]};f.saveComparison=()=>f.json(join(f.topic,'comparison.json'),f.comparison);f.saveComparison();
  const cards=new Map((await loadWorkspace(f.workspace)).cards.map(c=>[c.data.id,c]));
  f.relations=[
    {id:'cites',source:f.b.id,target:f.a.id,kind:'cites',origin:'source',status:'source-checked',rationale:'Fixture citation, not a real research claim.',created_by:'fixture AI',
      review:{checked_by:'fixture reviewer',checked_at:'2026-11-11T00:00:00Z'},snapshots:{source:hash(readFileSync(f.b.path)),target:hash(readFileSync(f.a.path))},evidence_refs:[{paper_id:f.b.id,claim_id:'c1'}]},
    {id:'suggestion',source:f.a.id,target:f.b.id,kind:'related-to',origin:'ai',status:'proposed',rationale:'AI: both assess answers, but datasets and conditions differ.',created_by:'fixture AI',
      snapshots:{source:hash(readFileSync(f.a.path)),target:hash(readFileSync(f.b.path))},evidence_refs:[{paper_id:f.a.id,claim_id:'c1'},{paper_id:f.b.id,claim_id:'c1'}]}
  ];
  for(const relation of f.relations)relation.snapshots.dependencies=(await relationState(relation,cards,new Set([...cards.keys()].map(id=>canonical([id,'c1']))))).current_dependencies;
  f.config.relations='relations.json';f.saveConfig();f.saveRelations=()=>f.json(join(f.workspace,'relations.json'),{schema_version:'relations-1',relations:f.relations});f.saveRelations();
  return f;
}
test('topic criteria expose only current support, preserve conditions, missing side, direction and AI rationale',async t=>{
  const f=await fixture(t),data=await buildComparison(f.topic);
  assert.equal(data.papers.length,2);assert.equal(data.claims.length,2);assert.equal(data.held.length,2);
  assert.deepEqual(data.criteria[0].groups.map(g=>g.claims.length),[1,1]);assert.equal(data.criteria[1].groups[1].claims.length,0);
  assert.equal(data.criteria[0].groups[0].claims[0].claim.conditions,'One test set, percent accuracy');
  assert.equal(data.relations[0].source,f.b.id);assert.equal(data.relations[0].target,f.a.id);
  assert.equal(data.relations[1].origin,'ai');assert.match(data.relations[1].rationale,/datasets/);
  assert.equal(f.ok(f.topic,'compare','--json').claims.length,2);
});
test('wrong topic, unselected paper and duplicate criterion never leak another topic answer',async t=>{
  const f=await fixture(t);f.comparison.question='Different topic';f.saveComparison();await assert.rejects(buildComparison(f.topic),/현재 주제/);
  f.comparison.question='How did the two studies evaluate results?';f.comparison.criteria[0].refs.push({key:'OUTSIDE',claim_id:'c1'});f.saveComparison();await assert.rejects(buildComparison(f.topic),/선택하지 않은/);
  f.comparison.criteria[0].refs.pop();f.comparison.criteria.push(f.comparison.criteria[0]);f.saveComparison();await assert.rejects(buildComparison(f.topic),/중복/);
});
test('locator/conditions changes and newest negative reviews remove support and dependent relations after reopen',async t=>{
  const f=await fixture(t);f.b.data.claims[0].locators[0].start=2;f.b.data.claims[0].locators[0].end=2;f.b.save();let data=await buildComparison(f.topic);
  assert.equal(data.claims.length,1);assert.equal(data.criteria[0].groups[1].claims.length,0);assert.equal(data.relations.length,0);assert.equal(data.held_relations.length,2);
  f.b.data.claims[0].locators[0].start=1;f.b.data.claims[0].locators[0].end=1;f.b.data.claims[0].conditions='Different sample';f.b.save();assert.equal((await buildComparison(f.topic)).claims.length,1);
  f.b.data.claims[0].conditions='One test set, percent accuracy';f.b.save();f.review(f.b,'contradicted','2026-11-11T02:00:00Z');
  data=await buildComparison(f.topic);assert.equal(data.claims.length,1);assert.equal(data.relations.length,0);
});
test('changed and missing PDFs keep selected papers but withdraw their verified comparison evidence',async t=>{
  const f=await fixture(t),path=f.a.data.source.path;writeFileSync(path,'changed');let data=await buildComparison(f.topic);
  assert.equal(data.papers.length,2);assert.equal(data.claims.length,1);assert.equal(data.relations.length,0);assert.ok(data.held.some(h=>h.key==='A'&&/再|재확인/.test(h.reason)));
  unlinkSync(path);data=await buildComparison(f.topic);assert.equal(data.claims.length,1);assert.equal(data.criteria[0].groups[0].claims.length,0);
});
test('changing relation reason/direction or source claim invalidates its pinned dependency snapshot',async t=>{
  const f=await fixture(t);f.relations[0].rationale+=' changed';f.saveRelations();let data=await buildComparison(f.topic);
  assert.deepEqual(data.relations.map(r=>r.id),['suggestion']);assert.equal(data.held_relations[0].id,'cites');
  f.relations[0].source=f.a.id;f.relations[0].target=f.b.id;f.saveRelations();await assert.rejects(buildComparison(f.topic),/출발 논문/);
});
test('new support for changed conditions/limits does not reapprove an old relationship',async t=>{
  const f=await fixture(t);
  for(const [index,field] of ['conditions','limits'].entries()) {
    f.b.data.claims[0][field]='Changed '+field;f.b.save();f.review(f.b,'supported',`2026-11-11T0${index+3}:00:00Z`);
    const data=await buildComparison(f.topic);
    assert.equal(data.claims.length,2,'claim itself has a new current review');
    assert.equal(data.relations.length,0,'relationship still needs its own recheck');
    assert.equal(data.held_relations.length,2);
  }
});
test('unreviewed source proposal is labeled as such and never qualifies for source-only',async t=>{
  const f=await fixture(t);f.relations[0].status='proposed';delete f.relations[0].review;f.saveRelations();
  const data=await buildComparison(f.topic),proposal=data.relations.find(r=>r.id==='cites');
  assert.equal(proposal.origin_label,'원문 제안 · 미대조');
  assert.equal(data.relations.filter(r=>r.origin==='source'&&r.status==='source-checked'&&!r.needs_recheck).length,0);
});
test('deleting a previously pinned claim holds dependent relations and keeps unrelated comparison readable',async t=>{
  const f=await fixture(t);f.b.data.claims=f.b.data.claims.filter(c=>c.id!=='c1');f.b.save();
  const data=await buildComparison(f.topic);
  assert.equal(data.papers.length,2);assert.equal(data.claims.length,1);assert.equal(data.criteria[0].groups[0].claims.length,1);
  assert.equal(data.criteria[0].groups[1].claims.length,0);assert.equal(data.relations.length,0);assert.equal(data.held_relations.length,2);
  assert.ok(data.held_relations.every(r=>r.current_dependencies===null));
});
test('AI cannot be source-checked, absent/foreign claim refs and self-relations are rejected',async t=>{
  const f=await fixture(t);f.relations[1].status='source-checked';f.relations[1].review=f.relations[0].review;f.saveRelations();await assert.rejects(buildComparison(f.topic),/원문 관계/);
  f.relations[1].status='proposed';f.relations[1].evidence_refs[0].claim_id='missing';f.saveRelations();await assert.rejects(buildComparison(f.topic),/등록되지 않은 주장/);
  f.relations[1].evidence_refs=[];f.relations[1].source=f.relations[1].target;f.saveRelations();await assert.rejects(buildComparison(f.topic),/방향/);
});
test('source relationship review dates use the same real-calendar validation as claim reviews',async t=>{
  const f=await fixture(t);f.relations[0].review.checked_at='2025-02-30T00:00:00Z';f.saveRelations();
  await assert.rejects(buildComparison(f.topic),/시각/);
});
test('a long valid topic question keeps its exact question contract in comparison configuration',async t=>{
  const f=await fixture(t),topicPath=join(f.topic,'topic.json'),topic=JSON.parse(readFileSync(topicPath,'utf8'));
  topic.question='A'.repeat(2001);f.json(topicPath,topic);f.comparison.question=topic.question;f.saveComparison();
  assert.equal((await buildComparison(f.topic)).question,topic.question);
});
test('AI-only comparison has zero source relations while criteria nodes remain',async t=>{
  const f=await fixture(t);f.relations=f.relations.slice(1);f.saveRelations();const data=await buildComparison(f.topic);
  assert.equal(data.relations.filter(r=>r.origin==='source'&&r.status==='source-checked'&&!r.needs_recheck).length,0);assert.equal(data.criteria.length,2);
  const context={window:{}};runInNewContext(readFileSync(new URL('../dist/web/research-map.js',import.meta.url),'utf8'),context);
  const elements=context.window.DanseoMap.build({...data,papers:data.papers.map(p=>({...p,id:p.paper_id})),relations:[]},'comparison');
  assert.deepEqual([...new Set(elements.filter(e=>e.group==='nodes').map(e=>e.data.type))].sort(),['criterion','paper']);
  assert.equal(elements.filter(e=>e.group==='edges'&&e.data.type==='relation').length,0);
});
test('rationale words never invent dependencies and same-direction relationships have distinct curves',async t=>{
  const f=await fixture(t);f.b.data.claims.push({...f.b.data.claims[1],id:'accuracy'});f.b.save();
  f.relations[0].rationale='Compare accuracy';
  const cards=new Map((await loadWorkspace(f.workspace)).cards.map(c=>[c.data.id,c]));
  const refs=new Set([...cards.keys()].map(id=>canonical([id,'c1'])));
  f.relations[0].snapshots.dependencies=(await relationState(f.relations[0],cards,refs)).current_dependencies;
  f.relations.push({...f.relations[0],id:'extends',kind:'extends'});
  f.relations[2].snapshots={...f.relations[2].snapshots,dependencies:(await relationState(f.relations[2],cards,refs)).current_dependencies};f.saveRelations();
  const data=await buildComparison(f.topic);assert.ok(data.relations.some(r=>r.id==='cites'),'unreviewed accuracy was not an explicit ref');
  const context={window:{}};runInNewContext(readFileSync(new URL('../dist/web/research-map.js',import.meta.url),'utf8'),context);
  const elements=context.window.DanseoMap.build({...data,papers:data.papers.map(p=>({...p,id:p.paper_id}))},'comparison');
  const edges=elements.filter(e=>['cites','extends'].includes(e.data.recordId));assert.equal(edges.length,2);assert.notEqual(edges[0].data.bend,edges[1].data.bend);
});
test('loopback serves fresh scoped data and exact PDF/document; denies path/host/origin/method attacks',async t=>{
  const f=await fixture(t);
  // The CLI prints the random entry URL; capture a fresh server's receipt without exposing paths.
  let url;const log=console.log;console.log=value=>{url=JSON.parse(value).url;};let second;
  try{second=await serveComparison(f.topic);}finally{console.log=log;}t.after(()=>second.close());
  const root=await fetch(url);assert.equal(root.status,200);assert.match(root.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(await root.text(),/비교 기준/);let data=await(await fetch(url+'data')).json();assert.equal(data.claims.length,2);
  const parallel=await Promise.all([fetch(url+'data'),fetch(url+'data')]);assert.deepEqual(parallel.map(r=>r.status),[200,200]);
  assert.deepEqual(Buffer.from(await(await fetch(url+'file/1/pdf/'+data.papers[0].source.sha256)).arrayBuffer()),readFileSync(f.a.data.source.path));
  assert.match(await(await fetch(url+'file/1/analysis/'+data.papers[0].document_sha256)).text(),/How was the result evaluated/);
  const oldDocumentUrl=url+'file/1/analysis/'+data.papers[0].document_sha256;
  writeFileSync(data.papers[0].document,readFileSync(data.papers[0].document,'utf8')+'\nNew analysis note\n');
  assert.equal((await fetch(oldDocumentUrl)).status,409,'old document link never silently opens new bytes');
  const pdfPath=f.a.data.source.path,pdfBytes=readFileSync(pdfPath),oldPdfUrl=url+'file/1/pdf/'+data.papers[0].source.sha256;
  writeFileSync(pdfPath,Buffer.concat([pdfBytes,Buffer.from('changed')]));
  assert.ok([404,409].includes((await fetch(oldPdfUrl)).status),'old PDF is rejected when no longer current');writeFileSync(pdfPath,pdfBytes);
  assert.equal((await fetch(url+'file/0/../../workspace.json')).status,404);assert.equal((await fetch(url+'file/999/pdf/'+'a'.repeat(64))).status,404);
  assert.equal((await fetch(url+'data',{headers:{Origin:'https://example.com'}})).status,403);
  assert.equal((await fetch(url+'data',{method:'POST'})).status,403);
  const hostStatus=await new Promise(resolve=>get(url+'data',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}));assert.equal(hostStatus,403);
  const malformedStatus=await new Promise((resolve,reject)=>get({hostname:'127.0.0.1',port:new URL(url).port,path:'//%5B'},res=>{res.resume();resolve(res.statusCode);}).on('error',reject));
  assert.equal(malformedStatus,404);assert.equal((await fetch(url+'data')).status,200,'server survives malformed target without knowing token');
  assert.equal((await fetch(new URL('/data',url))).status,404);
  f.b.data.claims[0].conditions='Changed condition';f.b.save();data=await(await fetch(url+'data')).json();assert.equal(data.claims.length,1);assert.equal(data.relations.length,0);
  writeFileSync(join(f.topic,'comparison.json'),'broken');assert.equal((await fetch(url+'data')).status,409);
});
