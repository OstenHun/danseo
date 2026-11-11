import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPdf } from '../dist/core/source-pdf.js';
import { pdf } from './helpers/source-pdf.mjs';

const paper = {key:'example',title:'Selected Paper',authors:'Alice Lee, Ed Chi',source:'https://example.org/paper',edition:'Journal 2024'};
const edition = {edition:'Journal 2024',proof:'Journal 2024',page:1,draft:false};
const verify = (title,author,selected=paper,mark='Journal 2024') => verifyPdf(pdf([...([title].flat()),'Alice Lee'],author,mark),selected,edition);

test('catalogue may omit Latin middle initials without accepting a different author',async()=>{
  await verify(paper.title,'Ed H. Chi');
  await verify(paper.title,'Ed H. J. Chi');
  await verify(paper.title,'Ed H. Chi',paper,['ed.chi@example.org','Journal 2024']);
  const interview={...paper,title:'An Interview with Ed H. Chi'};
  await verify(['An Interview with','Ed H. Chi'],'Ed Chi',interview);
  await verify(['Proceedings of Example Conference','An Interview with','Ed H. Chi'],'Ed Chi',interview);
  await assert.rejects(verify(['An Interview with','Ed H. Chi'],'Ed Chi',{...interview,title:'An Interview with'}),/제목/);
  const single={...paper,authors:'Ed Chi',title:'An Interview with Ed H. Chi'};
  await verifyPdf(pdf(['An Interview with','Ed H. Chi'],'Ed Chi','Journal 2024'),single,edition);
  await assert.rejects(verifyPdf(pdf(['An Interview with','Ed H. Chi'],'Ed Chi','Journal 2024'),{...single,title:'An Interview with'},edition),/제목/);
  await assert.rejects(verifyPdf(pdf(paper.title,'Ed H. Chi','Journal 2024'),{...paper,authors:'Ed Chi'},edition),/저자/);
  await assert.rejects(verifyPdf(pdf(paper.title,'Ed H. Chi','Journal 2024'),{...paper,authors:'Ed H. Chi, Ed Chi'},edition),/저자/);
  await assert.rejects(verify(paper.title,'Ed H. Chi',{...paper,authors:'Alice Lee, Ed H. Chi, Ed Chi'}),/저자/);
  await assert.rejects(verify(paper.title,'Ed H. Chi',{...paper,authors:'Alice Lee, Ed Chi, Ed Chi'}),/저자/);
  await verify(paper.title,'Ed H. Chi',{...paper,authors:'Alice Lee, Ed H. Chi, Ed Chi'},['Ed J. Chi','Journal 2024']);
  const split={...paper,authors:'Alice Lee, Mary Anne H. Smith, Anne Smith'};
  await assert.rejects(verifyPdf(pdf([paper.title,'Alice Lee','Mary'],'Anne H. Smith','Journal 2024'),split,edition),/저자/);
  await verifyPdf(pdf([paper.title,'Alice Lee','Mary'],'Anne H. Smith',['Anne J. Smith','Journal 2024']),split,edition);
  for(const author of ['Edward H. Chi','Ed Henry Chi','Ed H. Chin','Ted H. Chi','Ed XChi']) {
    await assert.rejects(verify(paper.title,author),/저자/);
  }
  await assert.rejects(verify(paper.title,'Ed H. Chi',{...paper,authors:'Ed A. Chi'}),/저자/);
  await assert.rejects(verify(paper.title,'Edward H. Chi',{...paper,authors:'E. Chi'}),/저자/);
  for (const separator of [',', ';', '&']) {
    await assert.rejects(verify(paper.title,`Alice Lee, Jane Ed${separator} H. Chi`,{...paper,authors:'Alice Lee, Ed Chi'}),/저자/);
  }
  await assert.rejects(verify([paper.title,'Alice Lee','Sam Taylor'],'J. Park',{...paper,authors:'Alice Lee, Taylor Park'}),/저자/);
  await assert.rejects(verify(paper.title,'Alice Lee Sam Taylor J. Park',{...paper,authors:'Alice Lee, Taylor Park'}),/저자/);
});

test('split proceedings footer before the title is not part of the selected title',async()=>{
  const footer=['Proceedings of the Example Conference',', pages 1330-1350','August 11-16, 2024 (c)2024 Association for Computational Linguistics'];
  await verify([...footer,paper.title],'Ed H. Chi');
  await assert.rejects(verify([...footer,'A Different Paper'],'Ed H. Chi'),/제목/);
  await assert.rejects(verify([...footer,paper.title+': Another Study'],'Ed H. Chi'),/제목/);
  await assert.rejects(verify(['An arbitrary prefix',paper.title],'Ed H. Chi'),/제목/);
  await assert.rejects(verify([footer[1],footer[2],paper.title],'Ed H. Chi'),/제목/);
  await assert.rejects(verify([...footer,paper.title],'Another Author'),/저자/);
  await assert.rejects(verify([...footer,paper.title],'Ed H. Chi',paper,'Author accepted manuscript Journal 2024'),/판본/);
  await assert.rejects(verify([footer[0],footer[1],footer[2]+'. A Replication of',paper.title],'Ed H. Chi'),/제목/);
});
