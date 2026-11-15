import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hash } from './view-core.mjs';
import { overviewFor, verifyEvidence } from './research-evidence.mjs';
import { performancePlan, readTable, comparisonText } from './performance-evidence.mjs';
import { run } from './render-verified-research-view.mjs';

// Synthetic rectangular table; actual CRAG regression is kept in the private work record.
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'danseo-performance-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const c = JSON.parse(readFileSync(new URL('../assets/paper-relations.v2.example.json', import.meta.url), 'utf8'));
  Object.assign(c, overviewFor(c));
  const table = {id:'Table1',source_id:'S.1',page:2,header:'Task-A Task-B\nAccuracy Accuracy',footer:'Table 1. Test split. * reproduced baseline; others cited. No significance test.',columns:[{label:'Task-A',metric:'Accuracy',direction:'higher'},{label:'Task-B',metric:'Accuracy',direction:'higher'}],conditions:['Generator-A','Generator-B'],review:{checked_by:'test',checked_at:'2026-11-16T00:00:00Z',scope:'Synthetic full table, headers and footnotes'},quote:''};
  table.quote = `${table.header}\nGenerator-A\nBaseline* 70 67.3\nMethod 74 67.2\nGenerator-B\nBaseline 0.7 20\nMethod 0.6 25\n${table.footer}`;
  const pdf=Buffer.from('%PDF-1.7\nSynthetic fixture only.');
  const pages={pdf_sha256:hash(pdf),pages:[{page:2,text:table.quote}]};
  writeFileSync(path.join(dir,'source.pdf'),pdf);writeFileSync(path.join(dir,'pages.json'),JSON.stringify(pages));
  const e={version:2,sources:[{id:'S.1',document_path:'source.pdf',document_sha256:hash(pdf),text_path:'pages.json',text_sha256:hash(JSON.stringify(pages))}],counts:[],tables:[table],performance:[]};
  const comparison={table_id:'Table1',pairs:[{condition:'Generator-A',method:'Method',baseline:'Baseline*'},{condition:'Generator-B',method:'Method',baseline:'Baseline'}],assertion:'report'};
  const parsed=readTable(table,new Map([['S.1',new Map([[2,table.quote]])]]));
  c.papers[0].claims[0].statement=comparisonText(parsed,comparison);
  const screen=()=> {e.performance=performancePlan(c).map(x=>({...x,kind:'non-performance',reason:'Method/context only; no empirical ordering',comparison:null}));Object.assign(e.performance.find(x=>x.path==='/papers/0/claims/0/statement'),{kind:'table-comparison',reason:'All displayed cells compared under matching generator',comparison});};
  screen();
  const input=path.join(dir,'candidate.json'),sidecar=path.join(dir,'evidence.json'),output=path.join(dir,'view.html');
  const save=()=>{writeFileSync(input,JSON.stringify(c));writeFileSync(sidecar,JSON.stringify(e));};
  return {dir,c,e,table,comparison,parsed,screen,save,input,sidecar,output};
}

