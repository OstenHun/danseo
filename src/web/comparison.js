/* Topic comparison uses the shared DanseoMap. All research strings are text, never HTML. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { cites:'인용', extends:'확장', compares:'비교', 'related-to':'관련', 'reading-order':'읽기 순서' };
  let data, map, selection;
  const text = (tag, value, className) => { const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el; };
  const visibleRelations = () => data.relations.filter(r => !$('source-only').checked || r.origin === 'source' && r.status === 'source-checked' && !r.needs_recheck);
  function link(label, paper, kind, page) {
    const digest = kind === 'pdf' ? paper.source.sha256 : paper.document_sha256;
    const a=text('a',label);a.href=`file/${paper.number}/${kind}/${digest}${page ? '#page='+page : ''}`;a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function evidence(paper, claims) {
    const column=text('article','', 'evidence-column');column.append(text('h3',paper.title));
    if (!claims.length) column.append(text('p','이 기준으로 확인한 근거 없음'));
    for (const row of claims) {
      const article=text('div','','claim');
      article.append(text('p',row.claim.statement),text('p','조건 · '+(row.claim.conditions ?? '기록 없음')),text('p','한계 · '+(row.claim.limits ?? '기록 없음')));
      const locators=row.claim.locators.map(l => l.type === 'pdf-page-range' ? `PDF ${l.start}–${l.end}쪽` : `${l.type} ${l.value ?? ''}`).join(' · ');
      article.append(text('p',row.source.edition+' · '+locators,'metadata'),text('p','주장 '+row.paper_id+'/'+row.claim_id+' · 현재 원문 지지','metadata'));
      const checkedPages = [...new Set(row.review.evidence.map(item => item.pdf_page))];
      for (const item of row.review.evidence) article.append(text('p',`원문 대조 · PDF ${item.pdf_page}쪽 · ${item.section}`,'metadata'));
      const links=text('div','','evidence-links');
      links.append(link('해당 판본 PDF 열기',paper,'pdf',row.claim.locators.find(l=>l.type==='pdf-page-range')?.start ?? checkedPages[0]),link('주제별 분석 문서',paper,'analysis'));
      for (const page of checkedPages) links.append(link(`PDF 대조 ${page}쪽`,paper,'pdf',page));
      article.append(links);column.append(article);
    }
    return column;
  }
  function show(type,id,focus=true) {
    if(type==='grouping')type='criterion';
    selection={type,id};const panel=$('details');panel.replaceChildren();
    if(type==='relation') {
      const r=visibleRelations().find(r=>r.id===id);
      if(!r){selection=undefined;emptyDetails();return;}
      panel.append(text('h2',(labels[r.kind]??r.kind)+' · '+r.origin_label),
        text('p',data.papers.find(p=>p.paper_id===r.source).title+' → '+data.papers.find(p=>p.paper_id===r.target).title),
        text('p',r.rationale),text('p','작성 · '+r.created_by+(r.review?' / '+(r.status==='source-checked'?'원문 대조':'이전 대조 기록')+' · '+r.review.checked_by+' · '+r.review.checked_at:''),'metadata'));
      const columns=text('div','','evidence-columns');
      for(const paper of data.papers.filter(p=>[r.source,r.target].includes(p.paper_id)))columns.append(evidence(paper,data.claims.filter(c=>c.key===paper.key&&r.evidence_refs.some(ref=>ref.paper_id===c.paper_id&&ref.claim_id===c.claim_id))));
      panel.append(columns);
    } else if(type==='criterion') {
      const c=data.criteria.find(c=>c.id===id);if(!c)return;
      panel.append(text('h2',c.title),text('p','AI 분류 · '+c.rationale,'badge'));
      const columns=text('div','','evidence-columns');for(const paper of data.papers)columns.append(evidence(paper,c.groups.find(g=>g.key===paper.key).claims));panel.append(columns);
    } else if(type==='paper') {
      const p=data.papers.find(p=>p.id===id);if(!p)return;panel.append(text('h2',p.title));
      for(const c of data.criteria){panel.append(text('h3',c.title),text('p','AI 분류 · '+c.rationale,'badge'),evidence(p,c.groups.find(g=>g.key===p.key).claims));}
    }
    document.querySelectorAll('[data-selection]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.selection===type+':'+id)));
    map?.select(type,id);if(focus)panel.focus();
  }
  function emptyDetails(){ $('details').replaceChildren(text('h2','비교 기준을 선택하세요'),text('p','논문·기준·관계를 선택하면 현재 확인 가능한 근거를 보여줍니다.')); }
  function choices(id,items,type,label){
    const holder=$(id);holder.replaceChildren();
    for(const item of items){const button=text('button',label(item));button.type='button';button.dataset.selection=type+':'+item.id;button.setAttribute('aria-pressed','false');button.onclick=()=>show(type,item.id);holder.append(button);}
  }
  function render(){
    const relations=visibleRelations();
    if(selection?.type==='relation'&&!relations.some(r=>r.id===selection.id)){selection=undefined;emptyDetails();}
    choices('papers',data.papers,'paper',p=>p.number+'. '+p.title);choices('criteria',data.criteria,'criterion',c=>c.title);
    choices('relations',relations,'relation',r=>r.origin_label+' · '+(labels[r.kind]??r.kind)+' · '+data.papers.find(p=>p.paper_id===r.source).number+' → '+data.papers.find(p=>p.paper_id===r.target).number);
    $('empty-relations').textContent=relations.length?'':$('source-only').checked?'현재 유효한 원문 관계가 없습니다.'+(data.relations.length?' 필터를 풀면 미대조 관계·제안을 확인할 수 있습니다.':''):'현재 확인 가능한 연구 간 관계가 없습니다.';
    $('status').textContent=`논문 ${data.papers.length}편 · 기준 ${data.criteria.length}개 · 연구 간 관계 ${relations.length}개. 현재 파일로 확인했습니다.`;
    map?.destroy();map=window.DanseoMap.mount($('map'),{...data,relations},'comparison',element=>show(element.type,element.recordId));
    if(selection)show(selection.type,selection.id,false);
  }
  async function refresh(){
    $('refresh').disabled=true;$('error').hidden=true;
    // Clear previous evidence before attempting refresh. Failed reads must not leave old support visible.
    data=undefined;selection=undefined;emptyDetails();map?.destroy();map=undefined;for(const id of ['papers','criteria','relations','held'])$(id).replaceChildren();
    $('status').textContent='현재 근거를 확인하는 중입니다.';$('empty-relations').textContent='';
    try{const response=await fetch('data',{cache:'no-store'});if(!response.ok)throw new Error(await response.text());data=await response.json();
      data.papers=data.papers.map(p=>({...p,id:p.paper_id??'unavailable:'+p.number}));$('question').textContent=data.question;document.title=data.question+' · Danseo';
      for(const h of [...data.held,...data.held_relations])$('held').append(text('p',(h.paper_id??h.key??h.id)+(h.claim_id?'/'+h.claim_id:'')+' · '+h.reason));
      if(!$('held').childNodes.length)$('held').append(text('p','보류한 근거 없음'));render();
    }catch(error){data=undefined;$('status').textContent='현재 근거를 표시할 수 없습니다.';$('error').textContent=error.message;$('error').hidden=false;}
    finally{$('refresh').disabled=false;}
  }
  $('source-only').onchange=()=>{if(data)render();};$('refresh').onclick=refresh;
  window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});refresh();
})();