test('source-table report includes conditions, exceptions and footnotes before HTML output', t=>{
  const f=fixture(t);f.save();const r=run([f.input,'--evidence',f.sidecar,'--out',f.output]);
  assert.equal(r.performance_fields,1);assert.equal(r.source_semantics,'not-certified');
  assert.match(f.c.papers[0].claims[0].statement,/우세 2, 동률 0, 열세 2, 미보고 0/);
  assert.match(readFileSync(f.output,'utf8'),/67.2/);assert.match(f.c.papers[0].claims[0].statement,/reproduced baseline/);
});
test('the universal superiority assertion is contradicted by both exceptions, before write', t=>{
  const f=fixture(t);f.comparison.assertion='all-better';f.save();
  assert.throws(()=>run([f.input,'--evidence',f.sidecar,'--out',f.output]),/2 losses.*Generator-A.*Generator-B/);
  assert.equal(existsSync(f.output),false);
});
test('legacy overclaim in a relation rationale is blocked even with empty counts',t=>{
  const f=fixture(t);f.c.papers[0].claims[0].statement='방법을 결합한다.';f.c.relations[0].rationale='두 생성기 모두 네 평가에서 일관되게 능가한다.';
  f.e.version=1;f.e.sources=[];delete f.e.tables;delete f.e.performance;f.save();
  assert.throws(()=>run([f.input,'--evidence',f.sidecar,'--out',f.output]),/Performance claim.*relations\/0\/rationale/);assert.equal(existsSync(f.output),false);
});
test('performance cannot hide as non-performance or append a broader conclusion',t=>{
  const f=fixture(t);f.c.papers[0].claims[0].statement='모든 조건에서 우월하다.';f.screen();
  f.e.performance[0].kind='non-performance';f.e.performance[0].comparison=null;
  // Locate the statement explicitly: notes may precede it in the inventory.
  Object.assign(f.e.performance.find(x=>x.path.endsWith('/claims/0/statement')),{kind:'non-performance',comparison:null});
  assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/cannot be exempted/);
  f.c.papers[0].claims[0].statement=comparisonText(f.parsed,f.comparison)+' 따라서 언제나 우월하다.';f.screen();
  assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/exact source-derived/);
});
test('missing screening, stale statement and unrelated table evidence fail',t=>{
  const f=fixture(t);const e=structuredClone(f.e);e.performance.pop();assert.throws(()=>verifyEvidence(f.c,e,f.dir),/missing performance screening/);
  f.c.papers[0].claims[0].statement+=' changed';assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/stale performance/);
  f.c.papers[0].claims[0].statement=comparisonText(f.parsed,f.comparison);f.c.papers[0].claims[0].evidence=[];
  assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/table must be linked/);
});
test('omitted losing row, swapped column, missing column and changed source cells fail',t=>{
  const f=fixture(t);
  for(const mutate of [x=>x.quote=x.quote.replace('Method 74 67.2\n',''),x=>x.columns.reverse(),x=>x.columns.pop(),x=>x.quote=x.quote.replace('67.2','99.9')]) {
    const e=structuredClone(f.e);mutate(e.tables[0]);assert.throws(()=>verifyEvidence(f.c,e,f.dir));
  }
});
test('ties, missing values and lower-is-better cannot imply strict superiority',t=>{
  const f=fixture(t);const p=structuredClone(f.parsed);p.rows.set(JSON.stringify(['Generator-A','Method']),[70,null]);
  const report=comparisonText(p,f.comparison);assert.match(report,/동률 1, 열세 1, 미보고 1/);
  assert.throws(()=>comparisonText(p,{...f.comparison,assertion:'all-better'}),/1 losses, 1 ties, 1 missing/);
  const q=structuredClone(f.parsed);q.table.columns.forEach(c=>c.direction='lower');assert.match(comparisonText(q,f.comparison),/우세 2, 동률 0, 열세 2/);
});
test('condition matching preserves baseline footnotes, duplicates and invented rows fail',t=>{
  const f=fixture(t);const q=structuredClone(f.comparison);q.pairs[0].baseline='Baseline';assert.throws(()=>comparisonText(f.parsed,q),/missing comparison method/);
  q.pairs[0].condition='Generator-X';assert.throws(()=>comparisonText(f.parsed,q),/Invalid/);
  const duplicate=structuredClone(f.comparison);duplicate.pairs.push(duplicate.pairs[0]);assert.throws(()=>comparisonText(f.parsed,duplicate),/duplicate/);
});
test('mixed metrics cannot borrow another columns direction', t=>{
  const f=fixture(t), table=structuredClone(f.table);
  table.header='Task-A Task-B\nAccuracy Loss';table.columns[1]={label:'Task-B',metric:'Accuracy',direction:'higher'};
  table.quote=`${table.header}\nGenerator-A\nBaseline 70 1\nMethod 74 2\n${table.footer}`;table.conditions=['Generator-A'];
  const pages=new Map([['S.1',new Map([[2,table.quote]])]]);
  assert.throws(()=>readTable(table,pages),/every source header column and its metric/);
  table.columns[1]={label:'Task-B',metric:'Loss',direction:'lower'};
  const parsed=readTable(table,pages);
  assert.throws(()=>comparisonText(parsed,{table_id:table.id,pairs:[{condition:'Generator-A',method:'Method',baseline:'Baseline'}],assertion:'all-better'}),/1 losses/);
});
for (const cell of ['.7','-','—']) test(`omitted first column cannot be disguised as method suffix ${cell}`, t=>{
  const f=fixture(t),table=structuredClone(f.table);
  table.quote=`${table.header}\nGenerator-A\nBaseline ${cell} 20\nMethod .6 25\n${table.footer}`;table.conditions=['Generator-A'];table.columns.shift();
  assert.throws(()=>readTable(table,new Map([['S.1',new Map([[2,table.quote]])]])),/every source header column/);
});
test('short labels and topics cannot carry unchecked superiority claims',t=>{
  const f=fixture(t);f.c.papers[0].short_title='Always better';f.c.papers[0].topic='모든 조건에서 우월';f.screen();
  assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/cannot be exempted/);
});
test('unknown metric cannot borrow a different metrics direction from a compound quote',t=>{
  const f=fixture(t),table=structuredClone(f.table);
  table.header='Task-A\nQualityX';table.conditions=['Generator-A'];
  table.quote=`${table.header}\nGenerator-A\nBaseline 10\nMethod 9\n${table.footer}`;
  const source=table.quote+'\nQualityX higher is better; CostX lower is better.';
  table.columns=[{label:'Task-A',metric:'QualityX',direction:'lower',direction_quote:'QualityX higher is better; CostX lower is better.'}];
  const pages=new Map([['S.1',new Map([[2,source]])]]);
  assert.throws(()=>readTable(table,pages),/exact single-metric/);
  table.columns[0].direction='higher';table.columns[0].direction_quote='QualityX higher is better';
  assert.throws(()=>comparisonText(readTable(table,pages),{table_id:table.id,pairs:[{condition:'Generator-A',method:'Method',baseline:'Baseline'}],assertion:'all-better'}),/1 losses/);
});
test('direction excerpts cannot truncate another metric name',t=>{
  const f=fixture(t),table=structuredClone(f.table);
  table.header='Task-A\nQualityX';table.conditions=['Generator-A'];
  table.quote=`${table.header}\nGenerator-A\nBaseline 10\nMethod 9\n${table.footer}`;
  table.columns=[{label:'Task-A',metric:'QualityX',direction:'lower',direction_quote:'QualityX lower is better.'}];
  assert.throws(()=>readTable(table,new Map([['S.1',new Map([[2,table.quote+'\nOtherQualityX lower is better.']])]])),/exact single-metric/);
});
test('out-of-range decimals cannot round distinct source values into a tie',t=>{
  const f=fixture(t);
  for(const value of ['0.'+'0'.repeat(323)+'3','0.'+'0'.repeat(330)+'1','9007199254740993']) {
    const table=structuredClone(f.table);table.quote=table.quote.replace('74 67.2',`${value} 67.2`);
    assert.throws(()=>readTable(table,new Map([['S.1',new Map([[2,table.quote]])]])),/numeric precision/);
  }
});
test('common Korean and English superiority paraphrases cannot be exempted',t=>{
  const f=fixture(t);
  for(const claim of ['A가 B보다 뛰어나다','A가 B보다 앞선다','A가 더 낫다','A is faster than B']) {
    f.c.papers[0].claims[0].statement=claim;f.screen();
    Object.assign(f.e.performance.find(x=>x.path==='/papers/0/claims/0/statement'),{kind:'non-performance',comparison:null});
    assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/cannot be exempted/);
  }
});
test('source counts in table footnotes compose with exact performance reports',t=>{
  const f=fixture(t),oldFooter=f.table.footer;
  f.table.footer+=' Evaluation on 100 records (80 documents, 120 pairs).';
  f.table.quote=f.table.quote.replace(oldFooter,f.table.footer);
  const source=JSON.parse(readFileSync(path.join(f.dir,'pages.json'),'utf8'));source.pages[0].text=f.table.quote;
  writeFileSync(path.join(f.dir,'pages.json'),JSON.stringify(source));f.e.sources[0].text_sha256=hash(JSON.stringify(source));
  const parsed=readTable(f.table,new Map([['S.1',new Map([[2,f.table.quote]])]]));
  f.c.papers[0].claims[0].statement=comparisonText(parsed,f.comparison);f.screen();f.save();
  const receipt=run([f.input,'--evidence',f.sidecar,'--out',f.output]);assert.equal(receipt.count_fields,1);assert.equal(receipt.performance_fields,1);
  // A report-shaped classification cannot bypass the old count gate.
  f.c.papers[0].claims[0].statement='101 records';f.screen();
  assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/exact source-derived performance/);
});
test('method-only higher-order and lower-bound descriptions remain supported',t=>{
  const f=fixture(t);
  for(const claim of ['Uses higher-order interactions to construct the graph.','The proof derives a lower bound on the search space.']) {
    f.c.papers[0].claims[0].statement=claim;f.screen();
    Object.assign(f.e.performance.find(x=>x.path==='/papers/0/claims/0/statement'),{kind:'non-performance',comparison:null});
    assert.doesNotThrow(()=>verifyEvidence(f.c,f.e,f.dir));
  }
  f.c.papers[0].claims[0].statement='The method has higher accuracy than the baseline.';f.screen();
  Object.assign(f.e.performance.find(x=>x.path==='/papers/0/claims/0/statement'),{kind:'non-performance',comparison:null});
  assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/cannot be exempted/);
});
test('all supported metric names retain higher/lower comparison screening',t=>{
  const f=fixture(t);
  for(const metric of ['BLEU','ROUGE-L','EM','Exact Match','FactScore','AUC','AUROC','WER','CER']) {
    f.c.papers[0].claims[0].statement=`The method achieves higher ${metric} than the baseline.`;f.screen();
    Object.assign(f.e.performance.find(x=>x.path==='/papers/0/claims/0/statement'),{kind:'non-performance',comparison:null});
    assert.throws(()=>verifyEvidence(f.c,f.e,f.dir),/cannot be exempted/);
  }
});
